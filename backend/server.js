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
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/portfolio', async (req, res) => {
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

app.get('/api/prices/:ticker', async (req, res) => {
  const data = await fetchPrice(req.params.ticker.toUpperCase());
  if (!data) return res.status(404).json({ error: 'Ticker not found' });
  res.json(data);
});

app.get('/api/transactions', async (req, res) => {
  const { ticker } = req.query;
  const query = ticker
    ? `SELECT * FROM transactions WHERE ticker=$1 ORDER BY date DESC, created_at DESC`
    : `SELECT * FROM transactions ORDER BY date DESC, created_at DESC`;
  const params = ticker ? [ticker.toUpperCase()] : [];
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

app.post('/api/transactions', async (req, res) => {
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

app.delete('/api/transactions/:id', async (req, res) => {
  await pool.query('DELETE FROM transactions WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/import-csv', upload.single('file'), async (req, res) => {
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
app.post('/api/ai/chat', async (req, res) => {
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

    res.json({ text });
  } catch (e) {
    console.error('AI proxy error:', e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });
