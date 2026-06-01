# Portfolio Tracker — CloakBrowser + Google Sheets

A Python script that scrapes wallet data from DeBank using CloakBrowser (anti-detect Chromium via Hermes infrastructure) and writes it to Google Sheets.

## Why CloakBrowser?

DeBank's API blocks requests from server IPs (429 errors). CloakBrowser is a source-level patched Chromium with fingerprint spoofing — runs via the existing Hermes agent infrastructure at `/Users/leesirius/.hermes`.

## Setup

### 1. Prerequisites

CloakBrowser and Playwright are already installed in the Hermes venv. Ensure your Hermes environment is set up.

### 2. Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Google Sheets API** and **Google Drive API**
3. Go to **IAM → Service Accounts → Create Service Account**
4. Download the JSON key file → save as `credentials.json` in this directory
5. Share your Google Sheet with the service account email (as Editor)

### 3. Configure

Edit `config.py`:
- Set `SHEET_NAME` or `SHEET_URL` to point to your spreadsheet
- `CREDENTIALS_PATH` should point to your `credentials.json`
- `HERMES_SCRIPTS_PATH` — path to Hermes scripts (default: `/Users/leesirius/.hermes/scripts`)

### 4. Prepare the Google Sheet

Create a sheet named **"Wallets"** with this structure:

| | A | B |
|--|---|---|
| 1 | **Wallet Addresses** | |
| 2 | Label | Address |
| 3 | Main Wallet | 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 |

Other sheets (Dashboard, Token Holdings, DeFi Positions, NFT Holdings) are created automatically on first run.

### 5. Run

```bash
CLOAKBROWSER=1 python refresh.py
```

## Architecture

```
CLOAKBROWSER=1 python refresh.py
  → browser_backend.stealth_browser() launches CloakBrowser
  → for each wallet:
      → new page, register response interceptors (before goto)
      → navigate to debank.com/profile/<address>
      → wait for API responses to be captured
      → collect JSON data (tokens, DeFi, NFTs)
      → close page
  → gspread writes all data to Google Sheets
```

## Files

| File | Purpose |
|------|---------|
| `refresh.py` | Main entry point |
| `scraper.py` | CloakBrowser scraping via Hermes browser_backend |
| `sheets.py` | Google Sheets read/write |
| `config.py` | Configuration constants |
| `credentials.json` | Google service account key (not committed to git) |

## Testing

Test scraper standalone:
```bash
CLOAKBROWSER=1 python -c "from scraper import scrape_all_wallets; print(scrape_all_wallets([('Test', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')]))"
```

## Notes

- **Do not commit `credentials.json`** to git
- **Manual only** — run `CLOAKBROWSER=1 python refresh.py` when you want to refresh
- **CloakBrowser vs Camoufox**: Set `CLOAKBROWSER=1` to use CloakBrowser, otherwise defaults to Camoufox