import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { fmt, gainColor } from '../utils/format';
import { Sparkline, PriceHistoryModal } from './PriceHistory';

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

export function HoldingsTable({ holdings }) {
  const isMobile = useIsMobile();
  const [sortField, setSortField] = useState('market_value');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedHolding, setSelectedHolding] = useState(null);

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
          {sorted.map(h => <HoldingCard key={h.ticker} h={h} onClick={setSelectedHolding} />)}
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
    </>
  );
}
