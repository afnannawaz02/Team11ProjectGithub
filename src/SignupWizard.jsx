import { useState, useEffect } from 'react';
import {
  Button,
  NumberInput,
  Select,
  SelectItem,
  TextInput,
  SelectableTile,
  RadioTile,
  TileGroup,
  ProgressIndicator,
  ProgressStep,
} from '@carbon/react';

const TOTAL_STEPS = 12;

const STEP_META = [
  { label: 'Goals',        hint: 'What are you investing for?' },
  { label: 'Risk',         hint: 'How much volatility can you handle?' },
  { label: 'Time Horizon', hint: 'How long until you need this money?' },
  { label: 'Income',       hint: 'Income & savings snapshot' },
  { label: 'Investments',  hint: 'What do you already hold?' },
  { label: 'Birthday',     hint: "What's your date of birth?" },
  { label: 'Marital Status',    hint: 'What is your marital status?' },
  { label: 'Employment',        hint: 'Employment Status' },
  { label: 'Credit Score', hint: 'What is your credit score range?' },
  { label: 'Location',     hint: 'Where are you based?' },
  { label: 'Veteran',      hint: 'Have you served in the military?' },
  { label: 'Preferences',  hint: 'Any themes you care about?' },
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
        <SelectableTile
          key={value}
          id={`selectable-${value}`}
          value={value}
          selected={selected.includes(value)}
          onChange={() => toggle(value)}
          className="option-card"
        >
          {icon && <span className="option-card-icon">{icon}</span>}
          <span>{label}</span>
          {sub && <span className="option-card-sub">{sub}</span>}
        </SelectableTile>
      ))}
    </div>
  );
}

/** Row-list for single-select (risk, horizon, age, emergency) */
function RowList({ options, selected, onChange }) {
  return (
    <TileGroup
      name={`rowlist-${options[0]?.value ?? 'group'}`}
      valueSelected={selected}
      onChange={(value) => onChange(value)}
      className="option-list"
    >
      {options.map(({ value, label, hint }) => (
        <RadioTile
          key={value}
          value={value}
          className="option-row"
        >
          <span className="option-row-text">
            <span className="option-row-title">{label}</span>
            {hint && <span className="option-row-hint">{hint}</span>}
          </span>
        </RadioTile>
      ))}
    </TileGroup>
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
  const bracketOptions = [
    { value: 'under-25k',    label: 'Under $25,000',          hint: 'Entry level or part-time income' },
    { value: '25k-50k',      label: '$25,000 – $49,999',      hint: '' },
    { value: '50k-75k',      label: '$50,000 – $74,999',      hint: '' },
    { value: '75k-100k',     label: '$75,000 – $99,999',      hint: '' },
    { value: '100k-150k',    label: '$100,000 – $149,999',    hint: '' },
    { value: '150k-250k',    label: '$150,000 – $249,999',    hint: '' },
    { value: 'over-250k',    label: '$250,000 +',             hint: 'High income' },
    { value: 'prefer-not',   label: 'Prefer not to say',      hint: '' },
  ];
  const emergencyOptions = [
    { value: 'none',    label: 'No fund yet',  hint: 'Still building one' },
    { value: 'partial', label: 'Partial',      hint: '1 – 3 months of expenses' },
    { value: 'full',    label: 'Fully funded', hint: '3 – 6+ months covered' },
  ];
  return (
    <div className="step-body">
      <div className="field-group">
        <span className="field-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Annual income bracket</span>
        <RowList
          options={bracketOptions}
          selected={data.annualIncome}
          onChange={(v) => onChange({ annualIncome: v })}
        />
      </div>
      <div className="field-group" style={{ marginTop: '0.75rem' }}>
        <NumberInput
          id="monthly-savings"
          label="Monthly amount to invest (USD)"
          min={0}
          placeholder="e.g. 500"
          value={data.monthlySavings === '' ? '' : Number(data.monthlySavings)}
          onChange={(_e, { value }) => onChange({ monthlySavings: value === '' ? '' : String(value) })}
          allowEmpty
        />
      </div>
      <div className="field-group" style={{ marginTop: '0.75rem' }}>
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
  const today    = new Date();
  const maxDate  = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
    .toISOString().split('T')[0];
  const minDate  = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate())
    .toISOString().split('T')[0];

  const age = data.dob
    ? Math.floor((today - new Date(data.dob)) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const tooYoung = age !== null && age < 18;

  return (
    <div className="step-body">
      <div className="field-group">
        <TextInput
          id="dob-input"
          labelText="Date of birth"
          type="date"
          max={maxDate}
          min={minDate}
          value={data.dob || ''}
          onChange={(e) => onChange({ dob: e.target.value })}
          invalid={tooYoung}
          invalidText="You must be at least 18 years old to use Candyland Bank."
          helperText={age !== null && !tooYoung ? `Age: ${age}` : ''}
        />
      </div>
    </div>
  );
}

function StepMaritalStatus({ data, onChange }) {
  const options = [
    { value: 'single',    label: 'Single',            hint: 'Not married or in a civil partnership' },
    { value: 'married',   label: 'Married',           hint: 'Including civil partnership' },
    { value: 'partnered', label: 'Living with partner', hint: 'Unmarried but cohabiting' },
    { value: 'divorced',  label: 'Divorced / Separated', hint: '' },
    { value: 'widowed',   label: 'Widowed',           hint: '' },
    { value: 'prefer-not', label: 'Prefer not to say', hint: '' },
  ];
  return (
    <div className="step-body">
      <RowList options={options} selected={data.maritalStatus} onChange={(v) => onChange({ maritalStatus: v })} />
    </div>
  );
}

function StepEmployment({ data, onChange }) {
  const options = [
    { value: 'full-time',     label: 'Full time',       hint: 'Salaried or permanent contract' },
    { value: 'part-time',     label: 'Part time',       hint: 'Part-time or casual contract' },
    { value: 'self-employed', label: 'Self employed',   hint: 'Freelance, contractor, or business owner' },
    { value: 'student',       label: 'Student',         hint: 'Full or part-time study' },
    { value: 'retired',       label: 'Retired',         hint: 'No longer in the workforce' },
    { value: 'unemployed',    label: 'Unemployed',      hint: 'Currently seeking work' },
    { value: 'other',         label: 'Other',           hint: 'Homemaker, carer, or other' },
  ];
  return (
    <div className="step-body">
      <RowList options={options} selected={data.employmentStatus} onChange={(v) => onChange({ employmentStatus: v })} />
    </div>
  );
}

function StepCreditScore({ data, onChange }) {
  const options = [
    { value: 'poor',      label: 'Poor',      hint: 'Below 580 — building from scratch' },
    { value: 'fair',      label: 'Fair',      hint: '580 – 669 — room to improve' },
    { value: 'good',      label: 'Good',      hint: '670 – 739 — solid standing' },
    { value: 'very-good', label: 'Very Good', hint: '740 – 799 — above average' },
    { value: 'excellent', label: 'Excellent', hint: '800 + — top tier' },
    { value: 'unknown',   label: "I don't know", hint: 'No worries, we can work with this' },
  ];
  return (
    <div className="step-body">
      <RowList options={options} selected={data.creditScore} onChange={(v) => onChange({ creditScore: v })} />
    </div>
  );
}

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','Washington D.C.','West Virginia','Wisconsin','Wyoming',
];

/** Map full state name → ISO 3166-2 code used by GeoNames (e.g. "Texas" → "TX") */
const STATE_CODES = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
  'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
  'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
  'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','Washington D.C.':'DC','West Virginia':'WV',
  'Wisconsin':'WI','Wyoming':'WY',
};

