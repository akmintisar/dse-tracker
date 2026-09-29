const NEWS_URL = "data/news.json";

function newsEscape(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function newsTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-BD", {
    month:"short", day:"numeric", hour:"numeric", minute:"2-digit"
  });
}

async function loadNews() {
  const list = document.getElementById("news-list");
  const updated = document.getElementById("news-updated");
  if (!list) return;

  try {
    const res = await fetch(NEWS_URL + "?t=" + Date.now());
    if (!res.ok) throw new Error("News data unavailable");
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    updated.textContent = data.updated_at
      ? "Updated " + newsTime(data.updated_at)
      : "";

    if (!items.length) {
      list.innerHTML = '<div class="market-empty">No news is available right now.</div>';
      return;
    }

    list.innerHTML = items.slice(0, 12).map(item => {
      const description = item.description
        ? '<p>' + newsEscape(item.description) + '</p>'
        : "";
      const time = newsTime(item.published_at);
      return '<a class="news-item" href="' + newsEscape(item.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<div class="news-source">' + newsEscape(item.source) + (time ? " · " + newsEscape(time) : "") + '</div>' +
        '<h3>' + newsEscape(item.title) + '</h3>' +
        description +
        '<span class="news-read">Read original ↗</span>' +
        '</a>';
    }).join("");
  } catch (err) {
    console.error(err);
    list.innerHTML = '<div class="market-empty">News is temporarily unavailable.</div>';
  }
}

loadNews();
setInterval(loadNews, 30 * 60 * 1000);
