import { useState, useRef, useEffect } from 'react';
import BrandLogo from './grouped-logo.svg?react';
import {
  Button,
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Content,
  Grid,
  Column,
  Theme,
  TextInput,
  PasswordInput,
  TextArea,
  InlineNotification,
  Tag,
  Loading,
  ClickableTile,
} from '@carbon/react';
import SignupWizard from './SignupWizard';
import {
  createAccount,
  login,
  logout,
  getSession,
  getAccountByUsername,
  hasAnyAccount,
  saveSessions,
  loadSessions,
} from './auth.js';

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildGreeting(profile) {
  const goalMap = {
    retirement: 'retirement', home: 'buying a home', education: 'education',
    wealth: 'wealth growth', short_term: 'short-term goals', long_term: 'long-term goals',
  };
  const goals = profile.goals.map((g) => goalMap[g] || g).join(', ');
  return `Welcome back! I've built your profile — focus: ${goals || 'general'}, risk appetite: ${profile.risk}, horizon: ${profile.horizon}. What would you like to explore first?`;
}

const GOAL_LABELS = {
  retirement: 'Retirement', home: 'Home', education: 'Education',
  wealth: 'Wealth', short_term: 'Short-term', long_term: 'Long-term',
};
const SENDER_LABEL = { system: 'Gumdrop', bot: 'Gumdrop', user: 'You' };

// ── Account Signup ─────────────────────────────────────────────────────────────
function AccountSignup({ investorProfile, onComplete, onSkip, isGuest }) {
  const [form, setForm]     = useState({ username: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);

  const patch = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.username.trim())         e.username = 'Username is required.';
    else if (form.username.length < 3) e.username = 'Username must be at least 3 characters.';
    if (form.password.length < 6)      e.password = 'Password must be at least 6 characters.';
    if (form.password !== form.confirm) e.confirm  = 'Passwords do not match.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    const result = await createAccount(form.username.trim(), form.password, investorProfile);
    setBusy(false);
    if (!result.ok) { setErrors({ username: result.error }); return; }
    setDone(true);
    setTimeout(() => onComplete(form.username.trim()), 1000);
  };

  return (
    <div className="wizard-page">
      <div className="wizard-card">
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: '100%' }} />
        </div>
        <div className="wizard-inner">
          <div className="acct-badge">{isGuest ? 'Save your work' : 'Almost there!'}</div>
          <h2 className="wizard-heading">Create your account</h2>
          <p className="wizard-sub">
            {isGuest
              ? 'Your profile is ready — create an account to save it. Without one your data will be lost when you close the tab.'
              : 'Pick a username and password to save your profile locally. No email needed.'}
          </p>

          {done ? (
            <div className="acct-success">
              <span className="acct-success-icon">✓</span>
              <p>Account created! Taking you to your dashboard…</p>
            </div>
          ) : (
            <form className="auth-fields" onSubmit={handleSubmit} noValidate>
              <TextInput
                id="acct-username"
                labelText="Username"
                placeholder="e.g. jsmith"
                autoComplete="username"
                value={form.username}
                onChange={(e) => patch('username', e.target.value)}
                invalid={!!errors.username}
                invalidText={errors.username}
              />
              <PasswordInput
                id="acct-password"
                labelText="Password"
                placeholder="At least 6 characters"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => patch('password', e.target.value)}
                invalid={!!errors.password}
                invalidText={errors.password}
              />
              <PasswordInput
                id="acct-confirm"
                labelText="Confirm password"
                placeholder="Repeat password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => patch('confirm', e.target.value)}
                invalid={!!errors.confirm}
                invalidText={errors.confirm}
              />
              <Button type="submit" kind="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Create account'}
              </Button>
            </form>
          )}
        </div>
        <div className="wizard-footer">
          <Button kind="ghost" onClick={onSkip}>Skip for now</Button>
          <span className="acct-skip-hint">You can always sign up later.</span>
        </div>
      </div>
    </div>
  );
}