async function fetchCitiesForState(stateName) {
  const code = STATE_CODES[stateName];
  if (!code) return null;
  // GeoNames public demo account — rate-limited but sufficient for a local demo.
  // featureCode=PPL* covers populated places; adminCode1 = state FIPS / postal code.
  const url =
    `https://secure.geonames.org/searchJSON` +
    `?country=US&adminCode1=${code}&featureClass=P&maxRows=500` +
    `&orderby=population&username=demo`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.geonames) return null;
  const names = [...new Set(json.geonames.map((g) => g.name))].sort();
  return names.length ? names : null;
}

function StepState({ data, onChange }) {
  const [cities, setCities]   = useState(null);   // null = not loaded, [] = failed
  const [loading, setLoading] = useState(false);

  // Fetch cities whenever the selected state changes
  useEffect(() => {
    if (!data.usState) { setCities(null); return; }
    let cancelled = false;
    setLoading(true);
    onChange({ city: '' });   // reset city when state changes
    fetchCitiesForState(data.usState).then((result) => {
      if (cancelled) return;
      setCities(result ?? []);   // [] means fetch failed → fall back to text input
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [data.usState]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="step-body">
      <div className="field-group">
        <Select
          id="state-input"
          labelText="State"
          value={data.usState || ''}
          onChange={(e) => onChange({ usState: e.target.value })}
          autoComplete="address-level1"
        >
          <SelectItem value="" text="Select a state…" disabled hidden />
          {US_STATES.map((s) => (
            <SelectItem key={s} value={s} text={s} />
          ))}
        </Select>
      </div>

      {data.usState && (
        <div className="field-group" style={{ marginTop: '0.75rem' }}>
          {/* Loaded successfully → locked dropdown */}
          {!loading && cities && cities.length > 0 && (
            <Select
              id="city-input"
              labelText={`City${loading ? ' (Loading…)' : ''}`}
              value={data.city || ''}
              onChange={(e) => onChange({ city: e.target.value })}
              autoComplete="address-level2"
            >
              <SelectItem value="" text="Select a city…" disabled hidden />
              {cities.map((c) => (
                <SelectItem key={c} value={c} text={c} />
              ))}
            </Select>
          )}

          {/* Fetch failed / empty → plain text fallback */}
          {!loading && cities !== null && cities.length === 0 && (
            <TextInput
              id="city-input"
              labelText="City"
              placeholder="Type your city"
              value={data.city || ''}
              onChange={(e) => onChange({ city: e.target.value })}
              autoComplete="address-level2"
            />
          )}

          {/* Still loading → disabled placeholder */}
          {loading && (
            <Select id="city-input" labelText="City" disabled>
              <SelectItem value="" text="Loading cities…" />
            </Select>
          )}
        </div>
      )}
    </div>
  );
}

function StepVeteran({ data, onChange }) {
  const options = [
    { value: 'yes',        label: 'Yes, I am a veteran',          hint: 'Previously served in the armed forces' },
    { value: 'active',     label: 'Yes, currently serving',       hint: 'Active duty military' },
    { value: 'no',         label: 'No',                           hint: 'No military service' },
    { value: 'prefer-not', label: 'Prefer not to say',            hint: '' },
  ];
  return (
    <div className="step-body">
      <RowList options={options} selected={data.veteranStatus} onChange={(v) => onChange({ veteranStatus: v })} />
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
    case 5: return !!data.dob && Math.floor((new Date() - new Date(data.dob)) / (365.25 * 24 * 60 * 60 * 1000)) >= 18;
    case 6: return !!data.maritalStatus;
    case 7: return !!data.employmentStatus;
    case 8: return !!data.creditScore;
    case 9: return !!data.usState && !!data.city;
    case 10: return !!data.veteranStatus;
    case 11: return data.preferences.length > 0;
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
    dob: '',
    maritalStatus: '',
    employmentStatus: '',
    creditScore: '',
    usState: '',
    city: '',
    veteranStatus: '',
    preferences: [],
  });

  const patch = (partial) => setProfile((prev) => ({ ...prev, ...partial }));

  const steps = [
    <StepGoals          data={profile} onChange={patch} />,
    <StepRisk           data={profile} onChange={patch} />,
    <StepTimeHorizon    data={profile} onChange={patch} />,
    <StepIncome         data={profile} onChange={patch} />,
    <StepInvestments    data={profile} onChange={patch} />,
    <StepAge            data={profile} onChange={patch} />,
    <StepMaritalStatus  data={profile} onChange={patch} />,
    <StepEmployment     data={profile} onChange={patch} />,
    <StepCreditScore    data={profile} onChange={patch} />,
    <StepState          data={profile} onChange={patch} />,
    <StepVeteran        data={profile} onChange={patch} />,
    <StepPreferences    data={profile} onChange={patch} />,
  ];

  const canAdvance = isStepValid(step, profile);
  const progressPct = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
    else onComplete(profile);
  };

  return (
    <div className="wizard-page">
      <div className="wizard-hero-banner">
        <img src="/grouped-logo.svg" alt="Candyland Bank" />
      </div>
      <div className="wizard-card">
        {/* Progress bar */}
        <div
          className="wizard-progress-bar"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}
        >
          <div className="wizard-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

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
            {step === 5 && "You must be 18 or over. Your exact age stays private."}
            {step === 6 && "This helps personalise advice around joint finances and dependants."}
            {step === 7 && "This shapes how we think about your income stability and savings capacity."}
            {step === 8 && "This helps us tailor borrowing and debt-related advice."}
            {step === 9 && "State and local tax rules vary — this helps us give accurate after-tax guidance."}
            {step === 10 && "Some benefits and programmes are available exclusively to veterans."}
            {step === 11 && "Pick any that resonate. You can always change these later."}
          </p>

          {steps[step]}
        </div>

        {/* Footer nav */}
        <div className="wizard-footer">
          <div>
            {step > 0 ? (
              <Button kind="ghost" onClick={() => setStep((s) => s - 1)}>
                ← Back
              </Button>
            ) : (
              <Button kind="ghost" onClick={onExit}>
                ← Home
              </Button>
            )}
          </div>
          <div className="wizard-footer-right">
            <Button
              kind="primary"
              onClick={handleNext}
              disabled={!canAdvance}
            >
              {step === TOTAL_STEPS - 1 ? 'Finish setup →' : 'Next →'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
