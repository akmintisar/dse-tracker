"""
Pull current DSE market data for all available tickers and write
data/latest.json for the static website.

The unofficial bdshare package is used as the data source. DSE/bdshare
column names can change, so the mapping below is intentionally isolated.

Usage:
    python scripts/scrape.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from bdshare import get_current_trade_data
except ImportError:
    sys.exit("bdshare is not installed. Run: pip install bdshare")

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "latest.json"

COLUMN_MAP = {
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

def safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default

def clean_text(value, default="—"):
    if value is None:
        return default
    text = str(value).strip()
    return text if text and text.lower() != "nan" else default

def flat_history(price):
    """Temporary chart shape until real historical series are wired up."""
    point = [["now", price]]
    return {"1D": point, "1W": point, "1M": point, "1Y": point}

def main():
    df = get_current_trade_data()

    if df is None or df.empty:
        sys.exit("No data returned — DSE may be unavailable or bdshare may have changed.")

    cols = set(df.columns)
    missing = [
        COLUMN_MAP[key]
        for key in ("ticker", "price")
        if COLUMN_MAP[key] not in cols
    ]
    if missing:
        sys.exit(
            "Expected bdshare columns are missing: " + ", ".join(missing) +
            ". Returned columns: " + ", ".join(map(str, df.columns))
        )

    ticker_col = COLUMN_MAP["ticker"]
    company_col = COLUMN_MAP["company"] if COLUMN_MAP["company"] in cols else None
    stocks = {}

    for _, row in df.iterrows():
        ticker = clean_text(row.get(ticker_col), default="")
        if not ticker:
            continue

        price = safe_float(row.get(COLUMN_MAP["price"]))
        prev_close = safe_float(row.get(COLUMN_MAP["prev_close"]))
        change = price - prev_close
        change_pct = safe_float(row.get(COLUMN_MAP["change_pct"]))

        stocks[ticker] = {
            "ticker": ticker,
            "company": clean_text(row.get(company_col)) if company_col else ticker,
            "price": price,
            "change": change,
            "change_pct": change_pct,
            "open": safe_float(row.get(COLUMN_MAP["open"])),
            "high": safe_float(row.get(COLUMN_MAP["high"])),
            "low": safe_float(row.get(COLUMN_MAP["low"])),
            "prev_close": prev_close,
            "volume": clean_text(row.get(COLUMN_MAP["volume"])),
            "value_mn": safe_float(row.get(COLUMN_MAP["value_mn"])),
            "history": flat_history(price),
        }

    if not stocks:
        sys.exit("The scraper returned no usable tickers.")

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "default_ticker": "GP" if "GP" in stocks else next(iter(stocks)),
        "stocks": stocks,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Wrote {len(stocks)} DSE tickers to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
