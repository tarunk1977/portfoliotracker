import React, { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, TrendingUp, TrendingDown, Bell } from 'lucide-react';
import { fmt, gainColor } from '../utils/format';
import { Sparkline, PriceHistoryModal } from './PriceHistory';
import { PriceAlertModal } from './PriceAlertModal';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function HoldingCard({ h, onClick }) {
  const isUp = (h.gain_loss_pct ?? 0) >= 0;
  return (
    <div className="holding-card" onClick={() => onClick(h)}>
      <div className="hcard-top">
        <div className="hcard-left">
          <span className="ticker-badge">{h.ticker}</span>
          <div className="hcard-name">{h.company_name || h.ticker}</div>
        </div>
        <div className="hcard-right">
          <div className="hcard-value">{fmt.currency(h.market_value)}</div>
          <div className="hcard-return" style={{ color: gainColor(h.gain_loss_pct) }}>
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {fmt.pct(h.gain_loss_pct)}
          </div>
        </div>
      </div>
      <div className="hcard-stats">
        <div className="hcard-stat">
          <span className="hcard-stat-label">Shares</span>
          <span className="hcard-stat-value">{fmt.num(h.shares, 3)}</span>
        </div>
        <div className="hcard-stat">
          <span className="hcard-stat-label">Avg Cost</span>
          <span className="hcard-stat-value">{fmt.currency(h.avg_cost)}</span>
        </div>
        <div className="hcard-stat">
          <span className="hcard-stat-label">Price</span>
          <span className="hcard-stat-value">{fmt.currency(h.current_price)}</span>
        </div>
        <div className="hcard-stat">
          <span className="hcard-stat-label">Today</span>
          <span className="hcard-stat-value" style={{ color: gainColor(h.day_change_pct) }}>
            {fmt.pct(h.day_change_pct)}
          </span>
        </div>
      </div>
      <div className="hcard-bottom">
        <div className="hcard-invested">
          <span className="hcard-stat-label">Invested</span>
          <span style={{ color: '#a78bfa', fontFamily: 'DM Mono', fontSize: 13, fontWeight: 500 }}>
            {fmt.currency(h.cost_basis)}
          </span>
        </div>
        <div className="hcard-gainloss">
          <span className="hcard-stat-label">Gain/Loss</span>
          <span style={{ color: gainColor(h.gain_loss), fontFamily: 'DM Mono', fontSize: 13, fontWeight: 500 }}>
            {fmt.currency(h.gain_loss)}
          </span>
        </div>
        <Sparkline ticker={h.ticker} changePct={h.day_change_pct} />
      </div>
      <div className="hcard-tap-hint">Tap for price history →</div>
    </div>
  );
}

// Builds the tooltip text from an array of alerts for a ticker
function buildTooltip(alerts) {
  return alerts
    .map(a => `${a.condition === 'below' ? '📉 Below' : '📈 Above'} $${parseFloat(a.threshold_price).toFixed(2)}`)
    .join('\n');
}

function AlertBell({ holding, tickerAlerts, onOpen }) {
  const hasAlerts = tickerAlerts && tickerAlerts.length > 0;
  const tooltip = hasAlerts
    ? `Alerts set:\n${buildTooltip(tickerAlerts)}`
    : 'Set price alert';

  return (
    <button
      className="icon-btn"
      title={tooltip}
      onClick={e => { e.stopPropagation(); onOpen(holding); }}
      style={{
        color: hasAlerts ? '#f59e0b' : 'var(--muted)',
        filter: hasAlerts ? 'drop-shadow(0 0 4px rgba(245,158,11,0.5))' : 'none',
        transition: 'color 0.2s, filter 0.2s',
      }}
    >
      <Bell size={13} fill={hasAlerts ? '#f59e0b' : 'none'} />
    </button>
  );
}

