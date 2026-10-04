const SITE_ROOT = "/";
const DATA_URL = SITE_ROOT + "data/latest.json";
const HISTORY_URL = SITE_ROOT + "data/history/";
const DATA_FALLBACK_URL = "https://raw.githubusercontent.com/akmintisar/dse-tracker/main/data/latest.json";
const HISTORY_FALLBACK_URL = "https://raw.githubusercontent.com/akmintisar/dse-tracker/main/data/history/";
let allStocks = {};
let currentData = null;
let currentRange = "1D";
let historyCache = {};
let currentPage = "market";

const $ = (id) => document.getElementById(id);

async function loadData() {
  try {
    let res = await fetch(DATA_URL + "?t=" + Date.now());
    if (!res.ok) {
      res = await fetch(DATA_FALLBACK_URL + "?t=" + Date.now());
    }
    if (!res.ok) throw new Error("Failed to load market data");
    const payload = await res.json();

    allStocks = payload.stocks || {};
    $("last-updated").textContent = payload.updated_at
      ? "Market data updated " + new Date(payload.updated_at).toLocaleString()
      : "";

    if ($("status-badge")) $("status-badge").textContent = Object.keys(allStocks).length + " stocks";

    const path = window.location.pathname.replace(/\/+$/, "");
    const stockPrefix = SITE_ROOT.replace(/\\+$/, "") + "/stock/";
    const pathTicker = path.startsWith(stockPrefix)
      ? decodeURIComponent(path.slice(stockPrefix.length))
      : null;
    const params = new URLSearchParams(window.location.search);
    const requestedTicker = pathTicker || params.get("stock");

    if (requestedTicker && allStocks[requestedTicker]) {
      selectStock(requestedTicker, params.has("stock") ? "replace" : "none");
    } else {
      renderMarket();
      routeFromLocation();
    }
  } catch (err) {
    console.error(err);
    if ($("status-badge")) $("status-badge").textContent = "Data unavailable";
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function closeResults() {
  const box = $("search-results");
  box.classList.remove("open");
  box.innerHTML = "";
}

function stockUrl(ticker) {
  return SITE_ROOT + "stock/" + encodeURIComponent(ticker);
}

function selectStock(ticker, urlMode = "push") {
  if (!allStocks[ticker]) return;
  if (urlMode === "replace") {
    window.history.replaceState({stock: ticker}, "", stockUrl(ticker));
  } else if (urlMode === "push") {
    window.history.pushState({stock: ticker}, "", stockUrl(ticker));
  }
  currentData = allStocks[ticker];
  $("search-input").value = "";
  closeResults();
  $("market-home").hidden = true;
  $("all-stocks").hidden = true;
  $("stock-detail").hidden = false;
  currentPage = "stock";
  renderStock();
  loadHistory(ticker, currentRange);
  window.scrollTo({top: 0, behavior: "smooth"});
}

function showMarket() {
  currentData = null;
  $("stock-detail").hidden = true;
  $("all-stocks").hidden = true;
  $("market-home").hidden = false;
  currentPage = "market";
  $("search-input").focus();
  window.scrollTo({top: 0, behavior: "smooth"});
}

function routeFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, "");
  const root = SITE_ROOT.replace(/\/+$/, "");
  const stockPrefix = "/stock/";

  if (path.startsWith(stockPrefix)) {
    const ticker = decodeURIComponent(path.slice(stockPrefix.length));
    if (allStocks[ticker]) {
      selectStock(ticker, "none");
      return;
    }
  }

  showMarket();
}

window.addEventListener("popstate", routeFromLocation);

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
$("back-to-market").addEventListener("click", () => {
  if (window.location.pathname.includes("/stock/")) {
    window.history.back();
  } else {
    showMarket();
  }
});

