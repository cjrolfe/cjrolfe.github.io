#!/usr/bin/env python3
"""
Create a new company folder from /company-template, generate an AI summary from the supplied website,
optionally take a screenshot, and update assets/sites.json so the landing page shows the description.

Designed to run in GitHub Actions (issues-triggered).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / "company-template"
ASSETS_DIR = ROOT / "assets"
SITES_FILE = ASSETS_DIR / "sites.json"
SCREENSHOT_DIR = ASSETS_DIR / "screenshots"

S3_BASE = "https://sfdcdemoimages.s3.eu-west-1.amazonaws.com"


@dataclass
class CompanyRequest:
    name: str
    website: str = ""
    tone: str = "Professional"
    demo_description: str = ""


def slugify(s: str) -> str:
    s = s.strip().lower()
    s = s.replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"(^-+|-+$)", "", s)
    return s or "company"


def parse_issue_body(body: str) -> CompanyRequest:
    """
    Expects body lines like:
      **Company name:** Acme Ltd
      **Website:** https://acme.com
      **Demo description:** Custom description for this demo
      **Tone:** Professional
    """
    def find(field: str) -> str:
        m = re.search(rf"\*\*{re.escape(field)}:\*\*\s*(.+)", body, flags=re.IGNORECASE)
        return (m.group(1).strip() if m else "")

    name = find("Company name")
    website = find("Website")
    demo_description = find("Demo description")
    tone = find("Tone") or "Professional"

    if not name:
        raise ValueError("Could not parse **Company name:** from issue body")

    if website == "-":
        website = ""

    if demo_description == "-":
        demo_description = ""

    return CompanyRequest(
        name=name,
        website=website,
        tone=tone,
        demo_description=demo_description
    )


def fetch_site_text(url: str, max_chars: int = 12000) -> Tuple[str, str, str, str]:
    """
    Returns (title, meta_description, extracted_text)
    """
    if not url:
        return ("", "", "")

    # Make sure we have a scheme
    if not re.match(r"^https?://", url, flags=re.I):
        url = "https://" + url

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; GitHubActionsBot/1.0; +https://github.com/)"
    }
    r = requests.get(url, headers=headers, timeout=20, allow_redirects=True)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")

    title = (soup.title.get_text(" ", strip=True) if soup.title else "").strip()

    meta_desc = ""
    md = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    if md and md.get("content"):
        meta_desc = str(md.get("content")).strip()

    og_image = ""
    og = soup.find("meta", attrs={"property": re.compile(r"^og:image$", re.I)})
    if og and og.get("content"):
        og_image = str(og.get("content")).strip()

    # Extract a lightweight text signal for summarization
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    # Prefer main/article if present
    main = soup.find(["main", "article"]) or soup.body or soup
    text = main.get_text("\n", strip=True)

    # De-duplicate repeated whitespace and clamp
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars] + "…"

    return (title, meta_desc, text, og_image)


def ai_summary(company: CompanyRequest, title: str, meta_desc: str, page_text: str) -> str:
    """
    Uses configured AI provider to create a short 1–2 sentence summary.
    Falls back to meta description / generic text if AI is unavailable.

    Supports OpenAI and Anthropic Claude providers via ai_providers module.
    """
    def fallback() -> str:
        # Best-effort fallback if AI is unavailable
        if meta_desc and len(meta_desc.strip()) >= 40:
            return meta_desc.strip()
        if title:
            return f"{company.name} — demo environment based on publicly available information."
        return "Demo environment for this company."

    try:
        from ai_providers import create_provider, AIRequest

        provider = create_provider()
        if not provider:
            return fallback()

        # Keep input small to reduce cost (existing behavior)
        page_text_small = page_text[:8000] if page_text else ""

        request = AIRequest(
            company_name=company.name,
            website=company.website or "",
            tone=company.tone,
            title=title,
            meta_description=meta_desc,
            page_text=page_text_small,
            temperature=float(os.getenv("AI_TEMPERATURE", "0.4")),
            max_tokens=int(os.getenv("AI_MAX_TOKENS", "150"))
        )

        response = provider.generate_summary(request)

        if response.summary:
            return response.summary
        return fallback()

    except Exception as e:
        print(f"AI provider error: {e}")
        return fallback()



def maybe_take_screenshot(company_slug: str, url: str) -> Optional[str]:
    """
    Takes a screenshot using Playwright and returns the repo-relative path.
    If the page is blocked (Access Denied / bot protection), returns None so we don't display it.
    """
    if not url:
        return None

    if not re.match(r"^https?://", url, flags=re.I):
        url = "https://" + url

    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = SCREENSHOT_DIR / f"{company_slug}.png"

    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception:
        return None

    deny_markers = [
        "access denied",
        "you don't have permission",
        "request blocked",
        "service unavailable",
        "verify you are human",
        "captcha",
        "cloudflare",
        "akamai",
        "reference #",
    ]

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 720})

            # Slightly more "real" headers help sometimes, but won't beat most WAFs
            page.set_extra_http_headers({
                "Accept-Language": "en-GB,en;q=0.9",
            })

            resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(1500)

            # If server returns 403/401, consider it blocked
            status = resp.status if resp else 0
            if status in (401, 403):
                browser.close()
                return None

            # If content looks like a block page, skip screenshot
            content = (page.content() or "").lower()
            if any(m in content for m in deny_markers):
                browser.close()
                # Ensure we don't accidentally keep a bad image around
                if out_path.exists():
                    out_path.unlink(missing_ok=True)
                return None

            page.screenshot(path=str(out_path), full_page=True)
            browser.close()

        return f"/assets/screenshots/{company_slug}.png"
    except Exception:
        if out_path.exists():
            out_path.unlink(missing_ok=True)
        return None



def render_from_template(template_html: str, company: CompanyRequest, slug: str, summary: str, screenshot_path: Optional[str]) -> str:
    # Simple moustache-ish conditional blocks.
    html = template_html

    has_website = bool(company.website)
    has_screenshot = bool(screenshot_path)

    def strip_block(block_name: str, keep: bool) -> None:
        nonlocal html
        pattern = re.compile(rf"\{{\#IF_{block_name}\}}(.*?)\{{\/IF_{block_name}\}}", re.DOTALL)
        def repl(m):
            return m.group(1) if keep else ""
        html = pattern.sub(repl, html)

    strip_block("WEBSITE", has_website)
    strip_block("SCREENSHOT", has_screenshot)

    logo_url = f"{S3_BASE}/{slug}/logo.png"
    s3_bucket_hint = f"s3://sfdcdemoimages/{slug}/"
    s3_logo_hint = f"{slug}/logo.png"

    replacements = {
        "{{COMPANY_NAME}}": company.name,
        "{{COMPANY_WEBSITE}}": company.website,
        "{{COMPANY_SUMMARY}}": summary,
        "{{COMPANY_TONE}}": company.tone,
        "{{LOGO_URL}}": logo_url,
        "{{S3_BUCKET_HINT}}": s3_bucket_hint,
        "{{S3_LOGO_HINT}}": s3_logo_hint,
        "{{SCREENSHOT_PATH}}": screenshot_path or "",
    }


    for k, v in replacements.items():
        html = html.replace(k, v)

    return html


def upsert_sites_json(company_slug: str, company_name: str, summary: str) -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.utcnow().strftime("%Y-%m-%d")

    data = {"updated": today, "sites": []}
    if SITES_FILE.exists():
        try:
            data = json.loads(SITES_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    sites = data.get("sites", [])
    if not isinstance(sites, list):
        sites = []

    # Find existing
    existing = None
    for s in sites:
        if s.get("id") == company_slug:
            existing = s
            break

    if existing is None:
        existing = {"id": company_slug, "path": f"/{company_slug}/"}
        sites.append(existing)

    existing["name"] = company_name
    existing["description"] = summary
    existing.setdefault("tag", "Demo")
    existing.setdefault("logoUrl", f"{S3_BASE}/{company_slug}/logo.png")

    data["updated"] = today
    data["sites"] = sites

    SITES_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    issue_body = os.getenv("ISSUE_BODY", "")
    if not issue_body.strip():
        print("ISSUE_BODY is empty; nothing to do.")
        return 0

    req = parse_issue_body(issue_body)
    slug = slugify(req.name)

    company_dir = ROOT / slug
    if company_dir.exists():
        print(f"Company folder already exists: {company_dir}")
        return 0

    if not TEMPLATE_DIR.exists():
        raise FileNotFoundError(f"Template folder not found: {TEMPLATE_DIR}")

    shutil.copytree(TEMPLATE_DIR, company_dir)

    # Determine final description: use demo_description if provided, otherwise generate AI summary
    if req.demo_description:
        print(f"Using provided demo description: {req.demo_description}")
        final_summary = req.demo_description
        # Still fetch for screenshot og:image fallback
        _, _, _, og_image = fetch_site_text(req.website) if req.website else ("", "", "", "")
    else:
        print("No demo description provided; generating AI summary from website...")
        title, meta_desc, page_text, og_image = fetch_site_text(req.website)
        final_summary = ai_summary(req, title, meta_desc, page_text)
        print(f"Generated summary: {final_summary}")

    screenshot_path = maybe_take_screenshot(slug, req.website)

    # fallback: use og:image if screenshot missing
    if not screenshot_path and og_image:
        screenshot_path = og_image

    # Render index.html from template
    template_html = (TEMPLATE_DIR / "index.html").read_text(encoding="utf-8")
    out_html = render_from_template(template_html, req, slug, final_summary, screenshot_path)
    (company_dir / "index.html").write_text(out_html, encoding="utf-8")

    upsert_sites_json(slug, req.name, final_summary)

    print(f"Created {slug}/ with summary and assets updates.")
    if screenshot_path:
        print(f"Screenshot: {screenshot_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise
