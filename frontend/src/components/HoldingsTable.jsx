import React, { useState } from 'react';
import { Trash2, Edit2, ChevronUp, ChevronDown } from 'lucide-react';
import { fmt, gainColor } from '../utils/format';

export function HoldingsTable({ holdings, onDelete, onEdit }) {
  const [sortField, setSortField] = useState('market_value');
  const [sortDir, setSortDir] = useState('desc');

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
        <p>No holdings yet. Add your first position above or import a CSV.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="holdings-table">
        <thead>
          <tr>
            <Th field="ticker">Ticker</Th>
            <Th field="company_name">Name</Th>
            <Th field="shares" right>Shares</Th>
            <Th field="avg_cost" right>Avg Cost</Th>
            <Th field="current_price" right>Price</Th>
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
            <tr key={h.ticker}>
              <td><span className="ticker-badge">{h.ticker}</span></td>
              <td className="name-cell">{h.company_name || h.ticker}</td>
              <td className="right mono">{fmt.num(h.shares)}</td>
              <td className="right mono">{fmt.currency(h.avg_cost)}</td>
              <td className="right mono">{fmt.currency(h.current_price)}</td>
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
              <td className="actions-cell">
                <button className="icon-btn" onClick={() => onEdit(h)} title="Edit">
                  <Edit2 size={14} />
                </button>
                <button className="icon-btn danger" onClick={() => onDelete(h.ticker)} title="Remove">
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
