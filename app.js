const DATA_URL = "data/latest.json";
const HISTORY_URL = "data/history/";
let allStocks = {};
let currentData = null;
let currentRange = "1M";
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

    if (currentData) loadHistory(currentData.ticker, currentRange);
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

function formatAxisPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return "৳ " + (n / 1000).toFixed(1) + "K";
  if (Math.abs(n) >= 100) return "৳ " + n.toFixed(0);
  if (Math.abs(n) >= 10) return "৳ " + n.toFixed(1);
  return "৳ " + n.toFixed(2);
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

function niceDate(value, range) {
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return value;

  if (range === "5D" || range === "1M") {
    return d.toLocaleDateString("en-US", {month: "short", day: "numeric"});
  }
  if (range === "6M" || range === "YTD" || range === "1Y") {
    return d.toLocaleDateString("en-US", {month: "short", year: "2-digit"});
  }
  return d.toLocaleDateString("en-US", {year: "numeric"});
}

function clearChartLabels() {
  $("chart-grid").innerHTML = "";
  $("chart-y-labels").innerHTML = "";
  $("chart-x-labels").innerHTML = "";
}

function drawChart(series) {
  const line = $("chart-line");
  const empty = $("chart-empty");
  clearChartLabels();

  if (!series || series.length < 2) {
    line.setAttribute("points", "");
    line.classList.remove("up", "down");
    empty.textContent = currentRange === "1D"
      ? "Intraday data will be added separately."
      : "Historical data is not available for this stock yet.";
    empty.hidden = false;
    $("chart-range-label").textContent = currentRange === "1D" ? "Intraday" : currentRange;
    return;
  }

  empty.hidden = true;

  const clean = series
    .map(p => [String(p[0]), Number(p[1])])
    .filter(p => Number.isFinite(p[1]));

  if (clean.length < 2) {
    line.setAttribute("points", "");
    empty.hidden = false;
    return;
  }

  const values = clean.map(p => p[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * 0.02, 1);
  const chartMin = Math.max(0, min - spread * 0.08);
  const chartMax = max + spread * 0.08;

  const w = 600, h = 180;
  const left = 72, right = 8, top = 8, bottom = 26;
  const plotW = w - left - right;
  const plotH = h - top - bottom;

  const points = clean.map((p, i) => {
    const x = left + (i / (clean.length - 1)) * plotW;
    const y = top + (1 - (p[1] - chartMin) / (chartMax - chartMin)) * plotH;
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");

  line.setAttribute("points", points);
  line.classList.toggle("up", clean[clean.length - 1][1] >= clean[0][1]);
  line.classList.toggle("down", clean[clean.length - 1][1] < clean[0][1]);

  const overlay = $("chart-overlay");
  overlay.innerHTML = "";
  const focusLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  focusLine.setAttribute("id", "chart-focus-line");
  focusLine.setAttribute("y1", top);
  focusLine.setAttribute("y2", top + plotH);
  focusLine.setAttribute("visibility", "hidden");
  overlay.appendChild(focusLine);

  const focusDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  focusDot.setAttribute("id", "chart-focus-dot");
  focusDot.setAttribute("r", "4");
  focusDot.setAttribute("visibility", "hidden");
  overlay.appendChild(focusDot);

  let tooltip = $("chart-tooltip");
  tooltip.hidden = true;

  const showPoint = (clientX) => {
    const rect = $("chart-svg").getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * w;
    const clamped = Math.max(left, Math.min(w - right, svgX));
    const ratio = (clamped - left) / plotW;
    const index = Math.max(0, Math.min(clean.length - 1,
      Math.round(ratio * (clean.length - 1))));
    const p = clean[index];
    const x = left + (index / (clean.length - 1)) * plotW;
    const y = top + (1 - (p[1] - chartMin) / (chartMax - chartMin)) * plotH;

    focusLine.setAttribute("x1", x);
    focusLine.setAttribute("x2", x);
    focusLine.setAttribute("visibility", "visible");
    focusDot.setAttribute("cx", x);
    focusDot.setAttribute("cy", y);
    focusDot.setAttribute("visibility", "visible");

    tooltip.innerHTML =
      "<strong>" + escapeHTML(niceDate(p[0], currentRange)) + "</strong>" +
      "<span>৳ " + formatNumber(p[1]) + "</span>";
    tooltip.hidden = false;

    const tooltipLeft = (x / w) * rect.width;
    tooltip.style.left = Math.max(8, Math.min(rect.width - 120, tooltipLeft + 8)) + "px";
    tooltip.style.top = Math.max(4, (y / h) * rect.height - 42) + "px";
  };

  const hidePoint = () => {
    focusLine.setAttribute("visibility", "hidden");
    focusDot.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  };

  $("chart-svg").onmousemove = (e) => showPoint(e.clientX);
  $("chart-svg").ontouchmove = (e) => {
    if (e.touches.length) showPoint(e.touches[0].clientX);
  };
  $("chart-svg").onmouseleave = hidePoint;
  $("chart-svg").ontouchend = hidePoint;

  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const y = top + (i / tickCount) * plotH;
    const value = chartMax - (i / tickCount) * (chartMax - chartMin);

    const grid = document.createElementNS("http://www.w3.org/2000/svg", "line");
    grid.setAttribute("x1", left);
    grid.setAttribute("x2", w - right);
    grid.setAttribute("y1", y);
    grid.setAttribute("y2", y);
    $("chart-grid").appendChild(grid);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", left - 7);
    label.setAttribute("y", y + 3);
    label.setAttribute("text-anchor", "end");
    label.textContent = formatAxisPrice(value);
    $("chart-y-labels").appendChild(label);
  }

  const labelCount = Math.min(6, clean.length);
  for (let i = 0; i < labelCount; i++) {
    const index = Math.round(i * (clean.length - 1) / (labelCount - 1));
    const x = left + (index / (clean.length - 1)) * plotW;

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x);
    label.setAttribute("y", h - 5);
    label.setAttribute("text-anchor", i === 0 ? "start" : i === labelCount - 1 ? "end" : "middle");
    label.textContent = niceDate(clean[index][0], currentRange);
    $("chart-x-labels").appendChild(label);
  }

  $("chart-range-label").textContent =
    currentRange === "YTD" ? "Year to date" :
    currentRange === "5Y" ? "5 years" : currentRange;
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