import React, { useState, useEffect, useCallback } from 'react';
import { X, TrendingUp, TrendingDown, Loader } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, CartesianGrid } from 'recharts';
import { api } from '../utils/api';
import { fmt, gainColor } from '../utils/format';

const RANGES = ['1W', '1M', '3M', '6M', 'YTD', '1Y'];

// ── Sparkline (inline mini chart in table) ────────────────────────────────────
export function Sparkline({ ticker, changePct }) {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getHistory(ticker, '1M').then(data => {
      if (!cancelled) {
        setPoints(data.points || []);
        setLoading(false);
      }
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading) return <div className="sparkline-loading"><Loader size={10} className="spin" /></div>;
  if (!points.length) return null;

  const isUp = (changePct ?? 0) >= 0;
  const color = isUp ? '#22c55e' : '#ef4444';
  const min = Math.min(...points.map(p => p.price));
  const max = Math.max(...points.map(p => p.price));

  return (
    <div className="sparkline-wrap">
      <ResponsiveContainer width={80} height={32}>
        <LineChart data={points}>
          <Line
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <YAxis domain={[min * 0.998, max * 1.002]} hide />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Full Price History Modal ───────────────────────────────────────────────────
function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      <div className="tooltip-value">{fmt.currency(payload[0]?.value)}</div>
    </div>
  );
}

export function PriceHistoryModal({ holding, onClose }) {
  const [range, setRange] = useState('3M');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getHistory(holding.ticker, range);
      setData(result);
    } catch (e) {
      setError('Could not load price history.');
    } finally {
      setLoading(false);
    }
  }, [holding.ticker, range]);

  useEffect(() => { load(); }, [load]);

  const isUp = (data?.change_pct ?? 0) >= 0;
  const color = isUp ? '#22c55e' : '#ef4444';

  // Format x-axis labels based on range
  function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (range === '1W') return d.toLocaleDateString('en-CA', { weekday: 'short' });
    if (range === '1M') return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  // Thin out x-axis ticks to avoid crowding
  function getTicks(points) {
    if (!points?.length) return [];
    const step = Math.ceil(points.length / 6);
    return points.filter((_, i) => i % step === 0 || i === points.length - 1).map(p => p.date);
  }

  const avgCostLine = holding.avg_cost;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal history-modal">
        {/* Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ticker-badge">{holding.ticker}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{holding.company_name}</span>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 16, alignItems: 'baseline' }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{fmt.currency(holding.current_price)}</span>
              {data?.change_pct != null && (
                <span style={{ color, fontSize: 14, fontWeight: 500 }}>
                  {isUp ? '▲' : '▼'} {fmt.pct(Math.abs(data.change_pct))} ({range})
                </span>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Range selector */}
        <div className="range-tabs">
          {RANGES.map(r => (
            <button
              key={r}
              className={`range-tab ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >{r}</button>
          ))}
        </div>

        {/* Chart */}
        <div className="history-chart-wrap">
          {loading ? (
            <div className="loading-state" style={{ minHeight: 240 }}>
              <div className="spinner" /><p>Loading price history…</p>
            </div>
          ) : error ? (
            <div className="error-banner">{error}</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data?.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={getTicks(data?.points)}
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  tickFormatter={v => `$${v.toFixed(0)}`}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<PriceTooltip />} />
                {/* Avg cost reference line */}
                <ReferenceLine
                  y={avgCostLine}
                  stroke="#a78bfa"
                  strokeDasharray="4 3"
                  label={{ value: `Avg $${avgCostLine?.toFixed(2)}`, fill: '#a78bfa', fontSize: 11, position: 'insideTopRight' }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={color}
                  strokeWidth={2}
                  fill="url(#priceGrad)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stats row */}
        {data && !loading && (
          <div className="history-stats">
            <div className="history-stat">
              <span className="usage-label">Start Price</span>
              <span className="usage-value">{fmt.currency(data.start_price)}</span>
            </div>
            <div className="history-stat">
              <span className="usage-label">Current Price</span>
              <span className="usage-value">{fmt.currency(data.end_price)}</span>
            </div>
            <div className="history-stat">
              <span className="usage-label">Your Avg Cost</span>
              <span className="usage-value" style={{ color: '#a78bfa' }}>{fmt.currency(holding.avg_cost)}</span>
            </div>
            <div className="history-stat">
              <span className="usage-label">{range} Return</span>
              <span className="usage-value" style={{ color }}>{fmt.pct(data.change_pct)}</span>
            </div>
            <div className="history-stat">
              <span className="usage-label">Your Return</span>
              <span className="usage-value" style={{ color: gainColor(holding.gain_loss_pct) }}>
                {fmt.pct(holding.gain_loss_pct)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
