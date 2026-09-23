// Renders a single stock's price, chart, and stats from data/latest.json.
// This file expects latest.json to look like:
// {
//   "updated_at": "2026-09-22T10:30:00Z",
//   "ticker": "GP",
//   "company": "Grameenphone Ltd.",
//   "price": 312.40,
//   "change": 4.20,
//   "change_pct": 1.36,
//   "open": 308.20,
//   "high": 314.00,
//   "low": 306.50,
//   "prev_close": 308.20,
//   "volume": "1.2M",
//   "value_mn": 375.1,
//   "history": {
//     "1D": [ [ "10:00", 308 ], [ "10:30", 310 ], ... ],
//     "1W": [ [ "Mon", 305 ], [ "Tue", 308 ], ... ],
//     "1M": [...],
//     "1Y": [...]
//   }
// }

const DATA_URL = "data/latest.json";
let currentData = null;
let currentRange = "1W";

async function loadData() {
  try {
    const res = await fetch(DATA_URL + "?t=" + Date.now()); // cache-bust
    if (!res.ok) throw new Error("Failed to fetch data");
    currentData = await res.json();
    render();
    document.getElementById("status-badge").textContent = "Live";
  } catch (err) {
    console.error(err);
    document.getElementById("status-badge").textContent = "Offline (using cached view)";
  }
}

function render() {
  if (!currentData) return;
  const d = currentData;

  document.getElementById("stock-ticker").textContent = `${d.ticker} · ${d.company}`;
  document.getElementById("stock-price").textContent = `৳ ${d.price.toFixed(2)}`;

  const changeEl = document.getElementById("stock-change");
  const up = d.change >= 0;
  changeEl.textContent = `${up ? "▲" : "▼"} ${Math.abs(d.change).toFixed(2)} (${Math.abs(d.change_pct).toFixed(2)}%) today`;
  changeEl.className = "change " + (up ? "up" : "down");

  document.getElementById("last-updated").textContent =
    d.updated_at ? `Updated ${new Date(d.updated_at).toLocaleString()}` : "";

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
