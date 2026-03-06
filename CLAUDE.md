# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Pages-powered directory of company demo sites. Each company has its own folder with an `index.html` page. The landing page displays company cards read from `assets/sites.json`. All CRUD operations (create, archive, restore, delete) are **issue-driven** and automated via GitHub Actions.

## Architecture

### Frontend (Static HTML/CSS/JS)
- `index.html` - Main landing page with company directory and "Create new company" modal
- `archived.html` - Shows archived companies (with restore/delete options)
- `assets/app.js` - Renders cards from `sites.json`, handles search, and builds pre-filled GitHub Issue URLs
- `assets/sites.json` - **Source of truth** for all companies and their metadata

### Backend (Issue-Driven Automation)
Three Python scripts power the automation:
1. `scripts/create_company.py` - Creates a new company folder from `company-template/`, fetches website content, generates an AI summary via configured provider (OpenAI or Anthropic), optionally takes a Playwright screenshot, and updates `sites.json`
2. `scripts/archive_company.py` - Toggles the `archived` flag in `sites.json` or permanently deletes a company folder
3. `scripts/generate_sites.py` - Scans all folders with `index.html` (excluding `.github`, `assets`, `scripts`) and rebuilds `sites.json`

The AI provider system uses a modular architecture in `scripts/ai_providers/`:
- `base.py` - Abstract base class with shared retry logic
- `openai_provider.py` - OpenAI implementation
- `anthropic_provider.py` - Anthropic Claude implementation
- `__init__.py` - Factory function for provider selection

### GitHub Actions Workflows
- `.github/workflows/create-company.yml` - Triggers on issues with title "Create company:" or label "create-company"
- `.github/workflows/archive-company.yml` - Triggers on issues with titles "Archive company:", "Restore company:", or "Delete company:"
- `.github/workflows/generate-sites.yml` - Runs on push to main (when `*/index.html` or template changes) or manual dispatch

## Key Conventions

### Company Identifiers
- Company IDs are **slugified**: lowercase with hyphens (e.g., "Acme Ltd" → "acme-ltd")
- Each company lives in `/<company-id>/index.html`
- Folder names become the company ID

### Template System
The `company-template/index.html` uses a simple mustache-like syntax:
- `{{VARIABLE}}` - Replaced with actual values
- `{{#IF_CONDITION}}...{{/IF_CONDITION}}` - Conditional blocks (e.g., `{{#IF_WEBSITE}}`)

Variables replaced during company creation:
- `{{COMPANY_NAME}}`, `{{COMPANY_WEBSITE}}`, `{{COMPANY_SUMMARY}}`, `{{COMPANY_TONE}}`
- `{{LOGO_URL}}`, `{{S3_BUCKET_HINT}}`, `{{S3_LOGO_HINT}}`
- `{{SCREENSHOT_PATH}}`

### S3 Assets
- Logos are served from: `https://sfdcdemoimages.s3.eu-west-1.amazonaws.com/<company-id>/logo.png`
- Screenshots stored locally in: `assets/screenshots/<company-id>.png`

### sites.json Structure
Each entry in `sites.json` contains:
```json
{
  "id": "company-slug",
  "name": "Company Name",
  "path": "/company-slug/",
  "description": "AI-generated or fallback description",
  "tag": "Demo",
  "logoUrl": "https://sfdcdemoimages.s3.eu-west-1.amazonaws.com/company-slug/logo.png",
  "archived": false
}
```

