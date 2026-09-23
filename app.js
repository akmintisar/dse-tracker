// Renders a stock's price, chart, and stats from data/latest.json.
// latest.json now holds ALL DSE tickers, keyed under "stocks":
// {
//   "updated_at": "...",
//   "default_ticker": "GP",
//   "stocks": {
//     "GP": { "ticker": "GP", "company": "...", "price": ..., "history": {...} },
//     "SQURPHARMA": { ... },
//     ...
//   }
// }

const DATA_URL = "data/latest.json";
let allStocks = {};
let currentData = null;
let currentRange = "1W";

async function loadData() {
  try {
    const res = await fetch(DATA_URL + "?t=" + Date.now()); // cache-bust
    if (!res.ok) throw new Error("Failed to fetch data");
    const payload = await res.json();
    allStocks = payload.stocks || {};

    // Keep showing whatever's currently selected if it still exists,
    // otherwise fall back to the default ticker.
    const keepTicker = currentData?.ticker;
    const nextTicker = (keepTicker && allStocks[keepTicker]) ? keepTicker : payload.default_ticker;
    currentData = allStocks[nextTicker] || null;

    document.getElementById("last-updated").dataset.updatedAt = payload.updated_at || "";
    render();
    document.getElementById("status-badge").textContent = "Live";
  } catch (err) {
    console.error(err);
    document.getElementById("status-badge").textContent = "Offline (using cached view)";
  }
}

function selectStock(ticker) {
  if (!allStocks[ticker]) return;
  currentData = allStocks[ticker];
  currentRange = "1W";
  document.querySelectorAll(".range-tabs button").forEach(b =>
    b.classList.toggle("active", b.dataset.range === "1W")
  );
  render();
  document.getElementById("search-input").value = "";
  closeResults();
}

function closeResults() {
  const box = document.getElementById("search-results");
  box.classList.remove("open");
  box.innerHTML = "";
}

function runSearch(query) {
  const box = document.getElementById("search-results");
  const q = query.trim().toLowerCase();
  if (!q) { closeResults(); return; }

  const matches = Object.values(allStocks).filter(s =>
    s.ticker.toLowerCase().includes(q) || s.company.toLowerCase().includes(q)
  ).slice(0, 20);

  if (matches.length === 0) {
    box.innerHTML = `<div class="no-match">No matching stock found</div>`;
  } else {
    box.innerHTML = matches.map(s =>
      `<div class="result" data-ticker="${s.ticker}">
         <span>${s.ticker}</span><span class="name">${s.company}</span>
       </div>`
    ).join("");
    box.querySelectorAll(".result").forEach(el => {
      el.addEventListener("click", () => selectStock(el.dataset.ticker));
    });
  }
  box.classList.add("open");
}

document.getElementById("search-input").addEventListener("input", (e) => runSearch(e.target.value));
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) closeResults();
});

function render() {
  if (!currentData) return;
  const d = currentData;

  document.getElementById("stock-ticker").textContent = `${d.ticker} · ${d.company}`;
  document.getElementById("stock-price").textContent = `৳ ${d.price.toFixed(2)}`;

  const changeEl = document.getElementById("stock-change");
  const up = d.change >= 0;
  changeEl.textContent = `${up ? "▲" : "▼"} ${Math.abs(d.change).toFixed(2)} (${Math.abs(d.change_pct).toFixed(2)}%) today`;
  changeEl.className = "change " + (up ? "up" : "down");

  const updatedAt = document.getElementById("last-updated").dataset.updatedAt;
  document.getElementById("last-updated").textContent =
    updatedAt ? `Updated ${new Date(updatedAt).toLocaleString()}` : "";

  const stats = [
    ["Open", `৳ ${d.open?.toFixed(2) ?? "—"}`],
    ["High", `৳ ${d.high?.toFixed(2) ?? "—"}`],
    ["Low", `৳ ${d.low?.toFixed(2) ?? "—"}`],
    ["Prev. Close", `৳ ${d.prev_close?.toFixed(2) ?? "—"}`],
    ["Volume", d.volume ?? "—"],
    ["Value (mn)", `৳ ${d.value_mn ?? "—"}`],
  ];
  document.getElementById("stats-grid").innerHTML = stats.map(
    ([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`
  ).join("");

  drawChart();
}

function drawChart() {
  const series = currentData?.history?.[currentRange];
  const line = document.getElementById("chart-line");
  if (!series || series.length === 0) {
    line.setAttribute("points", "");
    return;
  }
  const values = series.map(p => p[1]);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const w = 600, h = 180, pad = 10;

  const points = series.map((p, i) => {
    const x = (i / (series.length - 1 || 1)) * w;
    const y = h - pad - ((p[1] - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  line.setAttribute("points", points);
}

document.querySelectorAll(".range-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.dataset.range;
    drawChart();
  });
});

loadData();
// Auto-refresh every 5 minutes while the tab is open
setInterval(loadData, 5 * 60 * 1000);
