const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  getPortfolio: () => request('/api/portfolio'),
  getPrice: (ticker) => request(`/api/prices/${ticker}`),
  getHistory: (ticker, range) => request(`/api/history/${ticker}?range=${range}`),
  addHolding: (data) => request('/api/holdings', { method: 'POST', body: JSON.stringify(data) }),
  updateHolding: (ticker, data) => request(`/api/holdings/${ticker}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHolding: (ticker) => request(`/api/holdings/${ticker}`, { method: 'DELETE' }),
  getTransactions: (ticker) => request(`/api/transactions${ticker ? `?ticker=${ticker}` : ''}`),
  addTransaction: (data) => request('/api/transactions', { method: 'POST', body: JSON.stringify(data) }),
  importCSV: (file) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/api/import-csv`, { method: 'POST', body: form }).then(r => r.json());
  },
  getAIUsage: () => request('/api/ai/usage'),
};
