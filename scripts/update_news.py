#!/usr/bin/env python3
"""Collect selected Bangladesh business/market headlines into data/news.json."""

from __future__ import annotations

import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

FEEDS = [
    ("The Business Standard", "https://www.tbsnews.net/rss.xml"),
    ("Prothom Alo", "https://www.prothomalo.com/feed/"),
    ("The Daily Star", "https://www.thedailystar.net/business/rss.xml"),
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

def text_of(parent, names):
    for child in list(parent):
        if child.tag.rsplit("}", 1)[-1].lower() in names:
            return clean(child.text)
    return ""

def parse_feed(source, url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Dhumketu-Express/1.0 news collector"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        root = ET.fromstring(response.read())

    items = []
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1].lower()
        if tag not in {"item", "entry"}:
            continue

        title = text_of(node, {"title"})
        link = ""
        for child in list(node):
            name = child.tag.rsplit("}", 1)[-1].lower()
            if name == "link":
                link = child.attrib.get("href", "") or clean(child.text)
                if link:
                    break

        description = text_of(node, {"description", "summary", "content"})
        published = text_of(node, {"pubdate", "published", "updated", "date"})

        haystack = f"{title} {description}".lower()
        if not title or not link:
            continue
        if not any(keyword.lower() in haystack for keyword in KEYWORDS):
            continue

        items.append({
            "title": title,
            "url": link,
            "source": source,
            "published_at": published,
            "description": description[:240],
        })

    return items

def main():
    all_items = []
    errors = []

    for source, url in FEEDS:
        try:
            all_items.extend(parse_feed(source, url))
        except Exception as exc:
            errors.append({"source": source, "error": str(exc)})

    seen = set()
    unique = []
    for item in all_items:
        key = item["url"] or item["title"].lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    unique = unique[:30]

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "items": unique,
        "errors": errors,
    }

    output = Path("data/news.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
