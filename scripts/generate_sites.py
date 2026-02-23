#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITES_FILE = ROOT / "assets" / "sites.json"
EXCLUDE = {".github", "assets", "scripts"}

S3_BASE = "https://sfdcdemoimages.s3.eu-west-1.amazonaws.com"


def detect_company_dirs():
    dirs = []
    for p in ROOT.iterdir():
        if not p.is_dir():
            continue
        if p.name in EXCLUDE:
            continue
        if (p / "index.html").exists():
            dirs.append(p.name)
    return sorted(dirs)


def load_existing():
    if not SITES_FILE.exists():
        return {}
    try:
        data = json.loads(SITES_FILE.read_text(encoding="utf-8"))
        out = {}
        for s in data.get("sites", []):
            _id = s.get("id")
            if _id:
                out[_id] = s
        return out
    except Exception:
        return {}


def main():
    (ROOT / "assets").mkdir(parents=True, exist_ok=True)
    today = datetime.utcnow().strftime("%Y-%m-%d")

    dirs = detect_company_dirs()
    existing = load_existing()

    sites = []
    for d in dirs:
        old = existing.get(d, {})
        sites.append({
            "id": d,
            "name": old.get("name") or d.replace("-", " ").title(),
            "path": f"/{d}/",
            "description": old.get("description", ""),
            "tag": old.get("tag") or "Demo",
            "logoUrl": old.get("logoUrl") or f"{S3_BASE}/{d}/logo.png",
            # NEW: preserve archived flag (default false)
            "archived": bool(old.get("archived", False)),
        })

    out = {"updated": today, "sites": sites}
    SITES_FILE.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
