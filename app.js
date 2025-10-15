/**
 * Insider Trading Dashboard - Frontend Application
 * Connects to existing Finnhub API backend
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : '/api';

// ============================================================================
// UTILITIES
// ============================================================================

function fmtMoney(val) {
    if (!val && val !== 0) return '—';
    return '$' + val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function fmtMoneyShort(val) {
    if (!val && val !== 0) return '—';
    const abs = Math.abs(val);
    if (abs >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (val / 1e3).toFixed(1) + 'K';
    return '$' + val.toFixed(0);
}

function fmtNum(val) {
    if (!val && val !== 0) return '—';
    return val.toLocaleString('en-US');
}

function fmtPct(val) {
    if (!val && val !== 0) return '—';
    return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
}

function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function showLoading() {
    document.getElementById('loading-overlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
}

function showError(message) {
    const banner = document.getElementById('error-banner');
    banner.textContent = message;
    banner.classList.add('active');
    setTimeout(() => banner.classList.remove('active'), 5000);
}

// ============================================================================
// STATE
// ============================================================================

let allTrades = [];
let allEarnings = [];
let filteredTrades = [];
let filteredEarnings = [];
let currentPage = 1;
let earningsCurrentPage = 1;
const rowsPerPage = 25;
let sortColumn = null;
let sortDirection = 'desc';
let earningsSortColumn = null;
let earningsSortDirection = 'desc';
let positiveChart = null;
let negativeChart = null;

const filters = {
    ticker: '',
    insider: '',
    amount: 'all',
    side: 'all'
};

const earningsFilters = {
    search: '',
    from: '',
    to: ''
};

// ============================================================================
// API CALLS
// ============================================================================

async function fetchInsiderTrades() {
    try {
        showLoading();
        
        // Get date range from filters or use defaults
        const params = new URLSearchParams();
        const from = getDefaultFromDate();
        const to = getDefaultToDate();
        
        params.append('from', from);
        params.append('to', to);
        
        console.log('Fetching insider trades...', `${API_BASE}/insider-trades?${params}`);
        
        const response = await fetch(`${API_BASE}/insider-trades?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API Response:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch data');
        }
        
        // Transform API data to match frontend expectations
        allTrades = (data.data || []).map(trade => ({
            ...trade,
            name: trade.personName || 'Unknown', // Map personName to name
            symbol: trade.symbol,
            filingDate: trade.filingDate,
            transactionDate: trade.transactionDate,
            share: trade.share,
            transactionPrice: trade.transactionPrice,
            transactionCode: trade.transactionCode,
            change: trade.change
        }));
        
        console.log('Loaded trades:', allTrades.length);
        
        applyFilters();
        hideLoading();
        
    } catch (error) {
        console.error('Error fetching insider trades:', error);
        showError('Failed to load insider trades. Please check your API key and try again.');
        hideLoading();
    }
}

async function fetchEarnings() {
    try {
        showLoading();
        
        const params = new URLSearchParams();
        if (earningsFilters.from) params.append('from', earningsFilters.from);
        if (earningsFilters.to) params.append('to', earningsFilters.to);
        
        // Default to next 7 days if no dates provided
        if (!earningsFilters.from && !earningsFilters.to) {
            const today = new Date();
            const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
            params.append('from', today.toISOString().split('T')[0]);
            params.append('to', weekFromNow.toISOString().split('T')[0]);
        }
        
        console.log('Fetching earnings...', `${API_BASE}/earnings?${params}`);
        
        const response = await fetch(`${API_BASE}/earnings?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Earnings Response:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch earnings');
        }
        
        allEarnings = data.data || [];
        applyEarningsFilters();
        hideLoading();
        
    } catch (error) {
        console.error('Error fetching earnings:', error);
        showError('Failed to load earnings calendar. Please try again.');
        hideLoading();
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
// DATA PROCESSING
// ============================================================================

function recomputeNet(trades) {
    const netByTicker = {};
    
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    
    trades.forEach(trade => {
        const filingDate = new Date(trade.filingDate);
        if (filingDate < fortyEightHoursAgo) return;
        
        if (!netByTicker[trade.symbol]) {
            netByTicker[trade.symbol] = 0;
        }
        
        const value = (trade.share || 0) * (trade.transactionPrice || 0);
        netByTicker[trade.symbol] += trade.transactionCode === 'P' ? value : -value;
    });

    const positive = [];
    const negative = [];

    Object.entries(netByTicker).forEach(([ticker, net]) => {
        if (net > 0) {
            positive.push({ ticker, value: net });
        } else if (net < 0) {
            negative.push({ ticker, value: Math.abs(net) });
        }
    });

    positive.sort((a, b) => b.value - a.value);
    negative.sort((a, b) => b.value - a.value);

    return {
        positive: positive.slice(0, 10),
        negative: negative.slice(0, 10)
    };
}

// ============================================================================
// FILTERING
// ============================================================================

function applyFilters() {
    filteredTrades = allTrades.filter(trade => {
        if (filters.ticker && !trade.symbol.toLowerCase().includes(filters.ticker.toLowerCase())) {
            return false;
        }
        if (filters.insider && !trade.name.toLowerCase().includes(filters.insider.toLowerCase())) {
            return false;
        }
        
        const value = (trade.share || 0) * (trade.transactionPrice || 0);
        if (filters.amount !== 'all') {
            if (filters.amount === '1-100k' && (value < 1 || value > 100000)) return false;
            if (filters.amount === '100k-1m' && (value < 100000 || value > 1000000)) return false;
            if (filters.amount === '1m+' && value < 1000000) return false;
        }
        
        if (filters.side !== 'all') {
            if (filters.side === 'buy' && trade.transactionCode !== 'P') return false;
            if (filters.side === 'sell' && trade.transactionCode !== 'S') return false;
        }
        
        return true;
    });

    currentPage = 1;
    updateCharts();
    updateTable();
    updateURL();
}

function applyEarningsFilters() {
    filteredEarnings = allEarnings.filter(earning => {
        if (earningsFilters.search && !earning.symbol.toLowerCase().includes(earningsFilters.search.toLowerCase())) {
            return false;
        }
        return true;
    });

    earningsCurrentPage = 1;
    updateEarningsTable();
}

// ============================================================================
// CHARTS
// ============================================================================

function updateCharts() {
    const netData = recomputeNet(filteredTrades);

    if (positiveChart) positiveChart.destroy();
    
    const posCtx = document.getElementById('positive-chart').getContext('2d');
    positiveChart = new Chart(posCtx, {
        type: 'bar',
        data: {
            labels: netData.positive.map(d => d.ticker),
            datasets: [{
                data: netData.positive.map(d => d.value),
                backgroundColor: '#6BE675',
                borderRadius: 6,
                barThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}  ${fmtMoneyShort(ctx.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: {
                        color: '#9FB0C7',
                        callback: (v) => fmtMoneyShort(v)
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#9FB0C7', font: { weight: 'bold' } }
                }
            }
        }
    });

    if (negativeChart) negativeChart.destroy();
    
    const negCtx = document.getElementById('negative-chart').getContext('2d');
    negativeChart = new Chart(negCtx, {
        type: 'bar',
        data: {
            labels: netData.negative.map(d => d.ticker),
            datasets: [{
                data: netData.negative.map(d => d.value),
                backgroundColor: '#FF6B6B',
                borderRadius: 6,
                barThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}  ${fmtMoneyShort(ctx.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: {
                        color: '#9FB0C7',
                        callback: (v) => fmtMoneyShort(v)
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#9FB0C7', font: { weight: 'bold' } }
                }
            }
        }
    });
}

// ============================================================================
// TABLE RENDERING
// ============================================================================

function updateTable() {
    const tbody = document.getElementById('trades-tbody');
    
    let sorted = [...filteredTrades];
    if (sortColumn) {
        sorted.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];
            
            if (sortColumn === 'filingDate' || sortColumn === 'transactionDate') {
                valA = new Date(valA);
                valB = new Date(valB);
            }
            
            if (sortColumn === 'value') {
                valA = (a.share || 0) * (a.transactionPrice || 0);
                valB = (b.share || 0) * (b.transactionPrice || 0);
            }
            
            if (sortDirection === 'asc') {
                return valA > valB ? 1 : -1;
            } else {
                return valA < valB ? 1 : -1;
            }
        });
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const page = sorted.slice(start, end);

    tbody.innerHTML = page.map(trade => {
        const value = (trade.share || 0) * (trade.transactionPrice || 0);
        const ownedAfter = Math.abs(trade.change || 0);
        const changePercent = trade.change || 0;
        
        return `
            <tr>
                <td>${trade.name || '—'}</td>
                <td><span class="ticker-pill">${trade.symbol}</span></td>
                <td>${trade.filingDate || '—'}</td>
                <td>${trade.transactionDate || '—'}</td>
                <td class="center"><span class="type-pill ${trade.transactionCode?.toLowerCase()}">${trade.transactionCode === 'P' ? 'Purchase' : 'Sale'}</span></td>
                <td class="right">${fmtNum(trade.share)}</td>
                <td class="right">${fmtMoney(trade.transactionPrice)}</td>
                <td class="right">${fmtMoneyShort(value)}</td>
                <td class="right">${fmtNum(ownedAfter)}</td>
                <td class="right">${fmtPct(changePercent)}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('pagination-info').textContent = 
        `Showing ${start + 1}-${Math.min(end, sorted.length)} of ${sorted.length} trades`;
    
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = end >= sorted.length;
}

function updateEarningsTable() {
    const tbody = document.getElementById('earnings-tbody');
    
    let sorted = [...filteredEarnings];
    if (earningsSortColumn) {
        sorted.sort((a, b) => {
            let valA = a[earningsSortColumn];
            let valB = b[earningsSortColumn];
            
            if (earningsSortColumn === 'date') {
                valA = new Date(a.date);
                valB = new Date(b.date);
            }
            
            if (valA === null) return 1;
            if (valB === null) return -1;
            
            if (earningsSortDirection === 'asc') {
                return valA > valB ? 1 : -1;
            } else {
                return valA < valB ? 1 : -1;
            }
        });
    }

    const start = (earningsCurrentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const page = sorted.slice(start, end);

    tbody.innerHTML = page.map(e => `
        <tr>
            <td><span class="ticker-pill">${e.symbol}</span></td>
            <td>${e.date || '—'}</td>
            <td class="right">${e.epsEstimate ? fmtMoney(e.epsEstimate) : '—'}</td>
            <td class="right">${e.epsActual ? fmtMoney(e.epsActual) : '—'}</td>
            <td class="right">${e.revenueEstimate ? fmtMoneyShort(e.revenueEstimate) : '—'}</td>
            <td class="right">${e.revenueActual ? fmtMoneyShort(e.revenueActual) : '—'}</td>
        </tr>
    `).join('');

    document.getElementById('earnings-pagination-info').textContent = 
        `Showing ${start + 1}-${Math.min(end, sorted.length)} of ${sorted.length} earnings`;
    
    document.getElementById('earnings-prev-page').disabled = earningsCurrentPage === 1;
    document.getElementById('earnings-next-page').disabled = end >= sorted.length;
}

function updateURL() {
    const params = new URLSearchParams();
    if (filters.ticker) params.set('ticker', filters.ticker);
    if (filters.insider) params.set('insider', filters.insider);
    if (filters.amount !== 'all') params.set('amount', filters.amount);
    if (filters.side !== 'all') params.set('side', filters.side);
    
    const url = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', url);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initializeEventListeners() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
            
            if (btn.dataset.tab === 'earnings' && allEarnings.length === 0) {
                fetchEarnings();
            }
        });
    });

    // Refresh buttons
    document.getElementById('refresh-insider').addEventListener('click', fetchInsiderTrades);
    document.getElementById('refresh-earnings').addEventListener('click', fetchEarnings);

    // Insider filters
    const debouncedApplyFilters = debounce(applyFilters, 300);

    document.getElementById('ticker-input').addEventListener('input', (e) => {
        filters.ticker = e.target.value;
        debouncedApplyFilters();
    });

    document.getElementById('insider-input').addEventListener('input', (e) => {
        filters.insider = e.target.value;
        debouncedApplyFilters();
    });

    document.querySelectorAll('[data-amount]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-amount]').forEach(b => b.setAttribute('aria-pressed', 'false'));
            btn.setAttribute('aria-pressed', 'true');
            filters.amount = btn.dataset.amount;
            applyFilters();
        });
    });

    document.querySelectorAll('[data-side]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-pressed', 'false'));
            btn.setAttribute('aria-pressed', 'true');
            filters.side = btn.dataset.side;
            applyFilters();
        });
    });

    // Sorting
    document.querySelectorAll('#insider-tab th button[data-sort]').forEach(btn => {
        btn.addEventListener('click', () => {
            const col = btn.dataset.sort;
            
            if (sortColumn === col) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = col;
                sortDirection = 'desc';
            }

            document.querySelectorAll('#insider-tab th button').forEach(b => b.className = '');
            btn.className = `sorted-${sortDirection}`;

            updateTable();
        });
    });

    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateTable();
        }
    });

    document.getElementById('next-page').addEventListener('click', () => {
        const maxPage = Math.ceil(filteredTrades.length / rowsPerPage);
        if (currentPage < maxPage) {
            currentPage++;
            updateTable();
        }
    });

    // Earnings filters
    const debouncedApplyEarningsFilters = debounce(applyEarningsFilters, 300);

    document.getElementById('earnings-search').addEventListener('input', (e) => {
        earningsFilters.search = e.target.value;
        debouncedApplyEarningsFilters();
    });

    document.getElementById('earnings-from').addEventListener('change', (e) => {
        earningsFilters.from = e.target.value;
        fetchEarnings();
    });

    document.getElementById('earnings-to').addEventListener('change', (e) => {
        earningsFilters.to = e.target.value;
        fetchEarnings();
    });

    // Earnings sorting
    document.querySelectorAll('#earnings-tab th button[data-sort]').forEach(btn => {
        btn.addEventListener('click', () => {
            const col = btn.dataset.sort;
            
            if (earningsSortColumn === col) {
                earningsSortDirection = earningsSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                earningsSortColumn = col;
                earningsSortDirection = 'desc';
            }

            document.querySelectorAll('#earnings-tab th button').forEach(b => b.className = '');
            btn.className = `sorted-${earningsSortDirection}`;

            updateEarningsTable();
        });
    });

    // Earnings pagination
    document.getElementById('earnings-prev-page').addEventListener('click', () => {
        if (earningsCurrentPage > 1) {
            earningsCurrentPage--;
            updateEarningsTable();
        }
    });

    document.getElementById('earnings-next-page').addEventListener('click', () => {
        const maxPage = Math.ceil(filteredEarnings.length / rowsPerPage);
        if (earningsCurrentPage < maxPage) {
            earningsCurrentPage++;
            updateEarningsTable();
        }
    });

    // CSV Download
    document.getElementById('download-csv').addEventListener('click', () => {
        const headers = ['Ticker', 'Date', 'EPS Estimate', 'EPS Actual', 'Revenue Estimate', 'Revenue Actual'];
        const rows = filteredEarnings.map(e => [
            e.symbol,
            e.date,
            e.epsEstimate || '',
            e.epsActual || '',
            e.revenueEstimate || '',
            e.revenueActual || ''
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'earnings_calendar.csv';
        a.click();
        URL.revokeObjectURL(url);
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    // Set default dates for earnings
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    document.getElementById('earnings-from').valueAsDate = today;
    document.getElementById('earnings-to').valueAsDate = weekFromNow;
    earningsFilters.from = today.toISOString().split('T')[0];
    earningsFilters.to = weekFromNow.toISOString().split('T')[0];

    initializeEventListeners();
    fetchInsiderTrades();
}

// Start app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
