import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { fmt, gainColor } from '../utils/format';
import { Sparkline, PriceHistoryModal } from './PriceHistory';

export function HoldingsTable({ holdings }) {
  const [sortField, setSortField] = useState('market_value');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedHolding, setSelectedHolding] = useState(null);

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
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
              <tr
                key={h.ticker}
                onClick={() => setSelectedHolding(h)}
                style={{ cursor: 'pointer' }}
                title="Click to view price history"
              >
                <td><span className="ticker-badge">{h.ticker}</span></td>
                <td className="name-cell">{h.company_name || h.ticker}</td>
                <td className="right mono">{fmt.num(h.shares)}</td>
                <td className="right mono">{fmt.currency(h.avg_cost)}</td>
                <td className="right mono">{fmt.currency(h.current_price)}</td>
                <td>
                  <Sparkline ticker={h.ticker} changePct={h.day_change_pct} />
                </td>
                <td className="right mono" style={{ color: gainColor(h.day_change_pct) }}>
                  {fmt.pct(h.day_change_pct)}
                </td>
                <td className="right mono" style={{ color: '#a78bfa', fontWeight: 500 }}>
                  {fmt.currency(h.cost_basis)}
                </td>
                <td className="right mono">{fmt.currency(h.market_value)}</td>
                <td className="right mono" style={{ color: gainColor(h.gain_loss) }}>
                  {fmt.currency(h.gain_loss)}
                </td>
                <td className="right mono" style={{ color: gainColor(h.gain_loss_pct), fontWeight: 600 }}>
                  {fmt.pct(h.gain_loss_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'right' }}>
        Click any row to view full price history
      </p>

      {selectedHolding && (
        <PriceHistoryModal
          holding={selectedHolding}
          onClose={() => setSelectedHolding(null)}
        />
      )}
    </>
  );
}
