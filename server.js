/**
 * Insider Trading Tracker - Express Server
 * Serves static files and fetches ALL insider trading transactions
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const ENABLE_CACHING = process.env.ENABLE_CACHING !== 'false';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '300', 10) * 1000; // 5 minutes default

// List of major S&P 500 companies to fetch insider trading data from
const MAJOR_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'V', 'UNH',
  'XOM', 'JNJ', 'WMT', 'JPM', 'LLY', 'PG', 'MA', 'HD', 'CVX', 'ABBV',
  'MRK', 'AVGO', 'KO', 'COST', 'PEP', 'ADBE', 'TMO', 'MCD', 'CSCO', 'ACN',
  'NKE', 'ABT', 'CRM', 'DHR', 'NFLX', 'VZ', 'WFC', 'TXN', 'ORCL', 'INTC',
  'BMY', 'PM', 'UPS', 'NEE', 'RTX', 'LOW', 'MS', 'HON', 'QCOM', 'BA'
];

// ============================================================================
// VALIDATION
// ============================================================================

if (!FINNHUB_API_KEY) {
  console.error('❌ Error: FINNHUB_API_KEY is required in .env file');
  console.error('Please create a .env file with your Finnhub API key:');
  console.error('FINNHUB_API_KEY=your_api_key_here');
  process.exit(1);
}

// ============================================================================
// INITIALIZE EXPRESS
// ============================================================================

const app = express();

// ============================================================================
// CACHE SETUP (In-Memory)
// ============================================================================

const cache = new Map();

function getCache(key) {
  if (!ENABLE_CACHING) return null;
  
  const cached = cache.get(key);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

function setCache(key, data) {
  if (!ENABLE_CACHING) return;
  
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, CACHE_TTL);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || false
    : '*',
  credentials: false,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

const morganFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    statusCode: 429
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
      statusCode: 429
    });
  }
});

app.use('/api', apiLimiter);

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateDate(date) {
  if (!date) {
    return { valid: true, error: null };
  }
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { 
      valid: false, 
      error: 'Invalid date format. Use YYYY-MM-DD format.' 
    };
  }
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return { valid: false, error: 'Invalid date.' };
  }
  
  return { valid: true, error: null };
}

function validateDateRange(from, to) {
  if (!from || !to) {
    return { valid: true, error: null };
  }
  
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

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

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

function handleFinnhubError(error) {
  if (error.response) {
    const status = error.response.status;
    const message = error.response.data?.error || error.message;
    
    switch (status) {
      case 401:
        return {
          success: false,
          error: 'Invalid API key configuration',
          statusCode: 500
        };
      case 429:
        return {
          success: false,
          error: 'API rate limit exceeded. Please try again later.',
          details: 'Finnhub API rate limit reached',
          statusCode: 429
        };
      case 404:
        return {
          success: false,
          error: 'Resource not found',
          statusCode: 404
        };
      default:
        return {
          success: false,
          error: 'Failed to fetch data from Finnhub API',
          details: `API returned ${status}: ${message}`,
          statusCode: 502
        };
    }
  } else if (error.request) {
    return {
      success: false,
      error: 'Service temporarily unavailable. Please try again.',
      details: 'No response from Finnhub API',
      statusCode: 503
    };
  } else {
    return {
      success: false,
      error: 'Internal server error',
      details: error.message,
      statusCode: 500
    };
  }
}

// ============================================================================
// FETCH ALL TRANSACTIONS
// ============================================================================

/**
 * Fetch insider transactions for multiple symbols
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<Array>} Combined transaction data
 */
async function fetchAllTransactions(from, to) {
  console.log(`📡 Fetching transactions from ${from} to ${to}...`);
  
  let successCount = 0;
  let failCount = 0;
  
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
      successCount++;
      const transformed = transformFinnhubData(response.data);
      if (NODE_ENV === 'development' && transformed.length > 0) {
        console.log(`✅ ${symbol}: ${transformed.length} transactions`);
      }
      return transformed;
    })
    .catch(error => {
      failCount++;
      // Log but don't fail on individual symbol errors
      if (NODE_ENV === 'development') {
        console.log(`⚠️  Failed to fetch ${symbol}:`, error.message);
      }
      return [];
    })
  );
  
  // Wait for all requests to complete
  const results = await Promise.all(promises);
  
  console.log(`📊 Results: ${successCount} succeeded, ${failCount} failed`);
  
  // Flatten and combine all results
  const allTransactions = results.flat();
  
  console.log(`📈 Total transactions: ${allTransactions.length}`);
  
  // Sort by filing date (most recent first)
  allTransactions.sort((a, b) => {
    const dateA = new Date(a.filingDate);
    const dateB = new Date(b.filingDate);
    return dateB - dateA;
  });
  
  return allTransactions;
}

