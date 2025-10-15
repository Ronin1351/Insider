/**
 * Insider Trading Tracker Application
 * Multi-tab dashboard with insider trades and earnings calendar
 */

// ============================================================================
// STATE
// ============================================================================

const state = {
  allTrades: [],
  filteredTrades: [],
  currentTab: 'dashboard',
  dashboardFilters: {
    ticker: '',
    insider: '',
    amount: 'all',
    type: 'all', // Changed from array to single value
    dateFrom: '',
    dateTo: ''
  },
  currentSort: { column: 'filingDate', direction: 'desc' },
  isLoading: false
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_ENDPOINT: '/api/insider-trades',
  EARNINGS_ENDPOINT: '/api/earnings',
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatCurrency(amount) {
  if (!amount) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
}

function formatCurrencyShort(amount) {
  if (!amount) return '$0';
  const abs = Math.abs(amount);
  if (abs >= 1e9) return '$' + (amount / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (amount / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (amount / 1e3).toFixed(2) + 'K';
  return formatCurrency(amount);
}

function formatNumber(num) {
  if (!num && num !== 0) return '0';
  return new Intl.NumberFormat('en-US').format(num);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

function calculateTransactionValue(shares, price) {
  return Math.abs(shares || 0) * (price || 0);
}

function calculateOwnedAfter(shares, change, transactionCode) {
  // Finnhub's 'change' field is the change in ownership
  // For accurate calculation, we need to work backwards
  if (change === null || change === undefined) return null;
  
  // If change is provided as shares
  return Math.abs(change);
}

function calculateChangePercent(shares, ownedBefore) {
  // Calculate percentage change: (shares traded / owned before) * 100
  if (!ownedBefore || ownedBefore === 0) return null;
  return (shares / ownedBefore) * 100;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchInsiderTrades(retryCount = 0) {
  try {
    const params = new URLSearchParams();
    const from = state.dashboardFilters.dateFrom || getDefaultFromDate();
    const to = state.dashboardFilters.dateTo || getDefaultToDate();
    
    params.append('from', from);
    params.append('to', to);
    
    const response = await fetch(`${CONFIG.API_ENDPOINT}?${params}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'API request failed');
    
    return data;
  } catch (error) {
    if (retryCount < CONFIG.MAX_RETRIES) {
      await delay(CONFIG.RETRY_DELAY * (retryCount + 1));
      return fetchInsiderTrades(retryCount + 1);
    }
    throw error;
  }
}

async function fetchEarningsCalendar() {
  try {
    const params = new URLSearchParams();
    params.append('from', getDefaultFromDate());
    params.append('to', getDefaultToDate());
    
    const response = await fetch(`${CONFIG.EARNINGS_ENDPOINT}?${params}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'API request failed');
    
    return data;
  } catch (error) {
    console.error('Earnings fetch error:', error);
    throw error;
  }
}

function getDefaultFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - 2); // Last 48 hours
  return date.toISOString().split('T')[0];
}

function getDefaultToDate() {
  return new Date().toISOString().split('T')[0];
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadInsiderTrades() {
  if (state.isLoading) return;
  
  try {
    state.isLoading = true;
    showLoading();
    
    console.log('Loading insider trades...');
    const response = await fetchInsiderTrades();
    console.log('API Response:', response);
    
    state.allTrades = response.data || [];
    console.log('Loaded trades:', state.allTrades.length);
    
    applyDashboardFilters();
    renderDashboardCharts();
    renderTransactionsTable();
    updateStats();
    
    if (state.allTrades.length === 0) {
      console.warn('No trades returned from API');
    }
    
  } catch (error) {
    console.error('Error loading trades:', error);
    showError(error.message);
  } finally {
    state.isLoading = false;
    hideLoading();
  }
}

async function loadEarningsCalendar() {
  try {
    document.getElementById('earnings-loading').style.display = 'flex';
    
    const response = await fetchEarningsCalendar();
    renderEarningsTable(response.data || []);
    
  } catch (error) {
    console.error('Error loading earnings:', error);
  } finally {
    document.getElementById('earnings-loading').style.display = 'none';
  }
}

// ============================================================================
// FILTERING
// ============================================================================

function applyDashboardFilters() {
  let filtered = [...state.allTrades];
  
  // Ticker filter - ONLY apply if user typed something
  if (state.dashboardFilters.ticker && state.dashboardFilters.ticker.trim() !== '') {
    const search = state.dashboardFilters.ticker.toLowerCase().trim();
    filtered = filtered.filter(t => t.symbol && t.symbol.toLowerCase().includes(search));
  }
  
  // Insider filter - ONLY apply if user typed something
  if (state.dashboardFilters.insider && state.dashboardFilters.insider.trim() !== '') {
    const search = state.dashboardFilters.insider.toLowerCase().trim();
    filtered = filtered.filter(t => t.personName && t.personName.toLowerCase().includes(search));
  }
  
  // Amount filter - ONLY apply if NOT "all"
  if (state.dashboardFilters.amount && state.dashboardFilters.amount !== 'all') {
    filtered = filtered.filter(t => {
      const value = calculateTransactionValue(t.share, t.transactionPrice);
      switch (state.dashboardFilters.amount) {
        case '1-100k': return value >= 1 && value <= 100000;
        case '100k-1m': return value > 100000 && value <= 1000000;
        case '1m+': return value > 1000000;
        default: return true;
      }
    });
  }
  
  // Type filter - ONLY apply if NOT "all"
  if (state.dashboardFilters.type && state.dashboardFilters.type !== 'all') {
    filtered = filtered.filter(t => {
      const isBuy = t.transactionCode === 'P';
      if (state.dashboardFilters.type === 'buy') return isBuy;
      if (state.dashboardFilters.type === 'sell') return !isBuy;
      return true;
    });
  }
  
  state.filteredTrades = filtered;
  
  // Debug logging
  console.log('Filter applied:', {
    totalTrades: state.allTrades.length,
    filteredTrades: filtered.length,
    filters: state.dashboardFilters
  });
}

// ============================================================================
// DASHBOARD CHARTS
// ============================================================================

function renderDashboardCharts() {
  console.log('Rendering dashboard charts with', state.filteredTrades.length, 'filtered trades');
  
  const buys = state.filteredTrades
    .filter(t => t.transactionCode === 'P')
    .sort((a, b) => calculateTransactionValue(b.share, b.transactionPrice) - 
                    calculateTransactionValue(a.share, a.transactionPrice))
    .slice(0, 10);
  
  const sells = state.filteredTrades
    .filter(t => t.transactionCode === 'S')
    .sort((a, b) => calculateTransactionValue(b.share, b.transactionPrice) - 
                    calculateTransactionValue(a.share, a.transactionPrice))
    .slice(0, 10);
  
  console.log('Top buys:', buys.length, 'Top sells:', sells.length);
  
  renderChart('top-buys-chart', buys, 'buy');
  renderChart('top-sells-chart', sells, 'sell');
}

function renderChart(containerId, trades, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (trades.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No data available</p>';
    return;
  }
  
  const maxValue = Math.max(...trades.map(t => calculateTransactionValue(t.share, t.transactionPrice)));
  
  container.innerHTML = trades.map(trade => {
    const value = calculateTransactionValue(trade.share, trade.transactionPrice);
    const percentage = (value / maxValue) * 100;
    
    return `
      <div class="chart-bar">
        <div class="chart-bar-label">${trade.symbol}</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill ${type}" style="width: ${percentage}%">
            ${formatCurrencyShort(value)}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// TABLE RENDERING
// ============================================================================

function renderTransactionsTable() {
  const tbody = document.getElementById('data-table-body');
  const table = tbody.closest('table');
  
  tbody.innerHTML = '';
  
  if (state.allTrades.length === 0) {
    table.classList.remove('visible');
    document.querySelector('.empty-state').classList.add('visible');
    return;
  }
  
  document.querySelector('.empty-state').classList.remove('visible');
  
  const fragment = document.createDocumentFragment();
  state.allTrades.forEach(trade => {
    fragment.appendChild(createTableRow(trade));
  });
  
  tbody.appendChild(fragment);
  table.classList.add('visible');
}

function createTableRow(trade) {
  const row = document.createElement('tr');
  const isBuy = trade.transactionCode === 'P';
  row.className = isBuy ? 'buy-row' : 'sell-row';
  
  const value = calculateTransactionValue(trade.share, trade.transactionPrice);
  const ownedAfter = calculateOwnedAfter(trade.share, trade.change, trade.transactionCode);
  
  // Calculate change percentage based on Finnhub's change field
  let changePct = trade.change; // Finnhub provides this as percentage
  let changePctDisplay = 'N/A';
  let changePctClass = '';
  
  if (changePct !== null && changePct !== undefined && !isNaN(changePct)) {
    const sign = changePct >= 0 ? '+' : '';
    changePctDisplay = `${sign}${changePct.toFixed(2)}%`;
    changePctClass = changePct >= 0 ? 'positive' : 'negative';
  }
  
  row.innerHTML = `
    <td>${formatDate(trade.filingDate)}</td>
    <td>${formatDate(trade.transactionDate)}</td>
    <td class="ticker">${trade.symbol}</td>
    <td>${trade.personName}</td>
    <td><span class="trade-type ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'BUY' : 'SELL'}</span></td>
    <td class="price">${formatCurrency(trade.transactionPrice)}</td>
    <td class="shares">${formatNumber(Math.abs(trade.share))}</td>
    <td class="value">${formatCurrency(value)}</td>
    <td class="owned">${ownedAfter !== null ? formatNumber(ownedAfter) : 'N/A'}</td>
    <td class="change-pct ${changePctClass}">${changePctDisplay}</td>
  `;
  
  return row;
}

function renderEarningsTable(earnings) {
  const tbody = document.getElementById('earnings-table-body');
  const table = document.getElementById('earnings-table');
  
  tbody.innerHTML = '';
  
  if (!earnings || earnings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No earnings data available</td></tr>';
    table.classList.add('visible');
    return;
  }
  
  earnings.forEach(earning => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDate(earning.date)}</td>
      <td class="ticker">${earning.symbol}</td>
      <td>${earning.name || earning.symbol}</td>
      <td>${earning.epsEstimate || 'N/A'}</td>
      <td>${earning.epsActual || 'N/A'}</td>
      <td>${earning.revenueEstimate ? formatCurrencyShort(earning.revenueEstimate) : 'N/A'}</td>
      <td>${earning.revenueActual ? formatCurrencyShort(earning.revenueActual) : 'N/A'}</td>
    `;
    tbody.appendChild(row);
  });
  
  table.classList.add('visible');
}

// ============================================================================
// STATS
// ============================================================================

function updateStats() {
  const statsBar = document.getElementById('stats-bar');
  if (state.allTrades.length === 0) {
    statsBar.style.display = 'none';
    return;
  }
  
  let buyVolume = 0, sellVolume = 0;
  
  state.allTrades.forEach(trade => {
    const value = calculateTransactionValue(trade.share, trade.transactionPrice);
    if (trade.transactionCode === 'P') buyVolume += value;
    else if (trade.transactionCode === 'S') sellVolume += value;
  });
  
  document.getElementById('stat-total').textContent = formatNumber(state.allTrades.length);
  document.getElementById('stat-buy-volume').textContent = formatCurrencyShort(buyVolume);
  document.getElementById('stat-sell-volume').textContent = formatCurrencyShort(sellVolume);
  
  statsBar.style.display = 'flex';
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showLoading() {
  document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

function showError(message) {
  console.error(message);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleTabChange(tabName) {
  state.currentTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
  
  // Load data for the tab
  if (tabName === 'earnings' && document.getElementById('earnings-table-body').children.length === 0) {
    loadEarningsCalendar();
  }
}

function handleDashboardFilterChange() {
  applyDashboardFilters();
  renderDashboardCharts();
}

function handleAmountClick(e) {
  if (!e.target.classList.contains('amount-btn')) return;
  
  // Single select - remove active from all, add to clicked
  document.querySelectorAll('.amount-btn').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
  
  state.dashboardFilters.amount = e.target.dataset.amount;
  handleDashboardFilterChange();
}

function handleTypeClick(e) {
  if (!e.target.classList.contains('type-btn')) return;
  
  // Single select - remove active from all, add to clicked
  document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
  
  state.dashboardFilters.type = e.target.dataset.type;
  handleDashboardFilterChange();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => handleTabChange(btn.dataset.tab));
  });
  
  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (state.currentTab === 'earnings') loadEarningsCalendar();
    else loadInsiderTrades();
  });
  
  // Dashboard filters
  const tickerInput = document.getElementById('dash-ticker');
  const insiderInput = document.getElementById('dash-insider');
  
  if (tickerInput) {
    tickerInput.addEventListener('input', (e) => {
      state.dashboardFilters.ticker = e.target.value.trim();
      handleDashboardFilterChange();
    });
  }
  
  if (insiderInput) {
    insiderInput.addEventListener('input', (e) => {
      state.dashboardFilters.insider = e.target.value.trim();
      handleDashboardFilterChange();
    });
  }
  
  const dashFrom = document.getElementById('dash-from');
  const dashTo = document.getElementById('dash-to');
  
  if (dashFrom) {
    dashFrom.addEventListener('change', (e) => {
      state.dashboardFilters.dateFrom = e.target.value;
      loadInsiderTrades();
    });
  }
  
  if (dashTo) {
    dashTo.addEventListener('change', (e) => {
      state.dashboardFilters.dateTo = e.target.value;
      loadInsiderTrades();
    });
  }
  
  const amountButtons = document.querySelector('.amount-buttons');
  const typeButtons = document.querySelector('.trade-type-buttons');
  
  if (amountButtons) {
    amountButtons.addEventListener('click', handleAmountClick);
  }
  
  if (typeButtons) {
    typeButtons.addEventListener('click', handleTypeClick);
  }
  
  // Table sorting
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => sortTable(th.dataset.sort));
  });
}

function sortTable(column) {
  // Sorting logic here if needed
  console.log('Sort by:', column);
}

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const dashFrom = document.getElementById('dash-from');
  const dashTo = document.getElementById('dash-to');
  
  if (dashFrom) dashFrom.value = twoDaysAgo;
  if (dashTo) dashTo.value = today;
  
  state.dashboardFilters.dateFrom = twoDaysAgo;
  state.dashboardFilters.dateTo = today;
}

async function init() {
  setDefaultDates();
  initializeEventListeners();
  await loadInsiderTrades();
}

// ============================================================================
// START
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
