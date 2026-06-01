# Portfolio Tracker — DeBank Scrape via CloakBrowser to Google Sheets

## Goal

Build a Python portfolio tracker that scrapes wallet data from DeBank using CloakBrowser (anti-detect Chromium via the existing Hermes agent infrastructure), then writes the data to Google Sheets. User runs a single command to refresh.

## Why CloakBrowser?

- DeBank blocks direct API calls from server IPs (429 errors from Google Apps Script)
- CloakBrowser is a patched Chromium with source-level fingerprint spoofing — far better than vanilla Playwright
- The user's Hermes agent at `/Users/leesirius/.hermes` already has CloakBrowser installed and a working browser backend wrapper
- An existing script `debank_fetch_parse.py` in Hermes already scrapes DeBank with network interception — we reuse this exact pattern

## Existing Infrastructure to Reuse

### Browser Backend Wrapper
**File:** `/Users/leesirius/.hermes/scripts/browser_backend.py`

Provides `stealth_browser()` context manager — handles CloakBrowser vs Camoufox switching via `CLOAKBROWSER=1` env var. Returns a standard Playwright browser object.

```python
from browser_backend import stealth_browser

with stealth_browser(headless=True, window=(1280, 720)) as browser:
    page = browser.new_page()
    page.on('response', handle_response)
    page.goto('https://debank.com/profile/0x...', wait_until='domcontentloaded', timeout=45000)
    page.wait_for_timeout(12000)
```

### CloakBrowser Launch API
```python
from cloakbrowser import launch
# Returns Playwright Browser object with patched Chromium
# Supports: proxy, geoip, humanize, human_preset
```

### Existing DeBank Scraper Pattern
**File:** `/Users/leesirius/.hermes/hermes-agent/scripts/debank_fetch_parse.py`
- Already uses `stealth_browser()` + `page.on('response', handler)` for network interception
- Already handles DeBank page load timing
- Reference this for the proven interception pattern

## Architecture

```
CLOAKBROWSER=1 python refresh.py
  → imports browser_backend from Hermes
  → stealth_browser() launches CloakBrowser (patched Chromium)
  → for each wallet:
      → new page, register response interceptors
      → navigate to debank.com/profile/<address>
      → wait for API responses to be captured
      → collect JSON data (tokens, DeFi, NFTs)
      → close page
  → gspread writes all data to Google Sheets
```

## Network Interception Strategy

When DeBank's page loads, it calls its own internal API. We intercept those responses:

| URL Pattern to Match | Data Captured | Response Path |
|---------------------|---------------|---------------|
| `*/user/total_balance*` | Total USD value | `data.total_usd_value` |
| `*/token/cache_balance_list*` | All token balances (all chains) | `data` → array of token objects |
| `*/portfolio/project_list*` | All DeFi positions | `data` → array of protocol objects |
| `*/nft/used_chains*` | Which chains have NFTs | `data` → array of chain IDs |
| `*/nft/collection_list*` | NFT collections per chain | `data` → array of collection objects |

All responses return `{ "data": ..., "error_code": 0 }`.

## Expected Response Schemas

### Token object (from `cache_balance_list`)
```json
{
  "chain": "eth",
  "name": "Ethereum",
  "symbol": "ETH",
  "amount": 1.5,
  "price": 3200.0,
  "logo_url": "...",
  "is_verified": true
}
```

### Protocol object (from `project_list`)
```json
{
  "chain": "eth",
  "name": "Aave V3",
  "portfolio_item_list": [
    {
      "name": "Lending",
      "detail_types": ["lending"],
      "stats": { "net_usd_value": 5000.0 }
    }
  ]
}
```

## Google Sheet Structure

### `Wallets` sheet (config)
| Row | A | B |
|-----|---|---|
| 1 | **Wallet Addresses** | |
| 2 | Label | Address |
| 3+ | *(e.g. "Main Wallet")* | *(0x...)* |

### `Dashboard` sheet
- Per-wallet summary: Label, Address (truncated), Total USD Value
- Grand total row
- "Last Updated" timestamp

### `Token Holdings` sheet
Headers: Wallet | Chain | Token | Symbol | Amount | Price (USD) | Value (USD)

### `DeFi Positions` sheet
Headers: Wallet | Chain | Protocol | Position Name | Type | Net Value (USD)

### `NFT Holdings` sheet
Headers: Wallet | Chain | Collection | # Items | Est. Value (USD)

## Google Sheets Auth (via Service Account)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable Google Sheets API
3. Create Service Account → download JSON key file
4. Share the Google Sheet with the service account email (as Editor)
5. Save JSON key as `credentials.json` in `/Users/leesirius/projects/portfolio/`

## Files to Create

All files in `/Users/leesirius/projects/portfolio/`.

### `config.py` — Configuration
- `SHEET_NAME` or `SHEET_URL` — which Google Sheet to write to
- `CREDENTIALS_PATH` — path to `credentials.json` (default: `./credentials.json`)
- `HERMES_SCRIPTS_PATH` — `/Users/leesirius/.hermes/scripts` (for importing `browser_backend`)
- `PAGE_LOAD_TIMEOUT` — ms to wait for DeBank page (default: 45000)
- `DATA_WAIT` — ms to wait after page load for late API responses (default: 12000)
- `DELAY_BETWEEN_WALLETS` — seconds between wallets (default: 3)
- `MIN_TOKEN_VALUE` — minimum USD value to include a token (default: 0.01)

