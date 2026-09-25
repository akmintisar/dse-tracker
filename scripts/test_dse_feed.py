"""One-request diagnostic for the bdshare live DSE feed."""
import sys
from bdshare import get_current_trade_data

def main():
    try:
        df = get_current_trade_data()
    except Exception as exc:
        print(f"DSE feed request failed: {type(exc).__name__}: {exc}")
        raise

    if df is None:
        sys.exit("DSE feed returned None.")
    print(f"Rows returned: {len(df)}")
    print(f"Columns: {[str(c) for c in df.columns]}")
    if not df.empty:
        print("Sample rows:")
        print(df.head(3).to_string(index=False))
    else:
        sys.exit("DSE feed returned an empty table.")

if __name__ == "__main__":
    main()
