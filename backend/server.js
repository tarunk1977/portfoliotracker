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

// DB connection (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── DB Init ────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS holdings (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(20) NOT NULL,
      company_name VARCHAR(200),
      shares NUMERIC(18,6) NOT NULL,
      avg_cost NUMERIC(18,4) NOT NULL,
      currency VARCHAR(10) DEFAULT 'USD',
      added_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

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
    CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);
  `);
  console.log('✅ Database initialized');
}

// ─── Price fetching (Yahoo Finance) ────────────────────────────────────────
const priceCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 min

async function fetchPrice(ticker) {
  const cached = priceCache.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const fetch = require('node-fetch');
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const data = {
      ticker,
      price: meta.regularMarketPrice,
      prevClose: meta.previousClose || meta.chartPreviousClose,
      name: meta.longName || meta.shortName || ticker,
      currency: meta.currency,
      change: meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose),
      changePct: ((meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose)) / (meta.previousClose || meta.chartPreviousClose)) * 100,
    };

    priceCache.set(ticker, { data, ts: Date.now() });
    return data;
  } catch (e) {
    console.error(`Price fetch failed for ${ticker}:`, e.message);
    return null;
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// GET /api/portfolio - full portfolio with live prices
app.get('/api/portfolio', async (req, res) => {
  try {
    const { rows: holdings } = await pool.query(
      'SELECT * FROM holdings ORDER BY ticker'
    );

    const enriched = await Promise.all(holdings.map(async (h) => {
      const price = await fetchPrice(h.ticker);
      const currentPrice = price?.price ?? null;
      const marketValue = currentPrice ? currentPrice * parseFloat(h.shares) : null;
      const costBasis = parseFloat(h.avg_cost) * parseFloat(h.shares);
      const gainLoss = marketValue ? marketValue - costBasis : null;
      const gainLossPct = gainLoss !== null ? (gainLoss / costBasis) * 100 : null;

      return {
        ...h,
        shares: parseFloat(h.shares),
        avg_cost: parseFloat(h.avg_cost),
        current_price: currentPrice,
        prev_close: price?.prevClose ?? null,
        day_change: price?.change ?? null,
        day_change_pct: price?.changePct ?? null,
        market_value: marketValue,
        cost_basis: costBasis,
        gain_loss: gainLoss,
        gain_loss_pct: gainLossPct,
        company_name: price?.name || h.company_name || h.ticker,
        currency: price?.currency || h.currency,
      };
    }));

    const totalValue = enriched.reduce((s, h) => s + (h.market_value || 0), 0);
    const totalCost = enriched.reduce((s, h) => s + h.cost_basis, 0);
    const totalGainLoss = totalValue - totalCost;
    const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
    const dayChange = enriched.reduce((s, h) => s + (h.day_change && h.shares ? h.day_change * h.shares : 0), 0);

    res.json({
      holdings: enriched,
      summary: {
        total_value: totalValue,
        total_cost: totalCost,
        total_gain_loss: totalGainLoss,
        total_gain_loss_pct: totalGainLossPct,
        day_change: dayChange,
        count: enriched.length,
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/prices/:ticker - single ticker price
app.get('/api/prices/:ticker', async (req, res) => {
  const data = await fetchPrice(req.params.ticker.toUpperCase());
  if (!data) return res.status(404).json({ error: 'Ticker not found' });
  res.json(data);
});

// POST /api/holdings - add/update a holding
app.post('/api/holdings', async (req, res) => {
  const { ticker, shares, avg_cost, currency = 'USD' } = req.body;
  if (!ticker || !shares || !avg_cost) {
    return res.status(400).json({ error: 'ticker, shares, avg_cost required' });
  }

  const upper = ticker.toUpperCase().trim();

  // Verify ticker exists
  const price = await fetchPrice(upper);
  if (!price) return res.status(400).json({ error: `Could not find ticker: ${upper}` });

  try {
    const { rows } = await pool.query(
      `INSERT INTO holdings (ticker, company_name, shares, avg_cost, currency)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [upper, price.name, parseFloat(shares), parseFloat(avg_cost), currency]
    );

    // If conflict (ticker exists), update
    if (rows.length === 0) {
      const existing = await pool.query('SELECT * FROM holdings WHERE ticker=$1', [upper]);
      const ex = existing.rows[0];
      const newShares = parseFloat(ex.shares) + parseFloat(shares);
      const newAvgCost = ((parseFloat(ex.shares) * parseFloat(ex.avg_cost)) + (parseFloat(shares) * parseFloat(avg_cost))) / newShares;

      const updated = await pool.query(
        `UPDATE holdings SET shares=$1, avg_cost=$2, updated_at=NOW() WHERE ticker=$3 RETURNING *`,
        [newShares, newAvgCost, upper]
      );
      return res.json(updated.rows[0]);
    }

    // Also record as transaction
    await pool.query(
      `INSERT INTO transactions (ticker, type, shares, price, currency, date)
       VALUES ($1, 'BUY', $2, $3, $4, NOW())`,
      [upper, parseFloat(shares), parseFloat(avg_cost), currency]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/holdings/:ticker
app.delete('/api/holdings/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  await pool.query('DELETE FROM holdings WHERE ticker=$1', [ticker]);
  res.json({ success: true });
});

