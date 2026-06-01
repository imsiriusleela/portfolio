"""Configuration for Portfolio Tracker — uses CloakBrowser via Hermes."""

import os

# Google Sheets
SHEET_NAME = "Portfolio Tracker"
SHEET_URL = None  # Set to sheet URL if using URL instead of name
CREDENTIALS_PATH = "./credentials.json"

# Hermes infrastructure
HERMES_SCRIPTS_PATH = "/Users/leesirius/.hermes/scripts"

# Scraping timing
PAGE_LOAD_TIMEOUT = 45000  # ms
DATA_WAIT = 12000  # ms to wait after page load for late API responses
DELAY_BETWEEN_WALLETS = 3  # seconds

# Filtering
MIN_TOKEN_VALUE = 0.01  # USD minimum to include a token