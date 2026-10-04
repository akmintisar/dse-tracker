""" 
Update the DSE stock catalog and latest market prices.

The frontend deliberately keeps historical data in separate files so that
searching hundreds of stocks does not require downloading every chart.
"""
import json
import math
import re
import sys
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from pathlib import Path

try:
    from bdshare import get_current_trade_data, get_current_trading_code
except ImportError:
    sys.exit("bdshare is not installed. Run: pip install bdshare")

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "latest.json"

MAP = {
    "ticker": "trading_code",
    "company": "company_name",
    "price": "ltp",
    "change_pct": "change",
    "open": "opening_price",
    "high": "high",
    "low": "low",
    "prev_close": "ycp",
    "volume": "volume",
    "value_mn": "value_mn",
}


def num(value, default=None):
    try:
        number = float(value)
        return default if not math.isfinite(number) else number
    except (TypeError, ValueError):
        return default


def text(value, default="—"):
    if value is None:
        return default
    value = str(value).strip()
    return default if not value or value.lower() == "nan" else value


def find_col(columns, names):
    lookup = {str(c).strip().lower(): c for c in columns}
    for name in names:
        if name.lower() in lookup:
            return lookup[name.lower()]
    return None


def fetch_dse_metadata(tickers):
    """Fetch DSE company names and A/B/G/N/Z categories from the official companies page."""
    try:
        response = requests.get(
            "https://dse.com.bd/companies",
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0 (compatible; DhumketuExpress/1.0)"},
        )
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
    except Exception as exc:
        print(f"Warning: could not fetch DSE company metadata: {exc}")
        return {}

    metadata = {}

    # The current DSE page renders rows with ticker + category + company name.
    # Depending on the HTML structure, those pieces may be in one element or
    # several nested elements, so inspect both element text and page text.
    candidates = []
    for element in soup.find_all(["a", "td", "div", "span"]):
        value = " ".join(element.stripped_strings)
        if value:
            candidates.append(value)

    # Longest ticker first prevents a shorter symbol from matching a prefix.
    sorted_tickers = sorted(set(tickers), key=len, reverse=True)

    for value in candidates:
        for ticker in sorted_tickers:
            # DSE currently displays examples such as "GPA Grameenphone Ltd."
            # but whitespace may appear between ticker and category in the DOM.
            pattern = r"^" + re.escape(ticker) + r"\s*([ABGNZ])\s+(.+?)\s*$"
            match = re.match(pattern, value)
            if not match:
                continue

            company = match.group(2).strip()
            # Avoid treating unrelated nested text as a company name.
            if company and ticker not in metadata:
                metadata[ticker] = {
                    "category": match.group(1),
                    "company": company,
                }
            break

    print(f"DSE metadata matched {len(metadata)} of {len(sorted_tickers)} symbols")
    return metadata


def main():
    # Trading codes gives us the complete current symbol catalog,
    # while current trades supplies the latest quote fields.
    codes = get_current_trading_code()
    quotes = get_current_trade_data()

    if codes is None or codes.empty:
        sys.exit("No DSE trading-code data returned.")
    if quotes is None or quotes.empty:
        sys.exit("No DSE current-trade data returned.")

    code_cols = set(codes.columns)
    quote_cols = set(quotes.columns)

    ticker_col = MAP["ticker"] if MAP["ticker"] in quote_cols else (
        "symbol" if "symbol" in quote_cols else None
    )
    if not ticker_col:
        sys.exit(
            "Cannot identify ticker column in current trade data: "
            + str(list(quotes.columns))
        )

    # Some bdshare versions use symbol rather than trading_code.
    company_col = MAP["company"] if MAP["company"] in quote_cols else None
    open_col = find_col(
        quotes.columns, ["opening_price", "open", "opening price", "open_price"]
    )
    high_col = find_col(quotes.columns, ["high", "today_high", "today's high"])
    low_col = find_col(quotes.columns, ["low", "today_low", "today's low"])

    stocks = {}

    for _, row in quotes.iterrows():
        ticker = text(row.get(ticker_col), "")
        if not ticker:
            continue

        prev = num(row.get(MAP["prev_close"]))
        price = num(row.get(MAP["price"]))

        # bdshare can return 0 for LTP/open/high/low when the DSE feed has
        # no current quote (for example outside an active session). A zero
        # LTP is not a meaningful traded price, so fall back to the previous
        # close instead of publishing a market-wide zero-price snapshot.
        if price is not None and price <= 0 and prev is not None and prev > 0:
            price = prev

        stocks[ticker] = {
            "ticker": ticker,
            "company": text(row.get(company_col), ticker) if company_col else ticker,
            "category": None,
            "price": price,
            "change": price - prev if price is not None and prev is not None else None,
            "change_pct": ((price - prev) / prev * 100) if price is not None and prev not in (None, 0) else None,
            "open": num(row.get(open_col)) if open_col else None,
            "high": num(row.get(high_col)) if high_col else None,
            "low": num(row.get(low_col)) if low_col else None,
            "prev_close": prev,
            "volume": text(row.get(MAP["volume"])),
            "value_mn": num(row.get(MAP["value_mn"])),
        }

    # Add symbols with no current quote so search remains a complete catalog.
    code_col = "symbol" if "symbol" in code_cols else (
        MAP["ticker"] if MAP["ticker"] in code_cols else None
    )
    if code_col:
        for _, row in codes.iterrows():
            ticker = text(row.get(code_col), "")
            if ticker and ticker not in stocks:
                stocks[ticker] = {
                    "ticker": ticker,
                    "company": ticker,
                    "category": None,
                    "price": None,
                    "change": None,
                    "change_pct": None,
                    "open": None,
                    "high": None,
                    "low": None,
                    "prev_close": None,
                    "volume": None,
                    "value_mn": None,
                    "week52_high": None,
                    "week52_low": None,
                }

    if not stocks:
        sys.exit("No usable DSE symbols returned.")

    # Fetch metadata only after the complete symbol catalog has been built.
    dse_metadata = fetch_dse_metadata(stocks.keys())
    for ticker, metadata in dse_metadata.items():
        if ticker in stocks:
            stocks[ticker]["category"] = metadata["category"]
            stocks[ticker]["company"] = metadata["company"]

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "default_ticker": "GP" if "GP" in stocks else sorted(stocks)[0],
        "stocks": dict(sorted(stocks.items())),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Wrote {len(stocks)} DSE symbols to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
