# 📊 Insider Trading Tracker

A modern, responsive web application for tracking insider trading data from public companies. Built with vanilla JavaScript, Express.js, and powered by the Finnhub API.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-green.svg)

## ✨ Features

- 🔍 **Real-time Data**: Fetch insider trading transactions from Finnhub API
- 🎯 **Advanced Filtering**: Filter by ticker symbol, date range, and transaction type
- 📊 **Sortable Table**: Click any column header to sort data
- 📱 **Fully Responsive**: Beautiful UI on desktop, tablet, and mobile
- 🎨 **Modern Dark Theme**: Easy on the eyes with professional design
- ⚡ **Fast Performance**: Caching, compression, and optimized rendering
- 🔒 **Secure**: API key protection, rate limiting, and security headers
- ♿ **Accessible**: WCAG compliant with keyboard navigation

## 🚀 Quick Start

### Prerequisites

- Node.js >= 14.0.0
- npm >= 6.0.0
- Finnhub API key ([Get one free here](https://finnhub.io/register))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd insider-trading-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Finnhub API key:
   ```env
   FINNHUB_API_KEY=your_actual_api_key_here
   ```

4. **Start the server**
   
   Development mode (with auto-reload):
   ```bash
   npm run dev
   ```
   
   Production mode:
   ```bash
   npm start
   ```

5. **Open your browser**
   ```
   http://localhost:3000
   ```

## 📁 Project Structure

```
insider-trading-tracker/
├── index.html          # Main HTML file
├── app.js             # Frontend JavaScript
├── styles.css         # Stylesheet (optional external)
├── server.js          # Express backend server
├── package.json       # Dependencies and scripts
├── .env.example       # Environment variables template
├── .env              # Your actual config (don't commit!)
└── README.md         # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FINNHUB_API_KEY` | ✅ Yes | - | Your Finnhub API key |
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment mode |
| `ENABLE_CACHING` | No | true | Enable response caching |
| `CACHE_TTL` | No | 300 | Cache time-to-live (seconds) |
| `RATE_LIMIT_WINDOW_MS` | No | 900000 | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | No | 100 | Max requests per window |

## 🎯 API Endpoints

### GET /api/insider-trades

Fetch insider trading data with optional filters.

**Query Parameters:**
- `symbol` (optional): Stock ticker (e.g., AAPL, TSLA)
- `from` (optional): Start date (YYYY-MM-DD)
- `to` (optional): End date (YYYY-MM-DD)

**Example Request:**
```bash
curl "http://localhost:3000/api/insider-trades?symbol=AAPL&from=2025-01-01&to=2025-10-14"
```

**Success Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "AAPL",
      "personName": "Tim Cook",
      "share": 10000,
      "change": 5.2,
      "filingDate": "2025-10-14",
      "transactionDate": "2025-10-12",
      "transactionPrice": 175.50,
      "transactionCode": "P"
    }
  ],
  "timestamp": "2025-10-14T10:30:00Z",
  "count": 1,
  "cached": false
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "statusCode": 400
}
```

### GET /health

Health check endpoint for monitoring.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-10-14T10:30:00Z",
  "environment": "development",
  "caching": true
}
```

## 🎨 Features in Detail

### Filtering
- **Symbol Search**: Type any stock ticker to filter results
- **Date Range**: Select start and end dates
- **Transaction Type**: Filter by Buy or Sell transactions
- **Real-time Updates**: Results update as you type (debounced)

### Sorting
- Click any column header to sort
- Click again to reverse sort direction
- Visual indicators show current sort state
- Supports: Date, Ticker, Name, Type, Price, Shares, Value, Delta

### Mobile Experience
- **Responsive Design**: Table converts to cards on mobile
- **Touch-Friendly**: Large tap targets and smooth scrolling
- **Optimized Layout**: Content reflows for small screens

## 🔒 Security

- ✅ Helmet.js security headers
- ✅ CORS protection
- ✅ Rate limiting (100 requests/15 minutes)
- ✅ API key never exposed to frontend
- ✅ Input validation on all parameters
- ✅ XSS protection via CSP

## ⚡ Performance

- ✅ Response caching (5-minute TTL)
- ✅ Gzip compression
- ✅ Debounced filter inputs
- ✅ Optimized DOM updates
- ✅ Document fragments for rendering

## 🐛 Troubleshooting

### Server won't start
```
Error: FINNHUB_API_KEY is required
```
**Solution**: Make sure you created a `.env` file with your API key.

### API returns 401 error
**Solution**: Check that your Finnhub API key is valid and active.

### API returns 429 error
**Solution**: You've hit the rate limit. Wait a few minutes or upgrade your Finnhub plan.

### No data showing
**Solution**: Try removing filters or selecting a different date range. Some stocks may not have recent insider trading activity.

## 📝 Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm test` - Run tests (not implemented yet)

## 🔄 Development Workflow

1. Make changes to frontend files (HTML, CSS, JS)
2. Server automatically serves the latest version
3. For backend changes, restart server (or use `npm run dev`)
4. Test in browser at `http://localhost:3000`

## 🚢 Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Configure `ALLOWED_ORIGINS` for CORS
3. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name insider-tracker
   ```

### Recommended Services
- **Heroku**: Easy deployment with free tier
- **Railway**: Modern platform with great DX
- **DigitalOcean**: Full control with App Platform
- **Vercel**: Serverless option (requires adapter)

## 📊 API Rate Limits

### Finnhub Free Tier
- 60 API calls/minute
- 30 calls/second

### Application Limits
- 100 requests per 15 minutes per IP
- Caching reduces API calls significantly

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **Finnhub**: For providing the insider trading data API
- **Express.js**: Fast, unopinionated web framework
- **Helmet.js**: Security middleware
- **Inter Font**: Beautiful system font by Rasmus Andersson

## 📧 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check the [Finnhub API documentation](https://finnhub.io/docs/api)

---

Made with ❤️ for investors and developers