// ============================================================================
// ROUTES
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    caching: ENABLE_CACHING,
    symbolsTracked: MAJOR_SYMBOLS.length,
    apiKeyConfigured: !!FINNHUB_API_KEY,
    apiKeyLength: FINNHUB_API_KEY ? FINNHUB_API_KEY.length : 0
  });
});

app.get('/test-api', async (req, res) => {
  try {
    console.log('🧪 Testing Finnhub API connection...');
    
    const response = await axios.get(`${FINNHUB_BASE_URL}/stock/insider-transactions`, {
      params: {
        symbol: 'AAPL',
        from: '2024-12-01',
        to: '2025-01-14',
        token: FINNHUB_API_KEY
      },
      timeout: 10000
    });
    
    console.log('✅ Finnhub API test successful');
    
    res.json({
      success: true,
      message: 'Finnhub API connection successful',
      sampleData: response.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Finnhub API test failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Finnhub API test failed',
      details: error.message,
      response: error.response?.data,
      statusCode: error.response?.status
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * API endpoint to fetch ALL insider trading data
 * GET /api/insider-trades?from=2025-01-01&to=2025-10-14
 */
app.get('/api/insider-trades', async (req, res, next) => {
  try {
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
    
    // Validate date range
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
    
    // Check cache
    const cacheKey = `all_${fromDate}_${toDate}`;
    const cachedData = getCache(cacheKey);
    
    if (cachedData) {
      if (NODE_ENV === 'development') {
        console.log(`✅ Cache hit: ${cacheKey}`);
      }
      
      return res.json({
        ...cachedData,
        cached: true
      });
    }
    
    if (NODE_ENV === 'development') {
      console.log(`❌ Cache miss: ${cacheKey}`);
      console.log(`📡 Fetching insider transactions for ${MAJOR_SYMBOLS.length} symbols...`);
      console.log(`📅 Date range: ${fromDate} to ${toDate}`);
      console.log(`🔑 API Key present: ${!!FINNHUB_API_KEY} (length: ${FINNHUB_API_KEY?.length})`);
    }
    
    // Fetch from Finnhub API for all symbols
    const allTransactions = await fetchAllTransactions(fromDate, toDate);
    
    // Prepare response
    const responseData = {
      success: true,
      data: allTransactions,
      timestamp: new Date().toISOString(),
      count: allTransactions.length,
      symbolsQueried: MAJOR_SYMBOLS.length,
      cached: false
    };
    
    // Cache the response
    setCache(cacheKey, responseData);
    
    if (NODE_ENV === 'development') {
      console.log(`✅ Fetched ${allTransactions.length} total transactions`);
    }
    
    res.json(responseData);
    
  } catch (error) {
    const errorResponse = handleFinnhubError(error);
    
    if (NODE_ENV === 'development') {
      console.error('❌ Error fetching insider trades:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
    
    res.status(errorResponse.statusCode).json(errorResponse);
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
    statusCode: 404
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    statusCode: err.statusCode || 500,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

let server;

function startServer() {
  server = app.listen(PORT, () => {
    console.log('');
    console.log('🚀 Insider Trading Tracker Server');
    console.log('================================');
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`🔒 API Key: ${FINNHUB_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`💾 Caching: ${ENABLE_CACHING ? '✓ Enabled' : '✗ Disabled'}`);
    console.log(`⏱️  Cache TTL: ${CACHE_TTL / 1000}s`);
    console.log(`📊 Tracking: ${MAJOR_SYMBOLS.length} major symbols`);
    console.log('');
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('');
  });
}

startServer();

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      console.log('✅ Server closed successfully');
      cache.clear();
      console.log('✅ Cache cleared');
      console.log('👋 Goodbye!');
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;