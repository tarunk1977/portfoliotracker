require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json());

// ─── Auth ─────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || 'folio-dev-secret-change-in-prod';
const APP_PASSWORD_HASH = process.env.APP_PASSWORD_HASH; // bcrypt hash of your password

// Middleware — verify JWT on all /api routes except /api/login
function requireAuth(req, res, next) {
  if (!APP_PASSWORD_HASH) return next(); // auth disabled if no password set
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  if (!APP_PASSWORD_HASH) return res.status(500).json({ error: 'Auth not configured. Add APP_PASSWORD_HASH to environment.' });

  const valid = await bcrypt.compare(password, APP_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  const token = jwt.sign({ role: 'owner' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// Health check (public)
app.get('/health', (req, res) => res.json({ status: 'ok', auth: !!APP_PASSWORD_HASH }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// DB Init
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(20) NOT NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('BUY','SELL')),
      shares NUMERIC(18,6) NOT NULL,
      price NUMERIC(18,4) NOT NULL,
      currency VARCHAR(10) DEFAULT 'USD',
      date DATE NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

    CREATE TABLE IF NOT EXISTS ai_usage (
      id SERIAL PRIMARY KEY,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
  `);
  console.log('DB initialized');
}

// Price fetching
const priceCache = new Map();
const CACHE_TTL = 60 * 1000;

async function fetchPrice(ticker) {
  const cached = priceCache.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  try {
    const fetch = require('node-fetch');
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const data = {
      ticker,
      price: meta.regularMarketPrice,
      prevClose,
      name: meta.longName || meta.shortName || ticker,
      currency: meta.currency,
      change: meta.regularMarketPrice - prevClose,
      changePct: ((meta.regularMarketPrice - prevClose) / prevClose) * 100,
    };
    priceCache.set(ticker, { data, ts: Date.now() });
    return data;
  } catch (e) {
    console.error(`Price fetch failed for ${ticker}:`, e.message);
    return null;
  }
}

// Fetch sector/profile info from Yahoo Finance quote summary
const sectorCache = new Map();
async function fetchSector(ticker) {
  if (sectorCache.has(ticker)) return sectorCache.get(ticker);
  try {
    const fetch = require('node-fetch');
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile,summaryDetail`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await res.json();
    const profile = json.quoteSummary?.result?.[0]?.assetProfile;
    const data = {
      sector: profile?.sector || 'Other',
      industry: profile?.industry || 'Other',
    };
    sectorCache.set(ticker, data);
    return data;
  } catch (e) {
    return { sector: 'Other', industry: 'Other' };
  }
}

// Compute holdings by replaying all transactions
async function computeHoldings() {
  const { rows } = await pool.query(
    `SELECT * FROM transactions ORDER BY date ASC, created_at ASC`
  );
  const map = {};
  for (const tx of rows) {
    const t = tx.ticker;
    if (!map[t]) map[t] = { ticker: t, shares: 0, totalCost: 0, currency: tx.currency };
    if (tx.type === 'BUY') {
      map[t].totalCost += parseFloat(tx.shares) * parseFloat(tx.price);
      map[t].shares += parseFloat(tx.shares);
    } else {
      const sellShares = parseFloat(tx.shares);
      if (map[t].shares > 0) {
        const avgCost = map[t].totalCost / map[t].shares;
        map[t].totalCost -= avgCost * sellShares;
        map[t].shares -= sellShares;
      }
    }
  }
  return Object.values(map)
    .filter(h => h.shares > 0.000001)
    .map(h => ({
      ticker: h.ticker,
      shares: h.shares,
      avg_cost: h.shares > 0 ? h.totalCost / h.shares : 0,
      currency: h.currency,
    }));
}

// Routes
app.get('/api/portfolio', requireAuth, async (req, res) => {
  try {
    const holdings = await computeHoldings();
    const enriched = await Promise.all(holdings.map(async (h) => {
      const price = await fetchPrice(h.ticker);
      const currentPrice = price?.price ?? null;
      const marketValue = currentPrice ? currentPrice * h.shares : null;
      const costBasis = h.avg_cost * h.shares;
      const gainLoss = marketValue != null ? marketValue - costBasis : null;
      const gainLossPct = gainLoss != null && costBasis > 0 ? (gainLoss / costBasis) * 100 : null;
      return {
        ticker: h.ticker,
        shares: h.shares,
        avg_cost: h.avg_cost,
        company_name: price?.name || h.ticker,
        currency: price?.currency || h.currency,
        current_price: currentPrice,
        prev_close: price?.prevClose ?? null,
        day_change: price?.change ?? null,
        day_change_pct: price?.changePct ?? null,
        market_value: marketValue,
        cost_basis: costBasis,
        gain_loss: gainLoss,
        gain_loss_pct: gainLossPct,
      };
    }));
    const totalValue = enriched.reduce((s, h) => s + (h.market_value || 0), 0);
    const totalCost = enriched.reduce((s, h) => s + h.cost_basis, 0);
    const totalGainLoss = totalValue - totalCost;
    const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
    const dayChange = enriched.reduce((s, h) => s + (h.day_change && h.shares ? h.day_change * h.shares : 0), 0);
    res.json({
      holdings: enriched,
      summary: { total_value: totalValue, total_cost: totalCost, total_gain_loss: totalGainLoss, total_gain_loss_pct: totalGainLossPct, day_change: dayChange, count: enriched.length }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/prices/:ticker', requireAuth, async (req, res) => {
  const data = await fetchPrice(req.params.ticker.toUpperCase());
  if (!data) return res.status(404).json({ error: 'Ticker not found' });
  res.json(data);
});

// GET /api/history/:ticker?range=1mo
app.get('/api/history/:ticker', requireAuth, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const range = req.query.range || '1mo';

  // Map range to Yahoo Finance params
  const rangeMap = {
    '1W':  { range: '5d',  interval: '1d' },
    '1M':  { range: '1mo', interval: '1d' },
    '3M':  { range: '3mo', interval: '1d' },
    '6M':  { range: '6mo', interval: '1wk' },
    'YTD': { range: 'ytd', interval: '1d' },
    '1Y':  { range: '1y',  interval: '1wk' },
  };

  const params = rangeMap[range] || rangeMap['1M'];

  try {
    const fetch = require('node-fetch');
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${params.interval}&range=${params.range}`;
    const result = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await result.json();
    const chart = json.chart?.result?.[0];
    if (!chart) return res.status(404).json({ error: 'No history found' });

    const timestamps = chart.timestamp || [];
    const closes = chart.indicators?.quote?.[0]?.close || [];
    const meta = chart.meta;

    const points = timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        price: closes[i] ? parseFloat(closes[i].toFixed(4)) : null,
      }))
      .filter(p => p.price !== null);

    res.json({
      ticker,
      name: meta.longName || meta.shortName || ticker,
      currency: meta.currency,
      range,
      points,
      start_price: points[0]?.price || null,
      end_price: points[points.length - 1]?.price || null,
      change_pct: points.length > 1
        ? ((points[points.length - 1].price - points[0].price) / points[0].price) * 100
        : null,
    });
  } catch (e) {
    console.error(`History fetch failed for ${ticker}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/calendar - monthly performance heatmap
app.get('/api/calendar', requireAuth, async (req, res) => {
  try {
    const fetch = require('node-fetch');
    const holdings = await computeHoldings();
    if (!holdings.length) return res.json({ months: [] });

    // Fetch 2Y monthly data for all holdings
    const monthlyData = {};

    await Promise.all(holdings.map(async h => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${h.ticker}?interval=1mo&range=2y`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const json = await r.json();
        const chart = json.chart?.result?.[0];
        if (!chart) return;

        const timestamps = chart.timestamp || [];
        const closes = chart.indicators?.quote?.[0]?.close || [];

        for (let i = 1; i < timestamps.length; i++) {
          if (!closes[i] || !closes[i - 1]) continue;
          const date = new Date(timestamps[i] * 1000);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const changePct = ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;
          const dollarChange = (closes[i] - closes[i - 1]) * h.shares;

          if (!monthlyData[key]) monthlyData[key] = { key, dollar_change: 0, weighted_pct: 0, count: 0 };
          monthlyData[key].dollar_change += dollarChange;
          monthlyData[key].weighted_pct += changePct;
          monthlyData[key].count++;
        }
      } catch (e) { /* skip */ }
    }));

    // Compute avg pct across holdings per month
    const months = Object.values(monthlyData)
      .map(m => ({
        key: m.key,
        year: parseInt(m.key.split('-')[0]),
        month: parseInt(m.key.split('-')[1]),
        dollar_change: parseFloat(m.dollar_change.toFixed(2)),
        avg_pct: parseFloat((m.weighted_pct / m.count).toFixed(2)),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    res.json({ months });
  } catch (e) {
    console.error('Calendar error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sectors - sector breakdown by portfolio value
app.get('/api/sectors', requireAuth, async (req, res) => {
  try {
    const holdings = await computeHoldings();
    if (!holdings.length) return res.json({ sectors: [], industries: [] });

    const enriched = await Promise.all(holdings.map(async h => {
      const [price, sector] = await Promise.all([fetchPrice(h.ticker), fetchSector(h.ticker)]);
      const marketValue = price?.price ? price.price * h.shares : h.avg_cost * h.shares;
      return {
        ticker: h.ticker,
        name: price?.name || h.ticker,
        market_value: marketValue,
        sector: sector.sector,
        industry: sector.industry,
      };
    }));

    const totalValue = enriched.reduce((s, h) => s + h.market_value, 0);

    // Group by sector
    const sectorMap = {};
    for (const h of enriched) {
      if (!sectorMap[h.sector]) sectorMap[h.sector] = { sector: h.sector, value: 0, holdings: [] };
      sectorMap[h.sector].value += h.market_value;
      sectorMap[h.sector].holdings.push({ ticker: h.ticker, name: h.name, value: h.market_value, industry: h.industry });
    }

    const sectors = Object.values(sectorMap)
      .map(s => ({ ...s, pct: parseFloat(((s.value / totalValue) * 100).toFixed(1)) }))
      .sort((a, b) => b.value - a.value);

    res.json({ sectors, total_value: totalValue });
  } catch (e) {
    console.error('Sector error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bestworst - best and worst single days across all holdings
app.get('/api/bestworst', requireAuth, async (req, res) => {
  try {
    const fetch = require('node-fetch');
    const holdings = await computeHoldings();
    if (!holdings.length) return res.json({ best: [], worst: [] });

    // Fetch 1Y daily data for all holdings
    const allDays = [];
    await Promise.all(holdings.map(async h => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${h.ticker}?interval=1d&range=1y`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const json = await r.json();
        const chart = json.chart?.result?.[0];
        if (!chart) return;

        const timestamps = chart.timestamp || [];
        const closes = chart.indicators?.quote?.[0]?.close || [];
        const opens = chart.indicators?.quote?.[0]?.open || [];

        for (let i = 1; i < timestamps.length; i++) {
          if (!closes[i] || !closes[i - 1]) continue;
          const changePct = ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;
          const dollarChange = (closes[i] - closes[i - 1]) * h.shares;
          allDays.push({
            ticker: h.ticker,
            date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
            close: parseFloat(closes[i].toFixed(2)),
            change_pct: parseFloat(changePct.toFixed(2)),
            dollar_change: parseFloat(dollarChange.toFixed(2)),
          });
        }
      } catch (e) { /* skip */ }
    }));

    // Sort by % change
    const sorted = allDays.sort((a, b) => b.change_pct - a.change_pct);
    const best = sorted.slice(0, 10);
    const worst = sorted.slice(-10).reverse();

    // Also compute best/worst portfolio days (sum across all holdings per date)
    const portfolioDays = {};
    for (const d of allDays) {
      if (!portfolioDays[d.date]) portfolioDays[d.date] = { date: d.date, dollar_change: 0 };
      portfolioDays[d.date].dollar_change += d.dollar_change;
    }
    const portfolioSorted = Object.values(portfolioDays).sort((a, b) => b.dollar_change - a.dollar_change);

    res.json({
      best_days: best,
      worst_days: worst,
      best_portfolio_days: portfolioSorted.slice(0, 5),
      worst_portfolio_days: portfolioSorted.slice(-5).reverse(),
    });
  } catch (e) {
    console.error('Best/worst error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/beta - portfolio beta vs SPY
app.get('/api/beta', requireAuth, async (req, res) => {
  try {
    const fetch = require('node-fetch');
    const holdings = await computeHoldings();
    if (!holdings.length) return res.json({ portfolio_beta: null, holdings: [] });

    // Fetch 1Y weekly prices for SPY + all holdings in parallel
    async function fetchWeeklyReturns(ticker) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1wk&range=1y`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const json = await r.json();
      const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      // Convert to weekly returns
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i] && closes[i - 1]) {
          returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }
      }
      return returns;
    }

    // Calculate beta: cov(stock, market) / var(market)
    function calcBeta(stockReturns, marketReturns) {
      const n = Math.min(stockReturns.length, marketReturns.length);
      if (n < 10) return null;
      const sr = stockReturns.slice(0, n);
      const mr = marketReturns.slice(0, n);
      const meanS = sr.reduce((a, b) => a + b, 0) / n;
      const meanM = mr.reduce((a, b) => a + b, 0) / n;
      let cov = 0, varM = 0;
      for (let i = 0; i < n; i++) {
        cov += (sr[i] - meanS) * (mr[i] - meanM);
        varM += (mr[i] - meanM) ** 2;
      }
      return varM === 0 ? null : parseFloat((cov / varM).toFixed(3));
    }

    // Fetch SPY + all tickers in parallel
    const tickers = ['SPY', ...holdings.map(h => h.ticker)];
    const returnsMap = {};
    await Promise.all(tickers.map(async t => {
      try { returnsMap[t] = await fetchWeeklyReturns(t); }
      catch { returnsMap[t] = []; }
    }));

    const spyReturns = returnsMap['SPY'];

    // Get total portfolio value for weighting
    const enrichedHoldings = await Promise.all(holdings.map(async h => {
      const price = await fetchPrice(h.ticker);
      const marketValue = price?.price ? price.price * h.shares : h.avg_cost * h.shares;
      const beta = calcBeta(returnsMap[h.ticker] || [], spyReturns);
      return { ticker: h.ticker, market_value: marketValue, beta };
    }));

    const totalValue = enrichedHoldings.reduce((s, h) => s + h.market_value, 0);

    // Weighted portfolio beta
    let portfolioBeta = 0;
    const holdingBetas = enrichedHoldings.map(h => {
      const weight = totalValue > 0 ? h.market_value / totalValue : 0;
      if (h.beta !== null) portfolioBeta += weight * h.beta;
      return { ticker: h.ticker, beta: h.beta, weight: parseFloat((weight * 100).toFixed(1)) };
    });

    res.json({
      portfolio_beta: parseFloat(portfolioBeta.toFixed(3)),
      spy_beta: 1.0,
      holdings: holdingBetas,
      interpretation: portfolioBeta < 0.8 ? 'Defensive' : portfolioBeta < 1.1 ? 'Market-like' : 'Aggressive',
    });
  } catch (e) {
    console.error('Beta calc error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  const { ticker } = req.query;
  const query = ticker
    ? `SELECT * FROM transactions WHERE ticker=$1 ORDER BY date DESC, created_at DESC`
    : `SELECT * FROM transactions ORDER BY date DESC, created_at DESC`;
  const params = ticker ? [ticker.toUpperCase()] : [];
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  const { ticker, type, shares, price, date, notes, currency = 'USD' } = req.body;
  if (!ticker || !type || !shares || !price || !date) {
    return res.status(400).json({ error: 'ticker, type, shares, price, date required' });
  }
  const upper = ticker.toUpperCase().trim();

  const priceData = await fetchPrice(upper);
  if (!priceData) return res.status(400).json({ error: `Could not find ticker: ${upper}` });

  if (type.toUpperCase() === 'SELL') {
    const holdings = await computeHoldings();
    const holding = holdings.find(h => h.ticker === upper);
    const currentShares = holding?.shares || 0;
    if (parseFloat(shares) > currentShares) {
      return res.status(400).json({
        error: `Cannot sell ${shares} shares — you only hold ${currentShares.toFixed(4)} of ${upper}`
      });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO transactions (ticker, type, shares, price, currency, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [upper, type.toUpperCase(), parseFloat(shares), parseFloat(price), currency, date, notes]
  );
  res.json({ transaction: rows[0], message: `${type.toUpperCase()} logged and holdings updated` });
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  const { ticker, type, shares, price, date, notes, currency = 'USD' } = req.body;
  if (!ticker || !type || !shares || !price || !date) {
    return res.status(400).json({ error: 'ticker, type, shares, price, date required' });
  }
  const upper = ticker.toUpperCase().trim();
  const { rows } = await pool.query(
    `UPDATE transactions SET ticker=$1, type=$2, shares=$3, price=$4, currency=$5, date=$6, notes=$7
     WHERE id=$8 RETURNING *`,
    [upper, type.toUpperCase(), parseFloat(shares), parseFloat(price), currency, date, notes || null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ transaction: rows[0] });
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM transactions WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/import-csv', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    const results = { imported: 0, errors: [] };
    for (const row of records) {
      const ticker = (row.ticker || row.Ticker || row.symbol || row.Symbol || '').toUpperCase().trim();
      const shares = parseFloat(row.shares || row.Shares || row.quantity || row.Quantity || 0);
      const price = parseFloat(row.avg_cost || row.AvgCost || row.average_cost || row.price || row.Price || row['avg cost'] || 0);
      const date = row.date || row.Date || new Date().toISOString().split('T')[0];
      const notes = row.notes || row.Notes || 'Imported from CSV';
      const currency = row.currency || row.Currency || 'USD';
      if (!ticker || !shares || !price) {
        results.errors.push(`Skipped: ${JSON.stringify(row)} (missing ticker/shares/price)`);
        continue;
      }
      try {
        await pool.query(
          `INSERT INTO transactions (ticker, type, shares, price, currency, date, notes) VALUES ($1,'BUY',$2,$3,$4,$5,$6)`,
          [ticker, shares, price, currency, date, notes]
        );
        results.imported++;
      } catch (e) {
        results.errors.push(`${ticker}: ${e.message}`);
      }
    }
    res.json(results);
  } catch (e) {
    res.status(400).json({ error: `CSV parse error: ${e.message}` });
  }
});

// POST /api/ai/chat - proxy to Anthropic API (keeps API key server-side)
app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI not configured. Add ANTHROPIC_API_KEY to backend environment variables.' });

  try {
    const fetch = require('node-fetch');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI request failed' });

    // Extract all text blocks (skip tool_use/tool_result blocks)
    const text = data.content
      ?.filter(b => b.type === 'text')
      ?.map(b => b.text)
      ?.join('\n') || 'No response generated.';

    // Return usage stats (input @ $3/M, output @ $15/M for claude-sonnet-4-5)
    const usage = data.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const costUSD = (inputTokens / 1_000_000 * 3) + (outputTokens / 1_000_000 * 15);

    // Persist to DB
    await pool.query(
      `INSERT INTO ai_usage (input_tokens, output_tokens, cost_usd) VALUES ($1, $2, $3)`,
      [inputTokens, outputTokens, costUSD]
    );

    res.json({ text, usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUSD } });
  } catch (e) {
    console.error('AI proxy error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/email - email chat transcript
app.post('/api/ai/email', requireAuth, async (req, res) => {
  const { to, messages, summary } = req.body;
  if (!to || !messages?.length) return res.status(400).json({ error: 'to and messages required' });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'Email not configured. Add RESEND_API_KEY to backend environment variables.' });

  try {
    const fetch = require('node-fetch');

    // Build HTML
    const htmlMessages = messages.map(m => {
      const isUser = m.role === 'user';
      const content = m.content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^## (.*$)/gm, '<h3 style="color:#6c63ff;margin:12px 0 4px">$1</h3>')
        .replace(/^- (.*$)/gm, '<li style="margin:3px 0">$1</li>')
        .replace(/\n/g, '<br>');
      return `
        <div style="margin:16px 0;display:flex;gap:12px;align-items:flex-start;flex-direction:${isUser ? 'row-reverse' : 'row'}">
          <div style="font-size:20px">${isUser ? '👤' : '✨'}</div>
          <div style="background:${isUser ? '#1a1060' : '#1a1d27'};border:1px solid #2a2d3d;border-radius:12px;padding:12px 16px;max-width:80%;font-size:13px;line-height:1.6;color:#e8eaf0">
            ${content}
          </div>
        </div>`;
    }).join('');

    const now = new Date().toLocaleString('en-CA', { dateStyle: 'full', timeStyle: 'short' });
    const html = `
      <div style="font-family:'Segoe UI',sans-serif;background:#0d0f14;padding:24px;border-radius:12px;max-width:700px;margin:0 auto">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #2a2d3d">
          <span style="font-size:22px">📈</span>
          <div>
            <div style="font-size:18px;font-weight:600;color:#8b84ff">Folio AI Advisor</div>
            <div style="font-size:12px;color:#7b7f94">Chat exported on ${now}</div>
          </div>
        </div>
        ${summary ? `
        <div style="background:#1a1d27;border:1px solid #2a2d3d;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#7b7f94">
          <strong style="color:#e8eaf0">Portfolio at time of chat:</strong>
          Value ${summary.total_value} · Invested ${summary.total_cost} · Return ${summary.total_gain_loss} (${summary.total_gain_loss_pct})
        </div>` : ''}
        ${htmlMessages}
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #2a2d3d;font-size:11px;color:#7b7f94;text-align:center">
          Exported from Folio · AI insights are for informational purposes only and not professional financial advice.
        </div>
      </div>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Folio <onboarding@resend.dev>',
        to: [to],
        subject: `Folio AI Advisor Chat — ${new Date().toLocaleDateString('en-CA')}`,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Email send failed');

    res.json({ success: true });
  } catch (e) {
    console.error('Email error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ai/usage - lifetime + monthly stats
app.get('/api/ai/usage', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        SUM(cost_usd) AS total_cost,
        SUM(input_tokens + output_tokens) AS total_tokens,
        SUM(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) THEN cost_usd ELSE 0 END) AS month_cost,
        SUM(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) THEN input_tokens + output_tokens ELSE 0 END) AS month_tokens,
        COUNT(*) AS total_calls
      FROM ai_usage
    `);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });
