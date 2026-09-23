"""
Build compact per-stock historical chart files.

This is intentionally separate from latest.json: the browser downloads only
the history for the stock a visitor selects.

Run daily after market close:
    python scripts/update_history.py
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

try:
    from bdshare import get_historical_data
except ImportError:
    sys.exit("bdshare is not installed. Run: pip install bdshare")

ROOT = Path(__file__).resolve().parent.parent
LATEST = ROOT / "data" / "latest.json"
OUT = ROOT / "data" / "history"

def clean_num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

def find_col(df, names):
    lower = {str(c).lower(): c for c in df.columns}
    for name in names:
        if name.lower() in lower:
            return lower[name.lower()]
    return None

def compact_history(df):
    if df is None or df.empty:
        return {}

    date_col = find_col(df, ["date", "trading_date"])
    close_col = find_col(df, ["close", "ltp", "ycp"])
    if not date_col or not close_col:
        return {}

    rows = []
    for _, row in df.iterrows():
        close = clean_num(row.get(close_col))
        if close is None:
            continue
        rows.append([str(row.get(date_col))[:10], close])

    rows = sorted(rows, key=lambda x: x[0])
    if not rows:
        return {}

    today = date.today()
    cutoffs = {
        "1D": today - timedelta(days=2),
        "1W": today - timedelta(days=9),
        "1M": today - timedelta(days=35),
        "1Y": today - timedelta(days=370),
    }

    return {
        period: [[d, v] for d, v in rows if d >= cutoff]
        for period, cutoff in cutoffs.items()
    }

def main():
    if not LATEST.exists():
        sys.exit("data/latest.json does not exist. Run scrape.py first.")

    payload = json.loads(LATEST.read_text(encoding="utf-8"))
    symbols = sorted(payload.get("stocks", {}))
    if not symbols:
        sys.exit("No symbols found in latest.json.")

    end = date.today()
    start = end - timedelta(days=370)
    OUT.mkdir(parents=True, exist_ok=True)

    failures = 0
    for i, symbol in enumerate(symbols, 1):
        try:
            df = get_historical_data(str(start), str(end), symbol)
            history = compact_history(df)
            if history:
                (OUT / f"{symbol}.json").write_text(
                    json.dumps(history, separators=(",", ":")),
                    encoding="utf-8",
                )
            print(f"[{i}/{len(symbols)}] {symbol}: {sum(len(v) for v in history.values())} points")
        except Exception as exc:
            failures += 1
            print(f"[{i}/{len(symbols)}] {symbol}: skipped ({exc})")

    print(f"History update complete. Failures: {failures}")

if __name__ == "__main__":
    main()