### `scraper.py` — CloakBrowser scraping logic
- Adds Hermes scripts path to `sys.path` for `browser_backend` import
- `scrape_wallet(browser, address)` → creates new page, sets up response interceptors, navigates to `https://debank.com/profile/<address>`, waits for data, returns dict:
  ```python
  {
    "total_balance": float,
    "tokens": [...],
    "protocols": [...],
    "nft_collections": [...]
  }
  ```
- `scrape_all_wallets(wallets)` → opens one browser, loops through wallets with delay between each, returns list of results
- Response handler registered **before** `page.goto()` to catch all responses
- Uses `page.wait_for_load_state("domcontentloaded")` then `page.wait_for_timeout(DATA_WAIT)` for late responses

### `sheets.py` — Google Sheets operations
- `get_client(credentials_path)` → returns authenticated gspread client
- `read_wallets(spreadsheet)` → reads `Wallets` sheet from row 3 down, returns list of `(label, address)` tuples
- `clear_data_sheets(spreadsheet)` → clears all data sheets below headers
- `write_dashboard(spreadsheet, summaries)` → writes summary table + grand total + timestamp
- `write_tokens(spreadsheet, wallet_label, tokens)` → filters dust (< $0.01), sorts by value desc, appends rows
- `write_protocols(spreadsheet, wallet_label, protocols)` → flattens `portfolio_item_list` into rows
- `write_nfts(spreadsheet, wallet_label, collections)` → appends collection-level rows
- `setup_sheets(spreadsheet)` → creates sheets with headers if they don't exist
- Uses **batch updates** (`worksheet.update()` with ranges) to stay within gspread rate limits

### `refresh.py` — Main entry point / orchestrator
```
Usage: CLOAKBROWSER=1 python refresh.py
```
1. Loads config
2. Connects to Google Sheet via gspread
3. Reads wallet list from `Wallets` sheet
4. Validates wallets (non-empty, addresses look like 0x...)
5. Calls `scrape_all_wallets()` to fetch all data
6. Clears data sheets
7. Writes Dashboard, Token Holdings, DeFi Positions, NFT Holdings
8. Prints summary to terminal (wallets processed, errors, total value)

### `requirements.txt`
```
gspread
google-auth
```
(CloakBrowser + Playwright already installed in Hermes venv)

### `README.md` — Setup instructions

### `.gitignore`
```
credentials.json
__pycache__/
*.pyc
```

## Implementation Order

1. `config.py` — constants and paths
2. `scraper.py` — CloakBrowser interception logic (test standalone with 1 wallet, print results)
3. `sheets.py` — Google Sheets read/write (test standalone with mock data)
4. `refresh.py` — orchestrator tying it all together
5. `requirements.txt` + `.gitignore`
6. `README.md`

## Verification

1. **Test scraper alone:**
   ```bash
   cd /Users/leesirius/projects/portfolio
   CLOAKBROWSER=1 python -c "from scraper import scrape_all_wallets; print(scrape_all_wallets([('Test', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')]))"
   ```
   Should print captured token/protocol/NFT data for vitalik.eth.

2. **Test sheets alone:**
   ```bash
   python -c "from sheets import get_client, setup_sheets; c = get_client('./credentials.json'); s = c.open('Portfolio Tracker'); setup_sheets(s)"
   ```
   Should create all 5 sheets with headers.

3. **Full test:**
   Add 1-2 wallets to the `Wallets` sheet, then:
   ```bash
   CLOAKBROWSER=1 python refresh.py
   ```
   Verify all sheets populated correctly.

4. Test with invalid address → confirm graceful skip + error count in terminal output.

5. Test with 5+ wallets → confirm no rate limiting, reasonable runtime (~15-20s per wallet).

## Risks & Open Questions

- **DeBank page changes**: If DeBank changes their SPA structure or adds challenge pages, the page load / wait timing may need adjustment. The network interception approach is resilient to UI changes since we capture API responses, not DOM.
- **CloakBrowser detection**: Unlikely given source-level Chromium patches, but if DeBank adds aggressive bot detection, enable `humanize=True` with `human_preset='careful'` in the launch config.
- **Network interception timing**: Register response handler **before** `page.goto()` to avoid missing early responses. The 12-second post-load wait catches late responses.
- **NFT pagination**: Large NFT portfolios may not fully load on first page view. Initial implementation captures what the page loads by default.
- **Google Sheets API quota**: gspread default is 60 req/min. Batch writes with `worksheet.update()` keeps us well under this. For 20 wallets, expect ~10-15 API calls total.
- **Python path**: `scraper.py` adds `/Users/leesirius/.hermes/scripts` to `sys.path` to import `browser_backend`. If Hermes moves, update `HERMES_SCRIPTS_PATH` in config.

## What NOT to Do

- Don't call `api.debank.com` directly via `requests`/`httpx` — gets 429'd
- Don't parse HTML/DOM selectors — use network interception for structured JSON
- Don't write cell-by-cell to Google Sheets — use batch range updates
- Don't use vanilla Playwright — use CloakBrowser via `browser_backend`
- Don't install a separate Playwright/Chromium — CloakBrowser in Hermes venv has its own patched binary
- Don't commit `credentials.json` to git

## Source References

- Browser backend wrapper: `/Users/leesirius/.hermes/scripts/browser_backend.py`
- Existing DeBank scraper pattern: `/Users/leesirius/.hermes/hermes-agent/scripts/debank_fetch_parse.py`
- CloakBrowser package: `/Users/leesirius/.hermes/hermes-agent/venv/lib/python3.13/site-packages/cloakbrowser/`
- DeBank internal API structure: [py-debank](https://github.com/SecorD0/py-debank) (archived open source library)
