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
    from bdshare import get_basic_historical_data
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
    def normalize(value):
        return "".join(ch for ch in str(value).lower() if ch.isalnum())

    lookup = {normalize(c): c for c in df.columns}
    for name in names:
        key = normalize(name)
        if key in lookup:
            return lookup[key]
    return None

def get_52_week_extremes(df):
    if df is None or df.empty:
        return None, None

    date_col = find_col(df, ["date", "trading_date", "datetime", "timestamp"])
    high_col = find_col(df, ["high", "highest_price", "day_high", "high_price", "highp"])
    low_col = find_col(df, ["low", "lowest_price", "day_low", "low_price", "lowp"])
    if not high_col or not low_col:
        return None, None

    rows = []
    for idx, row in df.iterrows():
        raw_date = row.get(date_col) if date_col else idx
        try:
            parsed = datetime.fromisoformat(str(raw_date)[:10]).date()
        except ValueError:
            try:
                parsed = datetime.strptime(str(raw_date)[:10], "%Y-%m-%d").date()
            except ValueError:
                continue
        high = clean_num(row.get(high_col))
        low = clean_num(row.get(low_col))
        if high is not None and low is not None:
            rows.append((parsed, high, low))

    if not rows:
        return None, None

    latest_date = max(r[0] for r in rows)
    cutoff = latest_date - timedelta(days=365)
    window = [r for r in rows if r[0] >= cutoff]
    if not window:
        return None, None

    return max(r[1] for r in window), min(r[2] for r in window)

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
            df = get_basic_historical_data(str(start), str(end), symbol)
            history = compact_history(df)
            week52_high, week52_low = get_52_week_extremes(df)
            if symbol in payload.get("stocks", {}):
                payload["stocks"][symbol]["week52_high"] = week52_high
                payload["stocks"][symbol]["week52_low"] = week52_low

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

    LATEST.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"History update complete. Successful: {successes}; failures: {failures}")

if __name__ == "__main__":
    main()
