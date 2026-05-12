# 📈 Folio — Portfolio Tracker

A full-stack investment portfolio tracker. Real-time stock & ETF prices, gain/loss analytics, CSV import, and charts. Bye-bye spreadsheet.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React, Recharts, Lucide icons |
| Backend | Node.js + Express |
| Database | PostgreSQL on **Neon** |
| Prices | Yahoo Finance (free, no API key) |
| Hosting | **Render** (frontend + backend) |

---

## Local Development

### 1. Set up Neon (free tier works great)

1. Go to [neon.tech](https://neon.tech) → create a free project
2. Copy the **Connection String** (looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`)

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and paste your Neon DATABASE_URL
npm run dev        # starts on http://localhost:3001
```

The server auto-creates the `holdings` and `transactions` tables on first run.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# .env already points to http://localhost:3001 by default
npm start          # opens http://localhost:3000
```

---

## Deploy to Render

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOU/folio.git
git push -u origin main
```

### Step 2 — Deploy Backend on Render

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
4. Add environment variables:
   - `DATABASE_URL` → your Neon connection string
   - `PORT` → `3001`
5. Deploy → copy the backend URL (e.g. `https://folio-backend.onrender.com`)

### Step 3 — Deploy Frontend on Render

1. **New → Static Site**
2. Connect the same repo
3. Settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `build`
4. Add environment variable:
   - `REACT_APP_API_URL` → your backend URL from Step 2
5. Deploy

### Step 4 — Update CORS

Go back to your **backend** service on Render → Environment → add:
- `FRONTEND_URL` → your frontend Render URL

Redeploy backend. Done! 🎉

---

## CSV Import Format

Your CSV needs these columns (header row required):

```csv
ticker,shares,avg_cost
AAPL,10,175.50
SPY,5.5,420.00
VTI,8,210.75
```

Also accepted column names: `Ticker`, `symbol`, `Symbol`, `Shares`, `quantity`, `Quantity`, `AvgCost`, `average_cost`, `price`, `Price`

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/portfolio` | All holdings with live prices + summary |
| GET | `/api/prices/:ticker` | Single ticker live price |
| POST | `/api/holdings` | Add or merge a holding |
| PUT | `/api/holdings/:ticker` | Update shares/avg_cost |
| DELETE | `/api/holdings/:ticker` | Remove a holding |
| GET | `/api/transactions` | All transactions (optional `?ticker=AAPL`) |
| POST | `/api/transactions` | Log a transaction |
| POST | `/api/import-csv` | Bulk import from CSV file |

---

## Upgrading Later

Ideas for v2:
- [ ] Transaction history timeline
- [ ] Dividend tracking
- [ ] Price history charts (1W / 1M / 1Y)
- [ ] Multiple portfolios / watchlist
- [ ] Email alerts for big moves
- [ ] Auth (NextAuth or Clerk)
