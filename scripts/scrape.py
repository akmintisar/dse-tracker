"""
Pulls current price data for one DSE ticker and writes it to data/latest.json
in the shape app.js expects.

Uses the unofficial `bdshare` package, which scrapes public DSE pages.
NOTE: bdshare's API has changed between versions before, and DSE's own
site structure can change too. If this script starts failing, check:
  https://pypi.org/project/bdshare/
for the current function names/usage before assuming your code is wrong.

Usage:
    python scripts/scrape.py GP
"""

import sys
import json
from datetime import datetime, timezone
from pathlib import Path

try:
    from bdshare import get_current_trade_data, get_hist_data
except ImportError:
    sys.exit("bdshare is not installed. Run: pip install bdshare")

TICKER = sys.argv[1] if len(sys.argv) > 1 else "GP"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "latest.json"


def build_history_placeholder(current_price):
    """
    Minimal placeholder history until real historical series are wired up.
    Replace this with get_hist_data() output once confirmed working —
    this keeps the site functional even if historical calls fail.
    """
    return {
        "1D": [["now", current_price]],
        "1W": [["now", current_price]],
        "1M": [["now", current_price]],
        "1Y": [["now", current_price]],
    }


def main():
    df = get_current_trade_data(TICKER)
    if df is None or df.empty:
        sys.exit(f"No data returned for ticker {TICKER}")

    row = df.iloc[0]

    # Column names depend on the bdshare version — print(df.columns) locally
    # if these lookups fail, and adjust the keys below to match.
    data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "ticker": TICKER,
        "company": row.get("company", TICKER) if hasattr(row, "get") else TICKER,
        "price": float(row.get("ltp", 0)),
        "change": float(row.get("change", 0)),
        "change_pct": float(row.get("change_pct", 0)),
        "open": float(row.get("open", 0)),
        "high": float(row.get("high", 0)),
        "low": float(row.get("low", 0)),
        "prev_close": float(row.get("ycp", 0)),
        "volume": str(row.get("volume", "—")),
        "value_mn": float(row.get("value_mn", 0)) if row.get("value_mn") else 0,
    }
    data["history"] = build_history_placeholder(data["price"])

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(data, indent=2))
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
