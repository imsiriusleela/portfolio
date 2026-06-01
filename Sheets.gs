/**
 * Sheets.gs — Sheet operations and data writing
 */

/**
 * Get or create a sheet with headers
 */
function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Clear data rows (below headers) on all data sheets
 */
function clearDataSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheets = ['Dashboard', 'Token Holdings', 'DeFi Positions', 'NFT Holdings'];
  dataSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getMaxColumns()).clearContent();
    }
  });
}

/**
 * Write dashboard rows and grand total
 * @param {Array} walletSummaries — [{label, address, balance}]
 */
function writeDashboard(walletSummaries) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Dashboard');
  if (!sheet) return;

  let row = 2;
  let grandTotal = 0;

  walletSummaries.forEach(w => {
    sheet.getRange(row, 1, 1, 3).setValues([[
      w.label,
      w.address,
      w.balance
    ]]);
    if (typeof w.balance === 'number') grandTotal += w.balance;
    row++;
  });

  // Grand total row
  sheet.getRange(row, 1, 1, 2).setValues([['GRAND TOTAL', '']]);
  sheet.getRange(row, 3).setValue(grandTotal);
  sheet.getRange(row, 1, 1, 3).setFontWeight('bold');
  sheet.getRange(row, 3).setNumberFormat('$#,##0.00');

  // Timestamp top-right
  const now = new Date();
  sheet.getRange(1, 4).setValue('Last Updated: ' + formatTimestamp_(now));
  sheet.getRange(1, 4).setFontWeight('normal');

  // Format USD column
  sheet.getRange(2, 3, row - 1, 1).setNumberFormat('$#,##0.00');
}

/**
 * Write token rows to Token Holdings sheet
 * @param {string} walletLabel
 * @param {Array} tokens
 */
function writeTokens(walletLabel, tokens) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Token Holdings');
  if (!sheet) return;

  const nextRow = sheet.getLastRow() + 1;

  // Filter and sort by value descending
  const filtered = (tokens || [])
    .filter(t => {
      const value = (t.amount || 0) * (t.price || 0);
      return value > 0.01;
    })
    .sort((a, b) => {
      const va = (a.amount || 0) * (a.price || 0);
      const vb = (b.amount || 0) * (b.price || 0);
      return vb - va;
    });

  filtered.forEach((t, i) => {
    const value = (t.amount || 0) * (t.price || 0);
    const row = nextRow + i;
    sheet.getRange(row, 1, 1, 7).setValues([[
      walletLabel,
      t.chain || '',
      t.name || '',
      t.symbol || '',
      t.amount || 0,
      t.price || 0,
      value
    ]]);
    sheet.getRange(row, 6).setNumberFormat('$#,##0.00');
    sheet.getRange(row, 7).setNumberFormat('$#,##0.00');
  });
}

/**
 * Write DeFi protocol positions
 * @param {string} walletLabel
 * @param {Array} protocols
 */
function writeProtocols(walletLabel, protocols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DeFi Positions');
  if (!sheet) return;

  const nextRow = sheet.getLastRow() + 1;
  let row = nextRow;

  (protocols || []).forEach(protocol => {
    const chain = protocol.chain || '';
    const protoName = protocol.name || '';

    (protocol.portfolio_item_list || []).forEach(item => {
      const positionName = item.name || '';
      const detailType = (item.detail_types || [])[0] || '';
      const netValue = item.stats ? (item.stats.net_usd_value || 0) : 0;

      sheet.getRange(row, 1, 1, 6).setValues([[
        walletLabel,
        chain,
        protoName,
        positionName,
        detailType,
        netValue
      ]]);
      sheet.getRange(row, 6).setNumberFormat('$#,##0.00');
      row++;
    });
  });
}

/**
 * Write NFT collections
 * @param {string} walletLabel
 * @param {string} chain
 * @param {Array} collections
 */
function writeNFTs(walletLabel, chain, collections) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('NFT Holdings');
  if (!sheet) return;

  const nextRow = sheet.getLastRow() + 1;

  (collections || []).forEach((col, i) => {
    const row = nextRow + i;
    const itemCount = col.nft_list ? col.nft_list.length : (col.amount || 0);
    const totalValue = col.total_price || 0;

    sheet.getRange(row, 1, 1, 5).setValues([[
      walletLabel,
      chain,
      col.name || '',
      itemCount,
      totalValue
    ]]);
    sheet.getRange(row, 5).setNumberFormat('$#,##0.00');
  });
}

function formatTimestamp_(date) {
  const pad = n => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}