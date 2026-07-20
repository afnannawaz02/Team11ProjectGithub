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
import {
  Analytics,
  ChatBot,
  ChartLine,
  Locked,
  Flash,
  Growth,
  Portfolio,
  Finance,
  Notebook,
  Logout,
  Checkmark,
  Email,
  Phone,
  Pin,
  PinFilled,
  TrashCan,
  Sprout,
  Task,
  Close,
  Search,
  Add,
} from '@carbon/icons-react';
import SignupWizard from './SignupWizard';
import {
  createAccount,
  login,
  logout,
  getSession,
  restoreSession,
  hasAnyAccount,
  saveSessions,
  loadSessions,
  fetchChatSessions,
  fetchChatMessages,
  upsertChatSession,
  saveChatMessage,
  deleteChatSession,
} from './auth.js';

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildGreeting(profile) {
  if (!profile) return "Hi! I'm Gumdrop, your Candyland Bank AI advisor. Ask me anything about investing, saving, or your finances.";
  const goalMap = {
    retirement: 'retirement', home: 'buying a home', education: 'education',
    wealth: 'wealth growth', short_term: 'short-term goals', long_term: 'long-term goals',
  };
  const goals = (profile.goals ?? []).map((g) => goalMap[g] || g).join(', ');
  return `Welcome back! I've built your profile — focus: ${goals || 'general'}, risk appetite: ${profile.risk}, horizon: ${profile.horizon}. What would you like to explore first?`;
}

const GOAL_LABELS = {
  retirement: 'Retirement', home: 'Home', education: 'Education',
  wealth: 'Wealth', short_term: 'Short-term', long_term: 'Long-term',
};
const SENDER_LABEL = { system: 'Gumdrop', bot: 'Gumdrop', user: 'You' };

