/**
 * Vercel Serverless Function - Insider Trades API
 */

const axios = require('axios');

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// List of major S&P 500 companies
const MAJOR_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'V', 'UNH',
  'XOM', 'JNJ', 'WMT', 'JPM', 'LLY', 'PG', 'MA', 'HD', 'CVX', 'ABBV',
  'MRK', 'AVGO', 'KO', 'COST', 'PEP', 'ADBE', 'TMO', 'MCD', 'CSCO', 'ACN',
  'NKE', 'ABT', 'CRM', 'DHR', 'NFLX', 'VZ', 'WFC', 'TXN', 'ORCL', 'INTC',
  'BMY', 'PM', 'UPS', 'NEE', 'RTX', 'LOW', 'MS', 'HON', 'QCOM', 'BA'
];

// Validation functions
function validateDate(date) {
  if (!date) return { valid: true, error: null };
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { valid: false, error: 'Invalid date format. Use YYYY-MM-DD format.' };
  }
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return { valid: false, error: 'Invalid date.' };
  }
  
  return { valid: true, error: null };
}

function validateDateRange(from, to) {
  if (!from || !to) return { valid: true, error: null };
  
  const fromDate = new Date(from);
  const toDate = new Date(to);
  
  if (toDate <= fromDate) {
    return { 
      valid: false, 
      error: "Invalid date range. 'to' date must be after 'from' date." 
    };
  }
  
  return { valid: true, error: null };
}

// Data transformation
function transformFinnhubData(finnhubData) {
  if (!finnhubData || !finnhubData.data || !Array.isArray(finnhubData.data)) {
    return [];
  }
  
  const transformed = finnhubData.data
    .filter(transaction => {
      return (
        transaction.symbol &&
        transaction.share &&
        transaction.share !== 0 &&
        (transaction.filingDate || transaction.transactionDate)
      );
    })
    .map(transaction => ({
      symbol: transaction.symbol,
      personName: transaction.name || 'Unknown',
      share: Math.abs(transaction.share) || 0,
      change: transaction.change || 0,
      filingDate: transaction.filingDate || transaction.transactionDate,
      transactionDate: transaction.transactionDate,
      transactionPrice: transaction.transactionPrice || 0,
      transactionCode: transaction.transactionCode || 'N/A'
    }));
  
  const uniqueTransactions = transformed.filter((transaction, index, self) => {
    return index === self.findIndex(t => (
      t.symbol === transaction.symbol &&
      t.filingDate === transaction.filingDate &&
      t.personName === transaction.personName &&
      t.share === transaction.share
    ));
  });
  
  uniqueTransactions.sort((a, b) => {
    const dateA = new Date(a.filingDate);
    const dateB = new Date(b.filingDate);
    return dateB - dateA;
  });
  
  return uniqueTransactions;
}

// Fetch all transactions
async function fetchAllTransactions(from, to) {
  console.log(`Fetching transactions from ${from} to ${to}...`);
  
  const promises = MAJOR_SYMBOLS.map(symbol => 
    axios.get(`${FINNHUB_BASE_URL}/stock/insider-transactions`, {
      params: {
        symbol,
        from,
        to,
        token: FINNHUB_API_KEY
      },
      timeout: 10000
    })
    .then(response => {
      const transformed = transformFinnhubData(response.data);
      return transformed;
    })
    .catch(error => {
      console.log(`Failed to fetch ${symbol}:`, error.message);
      return [];
    })
  );
  
  const results = await Promise.all(promises);
  const allTransactions = results.flat();
  
  allTransactions.sort((a, b) => {
    const dateA = new Date(a.filingDate);
    const dateB = new Date(b.filingDate);
    return dateB - dateA;
  });
  
  console.log(`Total transactions: ${allTransactions.length}`);
  
  return allTransactions;
}

// Main handler
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Check API key
    if (!FINNHUB_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error. API key not found.',
        statusCode: 500
      });
    }

    const { from, to } = req.query;
    
    // Validate dates
    const fromValidation = validateDate(from);
    if (!fromValidation.valid) {
      return res.status(400).json({
        success: false,
        error: fromValidation.error,
        statusCode: 400
      });
    }
    
    const toValidation = validateDate(to);
    if (!toValidation.valid) {
      return res.status(400).json({
        success: false,
        error: toValidation.error,
        statusCode: 400
      });
    }
    
    const rangeValidation = validateDateRange(from, to);
    if (!rangeValidation.valid) {
      return res.status(400).json({
        success: false,
        error: rangeValidation.error,
        statusCode: 400
      });
    }
    
    // Set default date range if not provided (last 30 days)
    const toDate = to || new Date().toISOString().split('T')[0];
    const fromDate = from || (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date.toISOString().split('T')[0];
    })();
    
    console.log(`API Key present: ${!!FINNHUB_API_KEY}`);
    console.log(`Fetching for ${MAJOR_SYMBOLS.length} symbols...`);
    
    // Fetch from Finnhub API
    const allTransactions = await fetchAllTransactions(fromDate, toDate);
    
    // Return response
    res.status(200).json({
      success: true,
      data: allTransactions,
      timestamp: new Date().toISOString(),
      count: allTransactions.length,
      symbolsQueried: MAJOR_SYMBOLS.length,
      cached: false
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      statusCode: 500
    });
  }
};
