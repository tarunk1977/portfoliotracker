import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../utils/api';
import { fmt } from '../utils/format';

function DayRow({ item, type }) {
  const isGood = type === 'best';
  const color = isGood ? '#22c55e' : '#ef4444';
  return (
    <div className="day-row">
      <div className="day-row-left">
        <span className="ticker-badge">{item.ticker}</span>
        <span className="day-date">{new Date(item.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
      <div className="day-row-right">
        <span className="day-pct" style={{ color }}>{isGood ? '+' : ''}{item.change_pct?.toFixed(2)}%</span>
        <span className="day-dollar" style={{ color }}>{item.dollar_change >= 0 ? '+' : ''}{fmt.currency(item.dollar_change)}</span>
      </div>
    </div>
  );
}

function PortfolioDayRow({ item, type }) {
  const isGood = type === 'best';
  const color = isGood ? '#22c55e' : '#ef4444';
  return (
    <div className="day-row">
      <div className="day-row-left">
        <span className="day-date">{new Date(item.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
      <div className="day-row-right">
        <span className="day-dollar" style={{ color, fontWeight: 600 }}>
          {item.dollar_change >= 0 ? '+' : ''}{fmt.currency(item.dollar_change)}
        </span>
      </div>
    </div>
  );
}

export function BestWorstDays() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('positions'); // 'positions' | 'portfolio'

  useEffect(() => {
    api.getBestWorst()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="chart-card">
      <h3 className="chart-title">Best & Worst Days (Last 12 Months)</h3>
      <div className="loading-state" style={{ padding: '40px 0' }}>
        <div className="spinner" /><p>Analyzing price history…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="chart-card">
      <h3 className="chart-title">Best & Worst Days</h3>
      <div className="error-banner">{error}</div>
    </div>
  );

  return (
    <div className="chart-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 className="chart-title" style={{ margin: 0 }}>Best & Worst Days — Last 12 Months</h3>
        <div className="type-toggle" style={{ padding: '2px' }}>
          <button className={`type-btn ${view === 'positions' ? 'active buy' : ''}`} onClick={() => setView('positions')} style={{ padding: '5px 12px', fontSize: 11 }}>Per Position</button>
          <button className={`type-btn ${view === 'portfolio' ? 'active buy' : ''}`} onClick={() => setView('portfolio')} style={{ padding: '5px 12px', fontSize: 11 }}>Portfolio</button>
        </div>
      </div>

      {view === 'positions' ? (
        <div className="bestworst-grid">
          <div className="bestworst-col">
            <div className="bestworst-header best">
              <TrendingUp size={14} /> Top 10 Best Days
            </div>
            {data?.best_days?.map((d, i) => <DayRow key={i} item={d} type="best" />)}
          </div>
          <div className="bestworst-col">
            <div className="bestworst-header worst">
              <TrendingDown size={14} /> Top 10 Worst Days
            </div>
            {data?.worst_days?.map((d, i) => <DayRow key={i} item={d} type="worst" />)}
          </div>
        </div>
      ) : (
        <div className="bestworst-grid">
          <div className="bestworst-col">
            <div className="bestworst-header best">
              <TrendingUp size={14} /> Best Portfolio Days
            </div>
            {data?.best_portfolio_days?.map((d, i) => <PortfolioDayRow key={i} item={d} type="best" />)}
          </div>
          <div className="bestworst-col">
            <div className="bestworst-header worst">
              <TrendingDown size={14} /> Worst Portfolio Days
            </div>
            {data?.worst_portfolio_days?.map((d, i) => <PortfolioDayRow key={i} item={d} type="worst" />)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
        Based on your current share count × daily price movement over the last 12 months.
      </div>
    </div>
  );
}
