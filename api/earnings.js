/**
 * Vercel Serverless Function - Earnings Calendar API
 */

const axios = require('axios');

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

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

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
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
    
    // Set default date range
    const toDate = to || new Date().toISOString().split('T')[0];
    const fromDate = from || (() => {
      const date = new Date();
      date.setDate(date.getDate() + 7); // Next 7 days
      return date.toISOString().split('T')[0];
    })();
    
    console.log(`Fetching earnings calendar from ${fromDate} to ${toDate}...`);
    
    // Fetch from Finnhub API
    const response = await axios.get(`${FINNHUB_BASE_URL}/calendar/earnings`, {
      params: {
        from: fromDate,
        to: toDate,
        token: FINNHUB_API_KEY
      },
      timeout: 10000
    });
    
    // Transform data
    const earnings = response.data.earningsCalendar || [];
    
    const transformedData = earnings.map(item => ({
      date: item.date,
      symbol: item.symbol,
      name: item.name || item.symbol,
      epsEstimate: item.epsEstimate,
      epsActual: item.epsActual,
      revenueEstimate: item.revenueEstimate,
      revenueActual: item.revenueActual,
      quarter: item.quarter,
      year: item.year
    }));
    
    // Sort by date
    transformedData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.status(200).json({
      success: true,
      data: transformedData,
      timestamp: new Date().toISOString(),
      count: transformedData.length
    });
    
  } catch (error) {
    console.error('Earnings API Error:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings calendar',
      details: error.message,
      statusCode: 500
    });
  }
};
