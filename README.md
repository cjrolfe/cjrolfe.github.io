# Swordthain Demo Sites (GitHub Pages)

This repo powers a small **GitHub Pages directory of “company demo sites”**.

* The **landing page** (`/index.html`) reads `assets/sites.json` and shows each company as a card.
* Each company lives in its **own folder** (e.g. `/bbc/`, `/rossellimac/`) with an `index.html`.
* New companies can be created via a **“Create new company” modal** on the landing page.
  * Submitting the modal opens a pre-filled **GitHub Issue**.
  * A GitHub Action turns that issue into a new company folder based on `/company-template/`.
  * Optionally, the action:
    * pulls basic text from the company website,
    * generates a short summary using OpenAI,
    * and attempts a Playwright screenshot.
* Companies can be **archived / restored** (hidden from the landing page) via another issue-driven workflow.

## How it works

### Landing page + data

The landing page is pure static HTML/CSS/JS:

* `index.html` – the main directory UI (includes the “Create new company” modal)
* `archived.html` – lists archived companies
* `assets/app.js` – fetches `assets/sites.json`, renders cards, handles search, and builds Issue links
* `assets/sites.json` – the source of truth for what companies appear and how

### Issue-driven automation

There are two main automations, both triggered by opening a GitHub Issue:

* **Create company** (`.github/workflows/create-company.yml`)
  * Reads the issue body, creates a folder from `company-template/`, generates summary + optional screenshot,
    and updates `assets/sites.json`.
* **Archive/restore company** (`.github/workflows/archive-company.yml`)
  * Toggles `archived: true/false` for a company in `assets/sites.json`.

There is also a helper workflow:

* **Generate sites.json** (`.github/workflows/generate-sites.yml`)
  * Rebuilds `assets/sites.json` by scanning folders that contain an `index.html`.
  * Useful if someone adds/removes company folders manually.

> ✅ Note: an older workflow `update-sites-date.yml` has been removed because `scripts/generate_sites.py`
> already sets the `updated` date (and having both created overlap / potential workflow churn).

## Usage

### Create a new company (recommended)

1. Open the landing page.
2. Click **Create new company**.
3. Fill in the fields and click **Create**.
4. Submit the GitHub Issue that opens.
5. The Action will:
   * create a folder like `/my-company/`
   * update `assets/sites.json`
   * comment + close the issue.

### Archive / restore a company

On the landing page (or the archived page), click **Archive** or **Restore**.
That opens a pre-filled GitHub Issue; the workflow updates `assets/sites.json` and closes the issue.

### Run scripts locally (optional)

Requirements:

* Python 3.11+

Install dependencies:

```bash
python -m pip install -r requirements.txt
python -m playwright install --with-deps chromium
```

Generate `assets/sites.json` from folders:

```bash
python scripts/generate_sites.py
```

## OpenAI setup (optional)

If you want the **create-company** workflow to generate summaries, set the repo secret:

* `OPENAI_API_KEY`

Optional repo variable:

* `OPENAI_MODEL` (defaults to `gpt-4.1-mini`)

If the key isn’t present, the workflow will fall back to the site meta description/title.

## File structure

```text
.
├─ index.html                 # Landing page (directory)
├─ archived.html              # Archived companies view
├─ CNAME                      # Custom domain for GitHub Pages
├─ assets/
│  ├─ app.js                  # UI logic (render cards, modal, issue links)
│  ├─ styles.css              # Global styling (includes modal styling)
│  ├─ sites.json              # Generated/maintained company registry
│  └─ screenshots/            # Optional screenshots taken during creation
├─ company-template/
│  └─ index.html              # Template used when creating new companies
├─ <company-id>/
│  └─ index.html              # A generated company page (one folder per company)
├─ scripts/
│  ├─ create_company.py       # Issue → create folder + summary + screenshot
│  ├─ archive_company.py      # Issue → toggle archived flag in sites.json
│  └─ generate_sites.py       # Scan folders → rebuild sites.json
└─ .github/workflows/
   ├─ create-company.yml      # Issues → create company site
   ├─ archive-company.yml     # Issues → archive/restore company
   └─ generate-sites.yml      # Push/dispatch → regenerate sites.json
```

## Troubleshooting

* **Modal appears at the bottom of the page**
  * That usually means the modal/backdrop isn’t `position: fixed`.
  * Ensure you’re using the latest `assets/styles.css` (this repo includes proper modal styling).

* **Create-company workflow fails with missing dependencies**
  * This repo includes `requirements.txt`. If you removed it previously, the workflow would fail.

* **A website blocks screenshotting**
  * The script detects common bot-block pages and will skip screenshots if it looks blocked.
  * The company will still be created.
