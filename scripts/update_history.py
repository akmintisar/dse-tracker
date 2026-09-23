"""
Build compact per-stock historical chart files.

Historical data is stored separately from latest.json so the browser only
downloads a chart when a visitor selects a stock.
"""
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    from bdshare import get_historical_data
except ImportError:
    sys.exit("bdshare is not installed. Run: pip install bdshare")

ROOT = Path(__file__).resolve().parent.parent
LATEST = ROOT / "data" / "latest.json"
OUT = ROOT / "data" / "history"

def clean_num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def find_col(df, names):
    lookup = {str(c).lower(): c for c in df.columns}
    for name in names:
        if name.lower() in lookup:
            return lookup[name.lower()]
    return None

def compact_history(df):
    if df is None or df.empty:
        return {}

    date_col = find_col(df, ["date", "trading_date"])
    close_col = find_col(df, ["close", "ltp", "ycp"])
    if not close_col:
        return {}

    rows = []
    for idx, row in df.iterrows():
        raw_date = row.get(date_col) if date_col else idx
        close = clean_num(row.get(close_col))
        if close is None or raw_date is None:
            continue
        rows.append([str(raw_date)[:10], close])

    rows = sorted(rows, key=lambda x: x[0])
    if not rows:
        return {}

    today = date.today()
    normalized = []
    for d, v in rows:
        try:
            parsed = datetime.fromisoformat(d).date()
        except ValueError:
            try:
                parsed = datetime.strptime(d, "%Y-%m-%d").date()
            except ValueError:
                continue
        normalized.append([parsed, v])
    cutoffs = {
        "1D": today - timedelta(days=2),
        "5D": today - timedelta(days=9),
        "1M": today - timedelta(days=35),
        "6M": today - timedelta(days=190),
        "YTD": date(today.year, 1, 1),
        "1Y": today - timedelta(days=370),
        "5Y": today - timedelta(days=1825),
    }

    return {
        period: [[d.isoformat(), v] for d, v in normalized if d >= cutoff]
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
    start = end - timedelta(days=1825)
    OUT.mkdir(parents=True, exist_ok=True)

    failures = 0
    successes = 0

    for i, symbol in enumerate(symbols, 1):
        try:
            df = get_historical_data(str(start), str(end), symbol)
            history = compact_history(df)

            if history:
                (OUT / f"{symbol}.json").write_text(
                    json.dumps(history, separators=(",", ":")),
                    encoding="utf-8",
                )
                successes += 1

            print(f"[{i}/{len(symbols)}] {symbol}: {sum(len(v) for v in history.values())} points")
        except Exception as exc:
            failures += 1
            print(f"[{i}/{len(symbols)}] {symbol}: skipped ({exc})")

    print(f"History update complete. Successful: {successes}; failures: {failures}")

if __name__ == "__main__":
    main()