export function HoldingsTable({ holdings }) {
  const isMobile = useIsMobile();
  const [sortField, setSortField] = useState('market_value');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [alertHolding, setAlertHolding] = useState(null);
  // Map of ticker → alert[]
  const [alertsMap, setAlertsMap] = useState({});

  const loadAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem('folio-token');
      const res = await fetch(`${BASE}/api/price-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      // Group by ticker
      const map = {};
      for (const a of data) {
        if (!map[a.ticker]) map[a.ticker] = [];
        map[a.ticker].push(a);
      }
      setAlertsMap(map);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const sorted = [...(holdings || [])].sort((a, b) => {
    const va = a[sortField] ?? 0;
    const vb = b[sortField] ?? 0;
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  function SortIcon({ field }) {
    if (sortField !== field) return <ChevronUp size={12} style={{ opacity: 0.2 }} />;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  function Th({ field, children, right }) {
    return (
      <th className={right ? 'right' : ''} onClick={() => handleSort(field)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {children} <SortIcon field={field} />
        </span>
      </th>
    );
  }

  if (!holdings?.length) {
    return (
      <div className="empty-state">
        <p>No holdings yet. Go to the <strong>Transactions</strong> tab and log your first buy.</p>
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="holdings-cards">
          {sorted.map(h => (
            <div key={h.ticker} style={{ position: 'relative' }}>
              <HoldingCard h={h} onClick={setSelectedHolding} />
              <div style={{ position: 'absolute', top: 10, right: 10 }}>
                <AlertBell holding={h} tickerAlerts={alertsMap[h.ticker]} onOpen={setAlertHolding} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="holdings-table">
              <thead>
                <tr>
                  <Th field="ticker">Ticker</Th>
                  <Th field="company_name">Name</Th>
                  <Th field="shares" right>Shares</Th>
                  <Th field="avg_cost" right>Avg Cost</Th>
                  <Th field="current_price" right>Price</Th>
                  <th>1M Trend</th>
                  <Th field="day_change_pct" right>Day</Th>
                  <Th field="cost_basis" right>Invested</Th>
                  <Th field="market_value" right>Value</Th>
                  <Th field="gain_loss" right>Gain/Loss</Th>
                  <Th field="gain_loss_pct" right>Return</Th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(h => (
                  <tr key={h.ticker} onClick={() => setSelectedHolding(h)} style={{ cursor: 'pointer' }}>
                    <td><span className="ticker-badge">{h.ticker}</span></td>
                    <td className="name-cell">{h.company_name || h.ticker}</td>
                    <td className="right mono">{fmt.num(h.shares)}</td>
                    <td className="right mono">{fmt.currency(h.avg_cost)}</td>
                    <td className="right mono">{fmt.currency(h.current_price)}</td>
                    <td><Sparkline ticker={h.ticker} changePct={h.day_change_pct} /></td>
                    <td className="right mono" style={{ color: gainColor(h.day_change_pct) }}>{fmt.pct(h.day_change_pct)}</td>
                    <td className="right mono" style={{ color: '#a78bfa', fontWeight: 500 }}>{fmt.currency(h.cost_basis)}</td>
                    <td className="right mono">{fmt.currency(h.market_value)}</td>
                    <td className="right mono" style={{ color: gainColor(h.gain_loss) }}>{fmt.currency(h.gain_loss)}</td>
                    <td className="right mono" style={{ color: gainColor(h.gain_loss_pct), fontWeight: 600 }}>{fmt.pct(h.gain_loss_pct)}</td>
                    <td><AlertBell holding={h} tickerAlerts={alertsMap[h.ticker]} onOpen={setAlertHolding} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'right' }}>
            Click any row to view full price history
          </p>
        </>
      )}

      {selectedHolding && (
        <PriceHistoryModal holding={selectedHolding} onClose={() => setSelectedHolding(null)} />
      )}

      {alertHolding && (
        <PriceAlertModal
          holding={alertHolding}
          onClose={() => { setAlertHolding(null); loadAlerts(); }}
        />
      )}
    </>
  );
}
