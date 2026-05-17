import React, { useState, useEffect } from 'react';
import { Upload, RefreshCw, TrendingUp, Clock, Sun, Moon } from 'lucide-react';
import { usePortfolio } from './hooks/usePortfolio';
import { SummaryCards } from './components/SummaryCards';
import { HoldingsTable } from './components/HoldingsTable';
import { AllocationChart, GainLossChart } from './components/Charts';
import { PortfolioBeta } from './components/PortfolioBeta';
import { SectorBreakdown } from './components/SectorBreakdown';
import { BestWorstDays } from './components/BestWorstDays';
import { PerformanceCalendar } from './components/PerformanceCalendar';
import { CSVImport } from './components/CSVImport';
import { TransactionsPage } from './components/TransactionsPage';
import { AIAdvisor } from './components/AIAdvisor';
import { LoginPage } from './components/LoginPage';
import './App.css';

export default function App() {
  const { data, loading, error, refresh, lastUpdated } = usePortfolio(60000);
  const [showCSV, setShowCSV] = useState(false);
  const [activeTab, setActiveTab] = useState('holdings');

  // Auth
  const [token, setToken] = useState(() => localStorage.getItem('folio-token'));
  function handleLogout() {
    localStorage.removeItem('folio-token');
    setToken(null);
  }

  // Show login if no token
  if (!token) return <LoginPage onLogin={setToken} />;

  // Theme toggle - persisted to localStorage
  const [theme, setTheme] = useState(() => localStorage.getItem('folio-theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('folio-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const timeStr = lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <TrendingUp size={22} />
            <span>Folio</span>
          </div>
          <div className="header-actions">
            {lastUpdated && (
              <span className="last-updated">
                <Clock size={13} /> {timeStr}
              </span>
            )}
            <button className="btn-ghost" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button className="btn-ghost" onClick={refresh} title="Refresh prices">
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
            <button className="btn-ghost" onClick={handleLogout} title="Sign out" style={{ fontSize: 12 }}>
              Sign out
            </button>
            <button className="btn-secondary" onClick={() => setShowCSV(true)}>
              <Upload size={15} /> Import CSV
            </button>
            <button className="btn-primary" onClick={() => setActiveTab('transactions')}>
              + Log Trade
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {error && (
          <div className="error-banner">
            ⚠ Could not connect to backend: {error}. Make sure the server is running.
          </div>
        )}

        {loading && !data ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading your portfolio…</p>
          </div>
        ) : (
          <>
            <SummaryCards summary={data?.summary} />

            <div className="tabs">
              <button className={`tab ${activeTab === 'holdings' ? 'active' : ''}`} onClick={() => setActiveTab('holdings')}>Holdings</button>
              <button className={`tab ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')}>Charts</button>
              <button className={`tab ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>Transactions</button>
              <button className={`tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
                ✨ AI Advisor
              </button>
            </div>

            <div style={{ display: activeTab === 'holdings' ? 'block' : 'none' }}>
              <HoldingsTable holdings={data?.holdings} />
            </div>

            <div style={{ display: activeTab === 'charts' ? 'block' : 'none' }}>
              <div className="charts-grid">
                <AllocationChart holdings={data?.holdings} />
                <GainLossChart holdings={data?.holdings} />
              </div>
              <div style={{ marginTop: 16 }}>
                <PortfolioBeta />
              </div>
              <div className="charts-grid" style={{ marginTop: 16 }}>
                <SectorBreakdown />
                <BestWorstDays />
              </div>
              <div style={{ marginTop: 16 }}>
                <PerformanceCalendar />
              </div>
            </div>

            <div style={{ display: activeTab === 'transactions' ? 'block' : 'none' }}>
              <TransactionsPage holdings={data?.holdings} onTradeLogged={refresh} />
            </div>

            <div style={{ display: activeTab === 'ai' ? 'block' : 'none' }}>
              <AIAdvisor holdings={data?.holdings} summary={data?.summary} />
            </div>
          </>
        )}
      </main>

      {showCSV && (
        <CSVImport
          onClose={() => setShowCSV(false)}
          onImport={refresh}
        />
      )}
    </div>
  );
}
