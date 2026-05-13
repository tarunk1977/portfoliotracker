import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RefreshCw, TrendingUp, AlertTriangle, PieChart, Search } from 'lucide-react';
import { fmt } from '../utils/format';

const STARTER_PROMPTS = [
  { icon: '📊', label: 'Portfolio health check', prompt: 'Give me a detailed analysis of my current portfolio health. What are the strengths and weaknesses?' },
  { icon: '⚖️', label: 'Should I rebalance?', prompt: 'Based on my current allocation and performance, should I rebalance? What would you suggest?' },
  { icon: '🔍', label: 'What else to invest in?', prompt: 'Based on my current holdings and market trends, what other ETFs or stocks would complement my portfolio well?' },
  { icon: '⚠️', label: 'Risks in my portfolio', prompt: 'What are the biggest risks in my current portfolio? Am I overexposed to any sectors or asset types?' },
  { icon: '💰', label: 'Income analysis', prompt: 'Analyze the dividend/income potential of my portfolio. How can I improve my passive income?' },
  { icon: '📈', label: 'Market trends', prompt: 'What are the key market trends right now that I should be aware of as an investor with my portfolio?' },
];

function buildPortfolioContext(holdings, summary) {
  if (!holdings?.length) return 'No holdings in portfolio yet.';

  const holdingLines = holdings.map(h =>
    `- ${h.ticker} (${h.company_name}): ${fmt.num(h.shares)} shares @ avg cost ${fmt.currency(h.avg_cost)}, current price ${fmt.currency(h.current_price)}, invested ${fmt.currency(h.cost_basis)}, current value ${fmt.currency(h.market_value)}, gain/loss ${fmt.currency(h.gain_loss)} (${fmt.pct(h.gain_loss_pct)}), day change ${fmt.pct(h.day_change_pct)}`
  ).join('\n');

  const totalValue = fmt.currency(summary?.total_value);
  const totalCost = fmt.currency(summary?.total_cost);
  const totalReturn = fmt.currency(summary?.total_gain_loss);
  const totalReturnPct = fmt.pct(summary?.total_gain_loss_pct);
  const dayChange = fmt.currency(summary?.day_change);

  return `PORTFOLIO SUMMARY:
Total Value: ${totalValue}
Total Invested: ${totalCost}
Total Return: ${totalReturn} (${totalReturnPct})
Today's Change: ${dayChange}
Number of Positions: ${holdings.length}

HOLDINGS:
${holdingLines}`;
}

export function AIAdvisor({ holdings, summary }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text) {
    const userMsg = text || input.trim();
    if (!userMsg) return;

    setInput('');
    setError('');
    setLoading(true);

    const portfolioContext = buildPortfolioContext(holdings, summary);

    const systemPrompt = `You are Folio AI, a friendly and knowledgeable investment advisor assistant embedded in a personal portfolio tracker app.

The user has a balanced investing style focused on growth and income.

Here is their LIVE portfolio data as of right now:
${portfolioContext}

Your role:
- Analyze their portfolio honestly — highlight what's working and what isn't
- Give actionable, specific recommendations (not generic advice)
- When suggesting new investments, be specific (actual ticker symbols) and explain why they'd complement the existing portfolio
- Factor in diversification, sector exposure, risk, and income potential
- You can reference current market trends and conditions in your analysis
- Be conversational and friendly, but substantive
- Use bullet points and clear sections for readability
- Always remind the user that this is not professional financial advice and they should do their own research

Important: The user holds mostly dividend ETFs and income-focused stocks (JEPI, JEPQ, SCHD, SCHY, O, MAIN, FXAIX). Keep this context in mind.`;

    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();

      // Extract text from response (handle tool use blocks)
      const textContent = data.content
        ?.filter(block => block.type === 'text')
        ?.map(block => block.text)
        ?.join('\n') || 'Sorry, I could not generate a response.';

      setMessages(prev => [...prev, { role: 'assistant', content: textContent }]);
    } catch (e) {
      setError('Failed to get AI response. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function reset() {
    setMessages([]);
    setError('');
    inputRef.current?.focus();
  }

  // Format assistant message with basic markdown-like rendering
  function formatMessage(text) {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} className="ai-h3">{line.slice(3)}</h3>;
      if (line.startsWith('# ')) return <h2 key={i} className="ai-h2">{line.slice(2)}</h2>;
      if (line.startsWith('**') && line.endsWith('**')) return <strong key={i} className="ai-bold">{line.slice(2, -2)}</strong>;
      if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} className="ai-bullet">• {line.slice(2)}</div>;
      if (line.match(/^\d+\./)) return <div key={i} className="ai-bullet">{line}</div>;
      if (line.trim() === '') return <div key={i} className="ai-spacer" />;
      // Handle inline bold
      const parts = line.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) {
        return <p key={i} className="ai-p">{parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}</p>;
      }
      return <p key={i} className="ai-p">{line}</p>;
    });
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="ai-advisor">
      {/* Header */}
      <div className="ai-header">
        <div className="ai-header-left">
          <Sparkles size={18} className="ai-sparkle" />
          <div>
            <div className="ai-title">Folio AI Advisor</div>
            <div className="ai-subtitle">Powered by Claude · Live portfolio context · Web search enabled</div>
          </div>
        </div>
        {hasMessages && (
          <button className="btn-ghost" onClick={reset} title="Start new conversation">
            <RefreshCw size={14} /> New chat
          </button>
        )}
      </div>

      {/* Disclaimer */}
      <div className="ai-disclaimer">
        <AlertTriangle size={13} />
        AI-generated insights are for informational purposes only and not professional financial advice. Always do your own research.
      </div>

      {/* Messages or starter prompts */}
      <div className="ai-messages">
        {!hasMessages ? (
          <div className="ai-welcome">
            <div className="ai-welcome-icon">✨</div>
            <h3>Ask me anything about your portfolio</h3>
            <p>I have full context of your {holdings?.length || 0} positions and live prices. I can also search the web for current market trends.</p>
            <div className="starter-grid">
              {STARTER_PROMPTS.map((sp, i) => (
                <button key={i} className="starter-btn" onClick={() => sendMessage(sp.prompt)}>
                  <span className="starter-icon">{sp.icon}</span>
                  <span>{sp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`ai-message ${msg.role}`}>
                <div className="ai-message-avatar">
                  {msg.role === 'user' ? '👤' : '✨'}
                </div>
                <div className="ai-message-bubble">
                  {msg.role === 'assistant' ? formatMessage(msg.content) : <p>{msg.content}</p>}
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-message assistant">
                <div className="ai-message-avatar">✨</div>
                <div className="ai-message-bubble ai-thinking">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-label">Analyzing your portfolio{Math.random() > 0.5 ? ' and searching the web' : ''}…</span>
                </div>
              </div>
            )}
          </>
        )}
        {error && <div className="error-banner">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="ai-input-row">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your portfolio, market trends, what to buy next…"
          rows={2}
          disabled={loading}
        />
        <button
          className="ai-send-btn"
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
        >
          {loading ? <RefreshCw size={18} className="spin" /> : <Send size={18} />}
        </button>
      </div>
      <div className="ai-input-hint">Press Enter to send · Shift+Enter for new line</div>
    </div>
  );
}
