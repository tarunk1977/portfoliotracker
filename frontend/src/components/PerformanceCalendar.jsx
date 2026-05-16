import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { fmt } from '../utils/format';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function heatColor(pct, theme) {
  if (pct == null) return theme === 'light' ? '#e8eaef' : '#1f2233';
  const intensity = Math.min(Math.abs(pct) / 6, 1); // cap at 6% for full color
  if (pct > 0) {
    const g = Math.round(100 + intensity * 97);
    const r = Math.round(20 - intensity * 10);
    const b = Math.round(60 - intensity * 50);
    return `rgb(${r},${g},${b})`;
  } else {
    const r = Math.round(120 + intensity * 119);
    const g = Math.round(20 - intensity * 10);
    const b = Math.round(20 - intensity * 10);
    return `rgb(${r},${g},${b})`;
  }
}

function textColor(pct) {
  if (pct == null) return 'var(--muted)';
  return Math.abs(pct) > 2 ? '#fff' : 'var(--text)';
}

export function PerformanceCalendar() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tooltip, setTooltip] = useState(null);
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';

  useEffect(() => {
    api.getCalendar()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="chart-card">
      <h3 className="chart-title">Monthly Performance Calendar</h3>
      <div className="loading-state" style={{ padding: '40px 0' }}>
        <div className="spinner" /><p>Building your performance calendar…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="chart-card">
      <h3 className="chart-title">Monthly Performance Calendar</h3>
      <div className="error-banner">{error}</div>
    </div>
  );

  const months = data?.months || [];
  if (!months.length) return null;

  // Group by year
  const byYear = {};
  for (const m of months) {
    if (!byYear[m.year]) byYear[m.year] = {};
    byYear[m.year][m.month] = m;
  }
  const years = Object.keys(byYear).sort();

  // Best/worst month
  const sorted = [...months].sort((a, b) => b.avg_pct - a.avg_pct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // Yearly totals
  function yearTotal(year) {
    return Object.values(byYear[year]).reduce((s, m) => s + m.dollar_change, 0);
  }

  return (
    <div className="chart-card perf-calendar-card">
      <h3 className="chart-title">Monthly Performance Calendar</h3>

      {/* Summary chips */}
      <div className="cal-summary">
        <div className="cal-chip">
          <span className="cal-chip-label">🏆 Best Month</span>
          <span className="cal-chip-val" style={{ color: '#22c55e' }}>
            {best ? `${MONTH_NAMES[best.month - 1]} ${best.year} +${best.avg_pct.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="cal-chip">
          <span className="cal-chip-label">📉 Worst Month</span>
          <span className="cal-chip-val" style={{ color: '#ef4444' }}>
            {worst ? `${MONTH_NAMES[worst.month - 1]} ${worst.year} ${worst.avg_pct.toFixed(1)}%` : '—'}
          </span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="cal-wrap">
        {/* Month headers */}
        <div className="cal-grid">
          <div className="cal-year-label" />
          {MONTH_NAMES.map(m => (
            <div key={m} className="cal-month-header">{m}</div>
          ))}
          <div className="cal-ytd-header">YTD</div>
        </div>

        {/* Year rows */}
        {years.map(year => {
          const ytd = yearTotal(year);
          return (
            <div key={year} className="cal-grid">
              <div className="cal-year-label">{year}</div>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                const cell = byYear[year]?.[month];
                const pct = cell?.avg_pct ?? null;
                return (
                  <div
                    key={month}
                    className="cal-cell"
                    style={{
                      background: heatColor(pct, theme),
                      color: textColor(pct),
                    }}
                    onMouseEnter={() => cell && setTooltip({ ...cell, x: month, y: year })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : ''}
                  </div>
                );
              })}
              <div
                className="cal-cell cal-ytd-cell"
                style={{
                  background: heatColor(ytd > 0 ? 3 : -3, theme),
                  color: '#fff',
                }}
              >
                {ytd >= 0 ? '+' : ''}{fmt.compact(ytd)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="cal-tooltip">
          <strong>{MONTH_NAMES[tooltip.month - 1]} {tooltip.year}</strong>
          <span style={{ color: tooltip.avg_pct >= 0 ? '#22c55e' : '#ef4444' }}>
            {tooltip.avg_pct >= 0 ? '+' : ''}{tooltip.avg_pct.toFixed(2)}% avg
          </span>
          <span>{tooltip.dollar_change >= 0 ? '+' : ''}{fmt.currency(tooltip.dollar_change)}</span>
        </div>
      )}

      {/* Legend */}
      <div className="cal-legend">
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>Worse</span>
        {[-5, -3, -1, 0, 1, 3, 5].map(v => (
          <div key={v} className="cal-legend-cell" style={{ background: heatColor(v, theme) }} />
        ))}
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>Better</span>
      </div>
    </div>
  );
}
