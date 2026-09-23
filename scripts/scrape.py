"""
Pulls current price data for EVERY DSE-listed ticker in one go and writes
data/latest.json in the shape app.js expects (a dict keyed by ticker).

Uses the unofficial `bdshare` package, which scrapes public DSE pages.
NOTE: bdshare's API has changed between versions before, and DSE's own
site structure can change too. If this script starts failing, check:
  https://pypi.org/project/bdshare/
for current function names/columns before assuming your code is wrong —
run `python -c "from bdshare import get_current_trade_data as f; print(f().columns)"`
locally to see the real column names and adjust COLUMN_MAP below.

Usage:
    python scripts/scrape.py
"""

import sys
import json
from datetime import datetime, timezone
from pathlib import Path

try:
    from bdshare import get_current_trade_data
except ImportError:
    sys.exit("bdshare is not installed. Run: pip install bdshare")

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "latest.json"

# Adjust these if bdshare's column names differ from what's assumed here.
COLUMN_MAP = {
    "ticker": "trading_code",
    "company": "company_name",  # falls back to ticker if this column doesn't exist
    "price": "ltp",
    "change_pct": "change",     # bdshare typically reports % change here
    "open": "opening_price",
    "high": "high",
    "low": "low",
    "prev_close": "ycp",
    "volume": "volume",
    "value_mn": "value_mn",
}


def flat_history(price):
    """Single-point placeholder until real historical series are wired up."""
    point = [["now", price]]
    return {"1D": point, "1W": point, "1M": point, "1Y": point}


def safe_float(val, default=0.0):
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def main():
    df = get_current_trade_data()  # no ticker arg = full market watch
    if df is None or df.empty:
        sys.exit("No data returned — DSE site may be down or bdshare's API changed.")

    cols = df.columns
    ticker_col = COLUMN_MAP["ticker"] if COLUMN_MAP["ticker"] in cols else cols[0]
    company_col = COLUMN_MAP["company"] if COLUMN_MAP["company"] in cols else None

    stocks = {}
    for _, row in df.iterrows():
        ticker = str(row[ticker_col]).strip()
        if not ticker:
            continue
        price = safe_float(row.get(COLUMN_MAP["price"]))
        prev_close = safe_float(row.get(COLUMN_MAP["prev_close"]))
        change = price - prev_close
        change_pct = safe_float(row.get(COLUMN_MAP["change_pct"]))

        stocks[ticker] = {
            "ticker": ticker,
            "company": str(row[company_col]) if company_col else ticker,
            "price": price,
            "change": change,
            "change_pct": change_pct,
            "open": safe_float(row.get(COLUMN_MAP["open"])),
            "high": safe_float(row.get(COLUMN_MAP["high"])),
            "low": safe_float(row.get(COLUMN_MAP["low"])),
            "prev_close": prev_close,
            "volume": str(row.get(COLUMN_MAP["volume"], "—")),
            "value_mn": safe_float(row.get(COLUMN_MAP["value_mn"])),
            "history": flat_history(price),
        }

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "default_ticker": "GP" if "GP" in stocks else next(iter(stocks), None),
        "stocks": stocks,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2))
    print(f"Wrote {len(stocks)} tickers to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
