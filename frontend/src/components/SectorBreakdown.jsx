import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../utils/api';
import { fmt } from '../utils/format';

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{d.sector}</div>
      <div className="tooltip-value">{fmt.currency(d.value)}</div>
      <div className="tooltip-pct">{d.pct}% of portfolio</div>
      <div className="tooltip-pct" style={{ color: 'var(--muted)', marginTop: 4 }}>
        {d.holdings.map(h => h.ticker).join(', ')}
      </div>
    </div>
  );
};

export function SectorBreakdown() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.getSectors()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="chart-card">
      <h3 className="chart-title">Sector Breakdown</h3>
      <div className="loading-state" style={{ padding: '40px 0' }}>
        <div className="spinner" /><p>Fetching sector data…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="chart-card">
      <h3 className="chart-title">Sector Breakdown</h3>
      <div className="error-banner">{error}</div>
    </div>
  );

  const sectors = data?.sectors || [];

  return (
    <div className="chart-card">
      <h3 className="chart-title">Sector Breakdown</h3>

      <div className="sector-layout">
        {/* Pie chart */}
        <ResponsiveContainer width="50%" height={220}>
          <PieChart>
            <Pie
              data={sectors}
              dataKey="value"
              nameKey="sector"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
            >
              {sectors.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Sector list */}
        <div className="sector-list">
          {sectors.map((s, i) => (
            <div key={s.sector}>
              <div
                className={`sector-row ${expanded === s.sector ? 'expanded' : ''}`}
                onClick={() => setExpanded(expanded === s.sector ? null : s.sector)}
              >
                <div className="sector-row-left">
                  <span className="sector-dot" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="sector-name">{s.sector}</span>
                </div>
                <div className="sector-row-right">
                  <span className="sector-pct">{s.pct}%</span>
                  <span className="sector-value">{fmt.currency(s.value)}</span>
                </div>
              </div>
              {/* Expanded holdings */}
              {expanded === s.sector && (
                <div className="sector-holdings">
                  {s.holdings.map(h => (
                    <div key={h.ticker} className="sector-holding-row">
                      <span className="ticker-badge" style={{ fontSize: 10, padding: '1px 6px' }}>{h.ticker}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>{h.industry}</span>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 12, marginLeft: 'auto' }}>{fmt.currency(h.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
