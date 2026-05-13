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
app.post('/api/ai/email', async (req, res) => {
  const { to, messages, summary } = req.body;
  if (!to || !messages?.length) return res.status(400).json({ error: 'to and messages required' });

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) return res.status(500).json({ error: 'Email not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to backend environment variables.' });

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    });

    // Build plain text version
    const textBody = messages.map(m =>
      `${m.role === 'user' ? '👤 You' : '✨ Folio AI'}:\n${m.content}`
    ).join('\n\n---\n\n');

    // Build HTML version
    const htmlMessages = messages.map(m => {
      const isUser = m.role === 'user';
      const content = m.content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^## (.*$)/gm, '<h3 style="color:#6c63ff;margin:12px 0 4px">$1</h3>')
        .replace(/^- (.*$)/gm, '<li style="margin:3px 0">$1</li>')
        .replace(/\n/g, '<br>');
      return `
        <div style="margin:16px 0;display:flex;flex-direction:${isUser ? 'row-reverse' : 'row'};gap:12px;align-items:flex-start">
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

    await transporter.sendMail({
      from: `Folio Portfolio Tracker <${gmailUser}>`,
      to,
      subject: `Folio AI Advisor Chat — ${new Date().toLocaleDateString('en-CA')}`,
      text: textBody,
      html,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Email error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ai/usage - lifetime + monthly stats
app.get('/api/ai/usage', async (req, res) => {
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
