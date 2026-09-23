# DSE Tracker

A simple, dark, distraction-free tracker for Dhaka Stock Exchange prices —
built to grow feature-by-feature over time.

## How it works

- `index.html` / `style.css` / `app.js` — the static site. It fetches
  `data/latest.json` and renders the price, chart, and stats.
- `data/latest.json` — the data the site reads. Right now it's a placeholder.
- `scripts/scrape.py` — pulls current price data using the unofficial
  `bdshare` package and overwrites `data/latest.json`.
- `.github/workflows/update-data.yml` — a scheduled GitHub Actions job that
  runs the scraper automatically and commits the result, so the site stays
  updated with no server needed.

## Deploying (GitHub Pages)

1. Create a new GitHub repo and push this folder to it.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source: Deploy from a branch**,
   branch: `main`, folder: `/ (root)`. Save.
4. GitHub will give you a URL like `https://<username>.github.io/<repo>/`
   within a minute or two — that's your live site.

## Turning on auto-updates

1. Go to the repo's **Actions** tab and enable workflows if prompted.
2. The `update-data.yml` workflow runs automatically on the schedule in the
   file (every 30 min during DSE trading hours, Sun–Thu). You can also
   trigger it manually anytime from Actions → "Update DSE price data" →
   "Run workflow".
3. First run: check the Actions log. If `scrape.py` fails, it's almost
   always because bdshare's column names have changed — see the comments
   inside `scripts/scrape.py` for where to adjust.

## Local testing before you deploy

```bash
pip install -r scripts/requirements.txt
python scripts/scrape.py GP
python -m http.server 8000
# open http://localhost:8000
```

## Adding features later

Everything reads from one JSON file, so most future features are additive:
- More tickers → scrape a list instead of one symbol, write one JSON per
  ticker or one combined file.
- Watchlist → frontend-only, reads the same data.
- Real historical charts → replace the placeholder `build_history_placeholder`
  in `scrape.py` with real `get_hist_data()` output.
