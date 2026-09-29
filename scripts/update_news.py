#!/usr/bin/env python3
"""Collect Bangladesh business/market headlines into data/news.json."""

from __future__ import annotations

import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

RSS_FEEDS = [
    ("The Business Standard", "https://www.tbsnews.net/rss.xml"),
    ("Prothom Alo", "https://www.prothomalo.com/feed/"),
    ("The Daily Star", "https://www.thedailystar.net/business/rss.xml"),
]

HTML_FEEDS = [
    ("The Business Standard", "https://www.tbsnews.net/economy/stocks"),
    ("Prothom Alo", "https://www.prothomalo.com/business"),
    ("The Daily Star", "https://www.thedailystar.net/business"),
]

KEYWORDS = (
    "stock", "share", "dse", "dhaka stock", "market", "bank", "banking",
    "economy", "economic", "finance", "financial", "bond", "ipo", "dividend",
    "business", "company", "corporate", "investment", "fund", "interest rate",
    "inflation", "exports", "imports", "শেয়ার", "শেয়ার", "পুঁজিবাজার",
    "অর্থনীতি", "ব্যাংক", "ব্যাংকিং", "বাণিজ্য", "লভ্যাংশ", "বিনিয়োগ",
    "বিনিয়োগ", "মূল্যস্ফীতি", "রপ্তানি", "আমদানি",
)

def clean(value: str | None) -> str:
    if not value:
        return ""
    value = html.unescape(re.sub(r"<[^>]+>", " ", value))
    return re.sub(r"\s+", " ", value).strip()

def local_name(tag):
    return tag.rsplit("}", 1)[-1].lower()

def node_text(node):
    return clean(" ".join(node.itertext()))

def parse_rss(source, url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; DhumketuExpress/1.0)"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        root = ET.fromstring(response.read())

    items = []
    for node in root.iter():
        if local_name(node.tag) not in {"item", "entry"}:
            continue

        title = ""
        link = ""
        description = ""
        published = ""

        for child in list(node):
            name = local_name(child.tag)
            value = node_text(child)
            if name == "title" and not title:
                title = value
            elif name == "link" and not link:
                link = child.attrib.get("href", "") or value
            elif name in {"description", "summary", "content"} and not description:
                description = value
            elif name in {"pubdate", "published", "updated", "date"} and not published:
                published = value

        haystack = f"{title} {description}".lower()
        if title and link and any(k.lower() in haystack for k in KEYWORDS):
            items.append({
                "title": title,
                "url": link,
                "source": source,
                "published_at": published,
                "description": description[:240],
            })
    return items

def parse_html(source, url):
    from bs4 import BeautifulSoup

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; DhumketuExpress/1.0)"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        soup = BeautifulSoup(response.read(), "html.parser")

    items = []
    for heading in soup.find_all(["h2", "h3", "h4"]):
        title = clean(heading.get_text(" ", strip=True))
        if not title or len(title) < 20:
            continue

        link = heading.find("a", href=True)
        if not link:
            link = heading.parent.find("a", href=True) if heading.parent else None
        if not link:
            continue

        href = link.get("href", "")
        if href.startswith("/"):
            from urllib.parse import urljoin
            href = urljoin(url, href)
        if not href.startswith("http"):
            continue

        haystack = title.lower()
        if not any(k.lower() in haystack for k in KEYWORDS):
            continue

        items.append({
            "title": title,
            "url": href,
            "source": source,
            "published_at": "",
            "description": "",
        })
    return items

def main():
    all_items = []
    errors = []

    for source, url in RSS_FEEDS:
        try:
            all_items.extend(parse_rss(source, url))
        except Exception as exc:
            errors.append({"source": source + " RSS", "error": str(exc)})

    # Some publishers keep an RSS endpoint but return an empty/changed feed.
    # Fall back to their public business/market pages so the News page still
    # has current headlines.
    if not all_items:
        for source, url in HTML_FEEDS:
            try:
                all_items.extend(parse_html(source, url))
            except Exception as exc:
                errors.append({"source": source + " page", "error": str(exc)})

    seen = set()
    unique = []
    for item in all_items:
        key = item["url"] or item["title"].lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "items": unique[:30],
        "errors": errors,
    }

    output = Path("data/news.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
