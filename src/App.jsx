import { useState, useRef, useEffect } from 'react';
import candylandTitle from '/CandyLand Title.svg';
import {
  Button,
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  TextInput,
} from '@carbon/react';
import SignupWizard from './SignupWizard';
import {
  createAccount,
  login,
  logout,
  getSession,
  getAccountByUsername,
  hasAnyAccount,
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
function AccountSignup({ investorProfile, onComplete, onSkip }) {
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
    if (!form.username.trim())        e.username = 'Username is required.';
    else if (form.username.length < 3) e.username = 'Username must be at least 3 characters.';
    if (form.password.length < 6)     e.password = 'Password must be at least 6 characters.';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match.';
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
        <div className="wizard-accent-bar" style={{ width: '100%' }} />
        <div className="wizard-inner">
          <div className="acct-badge">Almost there!</div>
          <h2 className="wizard-heading">Create your account</h2>
          <p className="wizard-sub">Pick a username and password to save your profile locally. No email needed.</p>

          {done ? (
            <div className="acct-success">
              <span className="acct-success-icon">✓</span>
              <p>Account created! Taking you to your dashboard…</p>
            </div>
          ) : (
            <form className="acct-form" onSubmit={handleSubmit} noValidate>
              <div className="field-group">
                <label className="field-label" htmlFor="acct-username">Username</label>
                <input
                  id="acct-username"
                  className={`field-input${errors.username ? ' field-input--error' : ''}`}
                  type="text"
                  placeholder="e.g. jsmith"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => patch('username', e.target.value)}
                />
                {errors.username && <span className="field-error">{errors.username}</span>}
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="acct-password">Password</label>
                <input
                  id="acct-password"
                  className={`field-input${errors.password ? ' field-input--error' : ''}`}
                  type="password"
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => patch('password', e.target.value)}
                />
                {errors.password && <span className="field-error">{errors.password}</span>}
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="acct-confirm">Confirm password</label>
                <input
                  id="acct-confirm"
                  className={`field-input${errors.confirm ? ' field-input--error' : ''}`}
                  type="password"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) => patch('confirm', e.target.value)}
                />
                {errors.confirm && <span className="field-error">{errors.confirm}</span>}
              </div>
              <div className="acct-form-footer">
                <button type="submit" className="btn btn-primary acct-submit-btn" disabled={busy}>
                  {busy ? 'Saving…' : 'Create account →'}
                </button>
              </div>
            </form>
          )}
        </div>
        <div className="wizard-footer">
          <button type="button" className="btn btn-ghost" onClick={onSkip}>Skip for now</button>
          <span className="acct-skip-hint">You can always sign up later.</span>
        </div>
      </div>
    </div>
  );
}

