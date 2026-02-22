// Netlify serverless function — proxies Binance klines (crypto) or Yahoo Finance (stocks)
// Runs server-side: no CORS issues, no geo-blocking
// Usage:
//   Crypto: /.netlify/functions/klines?symbol=BTCUSDT&interval=1d&limit=365
//   Stock:  /.netlify/functions/klines?symbol=AAPL&interval=1d&limit=365&market=stock

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { symbol = 'BTCUSDT', interval = '1d', limit = '365', market = 'crypto' } = params;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300', // 5min cache
  };

  try {
    if (market === 'stock') {
      // Yahoo Finance for stocks
      const end = Math.floor(Date.now() / 1000);
      const start = end - (parseInt(limit) * 24 * 60 * 60);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${start}&period2=${end}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error('Yahoo Finance HTTP ' + r.status);
      const j = await r.json();
      const result = j?.chart?.result?.[0];
      if (!result) throw new Error('No data from Yahoo');
      const ts = result.timestamp;
      const q  = result.indicators.quote[0];
      const candles = ts.map((t,i) => [
        t * 1000,
        q.open[i]?.toFixed(4)  || '0',
        q.high[i]?.toFixed(4)  || '0',
        q.low[i]?.toFixed(4)   || '0',
        q.close[i]?.toFixed(4) || '0',
        q.volume[i] || 0,
      ]).filter(c => parseFloat(c[4]) > 0);
      return { statusCode:200, headers, body: JSON.stringify(candles) };
    }

    // Crypto — Binance klines
    const binanceSym = symbol.toUpperCase().replace(/USDTUSDT/,'USDT');
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=${Math.min(parseInt(limit),1000)}`;
    
    let r = await fetch(url);
    if (!r.ok) {
      // Fallback to .us endpoint
      r = await fetch(url.replace('api.binance.com', 'api.binance.us'));
    }
    if (!r.ok) throw new Error('Binance HTTP ' + r.status);
    const data = await r.json();
    return { statusCode:200, headers, body: JSON.stringify(data) };

  } catch (err) {
    return { statusCode:500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
