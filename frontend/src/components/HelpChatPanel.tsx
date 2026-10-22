import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Bot, CornerDownLeft, LoaderCircle, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { supportApi, type SupportChatMessage } from '../api';
import './help-chat.css';

type ChatMessage = SupportChatMessage & {
  id: number;
  mode?: 'ai' | 'guide';
  actions?: { label: string; path: string }[];
};

const welcome: ChatMessage = {
  id: 0,
  role: 'assistant',
  content: 'Hi! I’m Quantx Guide. Ask about Quantx, Indian-market concepts, or the current market overview. I can explain data, but I can’t recommend shares or tell you to buy or sell.',
  mode: 'guide',
};
function promptsForPage(path: string): string[] {
  if (path === '/explore') return ['Explain this page', 'What is What-if Lab?', 'What do the quote labels mean?'];
  if (path === '/what-if') return ['Explain this page', 'How do I run a stock scenario?', 'Will this change my account?'];
  if (path.startsWith('/stocks/')) return ['Explain this page', 'What does market depth mean?', 'How do I place a practice order?'];
  if (path === '/orders') return ['Explain this page', 'What do the order statuses mean?', 'How do I cancel an open order?'];
  if (path.startsWith('/portfolio')) return ['Explain this page', 'What is the difference between holdings and positions?', 'How is P&L shown?'];
  if (path === '/account') return ['Explain this page', 'What is available cash?', 'What does the cash ledger record?'];
  if (path === '/market-stress') return ['Explain this page', 'What do Mild, High, and Panic mean?', 'Does stress mode change real prices?'];
  if (path === '/recovery') return ['Explain this page', 'What is a SafePoint?', 'What does rollback restore?'];
  return ['Current market overview', 'Explain this page', 'What does available cash mean?'];
}

export function HelpChatPanel({
  isOpen,
  page,
  pageTitle,
  onClose,
  onNavigate,
}: {
  isOpen: boolean;
  page: string;
  pageTitle: string;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useRef(1);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, isOpen]);

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || sending) return;
    const id = messageId.current++;
    const currentHistory = messages.filter((message) => message.id !== 0).slice(-10).map(({ role, content: text }) => ({ role, content: text }));
    setMessages((current) => [...current, { id, role: 'user', content }]);
    setDraft('');
    setSending(true);
    try {
      const reply = await supportApi.chat(content, currentHistory, page);
      setMessages((current) => [...current, {
        id: messageId.current++, role: 'assistant', content: reply.answer, mode: reply.mode, actions: reply.actions,
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'I couldn’t reach the help service. Please try again.';
      setMessages((current) => [...current, { id: messageId.current++, role: 'assistant', content: message, mode: 'guide' }]);
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  if (!isOpen) return null;

  return (
    <div className="help-chat-layer">
      <button className="help-chat-scrim" onClick={onClose} aria-label="Close help assistant" />
      <section className="help-chat-panel" role="dialog" aria-modal="true" aria-labelledby="help-chat-title">
        <header className="help-chat-header">
          <span className="help-chat-avatar"><Bot size={20} /><i><Sparkles size={10} /></i></span>
          <div className="help-chat-title-wrap">
            <strong id="help-chat-title">Quantx Guide</strong>
            <span><i /> Your market learning copilot</span>
          </div>
          <span className="help-chat-header-tag">BETA</span>
          <button className="help-chat-close" onClick={onClose} aria-label="Close help assistant"><X size={19} /></button>
        </header>

        <div className="help-chat-context"><Sparkles size={14} /> Helping with <strong>{pageTitle}</strong><span className="help-chat-context-live"><i /> READY</span></div>

        <div className="help-chat-messages" ref={scrollRef} aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`help-chat-message ${message.role === 'user' ? 'from-user' : 'from-guide'}`}>
              {message.role === 'assistant' && <span className="help-chat-message-avatar"><Bot size={15} /></span>}
              <div className="help-chat-bubble">
                <p>{message.content}</p>
                {message.role === 'assistant' && message.mode && <small className="help-chat-reply-mode">{message.mode === 'ai' ? 'AI response' : 'In-app guide'}</small>}
                {message.actions?.map((action) => (
                  <button key={action.path} className="help-chat-action" onClick={() => { onNavigate(action.path); onClose(); }}>
                    {action.label}<ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </article>
          ))}
          {messages.length === 1 && !sending && (
            <div className="help-chat-prompts">
              <span>TRY ASKING</span>
              {[...promptsForPage(page), 'What is market capitalization?'].map((prompt) => <button key={prompt} onClick={() => void sendMessage(prompt)}>{prompt}<ArrowRight size={13} /></button>)}
            </div>
          )}
          {sending && <div className="help-chat-typing"><span><Bot size={15} /></span><i /><i /><i /><small>Thinking</small><LoaderCircle size={13} className="help-chat-spinner" /></div>}
        </div>

        <form className="help-chat-compose" onSubmit={submit}>
          <label className="sr-only" htmlFor="help-chat-input">Ask Quantx Guide</label>
          <input id="help-chat-input" ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about Quantx or Indian markets…" maxLength={1200} disabled={sending} />
          <button type="submit" aria-label="Send message" disabled={sending || !draft.trim()}><Send size={16} /></button>
          <small><CornerDownLeft size={12} /> Enter to send</small>
        </form>
        <footer className="help-chat-footer"><MessageCircle size={13} /> Market education only · No personalized investment advice</footer>
      </section>
    </div>
  );
}
