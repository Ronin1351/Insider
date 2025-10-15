/**
 * Insider Trading Tracker Application
 * Comprehensive insider trading data display
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  allTrades: [],
  currentSort: {
    column: 'filingDate',
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

async function fetchInsiderTrades(retryCount = 0) {
  try {
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

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  return new Intl.NumberFormat('en-US').format(num);
}

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

function formatChangeValue(change) {
  if (change === null || change === undefined || isNaN(change)) {
    return '0';
  }
  
  // Format as absolute number with sign
  const sign = change >= 0 ? '+' : '';
  return sign + formatNumber(Math.round(change));
}

function calculateTransactionValue(shares, price) {
  if (!shares || !price) return 0;
  return Math.abs(shares) * price;
}

function calculateOwnedAfter(shares, change) {
  // If change represents the ownership after transaction
  // Some APIs return this directly, others require calculation
  if (change === null || change === undefined) return null;
  
  // Return the absolute value as shares owned
  return Math.abs(change);
}

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

function createTableRow(trade) {
  const row = document.createElement('tr');
  const isBuy = trade.transactionCode === 'P';
  
  row.className = isBuy ? 'buy-row' : 'sell-row';
  
  const transactionValue = calculateTransactionValue(trade.share, trade.transactionPrice);
  const ownedAfter = calculateOwnedAfter(trade.share, trade.change);
  const changeValue = trade.change;
  const changeClass = changeValue >= 0 ? 'positive' : 'negative';
  
  // Create table cells
  const cells = [
    { content: formatDate(trade.filingDate), class: '' },
    { content: formatDate(trade.transactionDate), class: '' },
    { content: trade.symbol, class: 'ticker' },
    { content: trade.personName, class: 'person-name' },
    { content: `<span class="trade-type ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'BUY' : 'SELL'}</span>`, class: '', raw: true },
    { content: formatCurrency(trade.transactionPrice), class: 'price' },
    { content: formatNumber(Math.abs(trade.share)), class: 'shares' },
    { content: formatCurrency(transactionValue), class: 'value' },
    { content: ownedAfter !== null ? formatNumber(ownedAfter) : 'N/A', class: 'owned' },
    { content: formatChangeValue(changeValue), class: `change-value ${changeClass}` }
  ];
  
  cells.forEach(cell => {
    const td = document.createElement('td');
    if (cell.class) {
      td.className = cell.class;
    }
    if (cell.raw) {
      td.innerHTML = cell.content;
    } else {
      td.textContent = cell.content;
    }
    row.appendChild(td);
  });
  
  return row;
}

function renderTable(trades) {
  const tbody = elements.tableBody;
  const table = elements.table;
  
  tbody.innerHTML = '';
  
  if (!trades || trades.length === 0) {
    table.classList.remove('visible');
    showEmptyState();
    return;
  }
  
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

function sortTrades(column) {
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
      case 'filingDate':
        aVal = new Date(a.filingDate);
        bVal = new Date(b.filingDate);
        break;
      case 'tradeDate':
        aVal = new Date(a.transactionDate);
        bVal = new Date(b.transactionDate);
        break;
      case 'ticker':
        aVal = a.symbol.toLowerCase();
        bVal = b.symbol.toLowerCase();
        return direction * aVal.localeCompare(bVal);
      case 'name':
        aVal = a.personName.toLowerCase();
        bVal = b.personName.toLowerCase();
        return direction * aVal.localeCompare(bVal);
      case 'type':
        aVal = a.transactionCode;
        bVal = b.transactionCode;
        return direction * aVal.localeCompare(bVal);
      case 'price':
        aVal = a.transactionPrice || 0;
        bVal = b.transactionPrice || 0;
        break;
      case 'qty':
        aVal = Math.abs(a.share) || 0;
        bVal = Math.abs(b.share) || 0;
        break;
      case 'value':
        aVal = calculateTransactionValue(a.share, a.transactionPrice);
        bVal = calculateTransactionValue(b.share, b.transactionPrice);
        break;
      case 'owned':
        aVal = calculateOwnedAfter(a.share, a.change) || 0;
        bVal = calculateOwnedAfter(b.share, b.change) || 0;
        break;
      case 'change':
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

const applyDateFilters = debounce(() => {
  state.filters.dateFrom = elements.filterDateFrom.value;
  state.filters.dateTo = elements.filterDateTo.value;
  
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

function showLoading() {
  elements.loading.style.display = 'flex';
  elements.table.classList.remove('visible');
  elements.refreshBtn.classList.add('loading');
  elements.refreshBtn.disabled = true;
}

function hideLoading() {
  elements.loading.style.display = 'none';
  elements.refreshBtn.classList.remove('loading');
  elements.refreshBtn.disabled = false;
}

function showError(message) {
  elements.errorMessage.classList.add('visible');
  const errorContent = elements.errorMessage.querySelector('.error-content p');
  if (errorContent) {
    errorContent.textContent = message;
  }
  elements.table.classList.remove('visible');
}

function hideError() {
  elements.errorMessage.classList.remove('visible');
}

function showEmptyState() {
  elements.emptyState.classList.add('visible');
}

function hideEmptyState() {
  elements.emptyState.classList.remove('visible');
}

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

function handleRefresh() {
  loadData();
}

function handleSort(event) {
  const header = event.target.closest('th[data-sort]');
  if (!header) return;
  
  const column = header.getAttribute('data-sort');
  sortTrades(column);
}

function handleKeyboard(event) {
  if (event.key === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const activeElement = document.activeElement;
    if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
      event.preventDefault();
      handleRefresh();
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

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

function setDefaultDateRange() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  elements.filterDateTo.value = today.toISOString().split('T')[0];
  elements.filterDateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
  
  state.filters.dateFrom = elements.filterDateFrom.value;
  state.filters.dateTo = elements.filterDateTo.value;
}

function initializeEventListeners() {
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', handleRefresh);
  }
  
  if (elements.filterDateFrom) {
    elements.filterDateFrom.addEventListener('change', applyDateFilters);
  }
  if (elements.filterDateTo) {
    elements.filterDateTo.addEventListener('change', applyDateFilters);
  }
  
  elements.tableHeaders.forEach(header => {
    header.addEventListener('click', handleSort);
  });
  
  document.addEventListener('keydown', handleKeyboard);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function init() {
  initializeElements();
  setDefaultDateRange();
  initializeEventListeners();
  
  await loadData();
}

// ============================================================================
// START APPLICATION
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
