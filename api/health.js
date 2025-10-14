/**
 * Vercel Serverless Function - Health Check
 */

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const apiKeyConfigured = !!process.env.FINNHUB_API_KEY;
  
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    apiKeyConfigured: apiKeyConfigured,
    apiKeyLength: apiKeyConfigured ? process.env.FINNHUB_API_KEY.length : 0
  });
};
```

---

## 📋 **Step-by-Step on GitHub:**

1. Go to your GitHub repo
2. Click **"Add file"** → **"Create new file"**
3. Type filename: `api/insider-trades.js` (include the `api/` part!)
4. Paste the first code block above
5. Scroll down, click **"Commit new file"**

6. Click **"Add file"** → **"Create new file"** again
7. Type filename: `api/health.js`
8. Paste the second code block above
9. Click **"Commit new file"**

✅ **Done!** Vercel will automatically redeploy in 1-2 minutes.

---

## 🧪 **After It Deploys, Test:**
```
https://your-app.vercel.app/api/health
