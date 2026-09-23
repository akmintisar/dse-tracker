"""
Update the DSE stock catalog and latest market prices.

The frontend deliberately keeps historical data in separate files so that
searching hundreds of stocks does not require downloading every chart.
"""
import json
import math
import sys
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

def main():
    # Trading codes gives us the complete current tradeable symbol catalog,
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
        sys.exit("Cannot identify ticker column in current trade data: " + str(list(quotes.columns)))

    # Some bdshare versions use symbol rather than trading_code.
    company_col = MAP["company"] if MAP["company"] in quote_cols else None

    stocks = {}
    for _, row in quotes.iterrows():
        ticker = text(row.get(ticker_col), "")
        if not ticker:
            continue
        prev = num(row.get(MAP["prev_close"]))
        price = num(row.get(MAP["price"]))
        stocks[ticker] = {
            "ticker": ticker,
            "company": text(row.get(company_col), ticker) if company_col else ticker,
            "price": price,
            "change": price - prev,
            "change_pct": num(row.get(MAP["change_pct"])),
            "open": num(row.get(MAP["open"])),
            "high": num(row.get(MAP["high"])),
            "low": num(row.get(MAP["low"])),
            "prev_close": prev,
            "volume": text(row.get(MAP["volume"])),
            "value_mn": num(row.get(MAP["value_mn"])),
        }

    # Ensure symbols returned by the trading-code endpoint are findable even
    # when a stock has no current quote. This prevents the search catalog from
    # collapsing to only stocks that traded in the latest scrape.
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
                    "price": None,
                    "change": None,
                    "change_pct": None,
                    "open": None,
                    "high": None,
                    "low": None,
                    "prev_close": None,
                    "volume": None,
                    "value_mn": None,
                }

    if not stocks:
        sys.exit("No usable DSE symbols returned.")

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "default_ticker": "GP" if "GP" in stocks else sorted(stocks)[0],
        "stocks": dict(sorted(stocks.items())),
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(stocks)} DSE symbols to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
