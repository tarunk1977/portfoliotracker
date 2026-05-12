export const fmt = {
  currency: (v, decimals = 2) =>
    v == null ? '—' : new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(v),

  pct: (v, decimals = 2) =>
    v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`,

  num: (v, decimals = 4) =>
    v == null ? '—' : parseFloat(v).toLocaleString('en-US', {
      minimumFractionDigits: 0, maximumFractionDigits: decimals,
    }),

  compact: (v) =>
    v == null ? '—' : new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      notation: 'compact', maximumFractionDigits: 1,
    }).format(v),
};

export const gainColor = (v) => {
  if (v == null) return '#888';
  return v >= 0 ? '#22c55e' : '#ef4444';
};
