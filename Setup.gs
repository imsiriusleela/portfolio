/**
 * Setup.gs — One-time sheet creation
 * Run setupSheets() to create all required sheets with proper headers
 */

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetNames = ['Wallets', 'Dashboard', 'Token Holdings', 'DeFi Positions', 'NFT Holdings'];
  const existingSheets = ss.getSheets().map(s => s.getName());
  const created = [];

  sheetNames.forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      created.push(name);
    } else {
      // Sheet exists — skip creation but ensure it has content
    }

    // Always write headers if sheet is new or empty
    const headers = getHeadersForSheet(name);
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const hasHeaders = headers.some((h, i) => firstRow[i] !== h);

    if (!hasHeaders || sheet.getLastRow() === 0) {
      sheet.clearContents();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f3f3f3');
    }

    sheet.setFrozenRows(1);
  });

  // Format Wallets sheet specifically
  const walletsSheet = ss.getSheetByName('Wallets');
  if (walletsSheet) {
    walletsSheet.getRange('A1:B1').setFontWeight('bold');
    walletsSheet.getRange('A2').setValue('Label');
    walletsSheet.getRange('B2').setValue('Wallet Address (0x...)');
    walletsSheet.getRange('A2:B2').setBackground('#e8f4fd');
    walletsSheet.setColumnWidth(1, 180);
    walletsSheet.setColumnWidth(2, 420);
    walletsSheet.setFrozenRows(2);

    // Add sample row if empty
    if (walletsSheet.getLastRow() < 3) {
      walletsSheet.getRange(3, 1, 1, 2).setValues([['Example Wallet', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']]);
    }
  }

  // Format Dashboard
  const dashSheet = ss.getSheetByName('Dashboard');
  if (dashSheet) {
    dashSheet.getRange('A1:D1').setFontWeight('bold');
    dashSheet.setColumnWidth(1, 180);
    dashSheet.setColumnWidth(2, 420);
    dashSheet.setColumnWidth(3, 140);
    dashSheet.setColumnWidth(4, 200);
  }

  // Format Token Holdings
  const tokenSheet = ss.getSheetByName('Token Holdings');
  if (tokenSheet) {
    tokenSheet.setColumnWidth(1, 160);
    tokenSheet.setColumnWidth(2, 80);
    tokenSheet.setColumnWidth(3, 200);
    tokenSheet.setColumnWidth(4, 80);
    tokenSheet.setColumnWidth(5, 140);
    tokenSheet.setColumnWidth(6, 100);
    tokenSheet.setColumnWidth(7, 120);
  }

  // Format DeFi Positions
  const defiSheet = ss.getSheetByName('DeFi Positions');
  if (defiSheet) {
    defiSheet.setColumnWidth(1, 160);
    defiSheet.setColumnWidth(2, 80);
    defiSheet.setColumnWidth(3, 160);
    defiSheet.setColumnWidth(4, 200);
    defiSheet.setColumnWidth(5, 120);
    defiSheet.setColumnWidth(6, 120);
  }

  // Format NFT Holdings
  const nftSheet = ss.getSheetByName('NFT Holdings');
  if (nftSheet) {
    nftSheet.setColumnWidth(1, 160);
    nftSheet.setColumnWidth(2, 80);
    nftSheet.setColumnWidth(3, 220);
    nftSheet.setColumnWidth(4, 100);
    nftSheet.setColumnWidth(5, 120);
  }

  const msg = created.length > 0
    ? 'Created sheets: ' + created.join(', ')
    : 'All sheets already exist with headers';
  const ui = SpreadsheetApp.getUi();
  if (ui) ui.alert('Setup Complete', msg, ui.ButtonSet.OK);
}

function getHeadersForSheet(name) {
  switch (name) {
    case 'Wallets':
      return ['Label', 'Wallet Address (0x...)'];
    case 'Dashboard':
      return ['Wallet Label', 'Wallet Address', 'Total Balance (USD)', 'Last Refreshed'];
    case 'Token Holdings':
      return ['Wallet', 'Chain', 'Token Name', 'Symbol', 'Amount', 'Price (USD)', 'Value (USD)'];
    case 'DeFi Positions':
      return ['Wallet', 'Chain', 'Protocol', 'Position Name', 'Type', 'Net Value (USD)'];
    case 'NFT Holdings':
      return ['Wallet', 'Chain', 'Collection', '# Items', 'Est. Value (USD)'];
    default:
      return [];
  }
}