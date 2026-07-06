import { useState, useRef, useEffect } from 'react';
import {
  Button,
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  TextInput,
} from '@carbon/react';
import SignupWizard from './SignupWizard';

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
const SENDER_LABEL = { system: 'Assistant', bot: 'Assistant', user: 'You' };

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
function ChatView({ profile }) {
  const [messages, setMessages] = useState([
    { sender: 'system', text: buildGreeting(profile) },
  ]);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { sender: 'user', text }]);
    setDraft('');
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Candyland Bank is here to help — what would you like to explore?' },
      ]);
    }, 400);
  };

  return (
    <section className="chat-section" id="chat">
      <div className="chat-tile">
        <div className="chat-tile-header">
          <div className="chat-status-dot" aria-hidden="true" />
          <h2>Your financial assistant</h2>
        </div>

        <ProfileBar profile={profile} />

        <div className="chat-body">
          <div className="chat-window" role="log" aria-live="polite" aria-label="Conversation">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message-group ${msg.sender}`}>
                <span className="chat-sender-label">{SENDER_LABEL[msg.sender]}</span>
                <div className="chat-bubble">{msg.text}</div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="chat-input-bar">
          <TextInput
            id="chat-input"
            labelText=""
            placeholder="Ask me anything about investing…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <Button kind="primary" onClick={handleSend}>Send</Button>
        </div>
      </div>
    </section>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [profile, setProfile] = useState(null);

  if (!profile) {
    return (
      <div className="app-shell">
        <Header aria-label="Candyland Bank">
          <HeaderName href="#" prefix="Candyland">
            Bank
          </HeaderName>
        </Header>
        <main>
          <SignupWizard onComplete={setProfile} />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header aria-label="Candyland Bank">
        <HeaderName href="#" prefix="Candyland">
          Bank
        </HeaderName>
        <HeaderNavigation aria-label="Main navigation">
          <HeaderMenuItem href="#home">Home</HeaderMenuItem>
          <HeaderMenuItem href="#chat">Chat</HeaderMenuItem>
        </HeaderNavigation>
      </Header>

      <main className="page-content">
        <section id="home">
          <div className="hero-card">
            <p className="hero-eyebrow">Candyland Bank — Personalised investing</p>
            <h1>Candyland Bank.<br />Your money, your strategy.</h1>
            <p>
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
    </div>
  );
}