// PUT /api/holdings/:ticker - update shares/avg_cost
app.put('/api/holdings/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const { shares, avg_cost } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE holdings SET shares=$1, avg_cost=$2, updated_at=NOW() WHERE ticker=$3 RETURNING *`,
      [parseFloat(shares), parseFloat(avg_cost), ticker]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/transactions
app.get('/api/transactions', async (req, res) => {
  const { ticker } = req.query;
  const query = ticker
    ? `SELECT * FROM transactions WHERE ticker=$1 ORDER BY date DESC`
    : `SELECT * FROM transactions ORDER BY date DESC`;
  const params = ticker ? [ticker.toUpperCase()] : [];
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

// POST /api/transactions - log a transaction
app.post('/api/transactions', async (req, res) => {
  const { ticker, type, shares, price, date, notes, currency = 'USD' } = req.body;
  if (!ticker || !type || !shares || !price || !date) {
    return res.status(400).json({ error: 'ticker, type, shares, price, date required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO transactions (ticker, type, shares, price, currency, date, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [ticker.toUpperCase(), type.toUpperCase(), parseFloat(shares), parseFloat(price), currency, date, notes]
  );
  res.json(rows[0]);
});

// POST /api/import-csv - import holdings from CSV
app.post('/api/import-csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = { imported: 0, errors: [] };

    for (const row of records) {
      // Support common column name variations
      const ticker = (row.ticker || row.Ticker || row.symbol || row.Symbol || '').toUpperCase().trim();
      const shares = parseFloat(row.shares || row.Shares || row.quantity || row.Quantity || 0);
      const avg_cost = parseFloat(row.avg_cost || row.AvgCost || row.average_cost || row.price || row.Price || row['avg cost'] || 0);
      const currency = row.currency || row.Currency || 'USD';

      if (!ticker || !shares || !avg_cost) {
        results.errors.push(`Skipped row: ${JSON.stringify(row)} (missing ticker/shares/avg_cost)`);
        continue;
      }

      try {
        const price = await fetchPrice(ticker);
        await pool.query(
          `INSERT INTO holdings (ticker, company_name, shares, avg_cost, currency)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (ticker) DO UPDATE
           SET shares = EXCLUDED.shares, avg_cost = EXCLUDED.avg_cost, updated_at = NOW()`,
          [ticker, price?.name || ticker, shares, avg_cost, currency]
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

// ─── Start ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}).catch(e => {
  console.error('DB init failed:', e);
  process.exit(1);
});
