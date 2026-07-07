import { useState } from 'react';

const TOTAL_STEPS = 7;

const STEP_META = [
  { label: 'Goals',       hint: 'What are you investing for?' },
  { label: 'Risk',        hint: 'How much volatility can you handle?' },
  { label: 'Time Horizon',hint: 'How long until you need this money?' },
  { label: 'Income',      hint: 'Income & savings snapshot' },
  { label: 'Investments', hint: 'What do you already hold?' },
  { label: 'Age',         hint: 'Which age range are you in?' },
  { label: 'Preferences', hint: 'Any themes you care about?' },
];

// ── Reusable primitives ────────────────────────────────────────────────────────

/** Card-grid for multi-select (goals, investments, preferences) */
function CardGrid({ options, selected, onChange }) {
  const toggle = (value) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  return (
    <div className="option-grid">
      {options.map(({ value, icon, label, sub }) => (
        <button
          key={value}
          type="button"
          className={`option-card${selected.includes(value) ? ' selected' : ''}`}
          onClick={() => toggle(value)}
          aria-pressed={selected.includes(value)}
        >
          {icon && <span className="option-card-icon">{icon}</span>}
          <span>{label}</span>
          {sub && <span className="option-card-sub">{sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** Row-list for single-select (risk, horizon, age, emergency) */
function RowList({ options, selected, onChange }) {
  return (
    <div className="option-list">
      {options.map(({ value, label, hint }) => (
        <button
          key={value}
          type="button"
          className={`option-row${selected === value ? ' selected' : ''}`}
          onClick={() => onChange(value)}
          aria-pressed={selected === value}
        >
          <span className="option-row-radio">
            <span className="option-row-radio-dot" />
          </span>
          <span className="option-row-text">
            <span className="option-row-title">{label}</span>
            {hint && <span className="option-row-hint">{hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Steps ──────────────────────────────────────────────────────────────────────

function StepGoals({ data, onChange }) {
  const options = [
    { value: 'retirement', icon: '🏖', label: 'Retirement',           sub: 'Long-term security' },
    { value: 'home',       icon: '🏠', label: 'Buying a Home',        sub: 'Property purchase' },
    { value: 'education',  icon: '🎓', label: 'Education',            sub: 'Savings for study' },
    { value: 'wealth',     icon: '📈', label: 'Wealth Growth',        sub: 'Grow your net worth' },
    { value: 'short_term', icon: '⚡', label: 'Short-term Goals',     sub: 'Within a few years' },
    { value: 'long_term',  icon: '🌱', label: 'Long-term Goals',      sub: '10+ year horizon' },
  ];
  return (
    <div className="step-body">
      <CardGrid options={options} selected={data.goals} onChange={(v) => onChange({ goals: v })} />
    </div>
  );
}

function StepRisk({ data, onChange }) {
  const options = [
    { value: 'conservative', label: 'Conservative', hint: 'Preserve capital — accept lower returns and minimal swings' },
    { value: 'moderate',     label: 'Moderate',     hint: 'Balanced growth — manageable ups and downs' },
    { value: 'aggressive',   label: 'Aggressive',   hint: 'Maximise returns — comfortable with big swings' },
  ];
  return (
    <div className="step-body">
      <RowList options={options} selected={data.risk} onChange={(v) => onChange({ risk: v })} />
    </div>
  );
}

function StepTimeHorizon({ data, onChange }) {
  const options = [
    { value: 'short',  label: 'Short',  hint: '0 – 3 years — near-term liquidity needed' },
    { value: 'medium', label: 'Medium', hint: '3 – 10 years — mid-range planning' },
    { value: 'long',   label: 'Long',   hint: '10+ years — maximise compounding' },
  ];
  return (
    <div className="step-body">
      <RowList options={options} selected={data.horizon} onChange={(v) => onChange({ horizon: v })} />
    </div>
  );
}

function StepIncome({ data, onChange }) {
  const emergencyOptions = [
    { value: 'none',    label: 'No fund yet',     hint: 'Still building one' },
    { value: 'partial', label: 'Partial',         hint: '1 – 3 months of expenses' },
    { value: 'full',    label: 'Fully funded',    hint: '3 – 6+ months covered' },
  ];
  return (
    <div className="step-body">
      <div className="income-fields">
        <div className="field-group">
          <label className="field-label" htmlFor="annual-income">Annual income (USD)</label>
          <input
            id="annual-income"
            className="field-input"
            type="number"
            min="0"
            placeholder="e.g. 75 000"
            value={data.annualIncome}
            onChange={(e) => onChange({ annualIncome: e.target.value })}
          />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="monthly-savings">Monthly amount to invest (USD)</label>
          <input
            id="monthly-savings"
            className="field-input"
            type="number"
            min="0"
            placeholder="e.g. 500"
            value={data.monthlySavings}
            onChange={(e) => onChange({ monthlySavings: e.target.value })}
          />
        </div>
      </div>
      <div className="field-group" style={{ marginTop: '0.25rem' }}>
        <span className="field-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Emergency fund status</span>
        <RowList
          options={emergencyOptions}
          selected={data.emergencyFund}
          onChange={(v) => onChange({ emergencyFund: v })}
        />
      </div>
    </div>
  );
}

function StepInvestments({ data, onChange }) {
  const options = [
    { value: 'stocks', icon: '📊', label: 'Stocks',          sub: 'Equities' },
    { value: 'bonds',  icon: '🏦', label: 'Bonds',           sub: 'Fixed income' },
    { value: 'etfs',   icon: '📦', label: 'ETFs',            sub: 'Index baskets' },
    { value: 'crypto', icon: '🪙', label: 'Crypto',          sub: 'Digital assets' },
    { value: 'cash',   icon: '💵', label: 'Cash / Savings',  sub: 'Liquid savings' },
    { value: 'none',   icon: '🚀', label: 'Starting fresh',  sub: 'No holdings yet' },
  ];
  return (
    <div className="step-body">
      <CardGrid
        options={options}
        selected={data.currentInvestments}
        onChange={(v) => onChange({ currentInvestments: v })}
      />
    </div>
  );
}

function StepAge({ data, onChange }) {
  const options = [
    { value: '18-25', label: '18 – 25' },
    { value: '26-35', label: '26 – 35' },
    { value: '36-45', label: '36 – 45' },
    { value: '46-55', label: '46 – 55' },
    { value: '56-65', label: '56 – 65' },
    { value: '66+',   label: '66 +' },
  ];
  return (
    <div className="step-body">
      <RowList options={options} selected={data.ageBracket} onChange={(v) => onChange({ ageBracket: v })} />
    </div>
  );
}

function StepPreferences({ data, onChange }) {
  const options = [
    { value: 'esg',      icon: '🌿', label: 'ESG / Ethical',      sub: 'Values-aligned investing' },
    { value: 'tech',     icon: '💻', label: 'High-growth Tech',   sub: 'Innovative companies' },
    { value: 'dividend', icon: '💰', label: 'Dividend Income',    sub: 'Regular payouts' },
    { value: 'index',    icon: '📉', label: 'Low-fee Index',      sub: 'Broad market exposure' },
  ];
  return (
    <div className="step-body">
      <CardGrid
        options={options}
        selected={data.preferences}
        onChange={(v) => onChange({ preferences: v })}
      />
    </div>
  );
}

// ── Validation ─────────────────────────────────────────────────────────────────
function isStepValid(step, data) {
  switch (step) {
    case 0: return data.goals.length > 0;
    case 1: return !!data.risk;
    case 2: return !!data.horizon;
    case 3: return data.annualIncome !== '' && data.monthlySavings !== '' && !!data.emergencyFund;
    case 4: return data.currentInvestments.length > 0;
    case 5: return !!data.ageBracket;
    case 6: return data.preferences.length > 0;
    default: return false;
  }
}

// ── Wizard shell ───────────────────────────────────────────────────────────────
export default function SignupWizard({ onComplete, onExit }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({
    goals: [],
    risk: '',
    horizon: '',
    annualIncome: '',
    monthlySavings: '',
    emergencyFund: '',
    currentInvestments: [],
    ageBracket: '',
    preferences: [],
  });

  const patch = (partial) => setProfile((prev) => ({ ...prev, ...partial }));

  const steps = [
    <StepGoals        data={profile} onChange={patch} />,
    <StepRisk         data={profile} onChange={patch} />,
    <StepTimeHorizon  data={profile} onChange={patch} />,
    <StepIncome       data={profile} onChange={patch} />,
    <StepInvestments  data={profile} onChange={patch} />,
    <StepAge          data={profile} onChange={patch} />,
    <StepPreferences  data={profile} onChange={patch} />,
  ];

  const canAdvance = isStepValid(step, profile);
  const progressPct = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
    else onComplete(profile);
  };

  return (
    <div className="wizard-page">
      <div className="wizard-card">
        {/* Progress bar */}
        <div
          className="wizard-accent-bar"
          style={{ width: `${progressPct}%` }}
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        />

        <div className="wizard-inner">
          {/* Step pill */}
          <div className="wizard-step-pill">
            Step {step + 1} of {TOTAL_STEPS} &nbsp;·&nbsp; {STEP_META[step].label}
          </div>

          <h2 className="wizard-heading">{STEP_META[step].hint}</h2>
          <p className="wizard-sub">
            {step === 0 && "Select everything that applies — your goals shape every recommendation."}
            {step === 1 && "Be honest — there are no wrong answers. This drives your asset mix."}
            {step === 2 && "Think about when you\u2019ll actually need to withdraw this money."}
            {step === 3 && "Rough numbers are fine. This ensures advice fits your real situation."}
            {step === 4 && "We\u2019ll avoid overlap and build on what you already have."}
            {step === 5 && "We only need a bracket — no exact age required."}
            {step === 6 && "Pick any that resonate. You can always change these later."}
          </p>

          {/* Dot stepper */}
          <div className="step-dots" aria-hidden="true">
            {STEP_META.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`step-dot${i === step ? ' active' : i < step ? ' done' : ''}`}
                onClick={() => i < step && setStep(i)}
                tabIndex={i < step ? 0 : -1}
                aria-label={i < step ? `Go back to step ${i + 1}` : undefined}
              />
            ))}
          </div>

          {steps[step]}
        </div>

        {/* Footer nav */}
        <div className="wizard-footer">
          <div>
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
                ← Back
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={onExit}>
                ← Home
              </button>
            )}
          </div>
          <div className="wizard-footer-right">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNext}
              disabled={!canAdvance}
            >
              {step === TOTAL_STEPS - 1 ? 'Finish setup →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
