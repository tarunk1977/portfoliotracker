import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { api } from '../utils/api';

function betaColor(beta) {
  if (beta === null) return '#7b7f94';
  if (beta < 0.6) return '#22c55e';
  if (beta < 0.9) return '#3b82f6';
  if (beta < 1.1) return '#f59e0b';
  return '#ef4444';
}

function betaLabel(beta) {
  if (beta === null) return 'N/A';
  if (beta < 0.6) return 'Very Defensive';
  if (beta < 0.9) return 'Defensive';
  if (beta < 1.1) return 'Market-like';
  if (beta < 1.3) return 'Moderately Aggressive';
  return 'Aggressive';
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{d.ticker}</div>
      <div className="tooltip-value">β = {d.beta?.toFixed(2) ?? 'N/A'}</div>
      <div className="tooltip-pct">{d.weight}% of portfolio</div>
      <div className="tooltip-pct" style={{ color: betaColor(d.beta) }}>{betaLabel(d.beta)}</div>
    </div>
  );
};

export function PortfolioBeta() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getBeta()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="chart-card" style={{ minHeight: 200 }}>
      <h3 className="chart-title">Portfolio Beta vs S&P 500</h3>
      <div className="loading-state" style={{ padding: '40px 0' }}>
        <div className="spinner" /><p>Calculating beta (this takes ~10 seconds)…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="chart-card">
      <h3 className="chart-title">Portfolio Beta</h3>
      <div className="error-banner">{error}</div>
    </div>
  );

  const pb = data?.portfolio_beta;
  const color = betaColor(pb);
  const chartData = (data?.holdings || [])
    .filter(h => h.beta !== null)
    .sort((a, b) => a.beta - b.beta);

  return (
    <div className="chart-card beta-card">
      <h3 className="chart-title">Portfolio Beta vs S&P 500</h3>

      {/* Big beta number */}
      <div className="beta-hero">
        <div className="beta-number" style={{ color }}>
          β {pb?.toFixed(2) ?? '—'}
        </div>
        <div className="beta-interpretation" style={{ color }}>
          {betaLabel(pb)}
        </div>
        <div className="beta-explanation">
          {pb < 1
            ? `Your portfolio is ${((1 - pb) * 100).toFixed(0)}% less volatile than the S&P 500`
            : `Your portfolio is ${((pb - 1) * 100).toFixed(0)}% more volatile than the S&P 500`}
        </div>
      </div>

      {/* Scale bar */}
      <div className="beta-scale">
        <div className="beta-scale-bar">
          <div className="beta-scale-fill" style={{ left: `${Math.min(Math.max(pb / 2, 0), 1) * 100}%`, background: color }} />
        </div>
        <div className="beta-scale-labels">
          <span>0 (No risk)</span>
          <span>1 (Market)</span>
          <span>2 (High risk)</span>
        </div>
      </div>

      {/* Per-holding beta chart */}
      {chartData.length > 0 && (
        <>
          <div style={{ marginTop: 20, marginBottom: 8, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Beta by Position
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="ticker" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: 'Market (1.0)', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
              <Bar dataKey="beta" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={betaColor(d.beta)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        Calculated using 1-year weekly returns vs SPY. Beta is updated on page load.
      </div>
    </div>
  );
}
