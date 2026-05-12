import React, { useState, useEffect } from 'react';
import { X, Search, Loader } from 'lucide-react';
import { api } from '../utils/api';
import { fmt } from '../utils/format';

export function AddHoldingModal({ onClose, onSave, editHolding }) {
  const [ticker, setTicker] = useState(editHolding?.ticker || '');
  const [shares, setShares] = useState(editHolding?.shares || '');
  const [avgCost, setAvgCost] = useState(editHolding?.avg_cost || '');
  const [pricePreview, setPricePreview] = useState(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editHolding) {
      setPricePreview({ price: editHolding.current_price, name: editHolding.company_name });
    }
  }, [editHolding]);

  async function lookupTicker() {
    if (!ticker.trim()) return;
    setLooking(true);
    setError('');
    try {
      const data = await api.getPrice(ticker.trim().toUpperCase());
      setPricePreview(data);
    } catch {
      setError(`Ticker "${ticker.toUpperCase()}" not found. Check the symbol.`);
      setPricePreview(null);
    } finally {
      setLooking(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ticker || !shares || !avgCost) { setError('All fields required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editHolding) {
        await api.updateHolding(editHolding.ticker, { shares: parseFloat(shares), avg_cost: parseFloat(avgCost) });
      } else {
        await api.addHolding({ ticker: ticker.toUpperCase(), shares: parseFloat(shares), avg_cost: parseFloat(avgCost) });
      }
      onSave();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const mktValue = shares && avgCost ? parseFloat(shares) * parseFloat(avgCost) : null;
  const currentValue = shares && pricePreview?.price ? parseFloat(shares) * pricePreview.price : null;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{editHolding ? `Edit ${editHolding.ticker}` : 'Add Position'}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {!editHolding && (
            <div className="field-group">
              <label>Ticker Symbol</label>
              <div className="ticker-row">
                <input
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase())}
                  onBlur={lookupTicker}
                  placeholder="e.g. AAPL, SPY, VTI"
                  className="input"
                  autoFocus
                />
                <button type="button" className="btn-ghost" onClick={lookupTicker} disabled={looking}>
                  {looking ? <Loader size={16} className="spin" /> : <Search size={16} />}
                </button>
              </div>
              {pricePreview && (
                <div className="price-preview">
                  <span className="preview-name">{pricePreview.name}</span>
                  <span className="preview-price">{fmt.currency(pricePreview.price)}</span>
                </div>
              )}
            </div>
          )}

          <div className="field-row">
            <div className="field-group">
              <label>Shares</label>
              <input
                type="number"
                value={shares}
                onChange={e => setShares(e.target.value)}
                placeholder="0.00"
                step="any"
                min="0"
                className="input"
              />
            </div>
            <div className="field-group">
              <label>Avg Cost / Share</label>
              <input
                type="number"
                value={avgCost}
                onChange={e => setAvgCost(e.target.value)}
                placeholder="0.00"
                step="any"
                min="0"
                className="input"
              />
            </div>
          </div>

          {mktValue && (
            <div className="cost-preview">
              <div className="preview-row">
                <span>Cost basis</span>
                <span>{fmt.currency(mktValue)}</span>
              </div>
              {currentValue && (
                <div className="preview-row">
                  <span>Current value</span>
                  <span style={{ color: currentValue >= mktValue ? '#22c55e' : '#ef4444' }}>
                    {fmt.currency(currentValue)}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editHolding ? 'Update' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
