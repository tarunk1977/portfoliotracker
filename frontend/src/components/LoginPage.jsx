import React, { useState } from 'react';
import { TrendingUp, Lock, Eye, EyeOff } from 'lucide-react';

export function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');

    try {
      const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const res = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('folio-token', data.token);
      onLogin(data.token);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <TrendingUp size={28} />
          <span>Folio</span>
        </div>
        <p className="login-subtitle">Your personal portfolio tracker</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field-group">
            <label>Password</label>
            <div className="password-row">
              <input
                className="input"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
              />
              <button type="button" className="btn-ghost" onClick={() => setShow(s => !s)}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}

          <button type="submit" className="btn-primary login-btn" disabled={loading || !password}>
            <Lock size={15} />
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-hint">
          Secured with JWT · Session lasts 7 days
        </p>
      </div>
    </div>
  );
}
