import { useState, useRef, useEffect } from 'react';
import candylandTitle from '/CandyLand Title.svg';
import {
  Button,
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  TextInput,
  PasswordInput,
  TextArea,
  InlineNotification,
  Tag,
  Loading,
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
            <form className="acct-form" onSubmit={handleSubmit} noValidate>
              <div className="field-group">
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
              </div>
              <div className="field-group">
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
              </div>
              <div className="field-group">
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
              </div>
              <div className="acct-form-footer">
                <Button type="submit" kind="primary" className="acct-submit-btn" disabled={busy}>
                  {busy ? 'Saving…' : 'Create account →'}
                </Button>
              </div>
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
              <TextInput
                id="login-username"
                labelText="Username"
                placeholder="Your username"
                autoComplete="username"
                value={form.username}
                onChange={(e) => patch('username', e.target.value)}
                invalid={!!error}
              />
            </div>
            <div className="field-group">
              <PasswordInput
                id="login-password"
                labelText="Password"
                placeholder="Your password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => patch('password', e.target.value)}
                invalid={!!error}
                invalidText={error}
              />
            </div>
            <div className="acct-form-footer">
              <Button type="submit" kind="primary" className="acct-submit-btn" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in →'}
              </Button>
            </div>
          </form>
        </div>
        <div className="wizard-footer">
          <Button kind="ghost" onClick={onCreateNew}>
            Create new account
          </Button>
          <Button kind="tertiary" onClick={onGuest}>
            Continue as guest
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Home Page ──────────────────────────────────────────────────────────────────
function HomePage({ onGetStarted, isLoggedIn, onGoToChat, onSignIn, username }) {
  const ctaLabel  = isLoggedIn ? 'Chat with Gumdrop' : 'Build my profile';
  const ctaAction = isLoggedIn ? onGoToChat : onGetStarted;

  return (
    <div className="app-shell">
      <main className="home-main">

        {/* ── Hero ── */}
        <section className="home-hero">
          <h1 className="home-hero-heading">
            <img
  src={candylandTitle}
  alt="Candyland Bank" className="home-hero-title-img" style={{ marginRight: '-100px' }}/>
            Invest Smarter
          </h1>
          <p className="home-hero-sub">
            {isLoggedIn
              ? `Welcome back${username ? `, ${username}` : ''}.`
              : 'Build a tailored investment profile in minutes. Get AI-powered guidance, personalised strategies, and stay on track — all in one place.'}
          </p>
          <div className="home-hero-actions">
            {isLoggedIn ? (
              <button className="cta-btn" onClick={ctaAction}>
                {ctaLabel} <span className="cta-btn-arrow">→</span>
              </button>
            ) : (
              <Button kind="tertiary" className="home-hero-signin" onClick={onSignIn}>
                Sign in
              </Button>
            )}
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
              <Button kind="ghost" className="contact-link-btn" onClick={ctaAction}>Open the app →</Button>
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

  const [draft, setDraft]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editDraft, setEditDraft]  = useState('');
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

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
      const updated = prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s);
      const pinned   = updated.filter((s) => s.pinned);
      const unpinned = updated.filter((s) => !s.pinned);
      const reordered = [...pinned, ...unpinned];
      const activeId = prev[activeIdx].id;
      setActiveIdx(reordered.findIndex((s) => s.id === activeId));
      return reordered;
    });
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    setSessions((prev) => {
      if (prev.length === 1) {
        // always keep at least one session
        const fresh = { ...makeSession(), messages: [greeting] };
        setActiveIdx(0);
        return [fresh];
      }
      const next = prev.filter((s) => s.id !== id);
      const deletedIdx = prev.findIndex((s) => s.id === id);
      const currentId  = prev[activeIdx].id;
      if (currentId === id) {
        // activate the item that takes its place, or the last one
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
                        className="chat-edit-save"
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
                        className="chat-edit-cancel"
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
              className="chat-textarea"
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
              className="chat-send-btn"
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
function NavShell({ children, username, onLogout, onGoHome }) {
  return (
    <div className="app-shell">
      <Header aria-label="Candyland Bank">
        <HeaderName href="#" prefix="">
          <img
            src={candylandTitle}
            alt="Candyland Bank"
            style={{ height: '2rem', width: 'auto', cursor: onGoHome ? 'pointer' : 'default' }}
            onClick={onGoHome || undefined}
            role={onGoHome ? 'button' : undefined}
            tabIndex={onGoHome ? 0 : undefined}
            onKeyDown={onGoHome ? (e) => e.key === 'Enter' && onGoHome() : undefined}
          />
        </HeaderName>
        {username && (
          <HeaderNavigation aria-label="Main navigation">
            <HeaderMenuItem onClick={onGoHome}>Home</HeaderMenuItem>
            <HeaderMenuItem
              onClick={() => document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Chat
            </HeaderMenuItem>
            <HeaderMenuItem onClick={onLogout} className="nav-danger">
              Sign out
            </HeaderMenuItem>
          </HeaderNavigation>
        )}
      </Header>
      {children}
    </div>
  );
}

// ── Password gate ──────────────────────────────────────────────────────────────
const GATE_KEY = 'cb_gate_ok';
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
        <img src={candylandTitle} alt="Candyland Bank" className="pin-logo" />
        <p className="pin-label">Enter the site password to continue</p>
        <PasswordInput
          id="pin-input"
          labelText=""
          hideLabel
          className={`pin-input${error ? ' pin-input--error' : ''}`}
          placeholder="••••••••"
          value={value}
          autoFocus
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === 'Enter' && value && attempt()}
          invalid={error}
          invalidText="Incorrect password — try again"
        />
        <Button kind="primary" className="pin-btn" onClick={attempt} disabled={!value}>
          Enter
        </Button>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  // Restore session on first render
  const [page, setPage] = useState('home');

  const [profile, setProfile]   = useState(() => {
    const session = getSession();
    if (session) {
      const account = getAccountByUsername(session.username);
      if (account) return account.profile;
    }
    return null;
  });

  const [username, setUsername] = useState(() => getSession()?.username ?? null);
  // true when user chose "Continue as guest" — their wizard data is unsaved
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
      <NavShell onGoHome={() => setPage('home')}>
        <main>
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
        </main>
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
  } else if (page === 'wizard') {
    content = (
      <NavShell>
        <main>
          <SignupWizard
            onComplete={(p) => { setProfile(p); setPage('account'); }}
            onExit={() => setPage(hasAnyAccount() ? 'login' : 'home')}
          />
        </main>
      </NavShell>
    );
  } else if (page === 'account') {
    content = (
      <NavShell>
        <main>
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
        </main>
      </NavShell>
    );
  } else {
    content = (
      <NavShell username={username} onLogout={handleLogout} onGoHome={() => setPage('home')}>
        <main className="dashboard-main">
          <ChatView profile={profile} username={username} />
        </main>
      </NavShell>
    );
  }

  return <PasswordGate>{content}</PasswordGate>;
}
