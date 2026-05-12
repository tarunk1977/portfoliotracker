import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart2, Sun } from 'lucide-react';
import { fmt, gainColor } from '../utils/format';

function Card({ icon: Icon, label, value, sub, subColor }) {
  return (
    <div className="summary-card">
      <div className="card-icon"><Icon size={18} /></div>
      <div className="card-body">
        <div className="card-label">{label}</div>
        <div className="card-value">{value}</div>
        {sub && <div className="card-sub" style={{ color: subColor }}>{sub}</div>}
      </div>
    </div>
  );
}

export function SummaryCards({ summary }) {
  if (!summary) return null;
  const { total_value, total_cost, total_gain_loss, total_gain_loss_pct, day_change, count } = summary;
  const isUp = total_gain_loss >= 0;
  const dayUp = day_change >= 0;

  return (
    <div className="summary-grid">
      <Card
        icon={DollarSign}
        label="Portfolio Value"
        value={fmt.currency(total_value)}
        sub={`${count} position${count !== 1 ? 's' : ''}`}
        subColor="var(--muted)"
      />
      <Card
        icon={isUp ? TrendingUp : TrendingDown}
        label="Total Return"
        value={fmt.currency(total_gain_loss)}
        sub={fmt.pct(total_gain_loss_pct)}
        subColor={gainColor(total_gain_loss)}
      />
      <Card
        icon={BarChart2}
        label="Cost Basis"
        value={fmt.currency(total_cost)}
        sub="Total invested"
        subColor="var(--muted)"
      />
      <Card
        icon={Sun}
        label="Today's Change"
        value={fmt.currency(day_change)}
        sub={dayUp ? '▲ Today' : '▼ Today'}
        subColor={gainColor(day_change)}
      />
    </div>
  );
}
