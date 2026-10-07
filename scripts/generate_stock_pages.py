"""Generate static, indexable stock pages and the sitemap for GitHub Pages."""

import html
import json
import shutil
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "latest.json"
STOCK_ROOT = ROOT / "stock"
SITEMAP_PATH = ROOT / "sitemap.xml"

STATIC_PAGES = ["/", "/all-stocks/", "/insights/", "/news/", "/investments/", "/about/"]

def esc(value):
    return html.escape(str(value), quote=True)

def fmt_number(value):
    if value is None:
        return "—"
    try:
        number = float(value)
        return f"{number:,.0f}" if number.is_integer() else f"{number:,.2f}"
    except (TypeError, ValueError):
        return "—"

def fmt_integer(value):
    if value is None:
        return "—"
    try:
        return f"{int(float(value)):,}"
    except (TypeError, ValueError):
        return "—"

def fmt_change(stock):
    change, pct = stock.get("change"), stock.get("change_pct")
    if change is None or pct is None:
        return "No recent trade data"
    try:
        sign = "▲" if float(change) >= 0 else "▼"
        return f"{sign} {fmt_number(abs(float(change)))} ({fmt_number(abs(float(pct)))}%) today"
    except (TypeError, ValueError):
        return "No recent trade data"

def page_html(stock):
    ticker = str(stock.get("ticker", ""))
    company = str(stock.get("company") or ticker)
    category = str(stock.get("category") or "")
    price = stock.get("price")
    title = f"{ticker} Stock Price & Data — Chrematics"
    description = f"{ticker} ({company}) stock price, daily change, trading volume, 52-week high and low, and historical data from Chrematics."
    category_html = (
        f'<span class="category-badge category-{esc(category.lower())}">{esc(category)}</span>'
        if category else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="https://chrematics.com/stock/{esc(quote(ticker, safe=''))}/">
<title>{esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header>
  <div class="brand">
    <a class="brand-home" href="/"><h1>Chrematics</h1></a>
    <p class="subtitle">Dhaka Stock Exchange · Bangladesh</p>
  </div>
  <nav class="main-nav" aria-label="Main navigation">
    <a href="/all-stocks/">All Stocks</a>
    <a href="/insights/">Insights</a>
    <a href="/news/">News</a>
    <a href="/investments/">Investments</a>
    <a href="/about/">About</a>
  </nav>
</header>
<div class="search-shell">
  <div class="search">
    <label class="sr-only" for="search-input">Search DSE stocks</label>
    <div class="search-box">
      <span class="search-icon">⌕</span>
      <input id="search-input" type="search" autocomplete="off" placeholder="Search by ticker or company name…" />
    </div>
    <div id="search-results" role="listbox"></div>
  </div>
</div>
<main class="container">
  <div class="updated" id="last-updated"></div>
  <span id="status-badge" hidden></span>
  <section id="market-home" hidden></section>
  <section id="all-stocks" hidden></section>
  <section id="stock-detail">
    <button class="back-button" id="back-to-market" type="button" onclick="window.location.href='/'">← Back to market</button>
    <section class="price-card">
      <div class="price-top">
        <div>
          <div class="stock-ticker-row">
            <span class="ticker" id="stock-ticker">{esc(ticker)}</span>
            {category_html}
            <span id="stock-category" hidden>{esc(category)}</span>
          </div>
          <div class="company-name" id="stock-company">{esc(company)}</div>
          <div class="price" id="stock-price">{"৳ " + fmt_number(price) if price is not None else "—"}</div>
          <div class="change" id="stock-change">{esc(fmt_change(stock))}</div>
        </div>
        <div class="range-tabs" aria-label="Chart range">
          <button data-range="1D" class="active">1D</button>
          <button data-range="5D">5D</button>
          <button data-range="1M">1M</button>
          <button data-range="6M">6M</button>
          <button data-range="YTD">YTD</button>
          <button data-range="1Y">1Y</button>
          <button data-range="5Y">5Y</button>
        </div>
      </div>
      <div class="chart-heading">
        <span id="chart-title">Change since previous close</span>
        <span id="chart-range-label">Change since previous close</span>
      </div>
      <div class="chart-wrap">
        <svg id="chart-svg" viewBox="0 0 600 180" preserveAspectRatio="xMinYMid meet" aria-label="Historical stock price chart">
          <g id="chart-grid"></g><g id="chart-y-labels"></g>
          <polyline id="chart-line" fill="none" stroke-width="2" points="" />
          <g id="chart-x-labels"></g><g id="chart-overlay"></g>
        </svg>
        <div id="chart-empty" class="chart-empty" hidden>No historical data for this range yet.</div>
        <div id="chart-tooltip" class="chart-tooltip" hidden></div>
      </div>
    </section>
    <section class="stats-grid" id="stats-grid">
      <div class="stat"><div class="label">Volume</div><div class="value">{esc(fmt_integer(stock.get("volume")))}</div></div>
      <div class="stat"><div class="label">Open</div><div class="value">{esc("৳ " + fmt_number(stock.get("open")) if stock.get("open") is not None else "—")}</div></div>
      <div class="stat"><div class="label">Today's High</div><div class="value">{esc("৳ " + fmt_number(stock.get("high")) if stock.get("high") is not None else "—")}</div></div>
      <div class="stat"><div class="label">Today's Low</div><div class="value">{esc("৳ " + fmt_number(stock.get("low")) if stock.get("low") is not None else "—")}</div></div>
      <div class="stat"><div class="label">52-Week High</div><div class="value">{esc("৳ " + fmt_number(stock.get("week52_high")) if stock.get("week52_high") is not None else "—")}</div></div>
      <div class="stat"><div class="label">52-Week Low</div><div class="value">{esc("৳ " + fmt_number(stock.get("week52_low")) if stock.get("week52_low") is not None else "—")}</div></div>
    </section>
    <section class="market-panel" style="margin-top:24px">
      <div class="panel-heading"><h2>{esc(ticker)} Stock Information</h2><span>{esc(category) if category else "DSE"}</span></div>
      <p>{esc(company)} ({esc(ticker)}) is listed on the Dhaka Stock Exchange. Chrematics provides the latest available price, daily market movement, trading volume, 52-week range, and historical chart data for this security.</p>
    </section>
  </section>
</main>
<footer class="site-footer">
  <div class="footer-inner"><div class="footer-main">
    <div class="footer-brand"><a href="/">Chrematics</a><p>Bangladesh stock market data, market movers, and historical price information.</p></div>
    <div class="footer-column"><h3>Explore</h3><a href="/">Market</a><a href="/all-stocks/">All Stocks</a><a href="/insights/">Insights</a><a href="/news/">News</a><a href="/investments/">Investments</a></div>
    <div class="footer-column"><h3>Information</h3><a href="/about/">About</a><a href="/about#market-data">Market Data</a><a href="/about#data-timing">Data Timing</a><a href="/about#disclaimer">Disclaimer</a></div>
  </div><div class="footer-bottom"><span>© 2026 Chrematics</span></div></div>
</footer>
<script src="/app.js"></script>
</body>
</html>
"""

def write_sitemap(stocks, updated_at):
    urls = STATIC_PAGES + [f"/stock/{quote(str(ticker), safe='')}/" for ticker in sorted(stocks)]
    lastmod = ""
    if updated_at:
        try:
            lastmod = f"<lastmod>{esc(datetime.fromisoformat(updated_at.replace('Z', '+00:00')).date().isoformat())}</lastmod>"
        except ValueError:
            pass
    body = "\n".join(f"  <url><loc>https://chrematics.com{url}</loc>{lastmod}</url>" for url in urls)
    SITEMAP_PATH.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n</urlset>\n",
        encoding="utf-8",
    )

def main():
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    stocks = payload.get("stocks", {})
    STOCK_ROOT.mkdir(exist_ok=True)
    valid_tickers = set()
    for ticker, stock in stocks.items():
        ticker = str(ticker)
        valid_tickers.add(ticker)
        directory = STOCK_ROOT / ticker
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "index.html").write_text(page_html(stock), encoding="utf-8")
    for child in STOCK_ROOT.iterdir():
        if child.is_dir() and child.name not in valid_tickers:
            shutil.rmtree(child)
    write_sitemap(stocks, payload.get("updated_at"))
    print(f"Generated {len(valid_tickers)} stock pages and sitemap.xml.")

if __name__ == "__main__":
    main()
