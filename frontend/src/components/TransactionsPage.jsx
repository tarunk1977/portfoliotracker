import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, TrendingUp, TrendingDown, Filter, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { fmt } from '../utils/format';

// ── Add Transaction Modal ─────────────────────────────────────────────────
function AddTransactionModal({ onClose, onSave, holdings }) {
  const [type, setType] = useState('BUY');
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const total = shares && price ? parseFloat(shares) * parseFloat(price) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ticker || !shares || !price || !date) { setError('All fields except notes are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.addTransaction({ ticker: ticker.toUpperCase(), type, shares: parseFloat(shares), price: parseFloat(price), date, notes });
      onSave();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Log Transaction</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Buy / Sell toggle */}
          <div className="type-toggle">
            <button type="button" className={`type-btn buy ${type === 'BUY' ? 'active' : ''}`} onClick={() => setType('BUY')}>
              <TrendingUp size={15} /> Buy
            </button>
            <button type="button" className={`type-btn sell ${type === 'SELL' ? 'active' : ''}`} onClick={() => setType('SELL')}>
              <TrendingDown size={15} /> Sell
            </button>
          </div>

          <div className="field-group">
            <label>Ticker</label>
            <input
              className="input"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              list="holdings-list"
              autoFocus
            />
            <datalist id="holdings-list">
              {holdings?.map(h => <option key={h.ticker} value={h.ticker}>{h.company_name}</option>)}
            </datalist>
          </div>

          <div className="field-row">
            <div className="field-group">
              <label>Shares</label>
              <input className="input" type="number" value={shares} onChange={e => setShares(e.target.value)} placeholder="0.00" step="any" min="0" />
            </div>
            <div className="field-group">
              <label>Price / Share</label>
              <input className="input" type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" step="any" min="0" />
            </div>
          </div>

          <div className="field-group">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="field-group">
            <label>Notes (optional)</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Bought the dip" />
          </div>

          {total && (
            <div className="cost-preview">
              <div className="preview-row">
                <span>Total {type === 'BUY' ? 'cost' : 'proceeds'}</span>
                <span style={{ color: type === 'BUY' ? '#ef4444' : '#22c55e', fontWeight: 600 }}>
                  {type === 'BUY' ? '-' : '+'}{fmt.currency(total)}
                </span>
              </div>
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Log Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Transactions Table ────────────────────────────────────────────────────
export function TransactionsPage({ holdings, onTradeLogged }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filterTicker, setFilterTicker] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTransactions();
      setTransactions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!window.confirm('Delete this transaction? Holdings will be recalculated.')) return;
    try {
      const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      await fetch(`${BASE}/api/transactions/${id}`, { method: 'DELETE' });
      await load();
      onTradeLogged?.();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  }

  async function handleSave() {
    await load();
    onTradeLogged?.();
  }

  const tickers = ['ALL', ...Array.from(new Set(transactions.map(t => t.ticker))).sort()];
  const filtered = filterTicker === 'ALL' ? transactions : transactions.filter(t => t.ticker === filterTicker);

  const totalBought = transactions.filter(t => t.type === 'BUY').reduce((s, t) => s + parseFloat(t.shares) * parseFloat(t.price), 0);
  const totalSold = transactions.filter(t => t.type === 'SELL').reduce((s, t) => s + parseFloat(t.shares) * parseFloat(t.price), 0);

  return (
    <div className="transactions-page">
      {/* Mini summary */}
      <div className="tx-summary">
        <div className="tx-stat">
          <span className="tx-stat-label">Total Bought</span>
          <span className="tx-stat-value" style={{ color: '#ef4444' }}>{fmt.currency(totalBought)}</span>
        </div>
        <div className="tx-stat">
          <span className="tx-stat-label">Total Sold</span>
          <span className="tx-stat-value" style={{ color: '#22c55e' }}>{fmt.currency(totalSold)}</span>
        </div>
        <div className="tx-stat">
          <span className="tx-stat-label">Net Invested</span>
          <span className="tx-stat-value">{fmt.currency(totalBought - totalSold)}</span>
        </div>
        <div className="tx-stat">
          <span className="tx-stat-label">Trades Logged</span>
          <span className="tx-stat-value">{transactions.length}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="tx-toolbar">
        <div className="filter-row">
          <Filter size={14} style={{ color: 'var(--muted)' }} />
          <select className="input select-sm" value={filterTicker} onChange={e => setFilterTicker(e.target.value)}>
            {tickers.map(t => <option key={t} value={t}>{t === 'ALL' ? 'All tickers' : t}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Log Trade
        </button>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /><p>Loading transactions…</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>No transactions yet. Click "Log Trade" to record your first buy or sell.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="holdings-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Ticker</th>
                <th className="right">Shares</th>
                <th className="right">Price</th>
                <th className="right">Total</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const total = parseFloat(t.shares) * parseFloat(t.price);
                const isBuy = t.type === 'BUY';
                return (
                  <tr key={t.id}>
                    <td className="mono" style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {new Date(t.date).toLocaleDateString('en-CA')}
                    </td>
                    <td>
                      <span className={`type-pill ${isBuy ? 'buy' : 'sell'}`}>
                        {isBuy ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {t.type}
                      </span>
                    </td>
                    <td><span className="ticker-badge">{t.ticker}</span></td>
                    <td className="right mono">{fmt.num(t.shares)}</td>
                    <td className="right mono">{fmt.currency(t.price)}</td>
                    <td className="right mono" style={{ color: isBuy ? '#ef4444' : '#22c55e', fontWeight: 500 }}>
                      {isBuy ? '-' : '+'}{fmt.currency(total)}
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{t.notes || '—'}</td>
                    <td>
                      <button className="icon-btn danger" onClick={() => handleDelete(t.id)} title="Delete transaction">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddTransactionModal
          onClose={() => setShowAdd(false)}
          onSave={handleSave}
          holdings={holdings}
        />
      )}
    </div>
  );
}
