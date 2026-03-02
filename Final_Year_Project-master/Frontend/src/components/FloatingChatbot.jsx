/**
 * FloatingChatbot — AI Ride Agent (UI layer)
 *
 * This component is a THIN UI layer only.
 * All chatbot intelligence is delegated to unifiedAgent.js:
 *
 *   send() / dispatchMessage()
 *     → handleUserMessage()  (unifiedAgent.js)
 *         → detectIntent() → routeIntent()
 *             → handleDatabaseIntent()  ← Firebase only
 *             → handleLLMIntent()       ← LLM only, no DB writes
 *
 * This file manages: UI state, message rendering, input, quick-action buttons.
 * It does NOT contain business logic, Firebase calls, or LLM requests.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaComments, FaTimes, FaPaperPlane, FaRobot, FaMinus } from 'react-icons/fa';
import './FloatingChatbot.css';
import { db, auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { handleUserMessage } from '../services/unifiedAgent';
import { createInitialState } from '../services/unifiedAgent';
import {
  createOrGetPrivateChat, resolveRideStatus, getParticipantIds,
} from '../services/rideActionService';

/* ─── Constants for ride card rendering ─── */
const VEHICLE_EMOJI = { car: '🚗 Car', auto: '🛺 Auto' };

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */

const FloatingChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: "👋 Hi! I'm your **AI Ride Agent**. I can find rides, post rides, join/leave rides, and answer questions.\n\nTry saying **\"Find rides to Koramangala\"** or **\"Post a ride\"**!",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentState, setAgentState] = useState(createInitialState());
  const chatBodyRef = useRef(null);
  const navigate = useNavigate();

  /* ── External open trigger ── */
  useEffect(() => {
    const handler = () => { setIsOpen(true); setIsMinimized(false); };
    window.addEventListener('open-chatbot', handler);
    return () => window.removeEventListener('open-chatbot', handler);
  }, []);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [messages]);

  /* ═══════════════════════════════════════════════════════
     MESSAGE HELPERS
     ═══════════════════════════════════════════════════════ */

  const addBotMsg = useCallback((text, extra = {}) => {
    setMessages(prev => [...prev, { from: 'bot', text, ...extra }]);
  }, []);

  const addUserMsg = useCallback((text) => {
    setMessages(prev => [...prev, { from: 'user', text }]);
  }, []);

  const replaceBotThinking = useCallback((text, extra = {}) => {
    setMessages(prev => {
      const idx = prev.findLastIndex(m => m.from === 'bot' && m.text === '⏳ Thinking…');
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { from: 'bot', text, ...extra };
        return next;
      }
      return [...prev, { from: 'bot', text, ...extra }];
    });
  }, []);

  const showThinking = useCallback(() => {
    setMessages(prev => [...prev, { from: 'bot', text: '⏳ Thinking…' }]);
  }, []);

  const getUserId   = () => auth?.currentUser?.uid || null;
  const getUserName = () =>
    auth?.currentUser?.displayName || auth?.currentUser?.email?.split('@')[0] || 'User';

  /* ═══════════════════════════════════════════════════════
     DISPATCH — thin wrapper around unifiedAgent.handleUserMessage
     ═══════════════════════════════════════════════════════ */

  /**
   * Sends `text` through the unified agent and updates messages + agent state.
   * @param {string}  text            - message to process
   * @param {object}  [stateOverride] - optional state to use instead of agentState
   */
  const dispatchMessage = useCallback(async (text, stateOverride = null) => {
    showThinking();
    setIsLoading(true);
    try {
      const { result, newState } = await handleUserMessage(
        text,
        getUserId(),
        db,
        auth,
        getUserName(),
        stateOverride ?? agentState,
        messages,
      );
      replaceBotThinking(result.text, result);
      setAgentState(newState);
    } catch (err) {
      replaceBotThinking(`⚠️ Something went wrong: ${err.message || 'Unknown error'}. Please try again.`);
    }
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentState, messages]);




  /* ═══════════════════════════════════════════════════════
     MAIN SEND HANDLER
     ═══════════════════════════════════════════════════════ */

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    addUserMsg(text);
    setInput('');
    await dispatchMessage(text);
  };

  /* ═══════════════════════════════════════════════════════
     QUICK ACTION HANDLER
     ═══════════════════════════════════════════════════════ */

  const handleQuickAction = async (action, ride) => {
    if (isLoading) return;

    switch (action) {
      /* ── Confirmations: simulate "yes" through the unified agent ── */
      case 'confirm_join': {
        addUserMsg('Yes, join!');
        await dispatchMessage('yes');
        break;
      }
      case 'confirm_post': {
        addUserMsg('Yes, post it!');
        await dispatchMessage('yes');
        break;
      }
      case 'confirm_leave': {
        addUserMsg('Yes, leave');
        await dispatchMessage('yes');
        break;
      }
      case 'confirm_cancel': {
        addUserMsg('Yes, cancel');
        await dispatchMessage('yes');
        break;
      }

      /* ── Cancellation ── */
      case 'cancel_action': {
        addUserMsg('No');
        addBotMsg("👍 Cancelled! What else can I help with?");
        setAgentState(createInitialState());
        break;
      }

      /* ── Navigation shortcuts ── */
      case 'find_ride':
      case 'search_again': {
        addUserMsg('Find rides');
        await dispatchMessage('find rides', createInitialState());
        break;
      }
      case 'post_ride': {
        addUserMsg('Post a ride');
        await dispatchMessage('post a ride', createInitialState());
        break;
      }
      case 'my_rides': {
        addUserMsg('My rides');
        await dispatchMessage('my rides', createInitialState());
        break;
      }

      /* ── Join a specific ride card ── */
      case 'join_ride': {
        if (ride) {
          addUserMsg(`Join ride to ${ride.destination}`);
          const stateWithRide = { ...agentState, findResults: [ride] };
          await dispatchMessage('join ride #1', stateWithRide);
        }
        break;
      }

      /* ── Chat with driver (requires React Router navigation) ── */
      case 'chat_driver': {
        if (ride) {
          try {
            const res = await createOrGetPrivateChat(db, auth, ride);
            if (res.ok && res.chatId) {
              setIsOpen(false);
              navigate(`/privatechat/${res.chatId}`);
            } else addBotMsg(`❌ ${res.message || 'Could not open chat.'}`);
          } catch (e) { addBotMsg(`❌ ${e.message}`); }
        }
        break;
      }

      /* ── Vehicle selection inside post wizard ── */
      case 'vehicle_car': {
        addUserMsg('Car');
        await dispatchMessage('car');
        break;
      }
      case 'vehicle_auto': {
        addUserMsg('Auto');
        await dispatchMessage('auto');
        break;
      }

      default:
        break;
    }
  };

  /* ═══════════════════════════════════════════════════════
     FORMAT MARKDOWN-LIKE TEXT TO JSX
     ═══════════════════════════════════════════════════════ */

  const formatText = (text) => {
    if (!text) return text;
    const lines = String(text).split('\n');
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={i} />;

      /* Bold: **text** */
      const parts = [];
      let cursor = 0;
      const boldRx = /\*\*(.+?)\*\*/g;
      let m;
      let pk = 0;
      while ((m = boldRx.exec(trimmed)) !== null) {
        if (m.index > cursor) parts.push(<span key={pk++}>{trimmed.slice(cursor, m.index)}</span>);
        parts.push(<strong key={pk++}>{m[1]}</strong>);
        cursor = m.index + m[0].length;
      }
      if (cursor < trimmed.length) parts.push(<span key={pk++}>{trimmed.slice(cursor)}</span>);
      const content = parts.length > 0 ? parts : trimmed;

      if (/^[-•]\s/.test(trimmed)) {
        return <div key={i} style={{ display: 'flex', gap: 6, marginTop: 3, marginLeft: 4 }}>
          <span style={{ color: '#8b5cf6', fontWeight: 700, flexShrink: 0 }}>•</span>
          <span>{typeof content === 'string' ? content.replace(/^[-•]\s*/, '') : content}</span>
        </div>;
      }
      if (/^\d+[.)]\s/.test(trimmed)) {
        const num = trimmed.match(/^(\d+)[.)]\s*/)?.[1];
        return <div key={i} style={{ display: 'flex', gap: 6, marginTop: 3, marginLeft: 4 }}>
          <span style={{ color: '#8b5cf6', fontWeight: 700, flexShrink: 0, minWidth: 16 }}>{num}.</span>
          <span>{content}</span>
        </div>;
      }
      if (/^---+$/.test(trimmed)) return <hr key={i} style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />;
      if (/^─+$/.test(trimmed)) return <hr key={i} style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '6px 0' }} />;

      return <div key={i} style={{ marginTop: i > 0 ? 2 : 0 }}>{content}</div>;
    });
  };

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */

  return (
    <div className={`floating-chat ${isOpen ? 'open' : ''} ${isOpen && isMinimized ? 'is-minimized' : ''}`}>
      {/* Toggle Bubble */}
      {!isOpen && (
        <button className="floating-chat-toggle" onClick={() => setIsOpen(true)} aria-label="Open chat">
          <FaComments />
        </button>
      )}

      {isOpen && (
        <div className={`floating-chat-window ${isMinimized ? 'minimized' : ''}`}>
          {/* Header */}
          <div className="chat-header">
            <div className="chat-title">
              <FaRobot style={{ marginRight: 8 }} />
              AI Ride Agent
              <span className="agent-badge">AGENT</span>
            </div>
            <div className="chat-actions">
              <button className="chat-icon-btn" onClick={() => setIsMinimized(!isMinimized)} aria-label="Minimize"><FaMinus /></button>
              <button className="chat-icon-btn" onClick={() => setIsOpen(false)} aria-label="Close"><FaTimes /></button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Message Body */}
              <div className="chat-body" ref={chatBodyRef}>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`chat-message ${msg.from === 'user' ? 'user' : 'bot'}`}>
                    {/* Ride result cards */}
                    {msg.type === 'ride-results' && Array.isArray(msg.rides) ? (
                      <div>
                        <span className="bot-formatted">{formatText(msg.text)}</span>
                        <div className="agent-ride-cards">
                          {msg.rides.map((r, rIdx) => {
                            const uid = getUserId();
                            const pIds = getParticipantIds(r);
                            const total = Number(r.totalSeats || r.seats) || 1;
                            const avail = r.availableSeats != null ? Number(r.availableSeats) : (total - pIds.length);
                            const joined = uid && pIds.includes(uid);
                            const mine = uid && r.driverId === uid;
                            return (
                              <div key={r.id} className="agent-ride-card">
                                <div className="arc-header">
                                  <span className="arc-num">#{rIdx + 1}</span>
                                  <span className="arc-dest">{r.destination}</span>
                                  <span className={`arc-status arc-status-${resolveRideStatus(r)}`}>
                                    {resolveRideStatus(r)}
                                  </span>
                                </div>
                                <div className="arc-meta">
                                  <span>📅 {r.date}</span>
                                  <span>🕐 {r.time || 'Flex'}</span>
                                  <span>💺 {avail}/{total}</span>
                                  <span>₹{Number(r.price || 0)}</span>
                                </div>
                                <div className="arc-driver">👤 {r.driverName || 'Unknown'} {r.vehicleType ? `· ${VEHICLE_EMOJI[r.vehicleType] || r.vehicleType}` : ''}</div>
                                <div className="arc-actions">
                                  <button
                                    className="arc-btn arc-btn-join"
                                    disabled={joined || mine || avail <= 0}
                                    onClick={() => handleQuickAction('join_ride', r)}
                                  >
                                    {joined ? '✅ Joined' : mine ? 'Your Ride' : avail <= 0 ? 'Full' : 'Join'}
                                  </button>
                                  <button
                                    className="arc-btn arc-btn-chat"
                                    onClick={() => handleQuickAction('chat_driver', r)}
                                  >
                                    💬 Chat
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <span className="bot-formatted">{formatText(msg.text)}</span>
                    )}

                    {/* Quick-action chips */}
                    {msg.quickActions && msg.quickActions.length > 0 && (
                      <div className="agent-quick-actions">
                        {msg.quickActions.map((qa, qIdx) => (
                          <button
                            key={qIdx}
                            className="agent-qa-btn"
                            onClick={() => handleQuickAction(qa.action, qa.ride)}
                            disabled={isLoading}
                          >
                            {qa.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing dots */}
                {isLoading && (
                  <div className="chat-message bot typing-indicator">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                )}
              </div>

              {/* Input Bar */}
              <div className="chat-input">
                <input
                  type="text"
                  placeholder="Ask me anything about rides…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  disabled={isLoading}
                />
                <button onClick={send} aria-label="Send" disabled={isLoading || !input.trim()}>
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
