/**
 * DeBank.gs — API wrapper for DeBank internal API
 */

const DEBANK_BASE = 'https://api.debank.com/';

const HEADERS = {
  'accept': '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'origin': 'https://debank.com',
  'referer': 'https://debank.com/',
  'source': 'web',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
};

/**
 * Internal fetch helper with retry and rate-limit handling
 * @param {string} endpoint — e.g. 'user/total_balance'
 * @param {Object} params — query parameters
 * @returns {Object|null} — the data field from the response, or null on failure
 */
function debankFetch_(endpoint, params) {
  const url = DEBANK_BASE + endpoint + buildQuery_(params);
  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, {
        headers: HEADERS,
        muteHttpExceptions: true
      });

      const status = response.getResponseCode();

      if (status === 429 || status >= 500) {
        Utilities.sleep(2000);
        continue;
      }

      if (status !== 200) {
        console.warn('DeBank API error for ' + endpoint + ': HTTP ' + status);
        return null;
      }

      const json = JSON.parse(response.getContentText());

      if (json.error_code !== undefined && json.error_code !== 0) {
        console.warn('DeBank error_code=' + json.error_code + ' for ' + endpoint);
        return null;
      }

      return json.data || null;
    } catch (e) {
      lastError = e;
      Utilities.sleep(1000);
    }
  }

  console.warn('DeBank fetch failed after 2 attempts for ' + endpoint + ': ' + (lastError ? lastError.message : 'unknown'));
  return null;
}

function buildQuery_(params) {
  const qs = Object.entries(params)
    .filter(([_, v]) => v !== null && v !== undefined)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    .join('&');
  return qs ? '?' + qs : '';
}

/**
 * Fetch total USD balance for a wallet
 * @returns {number|null}
 */
function fetchTotalBalance(address) {
  const data = debankFetch_('user/total_balance', { addr: address });
  return (data && typeof data.total_usd_value === 'number') ? data.total_usd_value : null;
}

/**
 * Fetch all token balances across all chains
 * @returns {Array|null}
 */
function fetchAllTokens(address) {
  const data = debankFetch_('token/cache_balance_list', { user_addr: address });
  return Array.isArray(data) ? data : null;
}

/**
 * Fetch DeFi protocol positions
 * @returns {Array|null}
 */
function fetchProtocols(address) {
  const data = debankFetch_('portfolio/project_list', { user_addr: address });
  return Array.isArray(data) ? data : null;
}

/**
 * Fetch the list of chains that have NFT activity for this address
 * @returns {Array|null}
 */
function fetchNFTChains(address) {
  const data = debankFetch_('nft/used_chains', { user_addr: address });
  return Array.isArray(data) ? data : null;
}

/**
 * Fetch NFT collections for a specific chain
 * @returns {Array|null}
 */
function fetchNFTCollections(address, chain) {
  const data = debankFetch_('nft/collection_list', { user_addr: address, chain: chain });
  return Array.isArray(data) ? data : null;
}