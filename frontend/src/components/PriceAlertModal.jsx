import React, { useState, useEffect } from 'react';
import { X, Bell, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { fmt } from '../utils/format';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function authHeaders() {
  const token = localStorage.getItem('folio-token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export function PriceAlertModal({ holding, onClose }) {
  const [alerts, setAlerts] = useState([]);
  const [condition, setCondition] = useState('below');
  const [threshold, setThreshold] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadAlerts(); }, []);

  async function loadAlerts() {
    try {
      const res = await fetch(`${BASE}/api/price-alerts`, { headers: authHeaders() });
      const data = await res.json();
      setAlerts(data.filter(a => a.ticker === holding.ticker));
    } catch (e) { console.error(e); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!threshold) { setError('Enter a price threshold'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/api/price-alerts`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ticker: holding.ticker, condition, threshold_price: parseFloat(threshold) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setThreshold('');
      await loadAlerts();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await fetch(`${BASE}/api/price-alerts/${id}`, { method: 'DELETE', headers: authHeaders() });
      await loadAlerts();
    } catch (e) { console.error(e); }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2><Bell size={16} style={{ display: 'inline', marginRight: 8 }} />Price Alerts — {holding.ticker}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-form">
          {/* Current price context */}
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{holding.company_name || holding.ticker}</span>
            <span style={{ color: 'var(--text)', fontFamily: 'DM Mono', fontWeight: 600 }}>
              Current: {fmt.currency(holding.current_price)}
            </span>
          </div>

          {/* Add alert form */}
          <form onSubmit={handleAdd}>
            <div className="field-row">
              <div className="field-group">
                <label>Alert me when price goes</label>
                <div className="type-toggle">
                  <button type="button" className={`type-btn sell ${condition === 'below' ? 'active' : ''}`} onClick={() => setCondition('below')}>
                    <TrendingDown size={14} /> Below
                  </button>
                  <button type="button" className={`type-btn buy ${condition === 'above' ? 'active' : ''}`} onClick={() => setCondition('above')}>
                    <TrendingUp size={14} /> Above
                  </button>
                </div>
              </div>
              <div className="field-group">
                <label>Price ($)</label>
                <input
                  className="input"
                  type="number"
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                  placeholder={fmt.currency(holding.current_price)}
                  step="0.01"
                  min="0"
                  autoFocus
                />
              </div>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : <><Bell size={14} /> Set Alert</>}
              </button>
            </div>
          </form>

          {/* Existing alerts */}
          {alerts.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Alerts
              </div>
              {alerts.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: a.condition === 'below' ? '#ef4444' : '#22c55e', marginRight: 6 }}>
                      {a.condition === 'below' ? '📉' : '📈'}
                    </span>
                    Alert if price goes <strong>{a.condition}</strong> {fmt.currency(a.threshold_price)}
                  </div>
                  <button className="icon-btn danger" onClick={() => handleDelete(a.id)} title="Delete alert">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
