#!/usr/bin/env python3
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITES_FILE = ROOT / "assets" / "sites.json"


def parse_issue(issue_title: str, issue_body: str):
    """
    Supports:
      Title: "Archive company: Acme"
      Title: "Restore company: Acme"
    Body must include:
      **Company id:** company-slug
    """
    title = (issue_title or "").strip()
    body = (issue_body or "").strip()

    action = None
    if title.lower().startswith("archive company:"):
        action = "archive"
    elif title.lower().startswith("restore company:"):
        action = "restore"

    m = re.search(r"\*\*Company id:\*\*\s*([a-z0-9\-]+)", body, flags=re.IGNORECASE)
    company_id = (m.group(1).strip() if m else "")

    if not action or not company_id:
        raise ValueError("Could not parse action or **Company id:** from issue.")

    return action, company_id


def main() -> int:
    issue_title = os.getenv("ISSUE_TITLE", "")
    issue_body = os.getenv("ISSUE_BODY", "")

    action, company_id = parse_issue(issue_title, issue_body)

    if not SITES_FILE.exists():
        raise FileNotFoundError("assets/sites.json not found. Run generate_sites.py at least once.")

    data = json.loads(SITES_FILE.read_text(encoding="utf-8"))
    sites = data.get("sites", [])
    if not isinstance(sites, list):
        raise ValueError("assets/sites.json has invalid format (sites is not a list).")

    found = False
    for s in sites:
        if s.get("id") == company_id:
            if action == "archive":
                s["archived"] = True
            else:
                s["archived"] = False
            found = True
            break

    if not found:
        raise ValueError(f"Company id '{company_id}' not found in assets/sites.json")

    data["updated"] = datetime.utcnow().strftime("%Y-%m-%d")
    data["sites"] = sites
    SITES_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"{action.upper()} OK: {company_id}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise
