import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

export function usePortfolio(refreshInterval = 60000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getPortfolio();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!refreshInterval) { setLoading(false); return; } // disabled
    load();
    const interval = setInterval(load, refreshInterval);
    return () => clearInterval(interval);
  }, [load, refreshInterval]);

  return { data, loading, error, refresh: load, lastUpdated };
}
