import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { fmt } from '../utils/format';

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{d.name}</div>
      <div className="tooltip-value">{fmt.currency(d.value)}</div>
      <div className="tooltip-pct">{d.payload.pct?.toFixed(1)}% of portfolio</div>
    </div>
  );
};

export function AllocationChart({ holdings }) {
  if (!holdings?.length) return null;

  const total = holdings.reduce((s, h) => s + (h.market_value || 0), 0);
  const data = holdings
    .filter(h => h.market_value > 0)
    .map(h => ({
      name: h.ticker,
      value: h.market_value,
      pct: (h.market_value / total) * 100,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="chart-card">
      <h3 className="chart-title">Allocation</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="legend-list">
        {data.map((d, i) => (
          <div key={d.name} className="legend-item">
            <span className="legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="legend-ticker">{d.name}</span>
            <span className="legend-pct">{d.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GainLossChart({ holdings }) {
  if (!holdings?.length) return null;

  const data = holdings
    .filter(h => h.gain_loss != null)
    .map(h => ({
      ticker: h.ticker,
      'Gain/Loss': parseFloat(h.gain_loss?.toFixed(2)),
      'Return %': parseFloat(h.gain_loss_pct?.toFixed(2)),
    }))
    .sort((a, b) => b['Gain/Loss'] - a['Gain/Loss']);

  return (
    <div className="chart-card">
      <h3 className="chart-title">Gain / Loss by Position</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="ticker" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={v => fmt.compact(v)} />
          <Tooltip
            formatter={(v, name) => [name === 'Gain/Loss' ? fmt.currency(v) : fmt.pct(v), name]}
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
            labelStyle={{ color: 'var(--text)' }}
          />
          <Legend />
          <Bar dataKey="Gain/Loss" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d['Gain/Loss'] >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
