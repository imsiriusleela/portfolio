"""Portfolio Tracker — Main entry point.

Run: CLOAKBROWSER=1 python refresh.py

Requires:
- credentials.json (Google service account key) in project directory
- Google Sheet shared with service account email
- Wallets sheet with wallet list (Label, Address columns)
"""

from datetime import datetime

from config import (
    CREDENTIALS_PATH, SHEET_NAME, SHEET_URL,
    DELAY_BETWEEN_WALLETS,
)
from scraper import scrape_all_wallets
from sheets import (
    get_client,
    read_wallets,
    setup_sheets,
    write_dashboard,
    write_tokens,
    write_protocols,
    write_nfts,
    clear_data_sheets,
)


def print_section(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f" {title}")
    print('=' * 60)


def truncate_address(addr: str) -> str:
    if len(addr) > 18:
        return addr[:10] + "..." + addr[-6:]
    return addr


def refresh_all() -> None:
    # Connect to Google Sheets
    print_section("Connecting to Google Sheets")
    client = get_client(CREDENTIALS_PATH)

    if SHEET_URL:
        spreadsheet = client.open_by_url(SHEET_URL)
    else:
        spreadsheet = client.open(SHEET_NAME)

    print(f"  Opened: {spreadsheet.title}")

    # Ensure sheets exist
    setup_sheets(spreadsheet)

    # Read wallet list
    wallets_sheet = spreadsheet.worksheet("Wallets")
    wallets = read_wallets(wallets_sheet)
    print(f"  Found {len(wallets)} wallet(s)")

    if not wallets:
        print("  No wallets found. Add wallets to Wallets sheet first.")
        return

    # Validate addresses
    valid_wallets = []
    for label, address in wallets:
        if address.startswith("0x") and len(address) == 42:
            valid_wallets.append((label, address))
        else:
            print(f"  Skipping invalid address: {label} ({address})")

    if not valid_wallets:
        print("  No valid wallets to scrape.")
        return

    # Scrape all wallets
    print_section("Scraping Wallets")

    results = scrape_all_wallets(valid_wallets)

    # Collect data
    summaries = []
    all_tokens = {}  # wallet_label -> tokens
    all_protocols = {}  # wallet_label -> protocols
    all_nfts = {}  # wallet_label -> nft_collections
    error_count = 0

    for r in results:
        label = r['label']
        data = r['data']

        if r['error']:
            print(f"  ERROR {label}: {r['error']}")
            summaries.append({
                'label': label,
                'address': r['address'],
                'total_net_usd_value': 0,
            })
            error_count += 1
            continue

        total_balance = data.get('total_balance', {})
        total_net_usd = total_balance.get('total_net_usd_value', 0) if isinstance(total_balance, dict) else 0

        print(f"  {label}: ${total_net_usd:,.2f}")
        print(f"    Tokens: {len(data.get('tokens', []))}")
        print(f"    Protocols: {len(data.get('protocols', []))}")
        nft_colls = data.get('nft_collections', {})
        print(f"    NFT collections: {sum(len(v) for v in nft_colls.values())}")

        summaries.append({
            'label': label,
            'address': r['address'],
            'total_net_usd_value': total_net_usd,
        })

        all_tokens[label] = data.get('tokens', [])
        all_protocols[label] = data.get('protocols', [])
        all_nfts[label] = data.get('nft_collections', {})

    # Write to Google Sheets
    print_section("Writing to Google Sheets")

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Dashboard
    dashboard = spreadsheet.worksheet("Dashboard")
    write_dashboard(dashboard, summaries, now)
    print("  Dashboard written")

    # Token Holdings
    tokens_sheet = spreadsheet.worksheet("Token Holdings")
    tokens_sheet.clear()
    tokens_sheet.append_row([
        "Wallet", "Chain", "Token Name", "Symbol",
        "Amount", "Price (USD)", "Value (USD)"
    ])
    total_token_rows = 0
    for label, tokens in all_tokens.items():
        write_tokens(tokens_sheet, label, tokens)
        total_token_rows += len(tokens)
    print(f"  Token Holdings: {total_token_rows} rows")

    # DeFi Positions
    defi_sheet = spreadsheet.worksheet("DeFi Positions")
    defi_sheet.clear()
    defi_sheet.append_row([
        "Wallet", "Chain", "Protocol", "Position Name", "Type", "Net Value (USD)"
    ])
    total_defi_rows = 0
    for label, protocols in all_protocols.items():
        write_protocols(defi_sheet, label, protocols)
        total_defi_rows += sum(len(p.get('portfolio_item_list', [])) for p in protocols)
    print(f"  DeFi Positions: {total_defi_rows} rows")

    # NFT Holdings
    nft_sheet = spreadsheet.worksheet("NFT Holdings")
    nft_sheet.clear()
    nft_sheet.append_row([
        "Wallet", "Chain", "Collection", "# Items", "Est. Value (USD)"
    ])
    total_nft_rows = 0
    for label, nft_collections in all_nfts.items():
        write_nfts(nft_sheet, label, {'collections': nft_collections})
        total_nft_rows += sum(len(v) for v in nft_collections.values())
    print(f"  NFT Holdings: {total_nft_rows} rows")

    print_section("Done")
    print(f"  Wallets processed: {len(valid_wallets)}")
    if error_count:
        print(f"  Errors: {error_count}")
    grand_total = sum(s['total_net_usd_value'] for s in summaries)
    print(f"  Grand total: ${grand_total:,.2f}")
    print(f"  Time: {now}")


if __name__ == "__main__":
    refresh_all()