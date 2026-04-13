import React, { useEffect, useRef, useState } from 'react';
import { FaComments, FaPaperPlane, FaRobot, FaTimes, FaMinus } from 'react-icons/fa';
import './FloatingChatbot.css';
import { sendChatMessage } from '../services/chatbotService';

const OPENING_MESSAGE = {
  from: 'bot',
  text: "Hi. I can answer questions about ColonyCarpool, ride rules, approval flow, trust, and the project docs. Ask me anything about the app or its architecture.",
};

const QUICK_PROMPTS = [
  'What is ColonyCarpool?',
  'How does approval work?',
  'What does the trust score mean?',
  'How do I find a ride?',
];

const FloatingChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([OPENING_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const chatBodyRef = useRef(null);

  useEffect(() => {
    const handler = () => {
      setIsOpen(true);
      setIsMinimized(false);
    };

    window.addEventListener('open-chatbot', handler);
    return () => window.removeEventListener('open-chatbot', handler);
  }, []);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages]);

  const formatMessagesForApi = (items) => items.map((item) => ({
    role: item.from === 'bot' ? 'assistant' : 'user',
    content: item.text,
  }));

  const appendUserMessage = (text) => {
    setMessages((previous) => [...previous, { from: 'user', text }]);
  };

  const appendBotMessage = (text, sources = []) => {
    setMessages((previous) => [...previous, { from: 'bot', text, sources }]);
  };

  const formatText = (text) => {
    if (!text) return text;
    const lines = String(text).split('\n');
    return lines.map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={index} />;

      const parts = [];
      let cursor = 0;
      const boldRx = /\*\*(.+?)\*\*/g;
      let match;
      let keyIndex = 0;

      while ((match = boldRx.exec(trimmed)) !== null) {
        if (match.index > cursor) {
          parts.push(<span key={keyIndex++}>{trimmed.slice(cursor, match.index)}</span>);
        }
        parts.push(<strong key={keyIndex++}>{match[1]}</strong>);
        cursor = match.index + match[0].length;
      }

      if (cursor < trimmed.length) {
        parts.push(<span key={keyIndex++}>{trimmed.slice(cursor)}</span>);
      }

      const content = parts.length > 0 ? parts : trimmed;

      if (/^[-•]\s/.test(trimmed)) {
        return (
          <div key={index} style={{ display: 'flex', gap: 6, marginTop: 3, marginLeft: 4 }}>
            <span style={{ color: '#0f766e', fontWeight: 700, flexShrink: 0 }}>•</span>
            <span>{typeof content === 'string' ? content.replace(/^[-•]\s*/, '') : content}</span>
          </div>
        );
      }

      if (/^\d+[.)]\s/.test(trimmed)) {
        const number = trimmed.match(/^(\d+)[.)]\s*/)?.[1];
        return (
          <div key={index} style={{ display: 'flex', gap: 6, marginTop: 3, marginLeft: 4 }}>
            <span style={{ color: '#0f766e', fontWeight: 700, flexShrink: 0, minWidth: 16 }}>{number}.</span>
            <span>{content}</span>
          </div>
        );
      }

      if (/^---+$/.test(trimmed)) {
        return <hr key={index} style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />;
      }

      return <div key={index} style={{ marginTop: index > 0 ? 2 : 0 }}>{content}</div>;
    });
  };

  const send = async (rawText) => {
    const text = String(rawText || input).trim();
    if (!text || isLoading) return;

    const userMessage = { from: 'user', text };
    const nextMessages = [...messages, userMessage];
    appendUserMessage(text);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(formatMessagesForApi(nextMessages));
      appendBotMessage(response.answer || 'I could not find an answer in the knowledge base.', response.sources || []);
    } catch (error) {
      appendBotMessage(`⚠️ ${error?.message || 'Something went wrong while contacting the chatbot service.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt) => {
    setInput(prompt);
    send(prompt);
  };

  return (
    <div className={`floating-chat ${isOpen ? 'open' : ''} ${isOpen && isMinimized ? 'is-minimized' : ''}`}>
      {!isOpen && (
        <button className="floating-chat-toggle" onClick={() => setIsOpen(true)} aria-label="Open chat">
          <FaComments />
        </button>
      )}

      {isOpen && (
        <div className={`floating-chat-window ${isMinimized ? 'minimized' : ''}`}>
          <div className="chat-header">
            <div className="chat-title">
              <FaRobot style={{ marginRight: 8 }} />
              ColonyCarpool AI
              <span className="agent-badge">RAG</span>
            </div>
            <div className="chat-actions">
              <button className="chat-icon-btn" onClick={() => setIsMinimized((value) => !value)} aria-label="Minimize">
                <FaMinus />
              </button>
              <button className="chat-icon-btn" onClick={() => setIsOpen(false)} aria-label="Close">
                <FaTimes />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              <div className="chat-body" ref={chatBodyRef}>
                {messages.map((message, index) => (
                  <div key={index} className={`chat-message ${message.from === 'user' ? 'user' : 'bot'}`}>
                    <div className="bot-formatted">{formatText(message.text)}</div>
                    {message.from === 'bot' && Array.isArray(message.sources) && message.sources.length > 0 && (
                      <div className="chat-sources">
                        <div className="chat-sources-label">Sources</div>
                        {message.sources.slice(0, 3).map((source, sourceIndex) => (
                          <div key={`${source.title}-${sourceIndex}`} className="chat-source-card">
                            <div className="chat-source-title">{source.title || 'Knowledge source'}</div>
                            <div className="chat-source-meta">{source.source || 'Local knowledge base'}</div>
                            <div className="chat-source-excerpt">{source.excerpt || ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && <div className="chat-message bot"><div className="bot-formatted">Thinking...</div></div>}
              </div>

              <div className="chat-suggestions">
                {QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" className="chat-suggestion-chip" onClick={() => handleQuickPrompt(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="chat-input">
                <input
                  type="text"
                  placeholder="Ask about the app, rules, or project..."
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      send();
                    }
                  }}
                />
                <button type="button" onClick={() => send()} disabled={isLoading || !input.trim()} aria-label="Send message">
                  <FaPaperPlane />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FloatingChatbot;