document.querySelector(".brand-home").addEventListener("click", e => {
  e.preventDefault();
  if (window.location.pathname !== SITE_ROOT) {
    window.history.pushState({}, "", SITE_ROOT);
  }
  showMarket();
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

function formatAxisPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return "৳ " + (n / 1000).toFixed(1) + "K";
  if (Math.abs(n) >= 100) return "৳ " + n.toFixed(0);
  if (Math.abs(n) >= 10) return "৳ " + n.toFixed(1);
  return "৳ " + n.toFixed(2);
}

function validStocks() {
  return Object.values(allStocks).filter(s => Number.isFinite(Number(s.price)) && Number(s.price) > 0);
}

function renderMarket() {
  const stocks = validStocks();
  const gainers = stocks.filter(s => Number.isFinite(Number(s.change_pct)) && Number(s.change_pct) > 0)
    .sort((a,b) => Number(b.change_pct) - Number(a.change_pct)).slice(0, 5);
  const losers = stocks.filter(s => Number.isFinite(Number(s.change_pct)) && Number(s.change_pct) < 0)
    .sort((a,b) => Number(a.change_pct) - Number(b.change_pct)).slice(0, 5);
  const traded = stocks.filter(s => Number.isFinite(Number(s.volume)) && Number(s.volume) > 0)
    .sort((a,b) => Number(b.volume) - Number(a.volume)).slice(0, 8);

  const advancing = stocks.filter(s => Number(s.change_pct) > 0).length;
  const declining = stocks.filter(s => Number(s.change_pct) < 0).length;
  const unchanged = stocks.filter(s => Number(s.change_pct) === 0).length;
  const totalVolume = stocks.reduce((sum, s) => {
    const v = Number(s.volume);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  $("market-snapshot").innerHTML = [
    ["Stocks Tracked", formatInteger(Object.keys(allStocks).length)],
    ["Advancing", formatInteger(advancing)],
    ["Declining", formatInteger(declining)],
    ["Unchanged", formatInteger(unchanged)],
    ["Total Volume", formatInteger(totalVolume)]
  ].map(([label,value]) =>
    '<div class="snapshot-card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>'
  ).join("");

  $("top-gainers").innerHTML = gainers.length ? gainers.map(moverRow).join("") : emptyMarketMessage();
  $("top-losers").innerHTML = losers.length ? losers.map(moverRow).join("") : emptyMarketMessage();

  $("most-traded").innerHTML = traded.length
    ? traded.map((s, i) =>
        '<button class="traded-row" type="button" data-ticker="' + escapeHTML(s.ticker) + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="traded-name"><strong>' + escapeHTML(s.ticker) + '</strong><small>' + escapeHTML(s.company) + '</small></span>' +
        '<span class="traded-price">৳ ' + formatNumber(s.price) + '</span>' +
        '<span class="traded-change ' + (Number(s.change_pct) >= 0 ? "up" : "down") + '">' +
        (Number(s.change_pct) > 0 ? "+" : "") + formatNumber(s.change_pct) + '%</span>' +
        '<span class="traded-volume">' + formatInteger(s.volume) + '</span>' +
        '</button>'
      ).join("")
    : emptyMarketMessage();

  document.querySelectorAll("[data-ticker]").forEach(el => {
    if (!el.classList.contains("result")) {
      el.addEventListener("click", () => selectStock(el.dataset.ticker));
    }
  });
}

function moverRow(s) {
  const pct = Number(s.change_pct);
  const sign = pct > 0 ? "+" : "";
  return '<button class="mover-row" type="button" data-ticker="' + escapeHTML(s.ticker) + '">' +
    '<span><strong>' + escapeHTML(s.ticker) + '</strong><small>' + escapeHTML(s.company) + '</small></span>' +
    '<span class="mover-price">৳ ' + formatNumber(s.price) + '</span>' +
    '<span class="mover-change ' + (pct > 0 ? "up" : "down") + '">' + sign + formatNumber(pct) + '%</span>' +
    '</button>';
}

function emptyMarketMessage() {
  return '<div class="market-empty">No current trading data available.</div>';
}

function renderStock() {
  if (!currentData) return;
  const d = currentData;

  $("stock-ticker").textContent = d.ticker;
  $("stock-company").textContent = d.company || d.ticker;
  const categoryEl = $("stock-category");
  categoryEl.textContent = d.category || "";
  categoryEl.className = "category-badge category-" + String(d.category || "").toLowerCase();
  categoryEl.hidden = !d.category;
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
    ["Volume", formatInteger(d.volume)],
    ["Open", d.open == null ? "—" : "৳ " + formatNumber(d.open)],
    ["Today's High", d.high == null ? "—" : "৳ " + formatNumber(d.high)],
    ["Today's Low", d.low == null ? "—" : "৳ " + formatNumber(d.low)],
    ["52-Week High", d.week52_high == null ? "—" : "৳ " + formatNumber(d.week52_high)],
    ["52-Week Low", d.week52_low == null ? "—" : "৳ " + formatNumber(d.week52_low)]
  ];

  $("stats-grid").innerHTML = stats.map(([label,value]) =>
    '<div class="stat"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>'
  ).join("");
}

async function loadHistory(ticker, range) {
  if (range === "1D") {
    const d = allStocks[ticker];
    const series = d && Number.isFinite(Number(d.prev_close)) && Number.isFinite(Number(d.price))
      ? [["Previous Close", Number(d.prev_close)], ["Latest Available", Number(d.price)]]
      : [];
    drawChart(series);
    return;
  }

  if (historyCache[ticker]?.[range]) {
    drawChart(historyCache[ticker][range]);
    return;
  }

  try {
    const path = HISTORY_URL + encodeURIComponent(ticker) + ".json";
    let res = await fetch(path + "?t=" + Date.now());
    if (!res.ok) {
      res = await fetch(HISTORY_FALLBACK_URL + encodeURIComponent(ticker) + ".json?t=" + Date.now());
    }
    if (!res.ok) throw new Error("No history file");
    const history = await res.json();
    historyCache[ticker] = history;
    drawChart(history[range] || []);
  } catch {
    drawChart([]);
  }
}

function niceDate(value, range) {
  if (range === "1D") return String(value);
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return value;
  if (range === "5D" || range === "1M") return d.toLocaleDateString("en-US", {month:"short", day:"numeric"});
  if (range === "6M" || range === "YTD" || range === "1Y") return d.toLocaleDateString("en-US", {month:"short", year:"2-digit"});
  return d.toLocaleDateString("en-US", {year:"numeric"});
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
      ? "Previous close and latest available price are not available."
      : "Historical data is not available for this stock yet.";
    empty.hidden = false;
    $("chart-range-label").textContent = currentRange === "1D" ? "Intraday" : currentRange;
    return;
  }

  empty.hidden = true;
  const clean = series.map(p => [String(p[0]), Number(p[1])]).filter(p => Number.isFinite(p[1]));
  if (clean.length < 2) { line.setAttribute("points", ""); empty.hidden = false; return; }

  const values = clean.map(p => p[1]);
  const min = Math.min(...values), max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * 0.02, 1);
  const chartMin = Math.max(0, min - spread * 0.08), chartMax = max + spread * 0.08;
  const w = 600, h = 180, left = 72, right = 8, top = 8, bottom = 26;
  const plotW = w - left - right, plotH = h - top - bottom;

  const points = clean.map((p,i) => {
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
  focusLine.setAttribute("id","chart-focus-line");
  focusLine.setAttribute("y1",top); focusLine.setAttribute("y2",top + plotH);
  focusLine.setAttribute("visibility","hidden"); overlay.appendChild(focusLine);

  const focusDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  focusDot.setAttribute("id","chart-focus-dot"); focusDot.setAttribute("r","4");
  focusDot.setAttribute("visibility","hidden"); overlay.appendChild(focusDot);

  const tooltip = $("chart-tooltip");
  tooltip.hidden = true;

  const showPoint = (clientX) => {
    const rect = $("chart-svg").getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * w;
    const clamped = Math.max(left, Math.min(w-right, svgX));
    const index = Math.max(0, Math.min(clean.length-1, Math.round(((clamped-left)/plotW)*(clean.length-1))));
    const p = clean[index];
    const x = left + (index/(clean.length-1))*plotW;
    const y = top + (1-(p[1]-chartMin)/(chartMax-chartMin))*plotH;

    focusLine.setAttribute("x1",x); focusLine.setAttribute("x2",x); focusLine.setAttribute("visibility","visible");
    focusDot.setAttribute("cx",x); focusDot.setAttribute("cy",y); focusDot.setAttribute("visibility","visible");
    tooltip.innerHTML = "<strong>" + escapeHTML(currentRange === "1D" ? p[0] : niceDate(p[0],currentRange)) + "</strong><span>৳ " + formatNumber(p[1]) + "</span>";
    tooltip.hidden = false;
    const tooltipLeft = (x/w)*rect.width;
    tooltip.style.left = Math.max(8, Math.min(rect.width-120, tooltipLeft+8)) + "px";
    tooltip.style.top = Math.max(4, (y/h)*rect.height-42) + "px";
  };

  const hidePoint = () => {
    focusLine.setAttribute("visibility","hidden");
    focusDot.setAttribute("visibility","hidden");
    tooltip.hidden = true;
  };

  $("chart-svg").onmousemove = e => showPoint(e.clientX);
  $("chart-svg").ontouchmove = e => { if (e.touches.length) showPoint(e.touches[0].clientX); };
  $("chart-svg").onmouseleave = hidePoint;
  $("chart-svg").ontouchend = hidePoint;

  for (let i=0; i<=5; i++) {
    const y = top + (i/5)*plotH;
    const value = chartMax - (i/5)*(chartMax-chartMin);
    const grid = document.createElementNS("http://www.w3.org/2000/svg","line");
    grid.setAttribute("x1",left); grid.setAttribute("x2",w-right); grid.setAttribute("y1",y); grid.setAttribute("y2",y);
    $("chart-grid").appendChild(grid);
    const label = document.createElementNS("http://www.w3.org/2000/svg","text");
    label.setAttribute("x",left-7); label.setAttribute("y",y+3); label.setAttribute("text-anchor","end");
    label.textContent = formatAxisPrice(value); $("chart-y-labels").appendChild(label);
  }

  const labelCount = Math.min(6, clean.length);
  for (let i=0; i<labelCount; i++) {
    const index = Math.round(i*(clean.length-1)/(labelCount-1));
    const x = left + (index/(clean.length-1))*plotW;
    const label = document.createElementNS("http://www.w3.org/2000/svg","text");
    label.setAttribute("x",x); label.setAttribute("y",h-5);
    label.setAttribute("text-anchor",i===0 ? "start" : i===labelCount-1 ? "end" : "middle");
    label.textContent = niceDate(clean[index][0],currentRange); $("chart-x-labels").appendChild(label);
  }

  $("chart-range-label").textContent =
    currentRange === "1D" ? "Change since previous close" :
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