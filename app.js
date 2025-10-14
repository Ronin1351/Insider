/**
 * Insider Trading Tracker Application
 * Fetches and displays ALL insider trading transactions for a given time period
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  allTrades: [],
  currentSort: {
    column: 'date',
    direction: 'desc'
  },
  filters: {
    dateFrom: '',
    dateTo: ''
  },
  isLoading: false
};

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================

const elements = {
  refreshBtn: null,
  tableBody: null,
  table: null,
  loading: null,
  errorMessage: null,
  emptyState: null,
  lastUpdated: null,
  filterDateFrom: null,
  filterDateTo: null,
  tableHeaders: null,
  statsBar: null,
  statTotal: null,
  statBuyVolume: null,
  statSellVolume: null
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_ENDPOINT: '/api/insider-trades',
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  DEBOUNCE_DELAY: 300
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch insider trading data from the API with retry logic
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Object>} API response data
 */
async function fetchInsiderTrades(retryCount = 0) {
  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (state.filters.dateFrom) params.append('from', state.filters.dateFrom);
    if (state.filters.dateTo) params.append('to', state.filters.dateTo);
    
    const url = `${CONFIG.API_ENDPOINT}${params.toString() ? '?' + params.toString() : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  } catch (error) {
    if (retryCount < CONFIG.MAX_RETRIES) {
      await delay(CONFIG.RETRY_DELAY * (retryCount + 1));
      return fetchInsiderTrades(retryCount + 1);
    }
    throw error;
  }
}

/**
 * Load and display insider trading data
 */
async function loadData() {
  if (state.isLoading) return;
  
  try {
    state.isLoading = true;
    showLoading();
    hideError();
    hideEmptyState();
    hideStats();
    
    const response = await fetchInsiderTrades();
    
    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Invalid data format received');
    }
    
    state.allTrades = response.data;
    renderTable(state.allTrades);
    updateStatistics(state.allTrades);
    updateTimestamp(response.timestamp);
    
    if (state.allTrades.length === 0) {
      showEmptyState();
    }
    
  } catch (error) {
    console.error('Error loading data:', error);
    showError(getErrorMessage(error));
  } finally {
    state.isLoading = false;
    hideLoading();
  }
}

// ============================================================================
// DATA PROCESSING & FORMATTING
// ============================================================================

/**
 * Format number as currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0.00';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format large currency amounts with K, M, B suffixes
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrencyShort(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0';
  }
  
  const absAmount = Math.abs(amount);
  if (absAmount >= 1e9) {
    return '$' + (amount / 1e9).toFixed(2) + 'B';
  } else if (absAmount >= 1e6) {
    return '$' + (amount / 1e6).toFixed(2) + 'M';
  } else if (absAmount >= 1e3) {
    return '$' + (amount / 1e3).toFixed(2) + 'K';
  }
  return formatCurrency(amount);
}

/**
 * Format date string
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
}

/**
 * Format percentage with sign and color
 * @param {number} change - Percentage change
 * @returns {string} Formatted percentage
 */
function formatPercentage(change) {
  if (change === null || change === undefined || isNaN(change)) {
    return '0.0%';
  }
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Calculate transaction value
 * @param {number} shares - Number of shares
 * @param {number} price - Price per share
 * @returns {number} Total transaction value
 */
function calculateTransactionValue(shares, price) {
  if (!shares || !price) return 0;
  return shares * price;
}

/**
 * Get user-friendly error message
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
function getErrorMessage(error) {
  if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
    return 'Unable to connect. Please check your connection.';
  }
  if (error.message.includes('rate limit')) {
    return 'API rate limit exceeded. Please try again later.';
  }
  if (error.message.includes('Invalid data format')) {
    return error.message;
  }
  return error.message || 'An unexpected error occurred. Please try again.';
}

// ============================================================================
// STATISTICS CALCULATION
// ============================================================================

/**
 * Update statistics display
 * @param {Array} trades - Array of trade objects
 */
function updateStatistics(trades) {
  if (!trades || trades.length === 0) {
    hideStats();
    return;
  }
  
  let totalBuyVolume = 0;
  let totalSellVolume = 0;
  
  trades.forEach(trade => {
    const value = calculateTransactionValue(trade.share, trade.transactionPrice);
    if (trade.transactionCode === 'P') {
      totalBuyVolume += value;
    } else if (trade.transactionCode === 'S') {
      totalSellVolume += value;
    }
  });
  
  elements.statTotal.textContent = trades.length.toLocaleString();
  elements.statBuyVolume.textContent = formatCurrencyShort(totalBuyVolume);
  elements.statSellVolume.textContent = formatCurrencyShort(totalSellVolume);
  
  showStats();
}

function showStats() {
  if (elements.statsBar) {
    elements.statsBar.style.display = 'flex';
  }
}

function hideStats() {
  if (elements.statsBar) {
    elements.statsBar.style.display = 'none';
  }
}

// ============================================================================
// TABLE RENDERING
// ============================================================================

/**
 * Create a single table row for a trade
 * @param {Object} trade - Trade data object
 * @returns {HTMLTableRowElement} Table row element
 */
function createTableRow(trade) {
  const row = document.createElement('tr');
  const isBuy = trade.transactionCode === 'P';
  
  row.className = isBuy ? 'buy-row' : 'sell-row';
  
  const transactionValue = calculateTransactionValue(trade.share, trade.transactionPrice);
  const changeFormatted = formatPercentage(trade.change);
  const changeClass = trade.change >= 0 ? 'positive' : 'negative';
  
  // Create cells with data-label for mobile responsiveness
  const cells = [
    { label: 'Date', content: formatDate(trade.filingDate) },
    { label: 'Ticker', content: trade.symbol, class: 'ticker' },
    { label: 'Stock Price', content: formatCurrency(trade.transactionPrice), class: 'price' },
    { label: 'Transaction Amount', content: formatCurrency(transactionValue), class: 'amount' },
    { label: 'Own Δ%', content: changeFormatted, class: `delta ${changeClass}` }
  ];
  
  cells.forEach(cell => {
    const td = document.createElement('td');
    td.setAttribute('data-label', cell.label);
    if (cell.class) {
      td.className = cell.class;
    }
    td.textContent = cell.content;
    row.appendChild(td);
  });
  
  return row;
}

/**
 * Render the trades table
 * @param {Array} trades - Array of trade objects
 */
function renderTable(trades) {
  const tbody = elements.tableBody;
  const table = elements.table;
  
  // Clear existing rows
  tbody.innerHTML = '';
  
  if (!trades || trades.length === 0) {
    table.classList.remove('visible');
    showEmptyState();
    return;
  }
  
  // Use document fragment for better performance
  const fragment = document.createDocumentFragment();
  
  trades.forEach(trade => {
    fragment.appendChild(createTableRow(trade));
  });
  
  tbody.appendChild(fragment);
  table.classList.add('visible');
  hideEmptyState();
}

// ============================================================================
// SORTING FUNCTIONALITY
// ============================================================================

/**
 * Sort trades by column
 * @param {string} column - Column name to sort by
 */
function sortTrades(column) {
  // Toggle direction if same column, otherwise default to descending
  if (state.currentSort.column === column) {
    state.currentSort.direction = state.currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.currentSort.column = column;
    state.currentSort.direction = 'desc';
  }
  
  const direction = state.currentSort.direction === 'asc' ? 1 : -1;
  
  state.allTrades.sort((a, b) => {
    let aVal, bVal;
    
    switch (column) {
      case 'date':
        aVal = new Date(a.filingDate);
        bVal = new Date(b.filingDate);
        break;
      case 'ticker':
        aVal = a.symbol.toLowerCase();
        bVal = b.symbol.toLowerCase();
        return direction * aVal.localeCompare(bVal);
      case 'price':
        aVal = a.transactionPrice || 0;
        bVal = b.transactionPrice || 0;
        break;
      case 'amount':
        aVal = calculateTransactionValue(a.share, a.transactionPrice);
        bVal = calculateTransactionValue(b.share, b.transactionPrice);
        break;
      case 'delta':
        aVal = a.change || 0;
        bVal = b.change || 0;
        break;
      default:
        return 0;
    }
    
    if (aVal < bVal) return -direction;
    if (aVal > bVal) return direction;
    return 0;
  });
  
  updateSortIndicators();
  renderTable(state.allTrades);
}

/**
 * Update visual sort indicators on table headers
 */
function updateSortIndicators() {
  elements.tableHeaders.forEach(header => {
    const column = header.getAttribute('data-sort');
    header.classList.remove('sorted-asc', 'sorted-desc');
    
    if (column === state.currentSort.column) {
      header.classList.add(`sorted-${state.currentSort.direction}`);
    }
  });
}

// ============================================================================
// DATE FILTERING
// ============================================================================

/**
 * Apply date filters and reload data
 */
const applyDateFilters = debounce(() => {
  state.filters.dateFrom = elements.filterDateFrom.value;
  state.filters.dateTo = elements.filterDateTo.value;
  
  // Validate date range
  if (state.filters.dateFrom && state.filters.dateTo) {
    const fromDate = new Date(state.filters.dateFrom);
    const toDate = new Date(state.filters.dateTo);
    
    if (toDate < fromDate) {
      showError('End date must be after start date');
      return;
    }
  }
  
  loadData();
}, CONFIG.DEBOUNCE_DELAY);

/**
 * Debounce function to limit rapid calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================================================
// UI STATE MANAGEMENT
// ============================================================================

/**
 * Show loading state
 */
function showLoading() {
  elements.loading.style.display = 'flex';
  elements.table.classList.remove('visible');
  elements.refreshBtn.classList.add('loading');
  elements.refreshBtn.disabled = true;
}

/**
 * Hide loading state
 */
function hideLoading() {
  elements.loading.style.display = 'none';
  elements.refreshBtn.classList.remove('loading');
  elements.refreshBtn.disabled = false;
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
  elements.errorMessage.classList.add('visible');
  const errorContent = elements.errorMessage.querySelector('.error-content p');
  if (errorContent) {
    errorContent.textContent = message;
  }
  elements.table.classList.remove('visible');
}

/**
 * Hide error message
 */
function hideError() {
  elements.errorMessage.classList.remove('visible');
}

/**
 * Show empty state
 */
function showEmptyState() {
  elements.emptyState.classList.add('visible');
}

/**
 * Hide empty state
 */
function hideEmptyState() {
  elements.emptyState.classList.remove('visible');
}

/**
 * Update last updated timestamp
 * @param {string} timestamp - ISO timestamp string
 */
function updateTimestamp(timestamp) {
  if (!elements.lastUpdated) return;
  
  const date = timestamp ? new Date(timestamp) : new Date();
  const formatted = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  elements.lastUpdated.textContent = `Updated: ${formatted}`;
  elements.lastUpdated.classList.add('visible');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle refresh button click
 */
function handleRefresh() {
  loadData();
}

/**
 * Handle table header click for sorting
 * @param {Event} event - Click event
 */
function handleSort(event) {
  const header = event.target.closest('th[data-sort]');
  if (!header) return;
  
  const column = header.getAttribute('data-sort');
  sortTrades(column);
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyboard(event) {
  // R key for refresh (without modifiers)
  if (event.key === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const activeElement = document.activeElement;
    // Don't trigger if user is typing in an input
    if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
      event.preventDefault();
      handleRefresh();
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize DOM element references
 */
function initializeElements() {
  elements.refreshBtn = document.querySelector('#refresh-btn');
  elements.tableBody = document.querySelector('#data-table-body');
  elements.table = document.querySelector('table');
  elements.loading = document.querySelector('#loading');
  elements.errorMessage = document.querySelector('#error-message');
  elements.emptyState = document.querySelector('.empty-state');
  elements.lastUpdated = document.querySelector('#last-updated');
  elements.filterDateFrom = document.querySelector('.filter-date-from');
  elements.filterDateTo = document.querySelector('.filter-date-to');
  elements.tableHeaders = document.querySelectorAll('th.sortable');
  elements.statsBar = document.querySelector('#stats-bar');
  elements.statTotal = document.querySelector('#stat-total');
  elements.statBuyVolume = document.querySelector('#stat-buy-volume');
  elements.statSellVolume = document.querySelector('#stat-sell-volume');
}

/**
 * Set default date range (last 30 days)
 */
function setDefaultDateRange() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  elements.filterDateTo.value = today.toISOString().split('T')[0];
  elements.filterDateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
  
  state.filters.dateFrom = elements.filterDateFrom.value;
  state.filters.dateTo = elements.filterDateTo.value;
}

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
  // Refresh button
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', handleRefresh);
  }
  
  // Date filter inputs
  if (elements.filterDateFrom) {
    elements.filterDateFrom.addEventListener('change', applyDateFilters);
  }
  if (elements.filterDateTo) {
    elements.filterDateTo.addEventListener('change', applyDateFilters);
  }
  
  // Table header sorting
  elements.tableHeaders.forEach(header => {
    header.addEventListener('click', handleSort);
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

/**
 * Utility delay function
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main initialization function
 */
async function init() {
  initializeElements();
  setDefaultDateRange();
  initializeEventListeners();
  
  // Load initial data
  await loadData();
}

// ============================================================================
// START APPLICATION
// ============================================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}