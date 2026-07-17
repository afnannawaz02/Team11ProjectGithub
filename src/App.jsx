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
} from './auth.js';

// Relative URL — works in dev (Vite proxies /chat → 127.0.0.1:3001) and in
// production (Cloudflare Pages Function at /chat handles the request).
const PROXY_URL = '';

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
  const svgRef = useRef(null);

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

  return (
    <div className="st-chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="st-line-svg"
        aria-label={`${ticker} price chart`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`fill-${ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02"/>
          </linearGradient>
        </defs>

        {/* Grid + y-axis labels */}
        {yTicks.map(({ y, label }) => (
          <g key={label}>
            <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="#e8e8e8" strokeWidth="1"/>
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9e5a72">{label}</text>
          </g>
        ))}
        {xTicks.map(({ x, label }) => (
          <text key={label} x={x} y={PAD.top + cH + 18} textAnchor="middle" fontSize="10" fill="#9e5a72">{label}</text>
        ))}

        {/* Area + line */}
        <path d={areaPath} fill={`url(#fill-${ticker})`}/>
        <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round"/>

        {/* Crosshair + tooltip (always visible, snaps to nearest point) */}
        {/* Vertical crosshair line */}
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
              fill="var(--cds-layer-01, #ffffff)" stroke={lineColor} strokeWidth="1.2" filter="url(#tip-shadow)"/>
            <text x={tipX + 8} y={tipY + 16} fontSize="10" fill="#9e5a72">{hDate}</text>
            <text x={tipX + 8} y={tipY + 31} fontSize="13" fontWeight="700" fill="var(--cds-text-primary, #161616)">${hPrice.toFixed(2)}</text>
            <text x={tipX + 8} y={tipY + 46} fontSize="10" fontWeight="600"
              fill={hPct >= 0 ? '#24a148' : '#da1e28'}>
              {hPct >= 0 ? '+' : ''}{hPct.toFixed(2)}%
            </text>
            <defs>
              <filter id="tip-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.10"/>
              </filter>
            </defs>
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

function PanelPortfolioPie() {
  const slices = [
    { label: 'US Stocks',    pct: 42, color: '#f472a0' },
    { label: 'Intl Stocks',  pct: 18, color: '#c0356a' },
    { label: 'Bonds',        pct: 20, color: '#9d2256' },
    { label: 'Real Estate',  pct: 10, color: '#f9a8b8' },
    { label: 'Cash',         pct:  6, color: '#fbc4d9' },
    { label: 'Crypto',       pct:  4, color: '#6b2040' },
  ];

  // Build SVG pie slices
  const R = 120;
  const CX = 160;
  const CY = 160;
  let cumulative = 0;
  const paths = slices.map((s) => {
    const start = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
    cumulative += s.pct;
    const end   = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
    const x1 = CX + R * Math.cos(start);
    const y1 = CY + R * Math.sin(start);
    const x2 = CX + R * Math.cos(end);
    const y2 = CY + R * Math.sin(end);
    const large = s.pct > 50 ? 1 : 0;
    return { ...s, d: `M${CX},${CY} L${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} Z` };
  });

  return (
    <div className="db-panel db-panel--pie">
      <h2 className="db-panel-heading">Portfolio</h2>
      <p className="db-panel-sub">Your current asset allocation by category.</p>
      <div className="db-pie-wrap">
        <svg viewBox="0 0 320 320" width="280" height="280" aria-hidden="true">
          {paths.map((p) => (
            <path key={p.label} d={p.d} fill={p.color} stroke="#ffffff" strokeWidth="2" />
          ))}
          {/* donut hole */}
          <circle cx={CX} cy={CY} r={60} fill="var(--cds-layer-01)" />
          <text x={CX} y={CY - 8} textAnchor="middle" fontSize="13" fill="var(--cds-text-secondary)" fontFamily="inherit">Total</text>
          <text x={CX} y={CY + 12} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--cds-text-primary)" fontFamily="inherit">$12,450</text>
        </svg>
        <ul className="db-pie-legend">
          {slices.map((s) => (
            <li key={s.label} className="db-pie-legend-item">
              <span className="db-pie-legend-dot" style={{ background: s.color }} />
              <span className="db-pie-legend-label">{s.label}</span>
              <span className="db-pie-legend-pct">{s.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
function DashboardPage({ profile, username }) {
  const [activePanel, setActivePanel] = useState('assets');

  const isChat = activePanel === 'chat';

  const NAV = [
    { id: 'assets',   label: 'Assets',          Icon: Portfolio },
    { id: 'spending', label: 'Spending History', Icon: Finance   },
    { id: 'trades',   label: 'Portfolio',        Icon: Growth    },
  ];

  return (
    <div className="db-layout">
      {/* ── Main content ── */}
      <main className={`db-content${isChat ? ' db-content--chat' : ''}`}>
        {!isChat && <p className="db-sidebar-greeting">Welcome{username ? `, ${username}` : ''}.</p>}
        {activePanel === 'assets'    && <PanelAssets />}
        {activePanel === 'spending'  && <PanelSpending />}
        {activePanel === 'portfolio' && <PanelPortfolio profile={profile} />}
        {activePanel === 'trades'    && <PanelPortfolioPie />}
        {activePanel === 'chat'      && <ChatView profile={profile} username={username} />}
      </main>

      {/* ── Bottom navigation bar ── */}
      <nav className="db-bottom-nav">
        {/* Gumdrop chat button — always visible, sits with the other nav items */}
        <button
          className={`db-bottom-nav-item db-bottom-nav-item--chat${isChat ? ' db-bottom-nav-item--active' : ''}`}
          onClick={() => setActivePanel('chat')}
          aria-label="Gumdrop AI chat"
        >
          <ChatBot size={20} aria-hidden="true" />
          <span>Gumdrop</span>
        </button>
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`db-bottom-nav-item${activePanel === id ? ' db-bottom-nav-item--active' : ''}`}
            onClick={() => setActivePanel(id)}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Chat helpers ──────────────────────────────────────────────────────────────
function makeSession() {
  return { id: Date.now(), title: 'New chat', pinned: false };
}

// ── Financial Advisor Chat ─────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="typing-dots" aria-label="Gumdrop is thinking">
      <span /><span /><span />
    </div>
  );
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const QUICK_ACTIONS = [
  { label: 'Analyze My Spending',         prompt: 'Analyze my recent spending patterns and identify where I can cut back.' },
  { label: 'Review Crypto Portfolio',     prompt: 'Review my crypto portfolio allocation and give me risk-adjusted recommendations.' },
  { label: 'Financial Health Score',      prompt: 'Assess my overall financial health score based on my profile and goals.' },
  { label: 'Find Savings Opportunities',  prompt: 'Identify savings opportunities and subscriptions I can cut or reduce.' },
  { label: 'Debt Payoff Strategy',        prompt: 'Create a debt payoff strategy optimized for my income and goals.' },
  { label: 'Emergency Fund Analysis',     prompt: 'Analyze whether my emergency fund is sufficient for my situation.' },
  { label: 'Budget Review',               prompt: 'Review my budget and suggest an optimized allocation for my goals.' },
  { label: 'Goal Progress',               prompt: 'How am I tracking against each of my financial goals?' },
];

// Render plain text with basic markdown-like formatting (bold **x**, bullet - x)
function RichText({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="chat-rich-text">
      {lines.map((line, i) => {
        if (/^[-•]\s/.test(line)) {
          return <div key={i} className="chat-rich-bullet">{line.replace(/^[-•]\s/, '')}</div>;
        }
        if (/^\d+\.\s/.test(line)) {
          return <div key={i} className="chat-rich-numbered">{line}</div>;
        }
        // Bold: **word**
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="chat-rich-para">
            {parts.map((p, j) =>
              p.startsWith('**') && p.endsWith('**')
                ? <strong key={j}>{p.slice(2, -2)}</strong>
                : p
            )}
          </p>
        );
      })}
    </div>
  );
}

function ChatView({ profile, username }) {
  const greeting = {
    sender: 'bot',
    text: `Welcome back${username ? `, ${username}` : ''}. I'm your AI Financial Advisor, powered by IBM watsonx.\n\nI can analyze your banking activity, investment portfolio, financial goals, and survey responses to help you improve your financial health.\n\nWhat would you like to review today?`,
    ts: Date.now(),
  };

  const [sessions, setSessions] = useState(() => {
    const raw = loadSessions(username);
    // Sanitise: drop any session whose messages array contains stale/corrupt entries
    const valid = raw?.filter((s) =>
      Array.isArray(s.messages) &&
      s.messages.every((m) => typeof m.text === 'string')
    );
    return (valid && valid.length > 0) ? valid : [{ ...makeSession(), messages: [greeting] }];
  });
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => { saveSessions(username, sessions); }, [sessions, username]);

  const messages    = sessions[activeIdx].messages;
  const setMessages = (updater) =>
    setSessions((prev) =>
      prev.map((s, i) =>
        i === activeIdx
          ? { ...s, messages: typeof updater === 'function' ? updater(s.messages) : updater }
          : s
      )
    );

  const [draft,      setDraft]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editDraft,  setEditDraft]  = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const newChat = () => {
    setSessions((prev) => [{ ...makeSession(), messages: [greeting] }, ...prev]);
    setActiveIdx(0);
    setDraft('');
  };

  const switchSession = (idx) => { setActiveIdx(idx); setDraft(''); };

  const togglePin = (e, id) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated   = prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s);
      const pinned    = updated.filter((s) => s.pinned);
      const unpinned  = updated.filter((s) => !s.pinned);
      const reordered = [...pinned, ...unpinned];
      const activeId  = prev[activeIdx].id;
      setActiveIdx(reordered.findIndex((s) => s.id === activeId));
      return reordered;
    });
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    setSessions((prev) => {
      if (prev.length === 1) { setActiveIdx(0); return [{ ...makeSession(), messages: [greeting] }]; }
      const next       = prev.filter((s) => s.id !== id);
      const deletedIdx = prev.findIndex((s) => s.id === id);
      const currentId  = prev[activeIdx].id;
      if (currentId === id) { setActiveIdx(Math.min(deletedIdx, next.length - 1)); }
      else                  { setActiveIdx(next.findIndex((s) => s.id === currentId)); }
      return next;
    });
  };

  const send = async (text, priorMessages) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const history = priorMessages ?? messages;

    setSessions((prev) =>
      prev.map((s, i) =>
        i === activeIdx && s.title === 'New chat'
          ? { ...s, title: trimmed.length > 36 ? trimmed.slice(0, 36) + '…' : trimmed }
          : s
      )
    );
    setMessages(() => [
      ...history,
      { sender: 'user', text: trimmed, ts: Date.now() },
      { sender: 'bot',  text: '', pending: true, ts: Date.now() },
    ]);
    setDraft('');
    setLoading(true);
    inputRef.current?.focus();

    try {
      const res  = await fetch('/chat', {
        method:      'POST',
        credentials: 'same-origin',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          userMessage: trimmed,
          profile,
          messages: history.filter((m) => !m.pending).slice(-12),
        }),
      });
      const data  = await res.json();
      const reply = res.ok
        ? (data.reply || 'Sorry, I received an empty response.')
        : (data.error || 'Something went wrong. Please try again.');
      setMessages((prev) => prev.map((m) => (m.pending ? { sender: 'bot', text: reply, ts: Date.now() } : m)));
    } catch (err) {
      setMessages((prev) => prev.map((m) =>
        m.pending ? { sender: 'bot', text: `Network error: ${err.message}. In dev run \`npm run server\`. In production ensure WATSONX_API_KEY and WATSONX_PROJECT_ID are set in Cloudflare Pages secrets.`, ts: Date.now() } : m
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); }
  };

  const showQuickActions = messages.length <= 1;

  return (
    <div className="advisor-page" id="chat">

      {/* ── Session sidebar ───────────────────────────────────────────────── */}
      <aside className="advisor-sidebar">
        {/* Advisor identity */}
        <div className="advisor-sidebar-header">
          <div className="advisor-avatar-lg">
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="currentColor"/>
            </svg>
          </div>
          <div className="advisor-sidebar-identity">
            <span className="advisor-sidebar-name">Financial Advisor AI</span>
            <span className="advisor-sidebar-status">
              <span className="advisor-status-dot" />
              Online · IBM watsonx
            </span>
          </div>
        </div>

        <button className="advisor-new-btn" onClick={newChat}>
          <svg viewBox="0 0 16 16" fill="none" width="13" height="13" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          New conversation
        </button>

        <div className="chat-history-list">
          {sessions.some((s) => s.pinned) && <span className="chat-history-group-label">Pinned</span>}
          {sessions.filter((s) => s.pinned).map((s) => (
            <div key={s.id}
              className={`chat-history-item${sessions.indexOf(s) === activeIdx ? ' chat-history-item--active' : ''}`}
              onClick={() => switchSession(sessions.indexOf(s))} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && switchSession(sessions.indexOf(s))}
            >
              <svg viewBox="0 0 16 16" fill="none" width="13" height="13" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
                <path d="M14 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              <span className="chat-history-item-title">{s.title}</span>
              <div className="chat-history-item-actions">
                <button className="chat-history-pin-btn chat-history-pin-btn--active" onClick={(e) => togglePin(e, s.id)} aria-label="Unpin" title="Unpin"><PinFilled size={14} /></button>
                <button className="chat-history-del-btn" onClick={(e) => deleteSession(e, s.id)} aria-label="Delete" title="Delete"><TrashCan size={14} /></button>
              </div>
            </div>
          ))}
          {sessions.some((s) => s.pinned) && sessions.some((s) => !s.pinned) && <span className="chat-history-group-label">Recent</span>}
          {sessions.filter((s) => !s.pinned).map((s) => (
            <div key={s.id}
              className={`chat-history-item${sessions.indexOf(s) === activeIdx ? ' chat-history-item--active' : ''}`}
              onClick={() => switchSession(sessions.indexOf(s))} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && switchSession(sessions.indexOf(s))}
            >
              <svg viewBox="0 0 16 16" fill="none" width="13" height="13" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
                <path d="M14 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              <span className="chat-history-item-title">{s.title}</span>
              <div className="chat-history-item-actions">
                <button className="chat-history-pin-btn" onClick={(e) => togglePin(e, s.id)} aria-label="Pin" title="Pin"><Pin size={14} /></button>
                <button className="chat-history-del-btn" onClick={(e) => deleteSession(e, s.id)} aria-label="Delete" title="Delete"><TrashCan size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="advisor-disclaimer">
          Financial insights are for educational purposes only and do not constitute financial, legal, tax, or investment advice.
        </p>
      </aside>

      {/* ── Main conversation area ────────────────────────────────────────── */}
      <div className="advisor-main">

        {/* Top header bar */}
        <div className="advisor-topbar">
          <div className="advisor-topbar-left">
            <div className="advisor-avatar-sm">
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <p className="advisor-topbar-name">Financial Advisor AI</p>
              <p className="advisor-topbar-sub">Powered by IBM watsonx · Candyland Bank</p>
            </div>
          </div>
          <div className="advisor-status-pill">
            <span className="advisor-status-dot" />
            Online
          </div>
        </div>

        {/* Messages */}
        <div className="advisor-messages" role="log" aria-live="polite" aria-label="Conversation">
          {messages.map((msg, i) => (
            <div key={i} className={`advisor-row advisor-row--${msg.sender}`}>
              {msg.sender !== 'user' && (
                <div className="advisor-avatar-msg">
                  <svg viewBox="0 0 24 24" fill="none" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="currentColor"/>
                  </svg>
                </div>
              )}
              <div className="advisor-row-content">
                <div className="advisor-row-meta">
                  <span className="advisor-row-name">
                    {msg.sender === 'user' ? (username || 'You') : 'Financial Advisor AI'}
                  </span>
                  {msg.ts && <span className="advisor-row-time">{fmtTime(msg.ts)}</span>}
                </div>
                {editingIdx === i ? (
                  <div className="chat-edit-wrap">
                    <TextArea
                      id={`chat-edit-${i}`} labelText="" hideLabel
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
                  <div className={`advisor-bubble${msg.pending ? ' advisor-bubble--pending' : ''}${msg.sender === 'user' ? ' advisor-bubble--user' : ' advisor-bubble--bot'}`}>
                    {msg.pending ? <TypingDots /> : <RichText text={msg.text} />}
                    {msg.sender === 'user' && !msg.pending && (
                      <button className="chat-edit-btn" onClick={() => { setEditingIdx(i); setEditDraft(msg.text); }} aria-label="Edit" title="Edit">✏️</button>
                    )}
                  </div>
                )}
              </div>
              {msg.sender === 'user' && (
                <div className="advisor-avatar-user">
                  {username ? username[0].toUpperCase() : 'Y'}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Quick actions — shown only on a fresh conversation */}
        {showQuickActions && (
          <div className="advisor-quick-actions">
            <p className="advisor-quick-label">Quick actions</p>
            <div className="advisor-quick-grid">
              {QUICK_ACTIONS.map(({ label, prompt }) => (
                <button
                  key={label}
                  className="advisor-quick-btn"
                  onClick={() => send(prompt)}
                  disabled={loading}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="advisor-input-area">
          <div className="advisor-input-wrap">
            <TextArea
              ref={inputRef}
              id="chat-input"
              labelText="" hideLabel
              rows={1}
              placeholder={loading ? 'Your advisor is thinking…' : 'Ask about your finances, goals, portfolio…'}
              value={draft}
              disabled={loading}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
            />
            <button
              className="advisor-send-btn"
              onClick={() => send(draft)}
              disabled={loading || !draft.trim()}
              aria-label="Send message"
            >
              <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                <path d="M2 10L18 2L12 10L18 18L2 10Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <p className="advisor-input-hint">Enter to send · Shift+Enter for new line · Powered by IBM watsonx</p>
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
    <div className="db-layout" style={{ alignItems: 'center', paddingTop: '2rem', paddingBottom: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '36rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0 1rem' }}>
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
          <Button kind="ghost" onClick={onBack}>← Back</Button>
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

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]         = useState('home');
  const [profile, setProfile]   = useState(null);
  const [username, setUsername] = useState(() => getSession()?.username ?? null);
  const [isGuest, setIsGuest]   = useState(false);
  const [booting, setBooting]   = useState(true);
  const [theme, setTheme]       = useState(() => localStorage.getItem('cb-theme') ?? 'g10');

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
    setPage('home');
  };

  if (booting) return null; // wait for session check before rendering

  let content;

  if (page === 'login') {
    content = (
      <NavShell authHeader onGoHome={() => setPage('home')}>
        <LoginForm
          onLogin={(res) => {
            setProfile(res.profile ?? null);
            setUsername(res.username);
            setIsGuest(false);
            setPage('dashboard');
          }}
          onGoHome={() => setPage('home')}
          onCreateNew={() => setPage('signup')}
          onGuest={null}
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
  } else if (page === 'profile') {
    content = (
      <NavShell heroHeader username={username} onGoProfile={() => setPage('profile')} onGoHome={() => setPage('home')}>
        <ProfilePage
          username={username}
          profile={profile}
          onLogout={handleLogout}
          onBack={() => setPage('dashboard')}
          theme={theme}
          onToggleTheme={toggleTheme}
          onStartQuestionnaire={() => setPage('wizard')}
        />
      </NavShell>
    );
  } else if (page === 'dashboard') {
    content = (
      <NavShell heroHeader username={username} onGoProfile={() => setPage('profile')} onGoHome={() => setPage('home')}>
        <DashboardPage
          profile={profile}
          username={username}
          onStartQuestionnaire={() => setPage('wizard')}
          onLogout={handleLogout}
        />
      </NavShell>
    );
  } else if (page === 'wizard') {
    if (!username) {
      // Questionnaire requires a signed-up account — redirect to login
      content = (
        <NavShell authHeader onGoHome={() => setPage('home')}>
          <LoginForm
            onLogin={(res) => {
              setProfile(res.profile ?? null);
              setUsername(res.username);
              setIsGuest(false);
              setPage('wizard');
            }}
            onGoHome={() => setPage('home')}
            onCreateNew={() => setPage('signup')}
            onGuest={null}
          />
        </NavShell>
      );
    } else {
      content = (
        <NavShell authHeader username={username} onGoProfile={() => setPage('profile')} onGoHome={() => setPage('home')}>
          <SignupWizard
            onComplete={(p) => { setProfile(p); setPage('account'); }}
            onExit={() => setPage('dashboard')}
          />
        </NavShell>
      );
    }
  } else if (page === 'signup') {
    content = (
      <NavShell authHeader onGoHome={() => setPage('home')}>
        <AccountSignup
          investorProfile={null}
          isGuest={false}
          onComplete={() => setPage('login')}
          onSkip={null}
        />
      </NavShell>
    );
  } else if (page === 'account') {
    content = (
      <NavShell authHeader onGoHome={() => setPage('home')}>
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
      <NavShell heroHeader username={username} onGoProfile={() => setPage('profile')} onGoHome={() => setPage('home')}>
        <DashboardPage
          profile={profile}
          username={username}
          onStartQuestionnaire={() => setPage('wizard')}
          onLogout={handleLogout}
        />
      </NavShell>
    );
  }

  return (
    <Theme theme={theme}>
      <div key={page} className={`page-transition${theme === 'g100' ? ' theme-dark' : ''}`}>
        {content}
      </div>
    </Theme>
  );
}
