import { useState } from 'react';
import {
  Button,
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  Tile,
  TextInput,
} from '@carbon/react';

const initialMessages = [
  { sender: 'system', text: 'Welcome to Candyland! Ask anything.' },
];

export default function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    if (!draft.trim()) return;
    setMessages((prev) => [...prev, { sender: 'user', text: draft.trim() }]);
    setDraft('');
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Candyland is here to help — what would you like to explore?' },
      ]);
    }, 400);
  };

  return (
    <div className="app-shell">
      <Header aria-label="Candyland">
        <HeaderName href="#" prefix="Candyland">
          Sweet Chat
        </HeaderName>
        <HeaderNavigation aria-label="Candyland navigation">
          <HeaderMenuItem href="#home">Home</HeaderMenuItem>
          <HeaderMenuItem href="#chat">Chat</HeaderMenuItem>
        </HeaderNavigation>
      </Header>

      <main className="page-content">
        <section className="hero" id="home">
          <Tile className="hero-card">
            <h1>Candyland</h1>
            <p>Welcome to your sweet Carbon React template. Enjoy the design and chat with Candyland anytime.</p>
            <Button onClick={() => document.getElementById('chat').scrollIntoView({ behavior: 'smooth' })}>
              Open Chat
            </Button>
          </Tile>
        </section>

        <section className="chat-section" id="chat">
          <Tile>
            <h2>Chatbox</h2>
            <div className="chat-window">
              {messages.map((message, index) => (
                <div key={index} className={`chat-message ${message.sender}`}>
                  <span>{message.text}</span>
                </div>
              ))}
            </div>
            <div className="chat-input-row">
              <TextInput
                id="chat-input"
                labelText=""
                placeholder="Type a message..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSend()}
              />
              <Button kind="primary" onClick={handleSend}>
                Send
              </Button>
            </div>
          </Tile>
        </section>
      </main>
    </div>
  );
}
