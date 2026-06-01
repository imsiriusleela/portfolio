"""Google Sheets operations for Portfolio Tracker."""

from typing import Any

import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


def get_client(credentials_path: str) -> gspread.Client:
    """Authenticate and return gspread client."""
    creds = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
    return gspread.authorize(creds)


def read_wallets(sheet) -> list[tuple[str, str]]:
    """Read wallet list from Wallets sheet.

    Expected format:
    Row 2: Header (Label, Address)
    Row 3+: data rows

    Returns list of (label, address) tuples.
    """
    data = sheet.get_all_values()
    wallets = []

    for row in data[2:]:
        if len(row) >= 2 and row[1].strip():
            label = row[0].strip() if row[0].strip() else "Unnamed"
            address = row[1].strip()
            wallets.append((label, address))

    return wallets


def setup_sheets(spreadsheet) -> None:
    """Create sheets with headers if they don't exist."""
    existing = [s.title for s in spreadsheet.worksheets()]

    sheets_config = {
        "Dashboard": ["Label", "Address", "Total USD Value"],
        "Token Holdings": [
            "Wallet", "Chain", "Token Name", "Symbol",
            "Amount", "Price (USD)", "Value (USD)"
        ],
        "DeFi Positions": [
            "Wallet", "Chain", "Protocol", "Position Name", "Type", "Net Value (USD)"
        ],
        "NFT Holdings": [
            "Wallet", "Chain", "Collection", "# Items", "Est. Value (USD)"
        ],
    }

    for name, headers in sheets_config.items():
        if name not in existing:
            ws = spreadsheet.add_worksheet(title=name, rows=100, cols=20)
            ws.append_row(headers)
        else:
            ws = spreadsheet.worksheet(name)
            if not ws.get_all_values()[0]:
                ws.append_row(headers)


def clear_data_sheets(spreadsheet) -> None:
    """Clear data area of all data sheets (keeps headers)."""
    data_sheets = ["Dashboard", "Token Holdings", "DeFi Positions", "NFT Holdings"]
    for name in data_sheets:
        try:
            ws = spreadsheet.worksheet(name)
            ws.clear()
        except Exception:
            pass


def write_dashboard(sheet, summaries: list[dict], last_updated: str) -> None:
    """Write dashboard with per-wallet summary and grand total."""
    sheet.clear()

    sheet.append_row(["Label", "Address", "Total USD Value"])
    sheet.append_row([])

    grand_total = 0.0

    for s in summaries:
        net_usd = s.get("total_net_usd_value") or 0
        grand_total += net_usd
        addr = s.get("address", "")
        addr_display = addr[:10] + "..." + addr[-6:] if len(addr) > 18 else addr

        sheet.append_row([
            s.get("label", "Unknown"),
            addr_display,
            f"${net_usd:,.2f}"
        ])

    sheet.append_row([])
    sheet.append_row(["GRAND TOTAL", "", f"${grand_total:,.2f}"])
    sheet.append_row([])
    sheet.append_row([f"Last Updated: {last_updated}"])


def write_tokens(sheet, wallet_label: str, tokens: list[dict]) -> None:
    """Append token rows to Token Holdings sheet."""
    for token in tokens:
        amount = token.get("amount") or 0
        price = token.get("price") or 0
        value = amount * price

        sheet.append_row([
            wallet_label,
            token.get("chain", ""),
            token.get("name", ""),
            token.get("symbol", ""),
            amount,
            f"${price:,.2f}",
            f"${value:,.2f}",
        ])


def write_protocols(sheet, wallet_label: str, protocols: list[dict]) -> None:
    """Flatten and append DeFi protocol positions."""
    for protocol in protocols:
        chain = protocol.get("chain", "")
        name = protocol.get("name", "")

        for item in protocol.get("portfolio_item_list", []):
            position_name = item.get("name", "")
            detail_types = ", ".join(item.get("detail_types", []))
            stats = item.get("stats", {})
            net_usd = stats.get("net_usd_value") or 0

            sheet.append_row([
                wallet_label,
                chain,
                name,
                position_name,
                detail_types,
                f"${net_usd:,.2f}",
            ])


def write_nfts(sheet, wallet_label: str, nft_data: dict) -> None:
    """Append NFT holdings from nft_collections dict.

    nft_collections is a dict of chain -> list of collection objects.
    Each collection object has: id, name, chain, etc.
    """
    collections_by_chain = nft_data.get("collections", {})

    if isinstance(collections_by_chain, dict):
        for chain, collections in collections_by_chain.items():
            for coll in collections:
                sheet.append_row([
                    wallet_label,
                    chain,
                    coll.get("name", ""),
                    coll.get("id", ""),  # DeBank doesn't have item_count, use id as ref
                    "",  # est_value not available in DeBank NFT response
                ])
    else:
        # Fallback: list of collections
        for coll in collections_by_chain:
            sheet.append_row([
                wallet_label,
                coll.get("chain", ""),
                coll.get("name", ""),
                coll.get("id", ""),
                "",
            ])