// ── Login Form ─────────────────────────────────────────────────────────────────
function LoginForm({ onLogin, onCreateNew, onGuest, onGoHome }) {
  const [form, setForm]   = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  const patch = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Please enter your username and password.');
      return;
    }
    setBusy(true);
    const result = await login(form.username.trim(), form.password);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    onLogin(result.account);
  };

  return (
    <div className="wizard-page">
      <div className="wizard-card">
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: '100%' }} />
        </div>
        <div className="wizard-inner">
          <div className="acct-badge">Welcome back</div>
          <h2 className="wizard-heading">Sign in</h2>
          <p className="wizard-sub">Enter your Candyland Bank username and password.</p>

          {error && (
            <InlineNotification
              kind="error"
              title="Sign-in failed"
              subtitle={error}
              lowContrast
              hideCloseButton
            />
          )}

          <form className="auth-fields" onSubmit={handleSubmit} noValidate>
            <TextInput
              id="login-username"
              labelText="Username"
              placeholder="Your username"
              autoComplete="username"
              value={form.username}
              onChange={(e) => patch('username', e.target.value)}
            />
            <PasswordInput
              id="login-password"
              labelText="Password"
              placeholder="Your password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => patch('password', e.target.value)}
            />
            <Button type="submit" kind="primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
        <div className="wizard-footer">
          <Button kind="ghost" onClick={onCreateNew}>Create new account</Button>
          <Button kind="tertiary" onClick={onGuest}>Continue as guest</Button>
        </div>
      </div>
    </div>
  );
}

// ── Home Page ──────────────────────────────────────────────────────────────────
function HomePage({ onGetStarted, isLoggedIn, onGoToChat, onSignIn, username }) {
  const ctaLabel  = isLoggedIn ? 'Go to Dashboard' : 'Build my profile';
  const ctaAction = isLoggedIn ? onGoToChat : onGetStarted;

  return (
    <div className="home-main">
      {/* ── Hero ── */}
      <section className="home-hero">
        <Grid>
          <Column sm={4} md={8} lg={16} className="home-hero-inner">
            <h1 className="home-hero-heading">
              <BrandLogo className="hero-brand-logo" aria-label="Candyland Bank × IBM" />
            </h1>
            <div className="home-hero-actions">
              <Button kind="primary" size="lg" onClick={ctaAction} style={{ justifyContent: 'center', textAlign: 'center', minWidth: '16rem', paddingRight: '1rem', paddingLeft: '1rem' }}>
                {ctaLabel}
              </Button>
              {!isLoggedIn && (
                <Button kind="tertiary" size="lg" onClick={onSignIn}>
                  Sign in
                </Button>
              )}
            </div>
            <p className="home-hero-sub">
              {isLoggedIn
                ? `Welcome back${username ? `, ${username}` : ''}.`
                : 'Build a tailored investment profile in minutes. Get AI-powered guidance, personalised strategies, and stay on track — all in one place.'}
            </p>
          </Column>
        </Grid>
      </section>

      {/* ── Features ── */}
      <section className="home-section" id="features">
        <Grid>
          <Column sm={4} md={8} lg={16}>
            <h2 className="home-section-heading">Everything you need to invest smarter</h2>
            <p className="home-section-sub">
              Candyland Bank brings together your goals, risk appetite, and financial profile to give you guidance that actually fits your life.
            </p>
          </Column>
          <Column sm={4} md={8} lg={16}>
            <div className="home-features-grid">
              {[
                { icon: '🎯', title: 'Goal-based planning',    desc: "Whether you're saving for retirement, a home, or education — we tailor every recommendation to your specific goals." },
                { icon: '🤖', title: 'AI chat assistant',      desc: 'Ask anything about your investments. Your assistant knows your profile and gives contextual, personalised answers.' },
                { icon: '📊', title: 'Risk-matched strategies', desc: 'From conservative to aggressive, your strategy is built around your risk tolerance and time horizon.' },
                { icon: '🔒', title: 'Secure & private',        desc: 'Your financial data never leaves your session. No account required to get started.' },
                { icon: '⚡', title: 'Instant profile',         desc: 'Answer 7 quick questions and get a complete investor profile with personalised insights straight away.' },
                { icon: '📈', title: 'Track your horizon',      desc: 'Short-term or long-term, we keep you focused on what matters most for your timeline.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="home-feature-card">
                  <span className="home-feature-icon">{icon}</span>
                  <h3 className="home-feature-title">{title}</h3>
                  <p className="home-feature-desc">{desc}</p>
                </div>
              ))}
            </div>
          </Column>
        </Grid>
      </section>

      {/* ── How it works ── */}
      <section className="home-section home-section--tinted" id="how-it-works">
        <Grid>
          <Column sm={4} md={8} lg={16}>
            <h2 className="home-section-heading">Up and running in three steps</h2>
          </Column>
          <Column sm={4} md={8} lg={16}>
            <div className="home-steps">
              {[
                { n: '1', title: 'Build your profile',       desc: 'Tell us your goals, risk appetite, age, and income in a quick 12-step wizard.' },
                { n: '2', title: 'Get your strategy',        desc: 'We generate a personalised investor profile tailored to your answers.' },
                { n: '3', title: 'Chat with your assistant', desc: 'Ask questions, explore strategies, and get real-time guidance from your AI advisor.' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="home-step">
                  <div className="home-step-number">{n}</div>
                  <h3 className="home-step-title">{title}</h3>
                  <p className="home-step-desc">{desc}</p>
                </div>
              ))}
            </div>
          </Column>
        </Grid>
      </section>

      {/* ── Contact ── */}
      <section className="home-section" id="contact">
        <Grid>
          <Column sm={4} md={8} lg={16}>
            <h2 className="home-section-heading">Need help? We're here.</h2>
            <p className="home-section-sub">
              Our support team is available Monday – Friday, 9am – 6pm. Reach out and we'll get back to you within one business day.
            </p>
          </Column>
          <Column sm={4} md={8} lg={16}>
            <div className="contact-cards">
              <div className="contact-card">
                <span className="contact-card-icon">✉️</span>
                <h3 className="contact-card-title">Email support</h3>
                <p className="contact-card-desc">For general enquiries and account questions.</p>
                <a className="contact-link" href="mailto:support@candylandbank.com">support@candylandbank.com</a>
              </div>
              <div className="contact-card">
                <span className="contact-card-icon">💬</span>
                <h3 className="contact-card-title">Live chat</h3>
                <p className="contact-card-desc">Chat with your AI assistant directly inside the app.</p>
                <Button kind="ghost" onClick={ctaAction}>Open the app</Button>
              </div>
              <div className="contact-card">
                <span className="contact-card-icon">📞</span>
                <h3 className="contact-card-title">Phone</h3>
                <p className="contact-card-desc">Speak to a real person for urgent matters.</p>
                <a className="contact-link" href="tel:+18005550100">+1 800 555 0100</a>
              </div>
            </div>
          </Column>
        </Grid>
      </section>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <Grid>
          <Column sm={4} md={8} lg={16}>
            <p>© {new Date().getFullYear()} Candyland Bank. All rights reserved.</p>
          </Column>
        </Grid>
      </footer>
    </div>
  );
}

