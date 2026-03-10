# Swordthain Demo Sites (AWS)

This repo powers a **static directory of company demo sites** hosted on AWS (S3 + CloudFront). Automation is provided by API Gateway + Lambda.

* The **landing page** (`/index.html`) reads `assets/sites.json` and shows each company as a card.
* Each company lives in its **own folder** (e.g. `/bbc/`, `/rossellimac/`) with an `index.html`.
* New companies can be created via the **"Create new company"** modal on the landing page.
  * Submitting the form calls an API endpoint. A Lambda function creates the company folder from `/company-template/`.
  * Users can optionally provide a **custom demo description**. If left empty, the Lambda generates a short summary using OpenAI or Anthropic.
  * Screenshots are skipped in Lambda; the site uses the website's `og:image` when available.
* Companies can be **archived, restored, or deleted** via buttons that call the same API.

## Hosting architecture

| Component | Technology |
|-----------|------------|
| Static site | S3 bucket |
| CDN | CloudFront |
| Custom domain | Route 53 (swordthain.com) |
| Automation | API Gateway + Lambda |
| Logos | S3 (sfdcdemoimages, eu-west-1) |

## How it works

### Landing page + data

* `index.html` – main directory UI and "Create new company" modal
* `archived.html` – lists archived companies
* `assets/app.js` – fetches `assets/sites.json`, renders cards, and calls the API for create/archive/restore/delete
* `assets/sites.json` – source of truth for companies and metadata

### API + Lambda automation

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/create` | POST | Create new company from `company-template/`, generate AI summary, update `sites.json` |
| `/archive` | POST | Archive, restore, or delete a company (`action` + `companyId`) |

The Lambda functions read and write content in the S3 bucket and invalidate CloudFront cache after updates.

## Usage

### Create a new company

1. Open the landing page.
2. Click **Create new company**.
3. Fill in:
   * **Company name** (required)
   * **Company website** (optional) – used for AI summary and og:image
   * **Demo description** (optional) – custom description; if empty, AI-generated
   * **Tone** (optional) – affects AI style when no custom description is provided
4. Click **Create**. The API creates the company folder and updates `sites.json`.

### Archive / restore a company

On the landing page or archived page, click **Archive** or **Restore**. The API updates `sites.json` immediately.

### Delete an archived company

On the archived page, click **Delete** on a company. Confirm the prompt. The API removes the company from `sites.json` and deletes its folder. This is permanent.

## AI provider setup (AWS Secrets Manager)

Create a secret `swordthain/ai-keys` in Secrets Manager (eu-west-1) with JSON:

```json
{
  "OPENAI_API_KEY": "sk-...",
  "ANTHROPIC_API_KEY": "sk-ant-..."
}
```

Use the keys you need; omit the other.

Set Lambda environment variable `AI_PROVIDER` to `openai` or `anthropic`. If unset, OpenAI is used when `OPENAI_API_KEY` exists.

**Supported models:**

* **OpenAI:** `gpt-4.1-mini` (default), `gpt-4o-mini`, `gpt-4o`
* **Anthropic:** `claude-3-5-haiku-20241022` (default), `claude-3-5-sonnet-20241022`, `claude-opus-4-6`

## Deployment

### Deploy frontend to S3

```bash
aws s3 sync . s3://swordthain-demo-sites/ \
  --exclude ".git/*" \
  --exclude ".github/*" \
  --exclude "lambda/*" \
  --exclude "lambda.zip" \
  --exclude "*.pyc" \
  --exclude "__pycache__/*"
```

### Deploy Lambda

```bash
cd lambda
python3 -m pip install -r requirements.txt -t .
zip -r ../lambda.zip . -x "*.pyc" -x "__pycache__/*" -x "README.md"
cd ..
aws lambda update-function-code --function-name swordthain-automation --zip-file fileb://lambda.zip
```

### Invalidate CloudFront (optional)

```bash
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

## API URL configuration

The frontend uses `window.SWORDTHAIN_API` for the API base URL. It is set in `index.html` and `archived.html`:

```html
<script>window.SWORDTHAIN_API = "https://YOUR_API_ID.execute-api.eu-west-1.amazonaws.com/prod";</script>
```

Get the URL from API Gateway → your API → Stages → Invoke URL. Ensure it includes the stage (e.g. `/prod`).

## Local development

### Run scripts locally (filesystem)

The `scripts/` folder still has the original Python logic for local development:

```bash
python -m pip install -r requirements.txt
python -m playwright install --with-deps chromium  # for screenshots
python scripts/generate_sites.py
```

To test create/archive with env vars:

```bash
ISSUE_BODY="**Company name:** Test Co\n**Website:** https://example.com\n**Tone:** Professional" python scripts/create_company.py
ISSUE_TITLE="Archive company: Test Co" ISSUE_BODY="**Company id:** test-co" python scripts/archive_company.py
```

### Preview the site

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`. Note: create/archive/delete buttons call the live API; there is no local API server.

## File structure

```text
.
├─ index.html                 # Landing page (directory + create modal)
├─ archived.html              # Archived companies view
├─ CNAME                      # Custom domain (swordthain.com)
├─ assets/
│  ├─ app.js                  # UI logic + API calls
│  ├─ styles.css              # Global styling
│  ├─ sites.json              # Company registry
│  └─ screenshots/            # Screenshots (legacy; Lambda uses og:image)
├─ company-template/
│  └─ index.html              # Template for new companies
├─ <company-id>/
│  └─ index.html              # Generated company page
├─ lambda/                    # Lambda package (API backend)
│  ├─ lambda_function.py      # Handler (routes /create, /archive)
│  ├─ create_company.py      # Create logic (S3-adapted)
│  ├─ archive_company.py     # Archive/restore/delete (S3-adapted)
│  ├─ generate_sites.py       # Rebuild sites.json (S3-adapted)
│  ├─ s3_utils.py            # S3 + CloudFront helpers
│  ├─ ai_providers/          # OpenAI + Anthropic
│  └─ requirements.txt
├─ scripts/                   # Original scripts (local/dev use)
│  ├─ ai_providers/
│  ├─ create_company.py
│  ├─ archive_company.py
│  └─ generate_sites.py
└─ .github/workflows/         # Legacy (GitHub Actions, no longer used)
```

## Legacy: GitHub Pages + Actions

This project was originally hosted on GitHub Pages with GitHub Actions. The `.github/workflows/` folder and `scripts/` remain for reference and local use. The live site now runs entirely on AWS.
