"""
Capture a five-minute intraday snapshot for every DSE instrument.

The DSE does not expose a public push/streaming API through bdshare, so the
site builds a genuine intraday series from repeated live-market snapshots.
"""
import json
import math
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from bdshare import get_current_trade_data

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "intraday"
DHAKA = ZoneInfo("Asia/Dhaka")

def clean(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None

def find_col(df, names):
    lookup = {str(c).lower(): c for c in df.columns}
    for name in names:
        if name.lower() in lookup:
            return lookup[name.lower()]
    return None

def main():
    now = datetime.now(DHAKA)
    day_dir = OUT / now.strftime("%Y-%m-%d")
    day_dir.mkdir(parents=True, exist_ok=True)

    df = get_current_trade_data()
    symbol_col = find_col(df, ["symbol", "code"])
    price_col = find_col(df, ["ltp", "price", "close"])

    if not symbol_col or not price_col:
        raise RuntimeError("Could not identify symbol/price columns in DSE data.")

    stamp = now.strftime("%H:%M:%S")
    count = 0

    for _, row in df.iterrows():
        symbol = str(row.get(symbol_col, "")).strip().upper()
        price = clean(row.get(price_col))

        if not symbol or price is None:
            continue

        path = day_dir / f"{symbol}.json"
        try:
            payload = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        except (json.JSONDecodeError, OSError):
            payload = []

        if not payload or payload[-1][0] != stamp:
            payload.append([stamp, price])

        path.write_text(
            json.dumps(payload, separators=(",", ":")),
            encoding="utf-8",
        )
        count += 1

    print(f"Captured {count} instruments at {stamp} Asia/Dhaka.")

if __name__ == "__main__":
    main()
