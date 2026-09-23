const DATA_URL = "data/latest.json";
const HISTORY_URL = "data/history/";
let allStocks = {};
let currentData = null;
let currentRange = "1W";
let historyCache = {};

const $ = (id) => document.getElementById(id);

async function loadData() {
  try {
    const res = await fetch(DATA_URL + "?t=" + Date.now());
    if (!res.ok) throw new Error("Failed to load market data");
    const payload = await res.json();

    allStocks = payload.stocks || {};
    const keep = currentData?.ticker;
    const ticker = keep && allStocks[keep] ? keep : payload.default_ticker;
    currentData = allStocks[ticker] || null;

    $("last-updated").textContent = payload.updated_at
      ? "Market data updated " + new Date(payload.updated_at).toLocaleString()
      : "";

    $("status-badge").textContent = Object.keys(allStocks).length + " stocks";
    render();
  } catch (err) {
    console.error(err);
    $("status-badge").textContent = "Data unavailable";
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function closeResults() {
  const box = $("search-results");
  box.classList.remove("open");
  box.innerHTML = "";
}

function selectStock(ticker) {
  if (!allStocks[ticker]) return;
  currentData = allStocks[ticker];
  $("search-input").value = "";
  closeResults();
  render();
  loadHistory(ticker, currentRange);
}

function runSearch(query) {
  const box = $("search-results");
  const q = query.trim().toLowerCase();
  if (!q) { closeResults(); return; }

  const matches = Object.values(allStocks)
    .filter(s => String(s.ticker).toLowerCase().includes(q) ||
                 String(s.company).toLowerCase().includes(q))
    .sort((a,b) => {
      const score = (s) => s === q ? -3 : s.startsWith(q) ? -2 : s.includes(q) ? -1 : 0;
      const at = String(a.ticker).toLowerCase();
      const bt = String(b.ticker).toLowerCase();
      return score(at) - score(bt) || at.localeCompare(bt);
    })
    .slice(0, 30);

  box.innerHTML = matches.length
    ? matches.map(s =>
        '<button class="result" type="button" data-ticker="' + escapeHTML(s.ticker) + '">' +
        '<span class="symbol">' + escapeHTML(s.ticker) + '</span>' +
        '<span class="name">' + escapeHTML(s.company) + '</span>' +
        '</button>'
      ).join("")
    : '<div class="no-match">No DSE stock matched your search.</div>';

  box.querySelectorAll(".result").forEach(el =>
    el.addEventListener("click", () => selectStock(el.dataset.ticker))
  );
  box.classList.add("open");
}

$("search-input").addEventListener("input", e => runSearch(e.target.value));
document.addEventListener("click", e => {
  if (!e.target.closest(".search")) closeResults();
});

function formatNumber(value, decimals = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-BD", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }) : "—";
}

function formatInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-BD", {maximumFractionDigits:0}) : "—";
}

function render() {
  if (!currentData) return;
  const d = currentData;

  $("stock-ticker").textContent = d.ticker + " · " + d.company;
  $("stock-price").textContent = d.price == null ? "—" : "৳ " + formatNumber(d.price);

  const changeEl = $("stock-change");
  if (d.change == null || d.change_pct == null) {
    changeEl.className = "change";
    changeEl.textContent = "No recent trade data";
  } else {
    const up = Number(d.change) >= 0;
    changeEl.className = "change " + (up ? "up" : "down");
    changeEl.textContent = (up ? "▲ " : "▼ ") + formatNumber(Math.abs(d.change)) +
      " (" + formatNumber(Math.abs(d.change_pct)) + "%) today";
  }

  const stats = [
    ["Open", d.open == null ? "—" : "৳ " + formatNumber(d.open)],
    ["High", d.high == null ? "—" : "৳ " + formatNumber(d.high)],
    ["Low", d.low == null ? "—" : "৳ " + formatNumber(d.low)],
    ["Prev. Close", d.prev_close == null ? "—" : "৳ " + formatNumber(d.prev_close)],
    ["Volume", formatInteger(d.volume)],
    ["Value (mn)", d.value_mn == null ? "—" : "৳ " + formatNumber(d.value_mn)]
  ];

  $("stats-grid").innerHTML = stats.map(([label,value]) =>
    '<div class="stat"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>'
  ).join("");

  drawChart();
}

async function loadHistory(ticker, range) {
  if (range === "1D") {
    drawChart([]);
    return;
  }

  if (historyCache[ticker]?.[range]) {
    drawChart(historyCache[ticker][range]);
    return;
  }

  try {
    const res = await fetch(HISTORY_URL + encodeURIComponent(ticker) + ".json?t=" + Date.now());
    if (!res.ok) throw new Error("No history file");
    const history = await res.json();
    historyCache[ticker] = history;
    drawChart(history[range] || []);
  } catch {
    drawChart([]);
  }
}

function drawChart(series) {
  const line = $("chart-line");
  const empty = $("chart-empty");

  if (!series || series.length < 2) {
    line.setAttribute("points", "");
    empty.textContent = currentRange === "1D"
      ? "Intraday data will be added separately."
      : "Historical data is not available for this stock yet.";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  const values = series.map(p => Number(p[1])).filter(Number.isFinite);
  if (values.length < 2) {
    line.setAttribute("points", "");
    empty.hidden = false;
    return;
  }

  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1, w = 600, h = 180, pad = 10;
  const points = series.map((p,i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - pad - ((Number(p[1]) - min) / range) * (h - pad * 2);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  line.setAttribute("points", points);
}

document.querySelectorAll(".range-tabs button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".range-tabs button").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    currentRange = button.dataset.range;
    if (currentData) loadHistory(currentData.ticker, currentRange);
  });
});

loadData();
setInterval(loadData, 5 * 60 * 1000);