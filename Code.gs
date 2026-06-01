/**
 * Code.gs — Entry point & orchestrator
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Portfolio Tracker')
    .addItem('Refresh All', 'refreshAll')
    .addItem('Setup Sheets', 'setupSheets')
    .addToUi();
}

/**
 * Main orchestrator — fetches all wallet data and writes to sheets
 */
function refreshAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Read wallets ---
  const walletsSheet = ss.getSheetByName('Wallets');
  if (!walletsSheet) {
    alert_('Error', 'No "Wallets" sheet found. Run Setup Sheets first.');
    return;
  }

  const data = walletsSheet.getRange('A3:B' + walletsSheet.getLastRow()).getValues();
  const wallets = data
    .filter(row => row[0] && row[1] && typeof row[1] === 'string' && row[1].trim().startsWith('0x'))
    .map(row => ({ label: String(row[0]).trim(), address: String(row[1]).trim().toLowerCase() }));

  if (wallets.length === 0) {
    alert_('No Wallets Found', 'Add wallet addresses to the Wallets sheet (column B), starting at row 3.\nFormat: Label in column A, 0x address in column B.');
    return;
  }

  // --- Confirm ---
  const ui = SpreadsheetApp.getUi();
  if (ui) {
    const confirm = ui.alert(
      'Refresh ' + wallets.length + ' Wallet' + (wallets.length > 1 ? 's' : '') + '?',
      'This will fetch live data from DeBank and may take ~' + Math.ceil(wallets.length * 5 * 0.5) + ' seconds.',
      ui.ButtonSet.OK_CANCEL
    );
    if (confirm !== ui.ButtonSet.OK) return;
  }

  // --- Clear existing data ---
  clearDataSheets_();

  // --- Fetch each wallet ---
  const summaries = [];
  let successCount = 0;
  let errorCount = 0;

  wallets.forEach((wallet, idx) => {
    const toastMsg = 'Fetching ' + (idx + 1) + '/' + wallets.length + ': ' + wallet.label + '...';
    ss.toast(toastMsg, 'Portfolio Tracker', -1);

    const result = fetchWalletData_(wallet);
    if (result) {
      summaries.push({ label: wallet.label, address: wallet.address, balance: result.balance });
      successCount++;
    } else {
      summaries.push({ label: wallet.label, address: wallet.address, balance: 0 });
      errorCount++;
    }

    // Rate limit delay between wallets
    if (idx < wallets.length - 1) {
      Utilities.sleep(500);
    }
  });

  // --- Write all data ---
  writeDashboard(summaries);

  // --- Final toast ---
  const errMsg = errorCount > 0 ? (' ' + errorCount + ' error' + (errorCount > 1 ? 's' : '') + '.') : '';
  ss.toast('Refreshed ' + successCount + ' wallet' + (successCount > 1 ? 's' : '') + '.' + errMsg, 'Portfolio Tracker', 5);

  console.log('Refresh complete. Success=' + successCount + ', Errors=' + errorCount);
}

/**
 * Fetch all data for a single wallet
 * @param {Object} wallet — {label, address}
 * @returns {Object|null} — {balance} or null on complete failure
 */
function fetchWalletData_(wallet) {
  try {
    // 1. Total balance
    const balance = fetchTotalBalance(wallet.address);

    // 2. Tokens
    const tokens = fetchAllTokens(wallet.address);
    if (tokens && tokens.length > 0) {
      writeTokens(wallet.label, tokens);
    }

    // 3. DeFi positions
    const protocols = fetchProtocols(wallet.address);
    if (protocols && protocols.length > 0) {
      writeProtocols(wallet.label, protocols);
    }

    // 4. NFTs (require chain discovery first)
    const chains = fetchNFTChains(wallet.address);
    if (chains && chains.length > 0) {
      chains.forEach(chain => {
        const collections = fetchNFTCollections(wallet.address, chain);
        if (collections && collections.length > 0) {
          writeNFTs(wallet.label, chain, collections);
        }
        Utilities.sleep(300);
      });
    }

    return { balance };
  } catch (e) {
    console.warn('Error fetching wallet ' + wallet.label + ': ' + e.message);
    return null;
  }
}

function alert_(title, msg) {
  const ui = SpreadsheetApp.getUi();
  if (ui) ui.alert(title, msg, ui.ButtonSet.OK);
}