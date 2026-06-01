"""CloakBrowser-based DeBank scraper using Hermes browser_backend."""

import sys
from typing import Any

from config import HERMES_SCRIPTS_PATH, PAGE_LOAD_TIMEOUT, DATA_WAIT, MIN_TOKEN_VALUE

sys.path.insert(0, HERMES_SCRIPTS_PATH)

from browser_backend import stealth_browser


def scrape_wallet(browser, address: str) -> dict[str, Any]:
    """Scrape a wallet's data from DeBank using browser network interception.

    Args:
        browser: Playwright browser instance (from stealth_browser context)
        address: Wallet address to scrape

    Returns:
        {
            "total_balance": float,
            "tokens": [...],
            "protocols": [...],
            "nft_chains": [...],
            "nft_collections": [...]
        }
    """
    captured = {}
    nft_chains = []

    def handle_response(response):
        nonlocal nft_chains
        url = response.url

        if 'api.debank.com' not in url:
            return

        try:
            j = response.json()
            data = j.get('data')
            if data is None:
                return

            if 'asset/total_net_curve' in url:
                # data = {"usd_value_list": [[ts, usd_value], ...]} ascending
                lst = data.get('usd_value_list') if isinstance(data, dict) else None
                if lst and isinstance(lst[-1], list) and len(lst[-1]) == 2:
                    captured['total_balance'] = {'total_net_usd_value': lst[-1][1]}
            elif 'token/cache_balance_list' in url:
                captured['tokens'] = data
            elif 'portfolio/project_list' in url:
                captured['protocols'] = data
            elif 'nft/used_chains' in url:
                nft_chains = data if isinstance(data, list) else []
            elif 'nft/collection_list' in url:
                # Extract chain from URL
                chain = None
                if 'chain=' in url:
                    import re
                    m = re.search(r'chain=([^&]+)', url)
                    if m:
                        chain = m.group(1)

                existing = captured.get('nft_collections', {})
                if isinstance(data, list):
                    if chain:
                        existing[chain] = data
                    else:
                        existing['unknown'] = data
                captured['nft_collections'] = existing
        except Exception:
            pass

    page = browser.new_page()
    page.on('response', handle_response)

    page.goto(
        f'https://debank.com/profile/{address}',
        wait_until='domcontentloaded',
        timeout=PAGE_LOAD_TIMEOUT
    )
    page.wait_for_timeout(DATA_WAIT)

    page.close()

    # Filter dust tokens
    tokens = captured.get('tokens', [])
    tokens = [
        t for t in tokens
        if (t.get('amount') or 0) * (t.get('price') or 0) >= MIN_TOKEN_VALUE
    ]
    tokens.sort(
        key=lambda t: (t.get('amount') or 0) * (t.get('price') or 0),
        reverse=True
    )

    return {
        'total_balance': captured.get('total_balance', {}),
        'tokens': tokens,
        'protocols': captured.get('protocols', []),
        'nft_chains': nft_chains,
        'nft_collections': captured.get('nft_collections', {}),
    }


def scrape_all_wallets(wallets: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Scrape multiple wallets using CloakBrowser.

    Args:
        wallets: List of (label, address) tuples

    Returns:
        List of result dicts (one per wallet)
    """
    results = []

    with stealth_browser(headless=True, window=(1280, 720)) as browser:
        for label, address in wallets:
            print(f"  Scraping {label} ({address[:10]}...{address[-6:]})")
            try:
                data = scrape_wallet(browser, address)
                results.append({
                    'label': label,
                    'address': address,
                    'data': data,
                    'error': None,
                })
            except Exception as e:
                results.append({
                    'label': label,
                    'address': address,
                    'data': None,
                    'error': str(e),
                })

    return results


if __name__ == "__main__":
    # Test with vitalik.eth
    import json

    test_wallets = [("Test", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")]
    results = scrape_all_wallets(test_wallets)

    for r in results:
        print(f"\nLabel: {r['label']}")
        if r['error']:
            print(f"  ERROR: {r['error']}")
        else:
            data = r['data']
            print(f"  Total balance: {data.get('total_balance', {})}")
            print(f"  Tokens: {len(data.get('tokens', []))}")
            print(f"  Protocols: {len(data.get('protocols', []))}")
            nft_colls = data.get('nft_collections', {})
            print(f"  NFT collections: {sum(len(v) for v in nft_colls.values())}")