// ── Login Form ─────────────────────────────────────────────────────────────────
function LoginForm({ onLogin, onCreateNew }) {
  const [form, setForm]     = useState({ username: '', password: '' });
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState(false);

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
        <div className="wizard-accent-bar" style={{ width: '100%' }} />
        <div className="wizard-inner">
          <div className="acct-badge">Welcome back</div>
          <h2 className="wizard-heading">Sign in</h2>
          <p className="wizard-sub">Enter your Candyland Bank username and password.</p>
          <form className="acct-form" onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label className="field-label" htmlFor="login-username">Username</label>
              <input
                id="login-username"
                className={`field-input${error ? ' field-input--error' : ''}`}
                type="text"
                placeholder="Your username"
                autoComplete="username"
                value={form.username}
                onChange={(e) => patch('username', e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className={`field-input${error ? ' field-input--error' : ''}`}
                type="password"
                placeholder="Your password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => patch('password', e.target.value)}
              />
              {error && <span className="field-error">{error}</span>}
            </div>
            <div className="acct-form-footer">
              <button type="submit" className="btn btn-primary acct-submit-btn" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in →'}
              </button>
            </div>
          </form>
        </div>
        <div className="wizard-footer">
          <button type="button" className="btn btn-ghost" onClick={onCreateNew}>
            Create new account
          </button>
          <span className="acct-skip-hint">New to Candyland Bank?</span>
        </div>
      </div>
    </div>
  );
}

// ── Home Page ──────────────────────────────────────────────────────────────────
function HomePage({ onGetStarted, isLoggedIn, onGoToChat }) {
  const ctaLabel  = isLoggedIn ? 'Chat with Gumdrop →' : 'Build my profile';
  const ctaAction = isLoggedIn ? onGoToChat : onGetStarted;

  return (
    <div className="app-shell">
      <Header aria-label="Candyland Bank">
        <HeaderName href="#" prefix="">
          <img src={candylandTitle} alt="Candyland Bank" style={{ height: '2rem', width: 'auto' }} />
        </HeaderName>
      </Header>

      <main className="home-main">

        {/* ── Hero ── */}
        <section className="home-hero">
          <div className="home-hero-inner">
            <h1 className="home-hero-heading">
              <img src={candylandTitle} alt="Candyland Bank" className="home-hero-title-img" />
              Your money,<br />your strategy.
            </h1>
            <p className="home-hero-sub">
              {isLoggedIn
                ? 'Welcome back. Your profile is ready — jump straight into a conversation with Gumdrop.'
                : 'Build a tailored investment profile in minutes. Get AI-powered guidance, personalised strategies, and stay on track — all in one place.'}
            </p>
          </div>
          <div className="home-hero-visual" aria-hidden="true">
            <div className="home-stat-card">
              <span className="home-stat-value">3 min</span>
              <span className="home-stat-label">to build your profile</span>
            </div>
            <div className="home-stat-card">
              <span className="home-stat-value">AI</span>
              <span className="home-stat-label">powered guidance</span>
            </div>
            <div className="home-stat-card">
              <span className="home-stat-value">100%</span>
              <span className="home-stat-label">personalised to you</span>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="home-section" id="features">
          <h2 className="home-section-heading">Everything you need to invest smarter</h2>
          <p className="home-section-sub">Candyland Bank brings together your goals, risk appetite, and financial profile to give you guidance that actually fits your life.</p>
          <div className="home-features-grid">
            {[
              { icon: '🎯', title: 'Goal-based planning', desc: 'Whether you\'re saving for retirement, a home, or education — we tailor every recommendation to your specific goals.' },
              { icon: '🤖', title: 'AI chat assistant', desc: 'Ask anything about your investments. Your assistant knows your profile and gives contextual, personalised answers.' },
              { icon: '📊', title: 'Risk-matched strategies', desc: 'From conservative to aggressive, your strategy is built around your risk tolerance and time horizon.' },
              { icon: '🔒', title: 'Secure & private', desc: 'Your financial data never leaves your session. No account required to get started.' },
              { icon: '⚡', title: 'Instant profile', desc: 'Answer 7 quick questions and get a complete investor profile with personalised insights straight away.' },
              { icon: '📈', title: 'Track your horizon', desc: 'Short-term or long-term, we keep you focused on what matters most for your timeline.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="home-feature-card">
                <span className="home-feature-icon">{icon}</span>
                <h3 className="home-feature-title">{title}</h3>
                <p className="home-feature-desc">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="home-section home-section--tinted" id="how-it-works">
          <h2 className="home-section-heading">Up and running in three steps</h2>
          <div className="home-steps">
            {[
              { n: '1', title: 'Build your profile', desc: 'Tell us your goals, risk appetite, age, and income in a quick 7-step wizard.' },
              { n: '2', title: 'Get your strategy', desc: 'We generate a personalised investor profile tailored to your answers.' },
              { n: '3', title: 'Chat with your assistant', desc: 'Ask questions, explore strategies, and get real-time guidance from your AI advisor.' },
            ].map(({ n, title, desc }) => (
              <div key={n} className="home-step">
                <div className="home-step-number">{n}</div>
                <h3 className="home-step-title">{title}</h3>
                <p className="home-step-desc">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="home-cta">
          <h2 className="home-cta-heading">
            {isLoggedIn ? 'Your advisor is ready.' : 'Ready to take control of your finances?'}
          </h2>
          <p className="home-cta-sub">
            {isLoggedIn
              ? 'Pick up where you left off — Gumdrop remembers your profile and is ready to help.'
              : "Join thousands of investors who've built smarter strategies with Candyland Bank."}
          </p>
          <button className="cta-btn" onClick={ctaAction}>
            {ctaLabel} <span className="cta-btn-arrow">→</span>
          </button>
        </section>

        {/* ── Contact ── */}
        <section className="home-section" id="contact">
          <h2 className="home-section-heading">Need help? We're here.</h2>
          <p className="home-section-sub">Our support team is available Monday – Friday, 9am – 6pm. Reach out and we'll get back to you within one business day.</p>
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
              <button className="contact-link-btn" onClick={ctaAction}>Open the app →</button>
            </div>
            <div className="contact-card">
              <span className="contact-card-icon">📞</span>
              <h3 className="contact-card-title">Phone</h3>
              <p className="contact-card-desc">Speak to a real person for urgent matters.</p>
              <a className="contact-link" href="tel:+18005550100">+1 800 555 0100</a>
            </div>
          </div>
        </section>

        <footer className="home-footer">
          <img src={candylandTitle} alt="Candyland Bank" style={{ height: '1.5rem', width: 'auto', opacity: 0.7 }} />
          <p>© {new Date().getFullYear()} Candyland Bank. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}

// ── Profile summary bar ────────────────────────────────────────────────────────
function ProfileBar({ profile }) {
  const pills = [
    ...profile.goals.map((g) => ({ text: GOAL_LABELS[g] || g, variant: 'goal' })),
    profile.risk     && { text: profile.risk,     variant: 'risk' },
    profile.horizon  && { text: profile.horizon + ' horizon', variant: 'horizon' },
    profile.ageBracket && { text: profile.ageBracket, variant: 'age' },
  ].filter(Boolean);

  return (
    <div className="profile-summary" aria-label="Your investor profile">
      <span className="profile-pill-label">Profile &nbsp;→</span>
      {pills.map((p, i) => (
        <span key={i} className="profile-pill">{p.text}</span>
      ))}
    </div>
  );
}

// ── Chat view ──────────────────────────────────────────────────────────────────
const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'http://127.0.0.1:3001';

function ChatView({ profile }) {
  const [messages, setMessages] = useState([
    { sender: 'system', text: buildGreeting(profile) },
  ]);
  const [draft, setDraft]     = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || loading) return;

    const userMsg = { sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setDraft('');
    setLoading(true);

    // Add a placeholder bubble while waiting
    setMessages((prev) => [...prev, { sender: 'bot', text: '…', pending: true }]);

    try {
      const res = await fetch(`${PROXY_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: text,
          profile,
          // send the last 10 messages as history (trim pending placeholder)
          messages: messages.filter((m) => !m.pending).slice(-10),
        }),
      });

      const data = await res.json();
      const reply = res.ok
        ? (data.reply || 'Sorry, I received an empty response.')
        : (data.error || 'Something went wrong. Please try again.');

      setMessages((prev) =>
        prev.map((m) => (m.pending ? { sender: 'bot', text: reply } : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.pending
            ? { sender: 'bot', text: 'Could not reach the AI server. Make sure `npm run server` is running.' }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="chat-section" id="chat">
      <div className="chat-tile">
        <div className="chat-tile-header">
          <div className="chat-status-dot" aria-hidden="true" />
          <h2>Gumdrop</h2>
        </div>

        <ProfileBar profile={profile} />

        <div className="chat-body">
          <div className="chat-window" role="log" aria-live="polite" aria-label="Conversation">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message-group ${msg.sender}`}>
                <span className="chat-sender-label">{SENDER_LABEL[msg.sender]}</span>
                <div className={`chat-bubble${msg.pending ? ' chat-bubble--pending' : ''}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="chat-input-bar">
          <TextInput
            id="chat-input"
            labelText=""
            placeholder={loading ? 'Gumdrop is thinking…' : 'Ask me anything about investing…'}
            value={draft}
            disabled={loading}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <Button kind="primary" onClick={handleSend} disabled={loading}>
            {loading ? '…' : 'Send'}
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── Shared nav shell ───────────────────────────────────────────────────────────
function NavShell({ children, username, onLogout }) {
  return (
    <div className="app-shell">
      <Header aria-label="Candyland Bank">
        <HeaderName href="#" prefix="">
          <img src={candylandTitle} alt="Candyland Bank" style={{ height: '2rem', width: 'auto' }} />
        </HeaderName>
        {username && (
          <HeaderNavigation aria-label="Main navigation">
            <HeaderMenuItem href="#home">Home</HeaderMenuItem>
            <HeaderMenuItem href="#chat">Chat</HeaderMenuItem>
          </HeaderNavigation>
        )}
        {username && (
          <div className="nav-user-bar">
            <span className="nav-username">@{username}</span>
            <button className="nav-logout-btn" onClick={onLogout}>Sign out</button>
          </div>
        )}
      </Header>
      {children}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  // Restore session on first render
  const [page, setPage] = useState(() => {
    const session = getSession();
    if (session) {
      const account = getAccountByUsername(session.username);
      if (account) return 'dashboard';
    }
    return hasAnyAccount() ? 'login' : 'home';
  });

  const [profile, setProfile]   = useState(() => {
    const session = getSession();
    if (session) {
      const account = getAccountByUsername(session.username);
      if (account) return account.profile;
    }
    return null;
  });

  const [username, setUsername] = useState(() => getSession()?.username ?? null);

  const handleLogout = () => {
    logout();
    setUsername(null);
    setProfile(null);
    setPage('login');
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  if (page === 'login') {
    return (
      <NavShell>
        <main>
          <LoginForm
            onLogin={(account) => {
              setProfile(account.profile);
              setUsername(account.username);
              setPage('dashboard');
            }}
            onCreateNew={() => setPage('home')}
          />
        </main>
      </NavShell>
    );
  }

  // ── Home landing ───────────────────────────────────────────────────────────
  if (page === 'home') {
    return (
      <HomePage
        onGetStarted={() => setPage('wizard')}
        isLoggedIn={!!username}
        onGoToChat={() => setPage('dashboard')}
      />
    );
  }

  // ── Investor profile wizard ────────────────────────────────────────────────
  if (page === 'wizard') {
    return (
      <NavShell>
        <main>
          <SignupWizard
            onComplete={(p) => { setProfile(p); setPage('account'); }}
            onExit={() => setPage(hasAnyAccount() ? 'login' : 'home')}
          />
        </main>
      </NavShell>
    );
  }

  // ── Account creation ───────────────────────────────────────────────────────
  if (page === 'account') {
    return (
      <NavShell>
        <main>
          <AccountSignup
            investorProfile={profile}
            onComplete={(uname) => { setUsername(uname); setPage('dashboard'); }}
            onSkip={() => setPage('dashboard')}
          />
        </main>
      </NavShell>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <NavShell username={username} onLogout={handleLogout}>
      <main className="page-content">
        <section id="home">
          <div className="hero-card">
            <p className="hero-eyebrow">Personalised investing</p>
            <h1>
              <img src={candylandTitle} alt="Candyland Bank" className="hero-title-img" /><br />
              Your money, your strategy.
            </h1>
            <p>
              {username ? `Welcome back, @${username}. ` : ''}
              Your Candyland Bank investor profile is set. Chat with your assistant
              below to get personalised guidance, explore strategies, and stay on track.
            </p>
            <Button
              kind="primary"
              onClick={() => document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Start chatting
            </Button>
          </div>
        </section>
        <ChatView profile={profile} />
      </main>
    </NavShell>
  );
}