// ── Dashboard panels ───────────────────────────────────────────────────────────
function PanelAssets() {
  const items = [
    { name: 'US Equity ETF',        ticker: 'VTI',  value: '$12,450.00', change: '+2.4%',  up: true  },
    { name: 'International ETF',    ticker: 'VXUS', value: '$4,820.00',  change: '+0.8%',  up: true  },
    { name: 'Bond Fund',            ticker: 'BND',  value: '$6,100.00',  change: '-0.3%',  up: false },
    { name: 'Real Estate REIT',     ticker: 'VNQ',  value: '$2,310.00',  change: '+1.1%',  up: true  },
    { name: 'Cash & Equivalents',   ticker: 'VMFXX',value: '$3,050.00',  change: '0.0%',   up: true  },
  ];
  return (
    <div className="db-panel">
      <h2 className="db-panel-heading">Assets</h2>
      <p className="db-panel-sub">Overview of your current holdings.</p>
      <div className="db-table-wrap">
        <table className="db-table">
          <thead><tr><th>Name</th><th>Ticker</th><th>Value</th><th>Change</th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.ticker}>
                <td>{r.name}</td>
                <td><span className="db-ticker">{r.ticker}</span></td>
                <td>{r.value}</td>
                <td className={r.up ? 'db-up' : 'db-down'}>{r.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelSpending() {
  const items = [
    { date: 'Jun 28', desc: 'Grocery Store',      amount: '-$84.32',  type: 'debit'  },
    { date: 'Jun 27', desc: 'Netflix',             amount: '-$15.99',  type: 'credit' },
    { date: 'Jun 26', desc: 'Salary Deposit',      amount: '+$3,200.00', type: 'debit' },
    { date: 'Jun 25', desc: 'Electricity Bill',    amount: '-$112.00', type: 'debit'  },
    { date: 'Jun 24', desc: 'Amazon Purchase',     amount: '-$47.60',  type: 'credit' },
    { date: 'Jun 23', desc: 'Coffee Shop',         amount: '-$6.40',   type: 'debit'  },
    { date: 'Jun 22', desc: 'Gym Membership',      amount: '-$40.00',  type: 'credit' },
    { date: 'Jun 21', desc: 'ATM Withdrawal',      amount: '-$200.00', type: 'debit'  },
  ];
  return (
    <div className="db-panel">
      <h2 className="db-panel-heading">Spending History</h2>
      <p className="db-panel-sub">Recent transactions from your debit and credit cards.</p>
      <div className="db-table-wrap">
        <table className="db-table">
          <thead><tr><th>Date</th><th>Description</th><th>Card</th><th>Amount</th></tr></thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td>
                <td>{r.desc}</td>
                <td><span className={`db-badge db-badge--${r.type}`}>{r.type}</span></td>
                <td className={r.amount.startsWith('+') ? 'db-up' : 'db-down'}>{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelPortfolio({ profile }) {
  const RISK_DESC   = { conservative: 'Low risk, stable returns', moderate: 'Balanced growth & safety', aggressive: 'High risk, high reward' };
  const HORIZON_DESC = { short: 'Under 3 years', medium: '3 – 10 years', long: '10+ years' };
  const goals = (profile?.goals ?? []).map((g) => GOAL_LABELS[g] ?? g);

  const rows = [
    { label: 'Goals',            value: goals.length ? goals.join(', ') : 'None set' },
    { label: 'Risk appetite',    value: profile?.risk ? `${profile.risk} — ${RISK_DESC[profile.risk] ?? ''}` : 'Not set' },
    { label: 'Time horizon',     value: profile?.horizon ? `${profile.horizon} — ${HORIZON_DESC[profile.horizon] ?? ''}` : 'Not set' },
    { label: 'Annual income',    value: profile?.annualIncome ? `$${Number(profile.annualIncome).toLocaleString()}` : 'Not set' },
    { label: 'Monthly savings',  value: profile?.monthlySavings ? `$${Number(profile.monthlySavings).toLocaleString()}` : 'Not set' },
    { label: 'Emergency fund',   value: profile?.emergencyFund ?? 'Not set' },
    { label: 'Employment',       value: profile?.employmentStatus ?? 'Not set' },
    { label: 'Marital status',   value: profile?.maritalStatus ?? 'Not set' },
    { label: 'Credit score',     value: profile?.creditScore ?? 'Not set' },
    { label: 'Location',         value: profile?.city && profile?.usState ? `${profile.city}, ${profile.usState}` : profile?.usState ?? 'Not set' },
    { label: 'Veteran status',   value: profile?.veteranStatus ?? 'Not set' },
    { label: 'Preferences',      value: (profile?.preferences ?? []).join(', ') || 'None' },
  ];

  return (
    <div className="db-panel">
      <h2 className="db-panel-heading">Portfolio Breakdown</h2>
      <p className="db-panel-sub">Your full investor profile from the questionnaire.</p>
      <div className="db-kv-grid">
        {rows.map(({ label, value }) => (
          <div key={label} className="db-kv-row">
            <span className="db-kv-label">{label}</span>
            <span className="db-kv-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelTrades() {
  const items = [
    { date: 'Jun 28', action: 'Buy',  ticker: 'VTI',  qty: 5,   price: '$225.40', total: '$1,127.00' },
    { date: 'Jun 25', action: 'Sell', ticker: 'AAPL', qty: 2,   price: '$189.20', total: '$378.40'   },
    { date: 'Jun 20', action: 'Buy',  ticker: 'BND',  qty: 10,  price: '$73.15',  total: '$731.50'   },
    { date: 'Jun 15', action: 'Buy',  ticker: 'VXUS', qty: 8,   price: '$57.80',  total: '$462.40'   },
    { date: 'Jun 10', action: 'Sell', ticker: 'TSLA', qty: 1,   price: '$245.00', total: '$245.00'   },
    { date: 'Jun 05', action: 'Buy',  ticker: 'VNQ',  qty: 4,   price: '$82.30',  total: '$329.20'   },
  ];
  return (
    <div className="db-panel">
      <h2 className="db-panel-heading">Trade History</h2>
      <p className="db-panel-sub">Recent stock trades on your account.</p>
      <div className="db-table-wrap">
        <table className="db-table">
          <thead><tr><th>Date</th><th>Action</th><th>Ticker</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td>
                <td><span className={`db-badge db-badge--${r.action.toLowerCase()}`}>{r.action}</span></td>
                <td><span className="db-ticker">{r.ticker}</span></td>
                <td>{r.qty}</td>
                <td>{r.price}</td>
                <td>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
function DashboardPage({ profile, username }) {
  const [activePanel, setActivePanel] = useState('portfolio');
  const [menuOpen, setMenuOpen]       = useState(false);

  const NAV = [
    { id: 'assets',    label: 'Assets',           icon: '💼' },
    { id: 'spending',  label: 'Spending History',  icon: '💳' },
    { id: 'portfolio', label: 'Portfolio Breakdown', icon: '📊' },
    { id: 'trades',    label: 'Trade History',     icon: '📈' },
  ];

  const activeLabel = NAV.find((n) => n.id === activePanel)?.label;

  return (
    <div className="db-layout">
      {/* ── Left sidebar ── */}
      <aside className="db-sidebar">
        <p className="db-sidebar-greeting">Welcome{username ? `, ${username}` : ''}.</p>

        {/* Mobile dropdown toggle */}
        <button className="db-menu-toggle" onClick={() => setMenuOpen((o) => !o)}>
          <span>{activeLabel}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path d={menuOpen ? 'M2 11L8 5L14 11' : 'M2 5L8 11L14 5'} stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <nav className={`db-nav${menuOpen ? ' db-nav--open' : ''}`}>
          {NAV.map(({ id, label, icon }) => (
            <button
              key={id}
              className={`db-nav-item${activePanel === id ? ' db-nav-item--active' : ''}`}
              onClick={() => { setActivePanel(id); setMenuOpen(false); }}
            >
              <span className="db-nav-icon">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main className="db-content">
        {activePanel === 'assets'    && <PanelAssets />}
        {activePanel === 'spending'  && <PanelSpending />}
        {activePanel === 'portfolio' && <PanelPortfolio profile={profile} />}
        {activePanel === 'trades'    && <PanelTrades />}
      </main>
    </div>
  );
}

// ── Floating Gumdrop chat widget ───────────────────────────────────────────────
function FloatingChat({ profile }) {
  const [open, setOpen]     = useState(false);
  const [messages, setMsgs] = useState([{ sender: 'bot', text: 'Hi! Ask me anything about your investments.' }]);
  const [draft, setDraft]   = useState('');
  const [loading, setLoad]  = useState(false);
  const bottomRef           = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const trimmed = draft.trim();
    if (!trimmed || loading) return;
    const next = [...messages, { sender: 'user', text: trimmed }, { sender: 'bot', text: '', pending: true }];
    setMsgs(next);
    setDraft('');
    setLoad(true);
    try {
      const res  = await fetch(`${PROXY_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: trimmed, profile, messages: messages.slice(-6) }),
      });
      const data  = await res.json();
      const reply = res.ok ? (data.reply || 'No response.') : (data.error || 'Something went wrong.');
      setMsgs((prev) => prev.map((m) => m.pending ? { sender: 'bot', text: reply } : m));
    } catch {
      setMsgs((prev) => prev.map((m) => m.pending ? { sender: 'bot', text: 'Could not reach the server.' } : m));
    } finally {
      setLoad(false);
    }
  };

  return (
    <div className="fc-wrap">
      {open && (
        <div className="fc-window">
          <div className="fc-header">
            <span className="fc-title">Gumdrop</span>
            <button className="fc-close" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>
          <div className="fc-messages">
            {messages.map((m, i) => (
              <div key={i} className={`fc-msg fc-msg--${m.sender}`}>
                {m.pending ? <span className="fc-dots"><span/><span/><span/></span> : m.text}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="fc-input-row">
            <input
              className="fc-input"
              placeholder="Ask anything…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={loading}
            />
            <button className="fc-send" onClick={send} disabled={loading || !draft.trim()} aria-label="Send">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M2 10L18 2L12 10L18 18L2 10Z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
      )}
      <button className="fc-fab" onClick={() => setOpen((o) => !o)} aria-label="Open Gumdrop chat">
        <svg viewBox="0 0 32 32" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M28 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6l6 4 6-4h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
          <circle cx="16" cy="14" r="1.5" fill="currentColor"/>
          <circle cx="22" cy="14" r="1.5" fill="currentColor"/>
        </svg>
      </button>
    </div>
  );
}

// ── Chat view ──────────────────────────────────────────────────────────────────
const PROXY_URL = '';  // relative URLs — Vite proxies to localhost:3001 in dev, CF Functions in prod

const SUGGESTED_PROMPTS = [
  'What should I invest in first?',
  'Explain ETFs in simple terms',
  'How do I build an emergency fund?',
  'What is a good risk strategy for my age?',
];

const GOAL_ICONS = {
  retirement: '🏖', home: '🏠', education: '🎓',
  wealth: '📈', short_term: '⚡', long_term: '🌱',
};

function TypingDots() {
  return (
    <div className="typing-dots" aria-label="Gumdrop is typing">
      <span /><span /><span />
    </div>
  );
}

function makeSession() {
  return { id: Date.now(), title: 'New chat', messages: [], pinned: false };
}

function ChatView({ profile, username }) {
  const greeting = { sender: 'system', text: buildGreeting(profile) };

  const [sessions, setSessions] = useState(() => {
    const saved = loadSessions(username);
    return saved ?? [{ ...makeSession(), messages: [greeting] }];
  });
  const [activeIdx, setActiveIdx] = useState(0);

  // Persist sessions to localStorage whenever they change
  useEffect(() => {
    saveSessions(username, sessions);
  }, [sessions, username]);

  const messages = sessions[activeIdx].messages;
  const setMessages = (updater) =>
    setSessions((prev) =>
      prev.map((s, i) =>
        i === activeIdx
          ? { ...s, messages: typeof updater === 'function' ? updater(s.messages) : updater }
          : s
      )
    );

  const [draft, setDraft]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editDraft, setEditDraft]   = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const newChat = () => {
    const session = { ...makeSession(), messages: [greeting] };
    setSessions((prev) => [session, ...prev]);
    setActiveIdx(0);
    setDraft('');
  };

  const switchSession = (idx) => {
    setActiveIdx(idx);
    setDraft('');
  };

  const togglePin = (e, id) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated  = prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s);
      const pinned   = updated.filter((s) => s.pinned);
      const unpinned = updated.filter((s) => !s.pinned);
      const reordered = [...pinned, ...unpinned];
      const activeId  = prev[activeIdx].id;
      setActiveIdx(reordered.findIndex((s) => s.id === activeId));
      return reordered;
    });
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    setSessions((prev) => {
      if (prev.length === 1) {
        const fresh = { ...makeSession(), messages: [greeting] };
        setActiveIdx(0);
        return [fresh];
      }
      const next       = prev.filter((s) => s.id !== id);
      const deletedIdx = prev.findIndex((s) => s.id === id);
      const currentId  = prev[activeIdx].id;
      if (currentId === id) {
        setActiveIdx(Math.min(deletedIdx, next.length - 1));
      } else {
        setActiveIdx(next.findIndex((s) => s.id === currentId));
      }
      return next;
    });
  };

  // priorMessages: explicit history to use (for edits); falls back to current messages
  const send = async (text, priorMessages) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const history = priorMessages ?? messages;

    // Set session title from first user message
    setSessions((prev) =>
      prev.map((s, i) =>
        i === activeIdx && s.title === 'New chat'
          ? { ...s, title: trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed }
          : s
      )
    );

    setMessages(() => [
      ...history,
      { sender: 'user', text: trimmed },
      { sender: 'bot', text: '', pending: true },
    ]);
    setDraft('');
    setLoading(true);
    inputRef.current?.focus();

    try {
      const res = await fetch(`${PROXY_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: trimmed,
          profile,
          messages: history.filter((m) => !m.pending).slice(-10),
        }),
      });
      const data  = await res.json();
      const reply = res.ok
        ? (data.reply  || 'Sorry, I received an empty response.')
        : (data.error  || 'Something went wrong. Please try again.');
      setMessages((prev) => prev.map((m) => (m.pending ? { sender: 'bot', text: reply } : m)));
    } catch {
      setMessages((prev) => prev.map((m) =>
        m.pending ? { sender: 'bot', text: 'Could not reach the AI server. Make sure `npm run server` is running.' } : m
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); }
  };

  return (
    <div className="chat-page" id="chat">

      {/* ── History sidebar ───────────────────────────────────────────────── */}
      <aside className="chat-history-sidebar">
        <Button
          kind="tertiary"
          size="sm"
          className="chat-history-new-btn"
          onClick={newChat}
          renderIcon={() => (
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        >
          New chat
        </Button>
        <div className="chat-history-list">
          {sessions.some((s) => s.pinned) && (
            <span className="chat-history-group-label">Pinned</span>
          )}
          {sessions.filter((s) => s.pinned).map((s) => (
            <div
              key={s.id}
              className={`chat-history-item${sessions.indexOf(s) === activeIdx ? ' chat-history-item--active' : ''}`}
              onClick={() => switchSession(sessions.indexOf(s))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && switchSession(sessions.indexOf(s))}
            >
              <svg viewBox="0 0 16 16" fill="none" width="13" height="13" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
                <path d="M14 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              <span className="chat-history-item-title">{s.title}</span>
              <div className="chat-history-item-actions">
                <button
                  className="chat-history-pin-btn chat-history-pin-btn--active"
                  onClick={(e) => togglePin(e, s.id)}
                  aria-label="Unpin chat"
                  title="Unpin"
                >📌</button>
                <button
                  className="chat-history-del-btn"
                  onClick={(e) => deleteSession(e, s.id)}
                  aria-label="Delete chat"
                  title="Delete"
                >🗑</button>
              </div>
            </div>
          ))}
          {sessions.some((s) => s.pinned) && sessions.some((s) => !s.pinned) && (
            <span className="chat-history-group-label">Recent</span>
          )}
          {sessions.filter((s) => !s.pinned).map((s) => (
            <div
              key={s.id}
              className={`chat-history-item${sessions.indexOf(s) === activeIdx ? ' chat-history-item--active' : ''}`}
              onClick={() => switchSession(sessions.indexOf(s))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && switchSession(sessions.indexOf(s))}
            >
              <svg viewBox="0 0 16 16" fill="none" width="13" height="13" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
                <path d="M14 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              <span className="chat-history-item-title">{s.title}</span>
              <div className="chat-history-item-actions">
                <button
                  className="chat-history-pin-btn"
                  onClick={(e) => togglePin(e, s.id)}
                  aria-label="Pin chat"
                  title="Pin"
                >📌</button>
                <button
                  className="chat-history-del-btn"
                  onClick={(e) => deleteSession(e, s.id)}
                  aria-label="Delete chat"
                  title="Delete"
                >🗑</button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main chat area ────────────────────────────────────────────────── */}
      <div className="chat-main">

        {/* Messages */}
        <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-row chat-row--${msg.sender}`}>
              {msg.sender !== 'user' && (
                <div className="chat-avatar chat-avatar--bot">G</div>
              )}
              <div className="chat-row-content">
                <span className="chat-row-label">{SENDER_LABEL[msg.sender]}</span>
                {editingIdx === i ? (
                  <div className="chat-edit-wrap">
                    <TextArea
                      id={`chat-edit-${i}`}
                      labelText=""
                      hideLabel
                      className="chat-edit-textarea"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (editDraft.trim()) {
                            const prior = messages.slice(0, i);
                            setEditingIdx(null);
                            send(editDraft.trim(), prior);
                          }
                        }
                        if (e.key === 'Escape') { setEditingIdx(null); }
                      }}
                      autoFocus
                    />
                    <div className="chat-edit-actions">
                      <Button
                        kind="primary"
                        size="sm"
                        onClick={() => {
                          if (editDraft.trim()) {
                            const prior = messages.slice(0, i);
                            setEditingIdx(null);
                            send(editDraft.trim(), prior);
                          }
                        }}
                      >Save</Button>
                      <Button
                        kind="ghost"
                        size="sm"
                        onClick={() => setEditingIdx(null)}
                      >Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className={`chat-bubble-new${msg.pending ? ' chat-bubble-new--pending' : ''}${msg.sender === 'user' ? ' chat-bubble-new--user' : ''}`}>
                    {msg.pending ? <TypingDots /> : msg.text}
                    {msg.sender === 'user' && !msg.pending && (
                      <button
                        className="chat-edit-btn"
                        onClick={() => { setEditingIdx(i); setEditDraft(msg.text); }}
                        aria-label="Edit message"
                        title="Edit"
                      >✏️</button>
                    )}
                  </div>
                )}
              </div>
              {msg.sender === 'user' && (
                <div className="chat-avatar chat-avatar--user">
                  {username ? username[0].toUpperCase() : 'Y'}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          {messages.length <= 1 && (
            <div className="chat-inline-suggestions">
              {SUGGESTED_PROMPTS.map((p) => (
                <Tag
                  key={p}
                  type="blue"
                  className="chat-inline-suggestion-btn"
                  onClick={() => !loading && send(p)}
                  style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {p}
                </Tag>
              ))}
            </div>
          )}
          <div className="chat-input-wrap">
            <TextArea
              ref={inputRef}
              id="chat-input"
              labelText=""
              hideLabel
              rows={1}
              placeholder={loading ? 'Gumdrop is thinking…' : 'Ask me anything about investing…'}
              value={draft}
              disabled={loading}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
            />
            <Button
              kind="primary"
              size="sm"
              onClick={() => send(draft)}
              disabled={loading || !draft.trim()}
              aria-label="Send message"
              hasIconOnly
              iconDescription="Send message"
              renderIcon={() => (
                <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                  <path d="M2 10L18 2L12 10L18 18L2 10Z" fill="currentColor" />
                </svg>
              )}
            />
          </div>
          <p className="chat-input-hint">Press Enter to send · Shift+Enter for new line</p>
        </div>

      </div>
    </div>
  );
}

// ── Shared nav shell ───────────────────────────────────────────────────────────
function NavShell({ children, username, onLogout, onGoHome, heroHeader }) {
  return (
    <div className="app-shell">
      <Header aria-label="Candyland Bank" className={heroHeader ? 'cds--header--hero' : undefined}>
        <HeaderName href="#" prefix=""
          onClick={(e) => { e.preventDefault(); onGoHome?.(); }}
        >
          <img src="/grouped-logo.svg" alt="Candyland Bank" className="header-brand-logo" />
        </HeaderName>
        {username && (
          <HeaderGlobalBar>
            <button className="avatar-btn" aria-label={`Sign out (${username})`} onClick={onLogout}>
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
                <text x="16" y="21" textAnchor="middle" fontSize="14" fill="currentColor" fontWeight="700">
                  {username[0].toUpperCase()}
                </text>
              </svg>
            </button>
          </HeaderGlobalBar>
        )}
      </Header>
      <Content style={{ padding: 0, marginTop: 0 }}>
        {children}
      </Content>
    </div>
  );
}

// ── Password gate ──────────────────────────────────────────────────────────────
const GATE_KEY      = 'cb_gate_ok';
const SITE_PASSWORD = 'candyland2025';

function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(GATE_KEY) === '1'
  );
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const attempt = () => {
    if (value === SITE_PASSWORD) {
      sessionStorage.setItem(GATE_KEY, '1');
      setUnlocked(true);
    } else {
      setError(true);
      setValue('');
    }
  };

  if (unlocked) return children;

  return (
    <div className="pin-gate">
      <div className="pin-card">
        <BrandLogo className="pin-brand-logo" aria-label="Candyland Bank × IBM" />
        <p className="pin-label">Enter the site password to continue</p>
        <PasswordInput
          id="pin-input"
          labelText="Site password"
          hideLabel
          placeholder="••••••••"
          value={value}
          autoFocus
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === 'Enter' && value && attempt()}
          invalid={error}
          invalidText="Incorrect password — try again"
        />
        <Button kind="primary" onClick={attempt} disabled={!value}>
          Enter
        </Button>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState('home');

  const [profile, setProfile] = useState(() => {
    const session = getSession();
    if (session) {
      const account = getAccountByUsername(session.username);
      if (account) return account.profile;
    }
    return null;
  });
  const [username, setUsername] = useState(() => getSession()?.username ?? null);
  const [isGuest, setIsGuest]   = useState(false);

  const handleLogout = () => {
    logout();
    setUsername(null);
    setProfile(null);
    setIsGuest(false);
    setPage('login');
  };

  let content;

  if (page === 'login') {
    content = (
      <NavShell heroHeader onGoHome={() => setPage('home')}>
        <LoginForm
          onLogin={(account) => {
            setProfile(account.profile);
            setUsername(account.username);
            setIsGuest(false);
            setPage('dashboard');
          }}
          onGoHome={() => setPage('home')}
          onCreateNew={() => setPage('wizard')}
          onGuest={() => {
            setIsGuest(true);
            setPage('wizard');
          }}
        />
      </NavShell>
    );
  } else if (page === 'home') {
    content = (
      <HomePage
        onGetStarted={() => setPage('wizard')}
        isLoggedIn={!!username}
        username={username}
        onGoToChat={() => setPage('dashboard')}
        onSignIn={() => setPage('login')}
      />
    );
  } else if (page === 'dashboard') {
    content = (
      <NavShell heroHeader username={username} onLogout={handleLogout} onGoHome={() => setPage('home')}>
        <DashboardPage
          profile={profile}
          username={username}
        />
        <FloatingChat profile={profile} />
      </NavShell>
    );
  } else if (page === 'wizard') {
    content = (
      <NavShell heroHeader onGoHome={() => setPage(hasAnyAccount() ? 'login' : 'home')}>
        <SignupWizard
          onComplete={(p) => { setProfile(p); setPage('account'); }}
          onExit={() => setPage(hasAnyAccount() ? 'login' : 'home')}
        />
      </NavShell>
    );
  } else if (page === 'account') {
    content = (
      <NavShell heroHeader onGoHome={() => setPage('home')}>
        <AccountSignup
          investorProfile={profile}
          isGuest={isGuest}
          onComplete={(uname) => {
            setUsername(uname);
            setIsGuest(false);
            setPage('dashboard');
          }}
          onSkip={() => setPage('dashboard')}
        />
      </NavShell>
    );
  } else {
    content = (
      <NavShell heroHeader username={username} onLogout={handleLogout} onGoHome={() => setPage('home')}>
        <DashboardPage
          profile={profile}
          username={username}
        />
        <FloatingChat profile={profile} />
      </NavShell>
    );
  }

  return <Theme theme="g10"><PasswordGate>{content}</PasswordGate></Theme>;
}