### Protected Folders
- `company-template` **must never be archived or deleted** (it's used to create new companies)
- Excluded from `generate_sites.py`: `.github`, `assets`, `scripts`

## Common Development Tasks

### Local Setup
```bash
# Install Python dependencies (Python 3.11+ required)
python -m pip install -r requirements.txt

# Install Playwright browser for screenshots
python -m playwright install --with-deps chromium
```

### Running Scripts Locally
```bash
# Regenerate sites.json from existing folders
python scripts/generate_sites.py

# Test company creation (requires ISSUE_BODY env var)
ISSUE_BODY="**Company name:** Test Co
**Website:** https://example.com
**Tone:** Professional" \
python scripts/create_company.py

# Test archive/restore/delete (requires ISSUE_TITLE and ISSUE_BODY)
ISSUE_TITLE="Archive company: Test Co" \
ISSUE_BODY="**Company id:** test-co" \
python scripts/archive_company.py
```

### Testing UI Changes
Since this is a static site, you can:
1. Open `index.html` directly in a browser (may need a local server for `fetch()` to work)
2. Use Python's built-in server: `python -m http.server 8000`
3. View changes at `http://localhost:8000/`

## Issue-Driven Workflow

### Creating a Company
1. User clicks "Create new company" button on landing page
2. Modal opens, user fills in: Company name (required), Website (optional), Tone (optional)
3. Clicking "Create" opens a pre-filled GitHub Issue with label `create-company`
4. When issue is opened, `create-company.yml` workflow runs:
   - Copies `company-template/` to `/<company-id>/`
   - Fetches website text (title, meta description, page content)
   - Calls AI provider (OpenAI or Anthropic, if configured) to generate a summary
   - Takes a Playwright screenshot (if website allows it)
   - Renders `index.html` from template with all variables
   - Updates `assets/sites.json` with new company entry
   - Commits, pushes, comments on issue, and closes it

### Archiving/Restoring
1. User clicks "Archive" (on landing) or "Restore" (on archived page)
2. Pre-filled issue opens with title "Archive company: X" or "Restore company: X"
3. `archive-company.yml` workflow toggles the `archived` flag in `sites.json`
4. Company folder remains intact; only visibility on landing page changes

### Deleting (Permanent)
1. Only available from archived page (not landing page)
2. User clicks "Delete" button
3. Pre-filled issue opens with title "Delete company: X"
4. `archive-company.yml` workflow:
   - Removes company from `sites.json`
   - Deletes the entire `/<company-id>/` folder
5. **This is permanent and cannot be undone**

## AI Provider Integration

### Configuration
- Set repository secret: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- Set repository variable: `AI_PROVIDER` (values: `openai`, `anthropic`, `none`)
- Optional variables: `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `AI_TEMPERATURE`, `AI_MAX_TOKENS`

### Supported Providers
1. **OpenAI** - Uses `/v1/responses` endpoint
   - Default model: `gpt-4.1-mini`
   - Other models: `gpt-4o-mini`, `gpt-4o`
2. **Anthropic** - Uses `/v1/messages` endpoint
   - Default model: `claude-3-5-haiku-20241022` (fast, cost-effective)
   - Other models: `claude-3-5-sonnet-20241022`, `claude-opus-4-6`

### Provider Selection Logic
1. If `AI_PROVIDER=none` → skip AI (use fallback)
2. If `AI_PROVIDER=anthropic` → use Anthropic (requires `ANTHROPIC_API_KEY`)
3. If `AI_PROVIDER=openai` → use OpenAI (requires `OPENAI_API_KEY`)
4. If `AI_PROVIDER` not set and `OPENAI_API_KEY` exists → use OpenAI (legacy mode)
5. Otherwise → use fallback (no AI)

### Fallback Behavior
If AI provider is unavailable (no key, rate limit, or error):
- Falls back to website's meta description
- Or uses: `"[Company Name] — demo environment based on publicly available information."`
- The script **never fails** due to AI issues

### API Details
- **Retry logic:** 5 attempts with exponential backoff + jitter for 429/5xx errors
- **Input limited** to first 8000 chars of page text to reduce cost
- **Temperature:** 0.4 (configurable via `AI_TEMPERATURE`)
- **Max tokens:** 150 (configurable via `AI_MAX_TOKENS`)

### Adding New Providers
Create `scripts/ai_providers/new_provider.py` extending `AIProvider` base class, implement 6 abstract methods, and add to factory.

## Playwright Screenshot Logic

### When Screenshots Are Skipped
The script detects and skips screenshots if:
- HTTP status is 401 or 403
- Page content contains bot-block markers: "access denied", "captcha", "cloudflare", "verify you are human", etc.

### Fallback
If screenshot fails but the website has an `og:image` meta tag, that image URL is used instead.

## Important Notes

### Folder Detection
- `generate_sites.py` only detects folders with an `index.html` inside
- Folders without `index.html` are ignored
- Folders in `EXCLUDE` set (`.github`, `assets`, `scripts`) are always skipped

### Workflow Triggers
- `create-company.yml` triggered by: issue title starting with "Create company:" OR label "create-company"
- `archive-company.yml` triggered by: issue title starting with "Archive/Restore/Delete company:" OR label "archive-company"
- Both workflows check for specific body patterns before running

### Git Automation
All workflows:
- Use `github-actions[bot]` as committer
- Only commit if there are actual changes (`git diff --cached --quiet`)
- Auto-comment and close issues after success
- Post error messages if workflow fails

## Modifying Company Pages

### To Update a Company Page
1. Edit `/<company-id>/index.html` directly
2. Push changes to main
3. `assets/sites.json` will auto-update if you trigger `generate-sites.yml` manually (or on next template change)

### To Update the Template
1. Edit `company-template/index.html`
2. Changes only affect **newly created** companies
3. Existing companies are not automatically updated

### To Bulk Update sites.json
Run `python scripts/generate_sites.py` to rebuild from all existing folders. This preserves:
- `name`, `description`, `tag`, `logoUrl`, `archived` - from existing `sites.json` entries
- Only adds new companies or removes deleted ones