// ── Account Signup ─────────────────────────────────────────────────────────────
function AccountSignup({ investorProfile, onComplete, onSkip, isGuest }) {
  // step: 'form' | 'otp' | 'done'
  const [step, setStep]     = useState('form');
  const [form, setForm]     = useState({ username: '', password: '', confirm: '', email: '' });
  const [otp, setOtp]       = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy]     = useState(false);
  const [otpError, setOtpError] = useState('');

  const patch = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.username.trim())              e.username = 'Username is required.';
    else if (form.username.length < 3)      e.username = 'Username must be at least 3 characters.';
    if (form.password.length < 6)           e.password = 'Password must be at least 6 characters.';
    if (form.password !== form.confirm)     e.confirm  = 'Passwords do not match.';
    if (!form.email.trim())                 e.email    = 'IBM email is required.';
    else if (!form.email.endsWith('@ibm.com')) e.email  = 'Must be an @ibm.com address.';
    return e;
  };

  // Step 1: validate form → send OTP
  const handleSendOtp = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    const res = await fetch('/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.trim().toLowerCase() }),
    }).then((r) => r.json()).catch(() => ({ error: 'Network error' }));
    setBusy(false);
    if (!res.ok) { setErrors({ email: res.error || 'Failed to send code.' }); return; }
    setStep('otp');
  };

  // Step 2: verify OTP → create account
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) { setOtpError('Please enter the code.'); return; }
    setBusy(true);
    // Verify OTP
    const vRes = await fetch('/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.trim().toLowerCase(), code: otp.trim() }),
    }).then((r) => r.json()).catch(() => ({ error: 'Network error' }));
    if (!vRes.ok) { setBusy(false); setOtpError(vRes.error || 'Invalid code.'); return; }

    // Create account in D1
    const result = await createAccount(form.username.trim(), form.password, form.email.trim().toLowerCase(), investorProfile);
    setBusy(false);
    if (!result.ok) { setOtpError(result.error || 'Failed to create account.'); return; }
    setStep('done');
    setTimeout(() => onComplete(form.username.trim()), 1000);
  };

  return (
    <div className="wizard-page">
      <div className="wizard-card">
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: '100%' }} />
        </div>
        <div className="wizard-inner">
          <div className="acct-badge">{isGuest ? 'Save your work' : 'Create account'}</div>
          <h2 className="wizard-heading">Create your account</h2>
          <p className="wizard-sub">
            {step === 'otp'
              ? `We sent a 6-digit code to ${form.email}. Enter it below to verify your IBM email.`
              : 'Sign up with your IBM email (@ibm.com) to access Candyland Bank.'}
          </p>

          {step === 'done' && (
            <div className="acct-success">
              <Checkmark size={20} className="acct-success-icon" />
              <p>{onSkip ? 'Account created! Taking you to your dashboard…' : 'Account created! Taking you to sign in…'}</p>
            </div>
          )}

          {step === 'form' && (
            <form className="auth-fields" onSubmit={handleSendOtp} noValidate>
              <TextInput
                id="acct-email"
                labelText="IBM email"
                placeholder="you@ibm.com"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => patch('email', e.target.value)}
                invalid={!!errors.email}
                invalidText={errors.email}
              />
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
                {busy ? 'Sending code…' : 'Send verification code'}
              </Button>
            </form>
          )}

          {step === 'otp' && (
            <form className="auth-fields" onSubmit={handleVerifyOtp} noValidate>
              {otpError && (
                <InlineNotification kind="error" title="Error" subtitle={otpError} lowContrast hideCloseButton />
              )}
              <TextInput
                id="acct-otp"
                labelText="Verification code"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => { setOtp(e.target.value); setOtpError(''); }}
                autoFocus
              />
              <Button type="submit" kind="primary" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify & create account'}
              </Button>
              <Button kind="ghost" disabled={busy} onClick={() => setStep('form')}>← Back</Button>
            </form>
          )}
        </div>
        {onSkip && (
          <div className="wizard-footer">
            <Button kind="ghost" onClick={onSkip}>Skip for now</Button>
            <span className="acct-skip-hint">You can always sign up later.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Login Form ─────────────────────────────────────────────────────────────────
function LoginForm({ onLogin, onCreateNew, onGuest, onGoHome }) {
  // step: 'form' | 'otp'
  const [step, setStep]   = useState('form');
  const [form, setForm]   = useState({ username: '', password: '' });
  const [email, setEmail] = useState('');
  const [otp, setOtp]     = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  const patch = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  // Step 1: verify password → send OTP
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

    // Send OTP to their registered email
    const emailAddr = result.email || '';
    setEmail(emailAddr);
    if (emailAddr) {
      const otpRes = await fetch('/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddr }),
      }).then((r) => r.json()).catch(() => ({}));
      if (!otpRes.ok) {
        // If OTP fails (e.g. no email on old account), skip 2FA
        onLogin(result);
        return;
      }
      setStep('otp');
    } else {
      onLogin(result);
    }
  };

  // Step 2: verify OTP → complete login
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) { setError('Please enter the code.'); return; }
    setBusy(true);
    const vRes = await fetch('/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: otp.trim() }),
    }).then((r) => r.json()).catch(() => ({ error: 'Network error' }));
    setBusy(false);
    if (!vRes.ok) { setError(vRes.error || 'Invalid code.'); return; }
    // Re-fetch full session to get profile
    const meRes = await fetch('/api/auth?action=me', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({}));
    onLogin(meRes.ok ? meRes : { username: form.username.trim() });
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
          <p className="wizard-sub">
            {step === 'otp'
              ? `Enter the 6-digit code sent to ${email}.`
              : 'Enter your Candyland Bank username and password.'}
          </p>

          {error && (
            <InlineNotification kind="error" title="Sign-in failed" subtitle={error} lowContrast hideCloseButton />
          )}

          {step === 'form' && (
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
          )}

          {step === 'otp' && (
            <form className="auth-fields" onSubmit={handleVerifyOtp} noValidate>
              <TextInput
                id="login-otp"
                labelText="Verification code"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => { setOtp(e.target.value); setError(''); }}
                autoFocus
              />
              <Button type="submit" kind="primary" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </Button>
              <Button kind="ghost" disabled={busy} onClick={() => setStep('form')}>← Back</Button>
            </form>
          )}
        </div>
        <div className="wizard-footer">
          <Button kind="ghost" onClick={onCreateNew}>Create new account</Button>
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
                { Icon: Analytics, title: 'Goal-based planning',    desc: "Whether you're saving for retirement, a home, or education — we tailor every recommendation to your specific goals." },
                { Icon: ChatBot,   title: 'AI chat assistant',      desc: 'Ask anything about your investments. Your assistant knows your profile and gives contextual, personalised answers.' },
                { Icon: ChartLine, title: 'Risk-matched strategies', desc: 'From conservative to aggressive, your strategy is built around your risk tolerance and time horizon.' },
                { Icon: Locked,    title: 'Secure & private',        desc: 'Your financial data never leaves your session. No account required to get started.' },
                { Icon: Flash,     title: 'Instant profile',         desc: 'Answer 7 quick questions and get a complete investor profile with personalised insights straight away.' },
                { Icon: Growth,    title: 'Track your horizon',      desc: 'Short-term or long-term, we keep you focused on what matters most for your timeline.' },
              ].map(({ Icon, title, desc }) => (
                <div key={title} className="home-feature-card">
                  <Icon size={32} className="home-feature-icon" aria-hidden="true" />
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
                <Email size={32} className="contact-card-icon" aria-hidden="true" />
                <h3 className="contact-card-title">Email support</h3>
                <p className="contact-card-desc">For general enquiries and account questions.</p>
                <a className="contact-link" href="mailto:support@candylandbank.com">support@candylandbank.com</a>
              </div>
              <div className="contact-card">
                <Phone size={32} className="contact-card-icon" aria-hidden="true" />
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

// Seed-based pseudo-random for deterministic sparkline data
function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ── Finnhub helpers ────────────────────────────────────────────────────────────
async function fhFetch(params) {
  const qs  = new URLSearchParams(params);
  const res = await fetch(`/api/stock?${qs}`);
  const ct  = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Stock API returned non-JSON (${res.status}) — check FINNHUB_API_KEY is set in Cloudflare env vars`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  if (!res.ok)    throw new Error(`HTTP ${res.status}`);
  return data;
}

function fmtBig(n) {
  if (!n || isNaN(n)) return '—';
  const v = parseFloat(n);
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toLocaleString()}`;
}
function fmtVol(n) {
  if (!n || isNaN(n)) return '—';
  const v = parseFloat(n);
  if (v >= 1e9)  return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3)  return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) {
  const [, m, d] = iso.split('-');
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function StockLineChart({ ticker, seriesData }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  // Increment every time the data key changes so the animation re-triggers
  const [animKey, setAnimKey] = useState(0);
  const svgRef = useRef(null);

  useEffect(() => { setAnimKey((k) => k + 1); }, [seriesData]);

  const W = 600, H = 180, PAD = { top: 8, right: 8, bottom: 28, left: 56 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;

  if (!seriesData || seriesData.length < 2) {
    return <div className="st-chart-wrap" style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'180px', color:'var(--cds-text-secondary)' }}>No chart data</div>;
  }

  const prices = seriesData.map((d) => d.close);
  const POINTS = prices.length;
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const scX  = (i) => PAD.left + (i / (POINTS - 1)) * cW;
  const scY  = (p) => PAD.top  + cH - ((p - minP) / (maxP - minP || 1)) * cH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: PAD.top + cH - t * cH,
    label: `$${Math.round(minP + t * (maxP - minP))}`,
  }));

  const xTicks = [0, 1, 2, 3].map((k) => {
    const idx = Math.round((k / 3) * (POINTS - 1));
    return { x: scX(idx), label: fmtDate(seriesData[idx].date) };
  });

  const linePts  = prices.map((p, i) => `${scX(i)},${scY(p)}`).join(' ');
  const areaPath = `M${scX(0)},${scY(prices[0])} `
    + prices.map((p, i) => `L${scX(i)},${scY(p)}`).join(' ')
    + ` L${scX(POINTS-1)},${PAD.top + cH} L${scX(0)},${PAD.top + cH} Z`;

  const priceUp = prices[POINTS - 1] >= prices[0];
  const lineColor = priceUp ? '#24a148' : '#da1e28';

  // Map a mouse x (in SVG coords) to the nearest data index
  const xToIdx = (svgX) => {
    const raw = (svgX - PAD.left) / cW * (POINTS - 1);
    return Math.max(0, Math.min(POINTS - 1, Math.round(raw)));
  };

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    setHoverIdx(xToIdx(svgX));
  };

  // Hover data
  const hIdx   = hoverIdx ?? POINTS - 1;
  const hPrice = prices[hIdx];
  const hDate  = fmtDate(seriesData[hIdx].date);
  const hPct   = ((hPrice - prices[0]) / prices[0]) * 100;
  const hX     = scX(hIdx);
  const hY     = scY(hPrice);
  // Keep tooltip inside chart bounds
  const tipW = 110, tipH = 52, tipPad = 8;
  const tipX = hX + tipPad + tipW > W - PAD.right ? hX - tipW - tipPad : hX + tipPad;
  const tipY = Math.max(PAD.top, Math.min(hY - tipH / 2, PAD.top + cH - tipH));

  const clipId   = `clip-${ticker}-${animKey}`;
  const gradId   = `fill-${ticker}-${animKey}`;
  const filterId = `shadow-${ticker}-${animKey}`;

  return (
    <div className="st-chart-wrap">
      {/* key=animKey forces React to remount the SVG on every data change,
          which restarts the CSS clip animation from scratch */}
      <svg
        key={animKey}
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="st-line-svg"
        aria-label={`${ticker} price chart`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02"/>
          </linearGradient>

          {/* Clip rect that slides from left to right to reveal the chart */}
          <clipPath id={clipId}>
            <rect
              x={PAD.left} y={PAD.top}
              width={cW} height={cH + PAD.bottom}
              className="st-chart-clip-rect"
            />
          </clipPath>

          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.10"/>
          </filter>
        </defs>

        {/* Grid + y-axis labels (not clipped — visible immediately) */}
        {yTicks.map(({ y, label }) => (
          <g key={label}>
            <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="#e8e8e8" strokeWidth="1"/>
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9e5a72">{label}</text>
          </g>
        ))}
        {xTicks.map(({ x, label }) => (
          <text key={label} x={x} y={PAD.top + cH + 18} textAnchor="middle" fontSize="10" fill="#9e5a72">{label}</text>
        ))}

        {/* Area + line — clipped so they animate left → right */}
        <g clipPath={`url(#${clipId})`}>
          <path d={areaPath} fill={`url(#${gradId})`}/>
          <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round"/>
        </g>

        {/* Crosshair */}
        <line
          x1={hX} y1={PAD.top} x2={hX} y2={PAD.top + cH}
          stroke={lineColor} strokeWidth="1" strokeDasharray="4 3" opacity={hoverIdx !== null ? 0.7 : 0}
        />
        {/* Dot on line */}
        <circle
          cx={hX} cy={hY} r="4"
          fill={lineColor} stroke="#ffffff" strokeWidth="2"
          opacity={hoverIdx !== null ? 1 : 0}
        />
        {/* Tooltip box */}
        {hoverIdx !== null && (
          <g>
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="5"
              fill="var(--cds-layer-01, #ffffff)" stroke={lineColor} strokeWidth="1.2" filter={`url(#${filterId})`}/>
            <text x={tipX + 8} y={tipY + 16} fontSize="10" fill="#9e5a72">{hDate}</text>
            <text x={tipX + 8} y={tipY + 31} fontSize="13" fontWeight="700" fill="var(--cds-text-primary, #161616)">${hPrice.toFixed(2)}</text>
            <text x={tipX + 8} y={tipY + 46} fontSize="10" fontWeight="600"
              fill={hPct >= 0 ? '#24a148' : '#da1e28'}>
              {hPct >= 0 ? '+' : ''}{hPct.toFixed(2)}%
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA'];

function PanelAssets() {
  const [tickers,   setTickers]   = useState(DEFAULT_TICKERS);
  const [quotes,    setQuotes]    = useState({});
  const [profiles,  setProfiles]  = useState({});
  const [series,    setSeries]    = useState({});
  const [active,    setActive]    = useState(DEFAULT_TICKERS[0]);
  const [range,     setRange]     = useState('1M');
  const [search,    setSearch]    = useState('');
  const [searching, setSearching] = useState(false);
  const [results,   setResults]   = useState([]);
  const [loadingQ,  setLoadingQ]  = useState(false);
  const [loadingC,  setLoadingC]  = useState(false);
  const [error,     setError]     = useState('');

  const fetchedQuotes   = useRef(new Set());
  const fetchedProfiles = useRef(new Set());
  const fetchedSeries   = useRef(new Set());

  const makeFallbackQuote = (ticker) => {
    const rand  = seededRand(ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 42));
    const base  = { AAPL: 185, MSFT: 415, GOOGL: 175, TSLA: 245 }[ticker] ?? 100;
    const price = parseFloat((base + (rand() - 0.5) * 20).toFixed(2));
    const change = parseFloat(((rand() - 0.48) * 6).toFixed(2));
    return {
      price, change, pct: parseFloat(((change / price) * 100).toFixed(2)),
      high: parseFloat((price * (1 + rand() * 0.02)).toFixed(2)),
      low:  parseFloat((price * (1 - rand() * 0.02)).toFixed(2)),
      open: parseFloat((price - change).toFixed(2)),
      prevClose: parseFloat((price - change).toFixed(2)),
    };
  };

  const fetchQuote = async (ticker) => {
    if (fetchedQuotes.current.has(ticker)) return;
    fetchedQuotes.current.add(ticker);
    setLoadingQ(true);
    try {
      // Finnhub /quote → { c: price, d: change, dp: pct, h, l, o, pc, v }
      const data = await fhFetch({ type: 'quote', ticker });
      setQuotes((prev) => ({
        ...prev,
        [ticker]: {
          price:  data.c  || 0,
          change: data.d  || 0,
          pct:    data.dp || 0,
          high:   data.h  || 0,
          low:    data.l  || 0,
          open:   data.o  || 0,
          prevClose: data.pc || 0,
        },
      }));
    } catch {
      fetchedQuotes.current.delete(ticker);
      // Fall back to seeded demo data
      setQuotes((prev) => ({ ...prev, [ticker]: makeFallbackQuote(ticker) }));
    } finally { setLoadingQ(false); }
  };

  const fetchProfile = async (ticker) => {
    if (fetchedProfiles.current.has(ticker)) return;
    fetchedProfiles.current.add(ticker);
    try {
      // Finnhub /stock/profile2 → { name, marketCapitalization, shareOutstanding, ... }
      const data = await fhFetch({ type: 'profile', ticker });
      setProfiles((prev) => ({ ...prev, [ticker]: data }));
    } catch {
      fetchedProfiles.current.delete(ticker);
    }
  };

  const makeFallbackSeries = (ticker, r) => {
    const days  = r === '1W' ? 7 : r === '1M' ? 30 : 90;
    const rand  = seededRand(ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
    const base  = { AAPL: 185, MSFT: 415, GOOGL: 175, TSLA: 245 }[ticker] ?? 100;
    let price   = base;
    const now   = Date.now();
    return Array.from({ length: days }, (_, i) => {
      price = Math.max(price * (0.985 + rand() * 0.03), 1);
      const d = new Date(now - (days - 1 - i) * 86400000);
      return {
        date:   d.toISOString().slice(0, 10),
        close:  parseFloat(price.toFixed(2)),
        volume: Math.round(rand() * 50e6 + 5e6),
      };
    });
  };

  const fetchSeries = async (ticker, r) => {
    const key = `${ticker}-${r}`;
    if (fetchedSeries.current.has(key)) return;
    fetchedSeries.current.add(key);
    setLoadingC(true);
    try {
      // Finnhub /stock/candle → { s, t:[], c:[], v:[] }
      const data = await fhFetch({ type: 'candle', ticker, range: r });
      if (!data.t?.length) throw new Error('empty');
      const entries = data.t.map((ts, i) => ({
        date:   new Date(ts * 1000).toISOString().slice(0, 10),
        close:  data.c[i],
        volume: data.v[i],
      }));
      setSeries((prev) => ({ ...prev, [key]: entries }));
    } catch {
      fetchedSeries.current.delete(key);
      // Fall back to deterministic demo data so the chart always renders
      const fallback = makeFallbackSeries(ticker, r);
      setSeries((prev) => ({ ...prev, [key]: fallback, [`${key}-demo`]: true }));
    } finally { setLoadingC(false); }
  };

  const retryActive = () => {
    fetchedQuotes.current.delete(active);
    fetchedSeries.current.delete(`${active}-${range}`);
    setError('');
    fetchQuote(active);
    fetchSeries(active, range);
    fetchProfile(active);
  };

  useEffect(() => {
    setError('');
    fetchQuote(active);
    fetchSeries(active, range);
    fetchProfile(active);
  }, [active, range]);

  // Finnhub symbol search → { count, result: [{ description, displaySymbol, symbol, type }] }
  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const data = await fhFetch({ type: 'search', query: search.trim() });
      setResults((data.result || []).slice(0, 6));
    } catch { setError('Symbol search failed.'); }
    finally  { setSearching(false); }
  };

  const addTicker = (sym) => {
    if (!tickers.includes(sym)) setTickers((t) => [...t, sym]);
    setActive(sym);
    setSearch('');
    setResults([]);
  };

  const q       = quotes[active]   || {};
  const pr      = profiles[active] || {};
  const sKey    = `${active}-${range}`;
  const seriesArr = series[sKey] || [];
  const isDemo    = !!series[`${sKey}-demo`];
  const priceUp   = (q.change || 0) >= 0;

  // Finnhub profile2: marketCapitalization is in millions
  const mktCap = pr.marketCapitalization ? fmtBig(pr.marketCapitalization * 1e6) : '—';

  return (
    <div className="st-wrap">

      {/* ── Search bar ── */}
      <div className="st-search-wrap">
        <Search size={16} className="st-search-icon" aria-hidden="true" />
        <input
          className="st-search-input"
          placeholder="Search ticker or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="st-search-btn" onClick={handleSearch} disabled={searching} aria-label="Search">
          {searching ? '…' : <Add size={16} />}
        </button>
        {results.length > 0 && (
          <div className="st-search-dropdown">
            {results.map((r) => (
              <button key={r.symbol} onClick={() => addTicker(r.symbol)} className="st-search-result">
                <strong>{r.displaySymbol}</strong> — {r.description}
              </button>
            ))}
          </div>
        )}
      </div>

      {isDemo && (
        <div style={{ padding:'0.45rem 0.85rem', marginBottom:'0.5rem', background:'#fff8e1', border:'1px solid #ffe082', borderRadius:'0.5rem', fontSize:'0.8rem', color:'#7c5c00' }}>
          Live market data unavailable — showing simulated chart data.
        </div>
      )}
      {error && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', padding:'0.6rem 0.85rem', marginBottom:'0.75rem', background:'#fff1f1', border:'1px solid #ffd7d9', borderRadius:'0.5rem', fontSize:'0.85rem', color:'#a2191f' }}>
          <span>⚠ {error}</span>
          <button onClick={retryActive} style={{ flexShrink:0, padding:'0.3rem 0.75rem', background:'#da1e28', color:'#fff', border:'none', borderRadius:'0.375rem', cursor:'pointer', fontSize:'0.8rem', fontWeight:600 }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Ticker pills ── */}
      <div className="st-tickers">
        {tickers.map((t) => {
          const tq = quotes[t];
          const up = tq ? tq.change >= 0 : true;
          const pct = tq ? `${tq.change >= 0 ? '+' : ''}${Number(tq.pct).toFixed(2)}%` : '—';
          return (
            <span key={t} className={`st-pill${active === t ? ' st-pill--active' : ''} ${up ? 'st-pill--up' : 'st-pill--down'}`}>
              <button className="st-pill-label" onClick={() => setActive(t)}>
                {t} <span>{pct}</span>
              </button>
              {tickers.length > 1 && (
                <button
                  className="st-pill-remove"
                  aria-label={`Remove ${t}`}
                  onClick={() => {
                    const next = tickers.filter((x) => x !== t);
                    setTickers(next);
                    if (active === t) setActive(next[0]);
                  }}
                >
                  <Close size={10} />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* ── Stock detail ── */}
      <div className="st-detail">
        <div className="st-detail-left">
          <h2 className="st-name">{pr.name || active}</h2>
          <div className="st-price">
            {loadingQ ? '…' : q.price ? `$${q.price.toFixed(2)}` : '—'}
          </div>
          <div className={`st-change ${priceUp ? 'st-up' : 'st-down'}`}>
            {q.price ? `${priceUp ? '↗' : '↘'} ${priceUp ? '+' : ''}${q.change?.toFixed(2)} (${priceUp ? '+' : ''}${Number(q.pct || 0).toFixed(2)}%)` : ''}
          </div>
        </div>
        <div className="st-range-btns">
          {['1W','1M','3M'].map((r) => (
            <button
              key={r}
              className={`st-pill${range === r ? ' st-pill--active' : ''}`}
              onClick={() => setRange(r)}
            >{r}</button>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      {loadingC
        ? <div style={{ height:'180px', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--cds-text-secondary)' }}>Loading chart…</div>
        : <StockLineChart key={sKey} ticker={active} seriesData={seriesArr} />
      }

      {/* ── Stat grid ── */}
      <div className="st-stats-grid">
        {[
          { label: 'High',       value: q.high  ? `$${q.high.toFixed(2)}`  : '—' },
          { label: 'Low',        value: q.low   ? `$${q.low.toFixed(2)}`   : '—' },
          { label: 'Open',       value: q.open  ? `$${q.open.toFixed(2)}`  : '—' },
          { label: 'Prev Close', value: q.prevClose ? `$${q.prevClose.toFixed(2)}` : '—' },
          { label: 'Market Cap', value: mktCap },
          { label: 'Exchange',   value: pr.exchange || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="st-stat-card">
            <span className="st-stat-label">{label}</span>
            <span className="st-stat-value">{value}</span>
          </div>
        ))}
      </div>

    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function fmt$(n) { return typeof n === 'number' ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'; }
function fmtPct(n) { return typeof n === 'number' ? `${n > 0 ? '+' : ''}${n.toFixed(1)}%` : '—'; }
function useApi(url) {
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(false);
  const [error, setError]   = useState(null);
  useEffect(() => {
    if (!url) return;
    setLoad(true); setError(null);
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('Non-JSON response — check API is deployed');
      return r.json();
    }).then(setData).catch((e) => setError(e.message)).finally(() => setLoad(false));
  }, [url]);
  return { data, loading, error };
}

function PanelLoadingOrError({ loading, error, children }) {
  if (loading) return <div className="panel-loading"><span className="panel-loading-spinner" /><span>Loading…</span></div>;
  if (error)   return <div className="panel-error">⚠ {error}</div>;
  return children;
}

// ── Donut chart (shared) ────────────────────────────────────────────────────────
function DonutChart({ slices, totalLabel, totalValue }) {
  const R = 110, CX = 140, CY = 140;
  let cum = 0;
  const paths = slices.map((s) => {
    const a0 = (cum / 100) * 2 * Math.PI - Math.PI / 2;
    cum += s.pct;
    const a1 = (cum / 100) * 2 * Math.PI - Math.PI / 2;
    const x1 = CX + R * Math.cos(a0), y1 = CY + R * Math.sin(a0);
    const x2 = CX + R * Math.cos(a1), y2 = CY + R * Math.sin(a1);
    return { ...s, d: `M${CX},${CY} L${x1},${y1} A${R},${R},0,${s.pct > 50 ? 1 : 0},1,${x2},${y2} Z` };
  });
  return (
    <svg viewBox="0 0 280 280" width="240" height="240" aria-hidden="true">
      {paths.map((p) => <path key={p.label} d={p.d} fill={p.color} stroke="#fff" strokeWidth="2" />)}
      <circle cx={CX} cy={CY} r={60} fill="var(--cds-layer-01, #fff8fa)" />
      <text x={CX} y={CY - 6} textAnchor="middle" fontSize="11" fill="var(--cds-text-secondary)" fontFamily="inherit">{totalLabel}</text>
      <text x={CX} y={CY + 12} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--cds-text-primary)" fontFamily="inherit">{totalValue}</text>
    </svg>
  );
}

// ── Sparkline bar chart ────────────────────────────────────────────────────────
function BarSparkline({ data, colorFn }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bar-sparkline">
      {data.map((d, i) => (
        <div key={i} className="bar-sparkline-col">
          <div
            className="bar-sparkline-bar"
            style={{ height: `${(d.value / max) * 100}%`, background: colorFn ? colorFn(d) : '#f472a0' }}
            title={`${d.label}: ${fmt$(d.value)}`}
          />
          <span className="bar-sparkline-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Health score ring ──────────────────────────────────────────────────────────
function HealthScoreRing({ score }) {
  const r = 52, circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? '#24a148' : score >= 60 ? '#f472a0' : '#da1e28';
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
  return (
    <svg viewBox="0 0 140 140" width="130" height="130" aria-label={`Health score ${score}`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#f0e0e8" strokeWidth="12" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform="rotate(-90 70 70)" />
      <text x="70" y="64" textAnchor="middle" fontSize="24" fontWeight="700" fill={color} fontFamily="inherit">{score}</text>
      <text x="70" y="82" textAnchor="middle" fontSize="14" fontWeight="600" fill={color} fontFamily="inherit">{grade}</text>
      <text x="70" y="98" textAnchor="middle" fontSize="9" fill="var(--cds-text-secondary)" fontFamily="inherit">HEALTH SCORE</text>
    </svg>
  );
}

// ── Net Worth line chart ────────────────────────────────────────────────────────
function NetWorthChart({ history }) {
  if (!history?.length) return null;
  const W = 560, H = 140, PAD = { t: 10, r: 8, b: 28, l: 70 };
  const vals = history.map((d) => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const sX = (i) => PAD.l + (i / (history.length - 1)) * (W - PAD.l - PAD.r);
  const sY = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - min) / (max - min || 1));
  const pts = vals.map((v, i) => `${sX(i)},${sY(v)}`).join(' ');
  const area = `M${sX(0)},${sY(vals[0])} ` + vals.map((v, i) => `L${sX(i)},${sY(v)}`).join(' ')
    + ` L${sX(history.length - 1)},${H - PAD.b} L${sX(0)},${H - PAD.b} Z`;
  const up = vals[vals.length - 1] >= vals[0];
  const col = up ? '#24a148' : '#da1e28';
  const ticks = [0, Math.floor(history.length / 2), history.length - 1];
  return (
    <div className="nw-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="nw-chart-svg" aria-label="Net worth history">
        <defs>
          <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.15"/>
            <stop offset="100%" stopColor={col} stopOpacity="0.01"/>
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const y = PAD.t + (H - PAD.t - PAD.b) * (1 - t);
          return (
            <g key={t}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f0d4e0" strokeWidth="1"/>
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#9e5a72">{fmt$(min + t * (max - min))}</text>
            </g>
          );
        })}
        {ticks.map((i) => (
          <text key={i} x={sX(i)} y={H - PAD.b + 14} textAnchor="middle" fontSize="9" fill="#9e5a72">{history[i].label}</text>
        ))}
        <path d={area} fill="url(#nw-fill)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round"/>
        <circle cx={sX(history.length - 1)} cy={sY(vals[vals.length - 1])} r="4" fill={col} stroke="#fff" strokeWidth="2"/>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Panel: Spending Intelligence ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function PanelSpending() {
  const [view, setView] = useState('overview'); // 'overview' | 'transactions' | 'subscriptions'
  const { data: analysis, loading: aLoad, error: aErr } = useApi('/api/spending?type=analysis');
  const { data: txnData,  loading: tLoad, error: tErr  } = useApi('/api/spending?type=transactions');
  const { data: subData,  loading: sLoad, error: sErr  } = useApi('/api/spending?type=subscriptions');

  return (
    <div className="db-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="db-panel-heading">Spending Intelligence</h2>
          <p className="db-panel-sub">Plaid-powered analysis of your banking activity.</p>
        </div>
        <div className="panel-tab-row">
          {[['overview','Overview'],['transactions','Transactions'],['subscriptions','Subscriptions']].map(([id, label]) => (
            <button key={id} className={`panel-tab${view === id ? ' panel-tab--active' : ''}`} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      </div>

      {view === 'overview' && (
        <PanelLoadingOrError loading={aLoad} error={aErr}>
          {analysis && (
            <>
              {/* Summary cards */}
              <div className="spend-summary-grid">
                {[
                  { label: 'Monthly Income',   value: fmt$(analysis.income),   sub: 'This month',   accent: 'green' },
                  { label: 'Total Expenses',   value: fmt$(analysis.expense),  sub: analysis.expenseChange !== 0 ? `${fmtPct(analysis.expenseChange)} vs last month` : 'This month', accent: analysis.expenseChange > 5 ? 'red' : 'neutral' },
                  { label: 'Net Savings',      value: fmt$(analysis.savings),  sub: `${analysis.savingsRate}% savings rate`, accent: analysis.savings >= 0 ? 'green' : 'red' },
                ].map(({ label, value, sub, accent }) => (
                  <div key={label} className={`spend-summary-card spend-summary-card--${accent}`}>
                    <span className="spend-summary-label">{label}</span>
                    <span className="spend-summary-value">{value}</span>
                    <span className="spend-summary-sub">{sub}</span>
                  </div>
                ))}
              </div>

              {/* Category breakdown */}
              <div className="spend-cats">
                <h3 className="spend-section-title">Spending by Category</h3>
                {(analysis.categories || []).map((c) => (
                  <div key={c.category} className="spend-cat-row">
                    <div className="spend-cat-meta">
                      <span className="spend-cat-dot" style={{ background: c.color }} />
                      <span className="spend-cat-name">{c.category}</span>
                      <span className="spend-cat-pct">{c.pct}%</span>
                      <span className="spend-cat-amt">{fmt$(c.total)}</span>
                    </div>
                    <div className="spend-cat-bar-track">
                      <div className="spend-cat-bar" style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Monthly trend */}
              {analysis.monthlyTrends?.length > 0 && (
                <div className="spend-trend">
                  <h3 className="spend-section-title">Monthly Trend</h3>
                  <div className="spend-trend-bars">
                    {analysis.monthlyTrends.map((m) => (
                      <div key={m.month} className="spend-trend-col">
                        <div className="spend-trend-bar-group">
                          <div className="spend-trend-bar spend-trend-bar--income"  style={{ height: `${(m.income   / Math.max(...analysis.monthlyTrends.map((x) => x.income),   1)) * 80}px` }} title={`Income: ${fmt$(m.income)}`}/>
                          <div className="spend-trend-bar spend-trend-bar--expense" style={{ height: `${(m.expenses / Math.max(...analysis.monthlyTrends.map((x) => x.expenses), 1)) * 80}px` }} title={`Expenses: ${fmt$(m.expenses)}`}/>
                        </div>
                        <span className="spend-trend-label">{m.month}</span>
                      </div>
                    ))}
                  </div>
                  <div className="spend-trend-legend">
                    <span className="spend-trend-legend-dot spend-trend-legend-dot--income" />Income
                    <span className="spend-trend-legend-dot spend-trend-legend-dot--expense" />Expenses
                  </div>
                </div>
              )}

              {/* Unusual transactions */}
              {analysis.unusual?.length > 0 && (
                <div className="spend-unusual">
                  <h3 className="spend-section-title">⚠ Unusual Transactions</h3>
                  {analysis.unusual.map((t, i) => (
                    <div key={i} className="spend-unusual-row">
                      <div>
                        <span className="spend-unusual-desc">{t.desc}</span>
                        <span className="spend-unusual-reason">{t.flagReason}</span>
                      </div>
                      <span className="db-down">{fmt$(Math.abs(t.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </PanelLoadingOrError>
      )}

      {view === 'transactions' && (
        <PanelLoadingOrError loading={tLoad} error={tErr}>
          {txnData && (
            <div className="db-table-wrap">
              <table className="db-table">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
                <tbody>
                  {(txnData.transactions || []).map((t, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'IBM Plex Mono', fontSize: '0.8rem' }}>{t.date}</td>
                      <td>{t.desc}</td>
                      <td><span className="spend-cat-chip" style={{ background: `${(t.category === 'Income' ? '#d1fae5' : '#fce7f3')}`, color: `${t.category === 'Income' ? '#065f46' : '#9d2256'}` }}>{t.category}</span></td>
                      <td className={t.amount > 0 ? 'db-up' : 'db-down'}>{t.amount > 0 ? '+' : ''}{fmt$(Math.abs(t.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelLoadingOrError>
      )}

      {view === 'subscriptions' && (
        <PanelLoadingOrError loading={sLoad} error={sErr}>
          {subData && (
            <>
              <div className="sub-summary">
                <div className="sub-summary-card">
                  <span className="sub-summary-label">Total Monthly</span>
                  <span className="sub-summary-value">{fmt$(subData.totalMonthly)}</span>
                </div>
                <div className="sub-summary-card">
                  <span className="sub-summary-label">Annual Cost</span>
                  <span className="sub-summary-value">{fmt$(subData.totalMonthly * 12)}</span>
                </div>
              </div>
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead><tr><th>Service</th><th>Category</th><th>Monthly</th><th>Annual</th></tr></thead>
                  <tbody>
                    {(subData.subscriptions || []).map((s, i) => (
                      <tr key={i}>
                        <td><strong>{s.service}</strong></td>
                        <td><span className="spend-cat-chip" style={{ background: '#fce7f3', color: '#9d2256' }}>{s.category}</span></td>
                        <td className="db-down">{fmt$(s.amount)}</td>
                        <td className="db-down">{fmt$(s.amount * 12)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="panel-hint">💡 Review entertainment subscriptions — you have {(subData.subscriptions || []).filter((s) => s.category === 'Entertainment').length} active at {fmt$((subData.subscriptions || []).filter((s) => s.category === 'Entertainment').reduce((acc, s) => acc + s.amount, 0))}/month.</p>
            </>
          )}
        </PanelLoadingOrError>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Panel: Portfolio + Net Worth (combined) ───────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function PanelPortfolioAndWealth({ profile }) {
  const [view, setView] = useState('allocation');
  const { data, loading, error } = useApi('/api/finance?type=portfolio');
  const { data: nwHistory, loading: hLoad, error: hErr } = useApi('/api/finance?type=networth');

  const RISK_DESC    = { conservative: 'Low risk', moderate: 'Balanced', aggressive: 'High risk' };
  const HORIZON_DESC = { short: '< 3 years', medium: '3–10 years', long: '10+ years' };
  const goals        = (profile?.goals ?? []).map((g) => GOAL_LABELS[g] ?? g);

  return (
    <div className="db-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="db-panel-heading">Portfolio & Net Worth</h2>
          <p className="db-panel-sub">Plaid · Coinbase · Finnhub — unified view.</p>
        </div>
        <div className="panel-tab-row">
          {[['allocation','Allocation'],['networth','Net Worth'],['stocks','Stocks'],['crypto','Crypto'],['profile','Profile']].map(([id, label]) => (
            <button key={id} className={`panel-tab${view === id ? ' panel-tab--active' : ''}`} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Allocation tab ── */}
      {view === 'allocation' && (
        <PanelLoadingOrError loading={loading} error={error}>
          {data && (
            <>
              <div className="portfolio-net-worth-banner">
                <div>
                  <span className="portfolio-nw-label">Net Worth</span>
                  <span className="portfolio-nw-value">{fmt$(data.netWorth)}</span>
                </div>
                <div>
                  <span className="portfolio-nw-label">Total Assets</span>
                  <span className="portfolio-nw-value">{fmt$(data.totalAssets)}</span>
                </div>
                <div>
                  <span className="portfolio-nw-label">Total Debt</span>
                  <span className="portfolio-nw-value db-down">{fmt$(data.totalDebt)}</span>
                </div>
              </div>
              <div className="db-pie-wrap">
                <DonutChart slices={data.allocation} totalLabel="Net Worth" totalValue={fmt$(data.netWorth)} />
                <ul className="db-pie-legend">
                  {data.allocation.map((a) => (
                    <li key={a.label} className="db-pie-legend-item">
                      <span className="db-pie-legend-dot" style={{ background: a.color }} />
                      <span className="db-pie-legend-label">{a.label}</span>
                      <span className="db-pie-legend-pct">{a.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="portfolio-metrics-grid">
                {[
                  { label: 'Diversification Score', value: `${data.diversScore}/100`,      good: data.diversScore >= 65 },
                  { label: 'Crypto Exposure',        value: `${data.cryptoPct}%`,           good: data.cryptoPct <= 15 },
                  { label: 'Top Holding',            value: `${data.topConcentration}%`,    good: data.topConcentration <= 20 },
                  { label: 'Health Score',           value: `${data.healthScore}/100`,      good: data.healthScore >= 65 },
                ].map(({ label, value, good }) => (
                  <div key={label} className="portfolio-metric-card">
                    <span className="portfolio-metric-label">{label}</span>
                    <span className={`portfolio-metric-value ${good ? 'db-up' : 'db-down'}`}>{value}</span>
                  </div>
                ))}
              </div>
              {data.sectors?.length > 0 && (
                <div className="spend-cats">
                  <h3 className="spend-section-title">Sector Exposure (Equities)</h3>
                  {data.sectors.map((s, i) => {
                    const colors = ['#f472a0','#c0356a','#9d2256','#f9a8b8','#6b2040'];
                    return (
                      <div key={s.label} className="spend-cat-row">
                        <div className="spend-cat-meta">
                          <span className="spend-cat-dot" style={{ background: colors[i % colors.length] }} />
                          <span className="spend-cat-name">{s.label}</span>
                          <span className="spend-cat-pct">{s.pct}%</span>
                          <span className="spend-cat-amt">{fmt$(s.value)}</span>
                        </div>
                        <div className="spend-cat-bar-track">
                          <div className="spend-cat-bar" style={{ width: `${s.pct}%`, background: colors[i % colors.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </PanelLoadingOrError>
      )}

      {/* ── Net Worth tab ── */}
      {view === 'networth' && (
        <PanelLoadingOrError loading={loading || hLoad} error={error || hErr}>
          {data && nwHistory && (
            <>
              <div className="nw-snapshot-grid">
                {[
                  { label: 'Net Worth',    value: fmt$(data.netWorth),   note: 'Assets minus debt',     color: '#24a148' },
                  { label: 'Total Assets', value: fmt$(data.totalAssets), note: 'All holdings combined', color: '#f472a0' },
                  { label: 'Total Debt',   value: fmt$(data.totalDebt),   note: 'Credit cards & loans',  color: '#da1e28' },
                  { label: 'Liquid Cash',  value: fmt$(data.plaidAccounts?.filter((a) => a.type === 'checking' || a.type === 'savings').reduce((s, a) => s + a.balance, 0) || 0), note: 'Checking + savings', color: '#3b82d4' },
                ].map(({ label, value, note, color }) => (
                  <div key={label} className="nw-snapshot-card">
                    <div className="nw-snapshot-indicator" style={{ background: color }} />
                    <div>
                      <span className="nw-snapshot-label">{label}</span>
                      <span className="nw-snapshot-value" style={{ color }}>{value}</span>
                      <span className="nw-snapshot-note">{note}</span>
                    </div>
                  </div>
                ))}
              </div>
              <NetWorthChart history={nwHistory.history} />
              <h3 className="spend-section-title">Account Breakdown</h3>
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead><tr><th>Account</th><th>Type</th><th>Balance</th></tr></thead>
                  <tbody>
                    {(data.plaidAccounts || []).map((a) => (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td><span className={`db-badge db-badge--${a.type === 'credit' ? 'sell' : a.type === 'investment' ? 'buy' : 'debit'}`}>{a.type}</span></td>
                        <td className={a.balance < 0 ? 'db-down' : 'db-up'}>{fmt$(Math.abs(a.balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </PanelLoadingOrError>
      )}

      {/* ── Stocks tab ── */}
      {view === 'stocks' && (
        <PanelLoadingOrError loading={loading} error={error}>
          {data && (
            <div className="db-table-wrap">
              <table className="db-table">
                <thead><tr><th>Symbol</th><th>Price</th><th>Shares</th><th>Value</th><th>Allocation</th></tr></thead>
                <tbody>
                  {(data.stocks || []).map((s) => {
                    const alloc = data.totalAssets > 0 ? ((s.value / data.totalAssets) * 100).toFixed(1) : '0';
                    return (
                      <tr key={s.symbol}>
                        <td><span className="db-ticker">{s.symbol}</span></td>
                        <td style={{ fontFamily: 'IBM Plex Mono' }}>{fmt$(s.price)}</td>
                        <td>{s.shares.toFixed(2)}</td>
                        <td className="db-up">{fmt$(s.value)}</td>
                        <td><span className="alloc-bar-inline"><span style={{ width: `${alloc}%` }} />{alloc}%</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PanelLoadingOrError>
      )}

      {/* ── Crypto tab ── */}
      {view === 'crypto' && (
        <PanelLoadingOrError loading={loading} error={error}>
          {data && (
            <>
              <div className="sub-summary">
                <div className="sub-summary-card">
                  <span className="sub-summary-label">Crypto Total</span>
                  <span className="sub-summary-value">{fmt$(data.crypto?.reduce((s, h) => s + h.value, 0) || 0)}</span>
                </div>
                <div className="sub-summary-card">
                  <span className="sub-summary-label">Crypto % of Portfolio</span>
                  <span className={`sub-summary-value ${data.cryptoPct > 15 ? 'db-down' : 'db-up'}`}>{data.cryptoPct}%</span>
                </div>
              </div>
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead><tr><th>Coin</th><th>Price</th><th>Qty</th><th>Value</th><th>Weight</th></tr></thead>
                  <tbody>
                    {(data.crypto || []).map((h) => {
                      const cryptoTotal = data.crypto.reduce((s, x) => s + x.value, 0);
                      const weight = cryptoTotal > 0 ? ((h.value / cryptoTotal) * 100).toFixed(1) : '0';
                      return (
                        <tr key={h.symbol}>
                          <td><span className="db-ticker" style={{ background: '#ede9fe', color: '#5b21b6' }}>{h.symbol}</span> <small>{h.name}</small></td>
                          <td style={{ fontFamily: 'IBM Plex Mono' }}>{fmt$(h.price)}</td>
                          <td style={{ fontFamily: 'IBM Plex Mono', fontSize: '0.8rem' }}>{h.qty}</td>
                          <td className="db-up">{fmt$(h.value)}</td>
                          <td><span className="alloc-bar-inline"><span style={{ width: `${weight}%`, background: '#7c5cd8' }} />{weight}%</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {data.cryptoPct > 15 && (
                <p className="panel-hint">⚠ Crypto exceeds 15% of your total portfolio. Consider rebalancing to reduce volatility risk.</p>
              )}
            </>
          )}
        </PanelLoadingOrError>
      )}

      {/* ── Profile tab ── */}
      {view === 'profile' && (
        <div className="db-kv-grid">
          {[
            { label: 'Goals',           value: goals.length ? goals.join(', ') : 'None set' },
            { label: 'Risk appetite',   value: profile?.risk ? `${profile.risk} — ${RISK_DESC[profile.risk] ?? ''}` : 'Not set' },
            { label: 'Time horizon',    value: profile?.horizon ? `${profile.horizon} — ${HORIZON_DESC[profile.horizon] ?? ''}` : 'Not set' },
            { label: 'Annual income',   value: profile?.annualIncome ? fmt$(Number(profile.annualIncome)) : 'Not set' },
            { label: 'Monthly savings', value: profile?.monthlySavings ? fmt$(Number(profile.monthlySavings)) : 'Not set' },
            { label: 'Emergency fund',  value: profile?.emergencyFund ?? 'Not set' },
            { label: 'Employment',      value: profile?.employmentStatus ?? 'Not set' },
            { label: 'Credit score',    value: profile?.creditScore ?? 'Not set' },
            { label: 'Location',        value: profile?.city && profile?.usState ? `${profile.city}, ${profile.usState}` : profile?.usState ?? 'Not set' },
            { label: 'Preferences',     value: (profile?.preferences ?? []).join(', ') || 'None' },
          ].map(({ label, value }) => (
            <div key={label} className="db-kv-row">
              <span className="db-kv-label">{label}</span>
              <span className="db-kv-value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Budget note store (localStorage) ──────────────────────────────────────────
const BUDGET_KEY = 'gumdrop_budget_notes';
function loadBudgetNotes() {
  try { return JSON.parse(localStorage.getItem(BUDGET_KEY) || '[]'); } catch { return []; }
}
function saveBudgetNotes(notes) {
  try { localStorage.setItem(BUDGET_KEY, JSON.stringify(notes)); } catch {}
}
function useBudget() {
  const [notes, setNotes] = useState(loadBudgetNotes);
  const add = (title, content) => {
    const note = { id: Date.now(), title: title.trim(), content: content.trim(), createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) };
    setNotes((prev) => { const next = [note, ...prev]; saveBudgetNotes(next); return next; });
  };
  const remove = (id) => setNotes((prev) => { const next = prev.filter((n) => n.id !== id); saveBudgetNotes(next); return next; });
  return { notes, add, remove };
}

// ── Detect whether a Gumdrop reply contains budget/financial plan content ──────
function isBudgetReply(text) {
  const lower = text.toLowerCase();
  const triggers = ['budget', 'spending plan', 'monthly plan', 'savings plan', 'financial plan', 'allocation plan', 'expense breakdown', '50/30/20', 'zero-based', 'emergency fund plan', 'debt payoff plan', 'cut back on', 'reduce spending', 'save more'];
  return triggers.some((t) => lower.includes(t)) && text.length > 120;
}
function deriveBudgetTitle(userText) {
  const trimmed = userText.trim();
  return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed || 'Budget note';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Panel: Spending + Financial Health (combined) ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function PanelSpendingAndHealth() {
  const [view, setView] = useState('overview');
  const { notes, add: addBudgetNote, remove: removeBudgetNote } = useBudget();
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody,  setNoteBody]  = useState('');
  const { data: analysis, loading: aLoad, error: aErr } = useApi('/api/spending?type=analysis');
  const { data: txnData,  loading: tLoad, error: tErr  } = useApi('/api/spending?type=transactions');
  const { data: subData,  loading: sLoad, error: sErr  } = useApi('/api/spending?type=subscriptions');
  const { data: portfolio } = useApi('/api/finance?type=portfolio');

  const healthScore = portfolio?.healthScore ?? null;
  const savingsRate = analysis?.savingsRate ?? null;
  const diversScore = portfolio?.diversScore ?? null;
  const cryptoPct   = portfolio?.cryptoPct ?? null;

  const components = healthScore !== null ? [
    { label: 'Diversification', score: diversScore ?? 70, detail: cryptoPct > 20 ? `Crypto at ${cryptoPct}% — consider reducing.` : 'Well balanced across asset classes.' },
    { label: 'Savings Rate',    score: savingsRate !== null ? Math.min(100, Math.round(savingsRate * 4)) : 70, detail: savingsRate !== null ? `${savingsRate}% savings rate${savingsRate >= 20 ? ' — on target!' : ' — aim for 20%+.'}` : 'Loading…' },
    { label: 'Debt Ratio',      score: Math.round(Math.max(0, 100 - (portfolio?.totalDebt / Math.max(portfolio?.totalAssets, 1)) * 200)), detail: `Debt is ${portfolio ? ((portfolio.totalDebt / portfolio.totalAssets) * 100).toFixed(1) : '—'}% of assets.` },
    { label: 'Net Worth Growth',score: 72, detail: 'Net worth growing year-over-year.' },
  ] : [];

  const topActions = [
    savingsRate !== null && savingsRate < 20 && `Increase savings rate to 20%+ (currently ${savingsRate}%)`,
    diversScore !== null && diversScore < 65 && 'Reduce top holding concentration to improve diversification',
    cryptoPct !== null && cryptoPct > 15 && `Trim crypto exposure from ${cryptoPct}% toward 10–15%`,
    'Review and cancel unused subscriptions to free up $100–200/month',
    'Build emergency fund to 6 months of expenses',
  ].filter(Boolean).slice(0, 4);

  return (
    <div className="db-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="db-panel-heading">Spending & Health</h2>
          <p className="db-panel-sub">Plaid-powered analysis · AI financial wellness score.</p>
        </div>
        <div className="panel-tab-row">
          {[['overview','Overview'],['health','Health'],['budgeting','Budgeting'],['transactions','Transactions'],['subscriptions','Subscriptions']].map(([id, label]) => (
            <button key={id} className={`panel-tab${view === id ? ' panel-tab--active' : ''}`} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Spending Overview tab ── */}
      {view === 'overview' && (
        <PanelLoadingOrError loading={aLoad} error={aErr}>
          {analysis && (
            <>
              <div className="spend-summary-grid">
                {[
                  { label: 'Monthly Income', value: fmt$(analysis.income),  sub: 'This month', accent: 'green' },
                  { label: 'Total Expenses', value: fmt$(analysis.expense), sub: analysis.expenseChange !== 0 ? `${fmtPct(analysis.expenseChange)} vs last month` : 'This month', accent: analysis.expenseChange > 5 ? 'red' : 'neutral' },
                  { label: 'Net Savings',    value: fmt$(analysis.savings), sub: `${analysis.savingsRate}% savings rate`, accent: analysis.savings >= 0 ? 'green' : 'red' },
                ].map(({ label, value, sub, accent }) => (
                  <div key={label} className={`spend-summary-card spend-summary-card--${accent}`}>
                    <span className="spend-summary-label">{label}</span>
                    <span className="spend-summary-value">{value}</span>
                    <span className="spend-summary-sub">{sub}</span>
                  </div>
                ))}
              </div>
              <div className="spend-cats">
                <h3 className="spend-section-title">Spending by Category</h3>
                {(analysis.categories || []).map((c) => (
                  <div key={c.category} className="spend-cat-row">
                    <div className="spend-cat-meta">
                      <span className="spend-cat-dot" style={{ background: c.color }} />
                      <span className="spend-cat-name">{c.category}</span>
                      <span className="spend-cat-pct">{c.pct}%</span>
                      <span className="spend-cat-amt">{fmt$(c.total)}</span>
                    </div>
                    <div className="spend-cat-bar-track">
                      <div className="spend-cat-bar" style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                  </div>
                ))}
              </div>
              {analysis.monthlyTrends?.length > 0 && (
                <div className="spend-trend">
                  <h3 className="spend-section-title">Monthly Trend</h3>
                  <div className="spend-trend-bars">
                    {analysis.monthlyTrends.map((m) => (
                      <div key={m.month} className="spend-trend-col">
                        <div className="spend-trend-bar-group">
                          <div className="spend-trend-bar spend-trend-bar--income"  style={{ height: `${(m.income   / Math.max(...analysis.monthlyTrends.map((x) => x.income),   1)) * 80}px` }} title={`Income: ${fmt$(m.income)}`}/>
                          <div className="spend-trend-bar spend-trend-bar--expense" style={{ height: `${(m.expenses / Math.max(...analysis.monthlyTrends.map((x) => x.expenses), 1)) * 80}px` }} title={`Expenses: ${fmt$(m.expenses)}`}/>
                        </div>
                        <span className="spend-trend-label">{m.month}</span>
                      </div>
                    ))}
                  </div>
                  <div className="spend-trend-legend">
                    <span className="spend-trend-legend-dot spend-trend-legend-dot--income" />Income
                    <span className="spend-trend-legend-dot spend-trend-legend-dot--expense" />Expenses
                  </div>
                </div>
              )}
              {analysis.unusual?.length > 0 && (
                <div className="spend-unusual">
                  <h3 className="spend-section-title">⚠ Unusual Transactions</h3>
                  {analysis.unusual.map((t, i) => (
                    <div key={i} className="spend-unusual-row">
                      <div>
                        <span className="spend-unusual-desc">{t.desc}</span>
                        <span className="spend-unusual-reason">{t.flagReason}</span>
                      </div>
                      <span className="db-down">{fmt$(Math.abs(t.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </PanelLoadingOrError>
      )}

      {/* ── Health tab ── */}
      {view === 'health' && (
        <>
          <div className="health-top">
            <div className="health-score-wrap">
              {healthScore !== null ? (
                <HealthScoreRing score={healthScore} />
              ) : (
                <div className="panel-loading"><span className="panel-loading-spinner" /></div>
              )}
              <div className="health-label-block">
                <p className="health-label">Overall Score</p>
                <p className="health-desc">
                  {healthScore !== null
                    ? healthScore >= 80 ? 'Excellent financial health. Keep it up!'
                      : healthScore >= 65 ? 'Good — a few tweaks will push you to excellent.'
                      : healthScore >= 50 ? 'Fair — focus on savings rate and diversification.'
                      : 'Needs attention — prioritise debt and savings.'
                    : 'Computing your score…'}
                </p>
              </div>
            </div>
            {components.length > 0 && (
              <div className="health-components">
                {components.map(({ label, score, detail }) => {
                  const color = score >= 75 ? '#24a148' : score >= 55 ? '#f472a0' : '#da1e28';
                  return (
                    <div key={label} className="health-component-row">
                      <div className="health-component-header">
                        <span className="health-component-label">{label}</span>
                        <span className="health-component-score" style={{ color }}>{score}/100</span>
                      </div>
                      <div className="health-component-track">
                        <div className="health-component-fill" style={{ width: `${score}%`, background: color }} />
                      </div>
                      <span className="health-component-detail">{detail}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {topActions.length > 0 && (
            <div className="health-actions">
              <h3 className="spend-section-title">✦ AI Recommendations</h3>
              {topActions.map((action, i) => (
                <div key={i} className="health-action-row">
                  <span className="health-action-num">{i + 1}</span>
                  <span className="health-action-text">{action}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Transactions tab ── */}
      {view === 'transactions' && (
        <PanelLoadingOrError loading={tLoad} error={tErr}>
          {txnData && (
            <div className="db-table-wrap">
              <table className="db-table">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
                <tbody>
                  {(txnData.transactions || []).map((t, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'IBM Plex Mono', fontSize: '0.8rem' }}>{t.date}</td>
                      <td>{t.desc}</td>
                      <td><span className="spend-cat-chip" style={{ background: t.category === 'Income' ? '#d1fae5' : '#fce7f3', color: t.category === 'Income' ? '#065f46' : '#9d2256' }}>{t.category}</span></td>
                      <td className={t.amount > 0 ? 'db-up' : 'db-down'}>{t.amount > 0 ? '+' : ''}{fmt$(Math.abs(t.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelLoadingOrError>
      )}

      {/* ── Subscriptions tab ── */}
      {view === 'subscriptions' && (
        <PanelLoadingOrError loading={sLoad} error={sErr}>
          {subData && (
            <>
              <div className="sub-summary">
                <div className="sub-summary-card">
                  <span className="sub-summary-label">Total Monthly</span>
                  <span className="sub-summary-value">{fmt$(subData.totalMonthly)}</span>
                </div>
                <div className="sub-summary-card">
                  <span className="sub-summary-label">Annual Cost</span>
                  <span className="sub-summary-value">{fmt$(subData.totalMonthly * 12)}</span>
                </div>
              </div>
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead><tr><th>Service</th><th>Category</th><th>Monthly</th><th>Annual</th></tr></thead>
                  <tbody>
                    {(subData.subscriptions || []).map((s, i) => (
                      <tr key={i}>
                        <td><strong>{s.service}</strong></td>
                        <td><span className="spend-cat-chip" style={{ background: '#fce7f3', color: '#9d2256' }}>{s.category}</span></td>
                        <td className="db-down">{fmt$(s.amount)}</td>
                        <td className="db-down">{fmt$(s.amount * 12)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="panel-hint">💡 Review entertainment subscriptions — you have {(subData.subscriptions || []).filter((s) => s.category === 'Entertainment').length} active at {fmt$((subData.subscriptions || []).filter((s) => s.category === 'Entertainment').reduce((acc, s) => acc + s.amount, 0))}/month.</p>
            </>
          )}
        </PanelLoadingOrError>
      )}

      {/* ── Budgeting tab ── */}
      {view === 'budgeting' && (
        <div className="budget-wrap">
          <p className="db-panel-sub" style={{ marginBottom: '1rem' }}>
            Ask Gumdrop in the AI chat to build you a budget plan — it will appear here automatically. You can also add your own notes below.
          </p>

          {/* Manual note form */}
          <div className="budget-add-form">
            <input
              className="budget-note-title-input"
              placeholder="Note title (e.g. June Budget)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              maxLength={60}
            />
            <textarea
              className="budget-note-body-input"
              placeholder="Paste Gumdrop's budget advice or write your own plan…"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={4}
            />
            <button
              className="budget-save-btn"
              disabled={!noteTitle.trim() || !noteBody.trim()}
              onClick={() => { addBudgetNote(noteTitle, noteBody); setNoteTitle(''); setNoteBody(''); }}
            >
              Save note
            </button>
          </div>

          {/* Saved notes */}
          {notes.length === 0 ? (
            <div className="budget-empty">
              <p>No budget notes yet.</p>
              <p>Ask Gumdrop <em>"Create a monthly budget plan for me"</em> and it will save here automatically.</p>
            </div>
          ) : (
            <div className="budget-notes-list">
              {notes.map((n) => {
                const notePieSlices = isBudgetReply(n.content) ? parseBudgetPieData(n.content) : null;
                return (
                  <div key={n.id} className="budget-note-card">
                    <div className="budget-note-header">
                      <span className="budget-note-title">{n.title}</span>
                      <div className="budget-note-meta">
                        <span className="budget-note-date">{n.createdAt}</span>
                        <button
                          className="budget-note-del"
                          onClick={() => removeBudgetNote(n.id)}
                          aria-label="Delete note"
                          title="Delete"
                        >
                          <TrashCan size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="budget-note-body chat-bot-text"
                      dangerouslySetInnerHTML={{ __html: `<p>${n.content
                        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                        .replace(/^[*\-•] (.+)$/gm, '<li>$1</li>')
                        .replace(/(<li>[\s\S]*?<\/li>)(\n<li>)/g, '$1$2')
                        .replace(/(<li>)/g, '<ul>$1').replace(/(<\/li>)(?!\n<li>)/g, '$1</ul>')
                        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
                        .replace(/\n\n/g, '</p><p>')
                        .replace(/\n/g, '<br/>')}</p>` }}
                    />
                    {notePieSlices && <BudgetPieChart slices={notePieSlices} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Panel: Markets + Insights (combined) ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function PanelMarketsAndInsights() {
  const [activeTicker, setActiveTicker] = useState('AAPL');
  const [view, setView] = useState('news');

  const { data: newsData, loading: nLoad, error: nErr } = useApi(
    view === 'news' ? `/api/stock?type=news&ticker=${activeTicker}` : null
  );
  const { data: recData, loading: rLoad, error: rErr } = useApi(
    view === 'analyst' ? `/api/stock?type=recommend&ticker=${activeTicker}` : null
  );
  const { data: earnData, loading: eLoad, error: eErr } = useApi(
    view === 'earnings' ? `/api/stock?type=earnings&ticker=${activeTicker}` : null
  );

  const WATCH = ['AAPL', 'MSFT', 'GOOGL', 'NVDA'];
  const loading = nLoad || rLoad || eLoad;
  const error   = (view === 'news' ? nErr : view === 'analyst' ? rErr : eErr) || null;

  return (
    <div className="mkt-panel">
      {/* ── Header ── */}
      <div className="mkt-header">
        <div>
          <h2 className="mkt-title">Markets &amp; Insights</h2>
          <p className="mkt-sub">Live quotes · Analyst ratings · Earnings · News</p>
        </div>
        <div className="mkt-tabs">
          {[['news','News'],['analyst','Analyst'],['earnings','Earnings']].map(([id, label]) => (
            <button key={id} className={`mkt-tab${view === id ? ' mkt-tab--active' : ''}`} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* Stock chart + quote strip */}
      <PanelAssets />

      {/* ── Watchlist ticker selector for news/analyst/earnings ── */}
      <div className="mkt-watchlist">
        {WATCH.map((t) => (
          <button
            key={t}
            className={`mkt-watch-btn${activeTicker === t ? ' mkt-watch-btn--active' : ''}`}
            onClick={() => setActiveTicker(t)}
          >{t}</button>
        ))}
      </div>

      <PanelLoadingOrError loading={loading} error={error}>
        {/* ── News ── */}
        {view === 'news' && (newsData || []).length > 0 && (
          <div className="mkt-news-list">
            {(Array.isArray(newsData) ? newsData : []).slice(0, 6).map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="mkt-news-item">
                <div className="mkt-news-source">News · {a.datetime}</div>
                <div className="mkt-news-headline">{a.headline}</div>
                {a.summary && <div className="mkt-news-summary">{a.summary}</div>}
              </a>
            ))}
          </div>
        )}

        {/* ── Analyst ── */}
        {view === 'analyst' && recData && (
          <div className="mkt-analyst-panel">
            <div className="mkt-analyst-consensus">
              <div className={`mkt-analyst-verdict mkt-analyst-verdict--${(recData.consensus || 'hold').toLowerCase().replace(' ', '-')}`}>
                {recData.consensus || '—'}
              </div>
              <div className="mkt-analyst-meta">
                <span>{recData.total || 0} analysts</span><span>·</span>
                <span>{recData.buy_pct || 0}% bullish</span><span>·</span>
                <span>{recData.period || ''}</span>
              </div>
            </div>
            <div className="mkt-analyst-bars">
              {[
                { label: 'Strong Buy',  count: recData.strong_buy  || 0, color: '#24a148' },
                { label: 'Buy',         count: recData.buy         || 0, color: '#6fdc8c' },
                { label: 'Hold',        count: recData.hold        || 0, color: '#f4b45a' },
                { label: 'Sell',        count: recData.sell        || 0, color: '#ff8389' },
                { label: 'Strong Sell', count: recData.strong_sell || 0, color: '#da1e28' },
              ].map(({ label, count, color }) => (
                <div key={label} className="mkt-analyst-bar-row">
                  <span className="mkt-analyst-bar-label">{label}</span>
                  <div className="mkt-analyst-bar-track">
                    <div className="mkt-analyst-bar-fill" style={{ width: `${(count / Math.max(recData.total || 1, 1)) * 100}%`, background: color }} />
                  </div>
                  <span className="mkt-analyst-bar-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Earnings ── */}
        {view === 'earnings' && (earnData || []).length > 0 && (
          <div className="mkt-table-wrap">
            <table className="mkt-table">
              <thead><tr><th>Period</th><th>Actual EPS</th><th>Est. EPS</th><th>Surprise</th></tr></thead>
              <tbody>
                {(Array.isArray(earnData) ? earnData : []).map((e, i) => {
                  const surprise = e.surprise_pct;
                  return (
                    <tr key={i}>
                      <td>{e.period}</td>
                      <td>{e.actual_eps    != null ? `$${e.actual_eps.toFixed(2)}`    : '—'}</td>
                      <td>{e.estimated_eps != null ? `$${e.estimated_eps.toFixed(2)}` : '—'}</td>
                      <td className={surprise > 0 ? 'mkt-up' : surprise < 0 ? 'mkt-down' : ''}>
                        {surprise != null ? `${surprise > 0 ? '+' : ''}${surprise.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === 'news'     && (!newsData  || !Array.isArray(newsData)  || newsData.length  === 0) && <p className="mkt-hint">No recent news available. Ensure FINNHUB_API_KEY is configured.</p>}
        {!loading && !error && view === 'analyst'  && !recData   && <p className="mkt-hint">No analyst data available for {activeTicker}.</p>}
        {!loading && !error && view === 'earnings' && (!earnData || !Array.isArray(earnData) || earnData.length === 0)    && <p className="mkt-hint">No earnings data available for {activeTicker}.</p>}
      </PanelLoadingOrError>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
function DashboardPage({ profile, username }) {
  const [activePanel, setActivePanel] = useState('markets');

  const NAV = [
    { id: 'markets',   label: 'Markets',   Icon: ChartLine },
    { id: 'portfolio', label: 'Portfolio', Icon: Growth    },
    { id: 'spending',  label: 'Spending',  Icon: Finance   },
  ];

  const isChat = activePanel === 'chat';

  return (
    <div className="db-layout">
      {/* ── Main content ── */}
      <main className={`db-content${isChat ? ' db-content--chat' : ''}`}>
        {!isChat && <p className="db-sidebar-greeting">Welcome{username ? `, ${username}` : ''}.</p>}
        {activePanel === 'markets'   && <PanelMarketsAndInsights />}
        {activePanel === 'portfolio' && <PanelPortfolioAndWealth profile={profile} />}
        {activePanel === 'spending'  && <PanelSpendingAndHealth />}
        {activePanel === 'chat'      && <ChatView profile={profile} username={username} />}
      </main>

      {/* ── Bottom navigation bar ── */}
      <nav className="db-bottom-nav">
        {/* Gumdrop chat button */}
        <button
          className={`db-bottom-nav-item db-bottom-nav-item--chat${isChat ? ' db-bottom-nav-item--active' : ''}`}
          onClick={() => setActivePanel('chat')}
          aria-label="Gumdrop AI chat"
        >
          <svg viewBox="0 0 32 32" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M28 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6l6 4 6-4h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
            <circle cx="16" cy="14" r="1.5" fill="currentColor"/>
            <circle cx="22" cy="14" r="1.5" fill="currentColor"/>
          </svg>
          <span>AI</span>
        </button>
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`db-bottom-nav-item${activePanel === id ? ' db-bottom-nav-item--active' : ''}`}
            onClick={() => setActivePanel(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
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
            <button className="fc-close" onClick={() => setOpen(false)} aria-label="Close chat"><Close size={16} /></button>
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
// Uses watsonx Orchestrate ADK via /chat Cloudflare Function (MCSP auth).
// No custom LLM calls, no system-prompt injection, no Watson-branded UI.

const QUICK_ACTIONS = [
  { label: 'Review my portfolio', icon: <Growth size={14} aria-hidden="true" /> },
  { label: 'Build emergency fund', icon: <Finance size={14} aria-hidden="true" /> },
  { label: 'Explain ETFs', icon: <Analytics size={14} aria-hidden="true" /> },
  { label: 'Debt payoff strategy', icon: <Flash size={14} aria-hidden="true" /> },
  { label: 'Retirement planning', icon: <Sprout size={14} aria-hidden="true" /> },
  { label: 'Reduce monthly spending', icon: <Notebook size={14} aria-hidden="true" /> },
];

function TypingDots() {
  return (
    <div className="typing-dots" aria-label="Gumdrop is thinking">
      <span /><span /><span />
    </div>
  );
}

// ── Budget pie chart helpers ──────────────────────────────────────────────────

/**
 * CANONICAL_CATEGORIES
 * Fixed colour + display label for every category Gumdrop can mention.
 * Keys are lowercase match strings; the parser checks if any known key
 * appears in the text near a dollar or percent value.
 */
const CANONICAL_CATEGORIES = [
  { keys: ['food & dining', 'food and dining', 'dining', 'groceries', 'restaurants'], label: 'Food & Dining',    color: '#f472a0' },
  { keys: ['shopping'],                                                                label: 'Shopping',         color: '#a78bfa' },
  { keys: ['transportation', 'transport', 'gas', 'commute', 'uber', 'lyft'],          label: 'Transportation',   color: '#60a5fa' },
  { keys: ['utilities', 'utility', 'electric', 'water', 'internet', 'phone'],         label: 'Utilities',        color: '#34d399' },
  { keys: ['entertainment'],                                                            label: 'Entertainment',    color: '#fbbf24' },
  { keys: ['health', 'medical', 'pharmacy', 'gym', 'fitness'],                        label: 'Health',           color: '#f87171' },
  { keys: ['subscriptions', 'subscription', 'streaming'],                              label: 'Subscriptions',    color: '#e879f9' },
  { keys: ['housing', 'rent', 'mortgage'],                                             label: 'Housing',          color: '#fb923c' },
  { keys: ['investments', 'investing', 'portfolio contribution'],                      label: 'Investments',      color: '#2dd4bf' },
  { keys: ['debt', 'loan', 'credit card payment'],                                     label: 'Debt Payments',    color: '#f97316' },
  { keys: ['travel', 'vacation'],                                                      label: 'Travel',           color: '#94a3b8' },
  { keys: ['education', 'tuition', 'books'],                                           label: 'Education',        color: '#a3e635' },
  { keys: ['personal care', 'personal', 'clothing'],                                   label: 'Personal Care',    color: '#fb7185' },
];

// Fallback colours for any category not in the canonical list
const FALLBACK_COLOURS = ['#f472a0','#a78bfa','#34d399','#fbbf24','#60a5fa','#f87171','#4ade80','#fb923c','#e879f9','#38bdf8'];

/** Resolve a raw label to a canonical entry (or return null) */
function resolveCategory(raw) {
  const lower = raw.toLowerCase();
  return CANONICAL_CATEGORIES.find((c) => c.keys.some((k) => lower.includes(k))) ?? null;
}

/**
 * parseBudgetPieData(text)
 *
 * Two-pass extraction:
 *   Pass 1 — scan for ALL known canonical category names near a $ or % value.
 *   Pass 2 — generic regex for any label: value pairs not caught in pass 1.
 *
 * Dollar amounts are converted to proportional percentages.
 * Percentages are used directly and then re-normalised to 100.
 * Returns null if fewer than 2 slices are found.
 */
function parseBudgetPieData(text) {
  const lower = text.toLowerCase();
  const found = new Map(); // label → { amount?, pct?, color }

  // ── Pass 1: canonical category scan ─────────────────────────────────────────
  for (const cat of CANONICAL_CATEGORIES) {
    for (const key of cat.keys) {
      const idx = lower.indexOf(key);
      if (idx === -1) continue;
      // Look for a dollar or percent value within 80 chars after (or 30 before) the keyword
      const window = text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + key.length + 80));
      const dollarMatch = window.match(/\$\s*([\d,]+(?:\.\d+)?)/);
      const pctMatch    = window.match(/(\d+(?:\.\d+)?)\s*%/);
      if (dollarMatch) {
        const val = parseFloat(dollarMatch[1].replace(/,/g, ''));
        if (val > 0 && val < 1_000_000 && !found.has(cat.label)) {
          found.set(cat.label, { amount: val, color: cat.color });
        }
      } else if (pctMatch) {
        const pct = parseFloat(pctMatch[1]);
        if (pct > 0 && pct <= 100 && !found.has(cat.label)) {
          found.set(cat.label, { pct, color: cat.color });
        }
      }
      break; // matched this category, move on
    }
  }

  // ── Pass 2: generic regex for remaining label–value pairs ────────────────────
  // Only runs for additional labels not already captured
  const genericRe = /([A-Za-z][A-Za-z &\/\-']+?)\s*[:\-–—]\s*\$?([\d,]+(?:\.\d+)?)\s*(%)?/g;
  let m;
  while ((m = genericRe.exec(text)) !== null) {
    const rawLabel = m[1].trim().replace(/^[*\-•\d.]+\s*/, '');
    if (!rawLabel || rawLabel.length < 3) continue;
    const canonical = resolveCategory(rawLabel);
    const resolvedLabel = canonical ? canonical.label : rawLabel;
    if (found.has(resolvedLabel)) continue; // already have it
    const isPercent = !!m[3];
    const val = parseFloat(m[2].replace(/,/g, ''));
    if (!val || val <= 0) continue;
    if (isPercent && val <= 100) {
      found.set(resolvedLabel, { pct: val, color: canonical?.color ?? null });
    } else if (!isPercent && val < 1_000_000) {
      found.set(resolvedLabel, { amount: val, color: canonical?.color ?? null });
    }
  }

  if (found.size < 2) return null;

  // ── Convert dollar amounts to percentages ─────────────────────────────────
  const hasDollar  = [...found.values()].some((v) => v.amount !== undefined);
  const hasPct     = [...found.values()].some((v) => v.pct    !== undefined);

  let items = [...found.entries()].map(([label, v]) => ({ label, ...v }));

  if (hasDollar && !hasPct) {
    // All dollar — derive proportions from amounts
    const total = items.reduce((s, i) => s + (i.amount ?? 0), 0);
    if (total === 0) return null;
    items = items.map((i) => ({ ...i, pct: (i.amount / total) * 100 }));
  } else if (hasDollar && hasPct) {
    // Mixed — convert dollar items relative to the sum of dollar items,
    // then scale them to fill the remaining (100 - sum-of-pct) share
    const pctSum   = items.filter((i) => i.pct !== undefined).reduce((s, i) => s + i.pct, 0);
    const dolItems = items.filter((i) => i.amount !== undefined);
    const dolTotal = dolItems.reduce((s, i) => s + i.amount, 0);
    const remaining = Math.max(0, 100 - pctSum);
    items = items.map((i) => {
      if (i.pct !== undefined) return i;
      return { ...i, pct: dolTotal > 0 ? (i.amount / dolTotal) * remaining : 0 };
    });
  }
  // else all % — use as-is

  // ── Normalise to 100 and assign colours ──────────────────────────────────
  const sum = items.reduce((s, i) => s + (i.pct ?? 0), 0);
  if (sum === 0) return null;

  const EXCLUDED_LABELS = new Set(['savings', 'income', 'total expenses']);

  return items
    .filter((i) => (i.pct ?? 0) > 0 && !EXCLUDED_LABELS.has(i.label.toLowerCase()))
    .map((i, idx) => ({
      label:  i.label,
      pct:    Math.round((i.pct / sum) * 1000) / 10,
      amount: i.amount ?? null,
      color:  i.color ?? FALLBACK_COLOURS[idx % FALLBACK_COLOURS.length],
    }));
}

// ── SVG pie chart rendered inside bot messages ────────────────────────────────
function BudgetPieChart({ slices }) {
  const R = 100, CX = 120, CY = 120;
  const LABEL_R = 68; // radius at which percentage labels are placed (≈68% of R)
  let cum = 0;
  const paths = slices.map((s) => {
    const startAngle = (cum / 100) * 2 * Math.PI - Math.PI / 2;
    cum += s.pct;
    const endAngle   = (cum / 100) * 2 * Math.PI - Math.PI / 2;
    const midAngle   = (startAngle + endAngle) / 2;
    if (s.pct >= 99.9) {
      return { ...s, d: `M${CX},${CY - R} A${R},${R},0,1,1,${CX - 0.001},${CY - R} Z`, midAngle };
    }
    const x1 = CX + R * Math.cos(startAngle), y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle),   y2 = CY + R * Math.sin(endAngle);
    const large = s.pct > 50 ? 1 : 0;
    return { ...s, d: `M${CX},${CY} L${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} Z`, midAngle };
  });

  return (
    <div className="budget-pie-wrap">
      <div className="budget-pie-chart-col">
        <svg viewBox="0 0 240 240" width="210" height="210" aria-label="Budget allocation pie chart" role="img">
          {/* Slices */}
          {paths.map((p) => (
            <path key={p.label} d={p.d} fill={p.color} stroke="#fff" strokeWidth="2.5">
              <title>{p.label}: {p.pct}%{p.amount ? ` ($${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}</title>
            </path>
          ))}
          {/* Percentage labels — only for slices ≥ 5% to avoid overlap */}
          {paths.filter((p) => p.pct >= 5).map((p) => (
            <text
              key={`lbl-${p.label}`}
              x={CX + LABEL_R * Math.cos(p.midAngle)}
              y={CY + LABEL_R * Math.sin(p.midAngle)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="9.5"
              fontWeight="700"
              fontFamily="inherit"
              fill="#fff"
              style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
            >
              {p.pct}%
            </text>
          ))}
        </svg>
        <p className="budget-pie-title">Budget Breakdown</p>
      </div>
      <ul className="budget-pie-legend" aria-label="Chart legend">
        {slices.map((s) => (
          <li key={s.label} className="budget-pie-legend-item">
            <span className="budget-pie-swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="budget-pie-legend-label">{s.label}</span>
            <span className="budget-pie-legend-values">
              <span className="budget-pie-legend-pct">{s.pct}%</span>
              {s.amount != null && (
                <span className="budget-pie-legend-amt">${s.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Lightweight markdown → HTML for bot replies (bold, bullets, code)
function BotMessage({ text }) {
  const html = text
    // Code blocks
    .replace(/```[\s\S]*?```/g, (m) => `<pre><code>${m.slice(3, -3).replace(/^\w*\n/, '')}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Bullet lines
    .replace(/^[*\-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(\n<li>)/g, '$1$2')
    .replace(/(<li>)/g, '<ul>$1').replace(/(<\/li>)(?!\n<li>)/g, '$1</ul>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  const pieSlices = isBudgetReply(text) ? parseBudgetPieData(text) : null;

  return (
    <>
      <div
        className="chat-bot-text"
        dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }}
      />
      {pieSlices && <BudgetPieChart slices={pieSlices} />}
    </>
  );
}

function makeSession() {
  return { id: Date.now(), title: 'New chat', messages: [], pinned: false };
}

function ChatView({ profile, username }) {
  const greeting = { sender: 'system', text: buildGreeting(profile) };
  const { add: addBudgetNote } = useBudget();

  // ── Session list (D1 is the source of truth; localStorage is a fast cold-start cache) ──
  const [sessions, setSessions] = useState(() => loadSessions(username) ?? [{ ...makeSession(), messages: [greeting] }]);
  const [activeIdx, setActiveIdx]   = useState(0);
  const [dbLoading, setDbLoading]   = useState(true);  // true while loading from D1 on mount

  // ── Delete confirmation state ──────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // id of session pending deletion

  // ── Load sessions from D1 on mount ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dbSessions = await fetchChatSessions();
      if (cancelled || !dbSessions) { setDbLoading(false); return; }

      // Build session objects; messages are loaded lazily when the session is selected
      const hydrated = dbSessions.map((s) => ({
        id:       s.id,
        title:    s.title,
        pinned:   !!s.pinned,
        messages: null, // loaded on demand
      }));

      if (hydrated.length === 0) {
        // First time — create a fresh local session (D1 write happens on first send)
        setDbLoading(false);
        return;
      }

      setSessions(hydrated);
      setActiveIdx(0);
      setDbLoading(false);
    })();
    return () => { cancelled = true; };
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep localStorage in sync for fast reload ──────────────────────────────
  useEffect(() => {
    saveSessions(username, sessions);
  }, [sessions, username]);

  // ── Messages for the active session ───────────────────────────────────────
  const [messagesCache, setMessagesCache] = useState({});  // { [sessionId]: message[] }
  const activeSession = sessions[activeIdx] ?? sessions[0];
  const activeId      = activeSession?.id;

  // When the active session changes, load messages from D1 if not already cached
  useEffect(() => {
    if (!activeId) return;
    if (messagesCache[activeId]) return; // already loaded
    (async () => {
      const rows = await fetchChatMessages(activeId);
      if (!rows) {
        // New session not yet in D1 — seed with greeting
        setMessagesCache((prev) => ({ ...prev, [activeId]: [greeting] }));
        return;
      }
      const msgs = rows.length === 0
        ? [greeting]
        : rows.map((r) => ({ sender: r.sender, text: r.content }));
      setMessagesCache((prev) => ({ ...prev, [activeId]: msgs }));
    })();
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages    = messagesCache[activeId] ?? [greeting];
  const setMessages = (updater) =>
    setMessagesCache((prev) => ({
      ...prev,
      [activeId]: typeof updater === 'function' ? updater(prev[activeId] ?? [greeting]) : updater,
    }));

  const [draft, setDraft]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editDraft, setEditDraft]   = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── New chat ───────────────────────────────────────────────────────────────
  const newChat = () => {
    const session = { ...makeSession(), messages: [greeting] };
    setSessions((prev) => [session, ...prev]);
    setMessagesCache((prev) => ({ ...prev, [session.id]: [greeting] }));
    setActiveIdx(0);
    setDraft('');
  };

  const switchSession = (idx) => { setActiveIdx(idx); setDraft(''); };

  // ── Toggle pin (local + D1) ────────────────────────────────────────────────
  const togglePin = (e, id) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated   = prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s);
      const pinned    = updated.filter((s) => s.pinned);
      const unpinned  = updated.filter((s) => !s.pinned);
      const reordered = [...pinned, ...unpinned];
      const activeId_ = prev[activeIdx].id;
      setActiveIdx(reordered.findIndex((s) => s.id === activeId_));
      const target = updated.find((s) => s.id === id);
      upsertChatSession(id, target?.title ?? 'New chat', target?.pinned ?? false);
      return reordered;
    });
  };

  // ── Delete: request confirmation ───────────────────────────────────────────
  const requestDelete = (e, id) => {
    e.stopPropagation();
    setConfirmDeleteId(id);
  };

  // ── Delete: confirmed — remove locally + from D1 ──────────────────────────
  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);

    // Evict from messages cache
    setMessagesCache((prev) => { const next = { ...prev }; delete next[id]; return next; });

    // Update session list
    setSessions((prev) => {
      if (prev.length === 1) {
        const fresh = { ...makeSession(), messages: [greeting] };
        setMessagesCache((c) => ({ ...c, [fresh.id]: [greeting] }));
        setActiveIdx(0);
        return [fresh];
      }
      const next       = prev.filter((s) => s.id !== id);
      const deletedIdx = prev.findIndex((s) => s.id === id);
      const currentId_ = prev[activeIdx].id;
      if (currentId_ === id) {
        setActiveIdx(Math.min(deletedIdx, next.length - 1));
      } else {
        setActiveIdx(next.findIndex((s) => s.id === currentId_));
      }
      return next;
    });

    // Delete from D1 (fire-and-forget; failure is non-critical)
    deleteChatSession(id);
  };

  // ── Send a message ─────────────────────────────────────────────────────────
  const send = async (text, priorMessages) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const history = priorMessages ?? messages;
    const sessId  = activeId;

    // Auto-title the session on first real message
    const isNewTitle = sessions[activeIdx]?.title === 'New chat';
    const newTitle   = isNewTitle ? (trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed) : undefined;

    if (newTitle) {
      setSessions((prev) => prev.map((s, i) => i === activeIdx ? { ...s, title: newTitle } : s));
      upsertChatSession(sessId, newTitle, sessions[activeIdx]?.pinned ?? false);
    } else {
      // Ensure session exists in D1 (no-op if already there)
      upsertChatSession(sessId, sessions[activeIdx]?.title ?? 'New chat', sessions[activeIdx]?.pinned ?? false);
    }

    setMessages(() => [...history, { sender: 'user', text: trimmed }, { sender: 'bot', text: '', pending: true }]);
    setDraft('');
    setLoading(true);
    inputRef.current?.focus();

    // Persist user message to D1
    saveChatMessage(sessId, 'user', trimmed);

    try {
      const res   = await fetch('/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          userMessage: trimmed,
          profile,
          messages: history.filter((m) => !m.pending).slice(-10),
        }),
      });
      const data  = await res.json();
      const reply = res.ok
        ? (data.reply || 'Sorry, I received an empty response.')
        : (data.error || 'Something went wrong. Please try again.');
      setMessages((prev) => prev.map((m) => (m.pending ? { sender: 'bot', text: reply } : m)));
      // Persist bot reply to D1
      saveChatMessage(sessId, 'bot', reply);
      // Auto-save to Budgeting tab if reply contains budget advice
      if (res.ok && isBudgetReply(reply)) {
        addBudgetNote(deriveBudgetTitle(trimmed), reply);
      }
    } catch {
      setMessages((prev) => prev.map((m) =>
        m.pending
          ? { sender: 'bot', text: 'Could not reach the server. In dev: run `npm run server` and add WXO_API_KEY to .env.local.' }
          : m
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); }
  };

  const isNew = messages.length <= 1;

  // Title of the session pending deletion (for the confirmation dialog)
  const confirmTarget = sessions.find((s) => s.id === confirmDeleteId);

  return (
    <div className="chat-page" id="chat">

      {/* ── Delete confirmation modal ────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="confirm-modal">
            <h3 className="confirm-title" id="confirm-title">Delete chat?</h3>
            <p className="confirm-body">
              <strong>"{confirmTarget?.title ?? 'New chat'}"</strong> will be permanently deleted and cannot be recovered.
            </p>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn--cancel" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button className="confirm-btn confirm-btn--delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History sidebar ───────────────────────────────────────────────── */}
      <aside className="chat-history-sidebar">
        {/* Financial Advisor panel header */}
        <div className="chat-advisor-panel">
          <div className="chat-advisor-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
              <path d="M28 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6l6 4 6-4h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"
                stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
              <circle cx="16" cy="14" r="1.5" fill="currentColor"/>
              <circle cx="22" cy="14" r="1.5" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <p className="chat-advisor-name">Gumdrop</p>
            <p className="chat-advisor-sub">Financial Advisor AI · Powered by watsonx Orchestrate</p>
          </div>
        </div>

        <Button
          kind="tertiary"
          size="sm"
          className="chat-history-new-btn"
          onClick={newChat}
        >
          + New chat
        </Button>

        <div className="chat-history-list">
          {dbLoading && (
            <span style={{ padding: '0.75rem 1.25rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              Loading chats…
            </span>
          )}
          {sessions.some((s) => s.pinned) && (
            <span className="chat-history-group-label">Pinned</span>
          )}
          {sessions.filter((s) => s.pinned).map((s) => (
            <div
              key={s.id}
              className={`chat-history-item${sessions.indexOf(s) === activeIdx ? ' chat-history-item--active' : ''}`}
              onClick={() => switchSession(sessions.indexOf(s))}
              role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && switchSession(sessions.indexOf(s))}
            >
              <svg viewBox="0 0 16 16" fill="none" width="13" height="13" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
                <path d="M14 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              <span className="chat-history-item-title">{s.title}</span>
              <div className="chat-history-item-actions">
                <button className="chat-history-pin-btn chat-history-pin-btn--active" onClick={(e) => togglePin(e, s.id)} aria-label="Unpin" title="Unpin"><PinFilled size={14} /></button>
                <button className="chat-history-del-btn" onClick={(e) => requestDelete(e, s.id)} aria-label="Delete" title="Delete"><TrashCan size={14} /></button>
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
              role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && switchSession(sessions.indexOf(s))}
            >
              <svg viewBox="0 0 16 16" fill="none" width="13" height="13" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
                <path d="M14 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              <span className="chat-history-item-title">{s.title}</span>
              <div className="chat-history-item-actions">
                <button className="chat-history-pin-btn" onClick={(e) => togglePin(e, s.id)} aria-label="Pin" title="Pin"><Pin size={14} /></button>
                <button className="chat-history-del-btn" onClick={(e) => requestDelete(e, s.id)} aria-label="Delete" title="Delete"><TrashCan size={14} /></button>
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
                      labelText="" hideLabel
                      className="chat-edit-textarea"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (editDraft.trim()) { const prior = messages.slice(0, i); setEditingIdx(null); send(editDraft.trim(), prior); }
                        }
                        if (e.key === 'Escape') setEditingIdx(null);
                      }}
                      autoFocus
                    />
                    <div className="chat-edit-actions">
                      <Button kind="primary" size="sm" onClick={() => { if (editDraft.trim()) { const prior = messages.slice(0, i); setEditingIdx(null); send(editDraft.trim(), prior); } }}>Save</Button>
                      <Button kind="ghost"   size="sm" onClick={() => setEditingIdx(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className={`chat-bubble-new${msg.pending ? ' chat-bubble-new--pending' : ''}${msg.sender === 'user' ? ' chat-bubble-new--user' : ''}`}>
                    {msg.pending
                      ? <TypingDots />
                      : msg.sender !== 'user'
                        ? <BotMessage text={msg.text} />
                        : msg.text
                    }
                    {msg.sender === 'user' && !msg.pending && (
                      <button
                        className="chat-edit-btn"
                        onClick={() => { setEditingIdx(i); setEditDraft(msg.text); }}
                        aria-label="Edit message" title="Edit"
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

          {/* Quick actions — visible only on a fresh / empty conversation */}
          {isNew && (
            <div className="chat-quick-actions">
              <p className="chat-quick-actions-label">Quick actions</p>
              <div className="chat-quick-actions-grid">
                {QUICK_ACTIONS.map(({ label, icon }) => (
                  <button
                    key={label}
                    className="chat-quick-action-btn"
                    onClick={() => !loading && send(label)}
                    disabled={loading}
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chat-input-wrap">
            <TextArea
              ref={inputRef}
              id="chat-input"
              labelText="" hideLabel
              rows={1}
              placeholder={loading ? 'Gumdrop is thinking…' : 'Ask me anything about your finances…'}
              value={draft}
              disabled={loading}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
            />
            <Button
              kind="primary" size="sm"
              onClick={() => send(draft)}
              disabled={loading || !draft.trim()}
              aria-label="Send message" hasIconOnly iconDescription="Send message"
              renderIcon={() => (
                <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                  <path d="M2 10L18 2L12 10L18 18L2 10Z" fill="currentColor" />
                </svg>
              )}
            />
          </div>
          <p className="chat-input-hint">Enter to send · Shift+Enter for new line · Responses from watsonx Orchestrate Financial Advisor</p>
        </div>
      </div>
    </div>
  );
}

// ── Profile Page ───────────────────────────────────────────────────────────────
function ProfilePage({ username, profile, onLogout, onBack, theme, onToggleTheme, onStartQuestionnaire }) {
  const RISK_DESC    = { conservative: 'Low risk, stable returns', moderate: 'Balanced growth & safety', aggressive: 'High risk, high reward' };
  const HORIZON_DESC = { short: 'Under 3 years', medium: '3 – 10 years', long: '10+ years' };
  const goals = (profile?.goals ?? []).map((g) => GOAL_LABELS[g] ?? g);
  const profileRows = [
    { label: 'Goals',           value: goals.length ? goals.join(', ') : 'None set' },
    { label: 'Risk appetite',   value: profile?.risk ? `${profile.risk} — ${RISK_DESC[profile.risk] ?? ''}` : 'Not set' },
    { label: 'Time horizon',    value: profile?.horizon ? `${profile.horizon} — ${HORIZON_DESC[profile.horizon] ?? ''}` : 'Not set' },
    { label: 'Annual income',   value: profile?.annualIncome ? `$${Number(profile.annualIncome).toLocaleString()}` : 'Not set' },
    { label: 'Monthly savings', value: profile?.monthlySavings ? `$${Number(profile.monthlySavings).toLocaleString()}` : 'Not set' },
    { label: 'Emergency fund',  value: profile?.emergencyFund ?? 'Not set' },
    { label: 'Employment',      value: profile?.employmentStatus ?? 'Not set' },
    { label: 'Marital status',  value: profile?.maritalStatus ?? 'Not set' },
    { label: 'Credit score',    value: profile?.creditScore ?? 'Not set' },
    { label: 'Location',        value: profile?.city && profile?.usState ? `${profile.city}, ${profile.usState}` : profile?.usState ?? 'Not set' },
    { label: 'Veteran status',  value: profile?.veteranStatus ?? 'Not set' },
    { label: 'Preferences',     value: (profile?.preferences ?? []).join(', ') || 'None' },
  ];

  return (
    <div className="profile-shell">
      {/* ── Sticky back bar ──────────────────────────────────────────────── */}
      <div className="profile-back-bar">
        <button className="profile-back-btn" onClick={onBack} aria-label="Back to dashboard">
          ← Dashboard
        </button>
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────── */}
      <div className="profile-scroll">
      <div style={{ width: '100%', maxWidth: '36rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0 1rem', margin: '0 auto' }}>
        <div className="wizard-inner" style={{ padding: 0 }}>
          <div className="acct-badge">Account</div>
          <h2 className="wizard-heading">Profile settings</h2>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '4rem', height: '4rem', borderRadius: '50%', background: 'linear-gradient(135deg, #f472a0, #c0356a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff' }}>
                {username?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>{username}</p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cds-text-secondary)' }}>Candyland Bank member</p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #fbc4d9', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cds-text-secondary)' }}>
              Your account is secured with IBM email verification and two-factor authentication via OTP.
            </p>
          </div>

          {/* ── Investor profile ── */}
          <div style={{ borderTop: '1px solid #fbc4d9', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Investor profile</p>
            {!profile ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cds-text-secondary)' }}>
                No questionnaire completed yet. Use "Retake questionnaire" in the dashboard to build your profile.
              </p>
            ) : (
              <div className="db-kv-grid">
                {profileRows.map(({ label, value }) => (
                  <div key={label} className="db-kv-row">
                    <span className="db-kv-label">{label}</span>
                    <span className="db-kv-value">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Appearance ── */}
          <div style={{ borderTop: '1px solid #fbc4d9', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Appearance</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle-01)', borderRadius: '0.75rem' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem' }}>
                  {theme === 'g100' ? '🌙 Dark mode' : '☀️ Light mode'}
                </p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                  {theme === 'g100' ? 'Switch to light mode' : 'Switch to dark mode'}
                </p>
              </div>
              <button
                onClick={onToggleTheme}
                aria-label="Toggle colour theme"
                className="theme-toggle-btn"
                data-dark={theme === 'g100' ? 'true' : 'false'}
              >
                <span className="theme-toggle-knob" />
              </button>
            </div>
          </div>

          {/* ── Linked accounts ── */}
          <div style={{ borderTop: '1px solid #fbc4d9', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Linked accounts</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--cds-text-secondary)' }}>
              Connect your bank and crypto accounts for a unified view of your finances.
            </p>

            {/* Plaid */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle-01)', borderRadius: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '2rem', height: '2rem', borderRadius: '0.4rem', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="4" fill="#000"/><path d="M7 8h4v4H7zm5 0h4v4h-4zm5 0h4v4h-4zm-10 5h4v4H7zm5 0h4v4h-4zm5 0h4v4h-4zm-10 5h4v4H7zm5 0h4v4h-4zm5 0h4v4h-4z" fill="#fff"/></svg>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem' }}>Plaid</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Bank accounts &amp; transactions</p>
                </div>
              </div>
              <button
                onClick={() => window.open('https://plaid.com/products/transactions/', '_blank', 'noopener')}
                style={{ padding: '0.35rem 0.85rem', background: '#000', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                Connect
              </button>
            </div>

            {/* Coinbase */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle-01)', borderRadius: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '2rem', height: '2rem', borderRadius: '0.4rem', background: '#0052FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#0052FF"/><path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 16.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13z" fill="#fff"/></svg>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem' }}>Coinbase</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Crypto portfolio &amp; balances</p>
                </div>
              </div>
              <button
                onClick={() => window.open('https://www.coinbase.com/settings/api', '_blank', 'noopener')}
                style={{ padding: '0.35rem 0.85rem', background: '#0052FF', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                Connect
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '0.5rem', paddingBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button kind="tertiary" onClick={onStartQuestionnaire}>
              <Notebook size={16} style={{ marginRight: '0.4rem' }} aria-hidden="true" />
              Questionnaire
            </Button>
            <Button kind="danger" onClick={onLogout}>Sign out</Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Shared nav shell ───────────────────────────────────────────────────────────
function NavShell({ children, username, onGoProfile, onGoHome, heroHeader, authHeader }) {
  const headerClass = authHeader ? 'cds--header--auth' : heroHeader ? 'cds--header--hero' : undefined;
  return (
    <div className={authHeader ? 'app-shell app-shell--auth' : 'app-shell'}>
      <Header aria-label="Candyland Bank" className={headerClass}>
        <HeaderName href="#" prefix=""
          onClick={(e) => { e.preventDefault(); onGoHome?.(); }}
        >
          <img src="/grouped-logo.svg" alt="Candyland Bank" className="header-brand-logo" />
        </HeaderName>
        {username && (
          <HeaderGlobalBar>
            <button className="avatar-btn" aria-label={`Profile (${username})`} onClick={onGoProfile}>
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

// ── Page-order map — used to pick slide direction ─────────────────────────────
const PAGE_ORDER = { home: 0, login: 1, signup: 2, wizard: 3, account: 4, dashboard: 5, profile: 6 };

// Returns the CSS modifier suffix for the entering layer based on navigation direction
function enterClass(from, to) {
  const fIdx = PAGE_ORDER[from] ?? 0;
  const tIdx = PAGE_ORDER[to]   ?? 0;
  if (fIdx === tIdx) return 'enter';
  return tIdx > fIdx ? 'enter-right' : 'enter-left';
}
function exitClass(from, to) {
  const fIdx = PAGE_ORDER[from] ?? 0;
  const tIdx = PAGE_ORDER[to]   ?? 0;
  if (fIdx === tIdx) return 'exit';
  return tIdx > fIdx ? 'exit-left' : 'exit-right';
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]         = useState('home');
  const [profile, setProfile]   = useState(null);
  const [username, setUsername] = useState(() => getSession()?.username ?? null);
  const [isGuest, setIsGuest]   = useState(false);
  const [booting, setBooting]   = useState(true);
  const [theme, setTheme]       = useState(() => localStorage.getItem('cb-theme') ?? 'g10');

  // Outgoing page layer — holds the previous content while it animates out
  const [outgoing, setOutgoing] = useState(null); // { content, exitCls }
  const prevPageRef             = useRef('home');
  const exitTimerRef            = useRef(null);

  const navigate = (to) => {
    const from = prevPageRef.current;
    if (from === to) return;

    // Cancel any in-flight exit
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    // Snapshot the current rendered content before setPage re-renders it
    // We do this by storing the exit class; the outgoing content is
    // set synchronously in the same render cycle via a functional update.
    const eCls = exitClass(from, to);
    prevPageRef.current = to;

    setOutgoing(null);          // clear previous outgoing layer immediately
    setPage(to);                // trigger new content render

    // After one frame, inject the exit layer (the old page snapshot is gone;
    // we use a CSS-only exit on the wrapper by briefly adding a class)
    // Simple approach: record exit class, apply it once via state after render
    setOutgoing({ exitCls: eCls });
    exitTimerRef.current = setTimeout(() => setOutgoing(null), 240);
  };

  const toggleTheme = () => {
    const next = theme === 'g10' ? 'g100' : 'g10';
    setTheme(next);
    localStorage.setItem('cb-theme', next);
  };

  // Restore session from HttpOnly cookie on page load
  useEffect(() => {
    restoreSession().then((res) => {
      if (res.ok) {
        setUsername(res.username);
        setProfile(res.profile ?? null);
        prevPageRef.current = 'dashboard';
        setPage('dashboard');
      }
      setBooting(false);
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    setUsername(null);
    setProfile(null);
    setIsGuest(false);
    navigate('home');
  };

  if (booting) return null; // wait for session check before rendering

  let content;
  const nav = navigate; // shorter alias inside JSX

  if (page === 'login') {
    content = (
      <NavShell authHeader onGoHome={() => nav('home')}>
        <LoginForm
          onLogin={(res) => {
            setProfile(res.profile ?? null);
            setUsername(res.username);
            setIsGuest(false);
            nav('dashboard');
          }}
          onGoHome={() => nav('home')}
          onCreateNew={() => nav('signup')}
          onGuest={null}
        />
      </NavShell>
    );
  } else if (page === 'home') {
    content = (
      <HomePage
        onGetStarted={() => nav('wizard')}
        isLoggedIn={!!username}
        username={username}
        onGoToChat={() => nav('dashboard')}
        onSignIn={() => nav('login')}
      />
    );
  } else if (page === 'profile') {
    content = (
      <NavShell heroHeader username={username} onGoProfile={() => nav('profile')} onGoHome={() => nav('home')}>
        <ProfilePage
          username={username}
          profile={profile}
          onLogout={handleLogout}
          onBack={() => nav('dashboard')}
          theme={theme}
          onToggleTheme={toggleTheme}
          onStartQuestionnaire={() => nav('wizard')}
        />
      </NavShell>
    );
  } else if (page === 'dashboard') {
    content = (
      <NavShell heroHeader username={username} onGoProfile={() => nav('profile')} onGoHome={() => nav('home')}>
        <DashboardPage
          profile={profile}
          username={username}
          onStartQuestionnaire={() => nav('wizard')}
          onLogout={handleLogout}
        />
      </NavShell>
    );
  } else if (page === 'wizard') {
    if (!username) {
      content = (
        <NavShell authHeader onGoHome={() => nav('home')}>
          <LoginForm
            onLogin={(res) => {
              setProfile(res.profile ?? null);
              setUsername(res.username);
              setIsGuest(false);
              nav('wizard');
            }}
            onGoHome={() => nav('home')}
            onCreateNew={() => nav('signup')}
            onGuest={null}
          />
        </NavShell>
      );
    } else {
      content = (
        <NavShell authHeader username={username} onGoProfile={() => nav('profile')} onGoHome={() => nav('home')}>
          <SignupWizard
            onComplete={(p) => { setProfile(p); nav('account'); }}
            onExit={() => nav('dashboard')}
          />
        </NavShell>
      );
    }
  } else if (page === 'signup') {
    content = (
      <NavShell authHeader onGoHome={() => nav('home')}>
        <AccountSignup
          investorProfile={null}
          isGuest={false}
          onComplete={() => nav('login')}
          onSkip={null}
        />
      </NavShell>
    );
  } else if (page === 'account') {
    content = (
      <NavShell authHeader onGoHome={() => nav('home')}>
        <AccountSignup
          investorProfile={profile}
          isGuest={isGuest}
          onComplete={(uname) => {
            setUsername(uname);
            setIsGuest(false);
            nav('dashboard');
          }}
          onSkip={() => nav('dashboard')}
        />
      </NavShell>
    );
  } else {
    content = (
      <NavShell heroHeader username={username} onGoProfile={() => nav('profile')} onGoHome={() => nav('home')}>
        <DashboardPage
          profile={profile}
          username={username}
          onStartQuestionnaire={() => nav('wizard')}
          onLogout={handleLogout}
        />
      </NavShell>
    );
  }

  const enterCls = `page-layer page-layer--${enterClass(prevPageRef.current === page ? page : prevPageRef.current, page)}`;
  const darkCls  = theme === 'g100' ? ' theme-dark' : '';

  return (
    <Theme theme={theme}>
      <div className={`page-wrap${darkCls}`}>
        {/* Outgoing layer — renders briefly with exit animation then removed */}
        {outgoing && (
          <div key="exit" className={`page-layer page-layer--${outgoing.exitCls}${darkCls}`} aria-hidden="true" />
        )}
        {/* Incoming layer — always the live content */}
        <div key={page} className={enterCls}>
          {content}
        </div>
      </div>
    </Theme>
  );
}
