import React, { useState } from 'react';
import { FaComments, FaTimes, FaPaperPlane, FaRobot, FaMinus } from 'react-icons/fa';
import './FloatingChatbot.css';

// Simple keyword-based reply generator with more specific fallbacks
const getReply = (text) => {
  const t = text.toLowerCase();

  // Auth flows
  if (t.includes('login') || t.includes('sign in')) {
    return 'Login help: double-check email/password, then use "Forgot Password" on the login page. If you see "pending approval", an admin must approve your account.';
  }
  if (t.includes('signup') || t.includes('register')) {
    return 'Signup guide: open the Signup page, enter your society info, submit, and wait for admin approval. Use the email registered with your society.';
  }

  // Rides: join/post/change
  if (t.includes('join') && t.includes('ride')) {
    return 'Joining a ride: in Dashboard, pick a ride with seats left and click Join. If it is full, ask the driver in private chat or post your own ride.';
  }
  if (t.includes('post') && t.includes('ride')) {
    return 'Posting a ride: in Dashboard, click Post Ride, fill destination/date/time/seats/price, then submit. Make sure seats > 0 and destination is filled.';
  }
  if (t.includes('change') && (t.includes('time') || t.includes('destination'))) {
    return 'To change a ride time/destination: edit your ride card or repost a new ride with the updated details, then cancel the old one.';
  }
  if (t.includes('find') && t.includes('ride')) {
    return 'Finding a ride: use the filters (destination/date/status/seats) on Dashboard, or try the Suggested rides section for matches near you.';
  }

  // Map/location
  if (t.includes('map') || t.includes('location')) {
    return 'Map help: allow location access in your browser and refresh. Ensure the Google Maps API key is set in your environment config.';
  }

  // Notifications
  if (t.includes('notification') || t.includes('alert')) {
    return 'Notifications: check the bell for unread items and allow browser notifications. For chat alerts, keep the tab open so real-time updates arrive.';
  }

  // Payments/savings
  if (t.includes('payment') || t.includes('money') || t.includes('savings')) {
    return 'Savings are tracked per ride. If an amount looks off, open the ride card to see the breakdown or confirm the seat count with the driver.';
  }

  // Clustering/groups
  if (t.includes('cluster') || t.includes('group')) {
    return 'Groups: rides are clustered by proximity and capacity. Red = full, yellow/green = seats available. Join any non-full group.';
  }

  // Help/human
  if (t.includes('help') || t.includes('support') || t.includes('issue') || t.includes('problem')) {
    return 'Tell me the page, what you clicked, what you expected, and what happened. I will guide you or point you to the right place.';
  }

  // Fallback (generic)
  return 'Please share the page you are on and the action you are trying to do (e.g., join ride, reset password, map not loading). I will help from there.';
};

const FloatingChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Hi! I can help with login issues, ride joins, notifications, and maps. Ask me anything or pick a quick help topic.' },
  ]);
  const send = () => {
    if (!input.trim()) return;
    const userMsg = { from: 'user', text: input.trim() };
    const botMsg = { from: 'bot', text: getReply(input.trim()) };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput('');
  };

  const quickAsk = (text) => {
    setMessages((prev) => [...prev, { from: 'user', text }, { from: 'bot', text: getReply(text) }]);
  };

  return (
    <div className={`floating-chat ${isOpen ? 'open' : ''}`}>
      {!isOpen && (
        <button className="floating-chat-toggle" onClick={() => setIsOpen(true)}>
          <FaComments />
        </button>
      )}

      {isOpen && (
        <div className={`floating-chat-window ${isMinimized ? 'minimized' : ''}`}>
          <div className="chat-header">
            <div className="chat-title"><FaRobot style={{ marginRight: 8 }} /> Help Assistant</div>
            <div className="chat-actions">
              <button className="chat-icon-btn" onClick={() => setIsMinimized(!isMinimized)} aria-label="Minimize">
                <FaMinus />
              </button>
              <button className="chat-icon-btn" onClick={() => setIsOpen(false)} aria-label="Close">
                <FaTimes />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              <div className="chat-body">
                {messages.map((m, idx) => (
                  <div key={idx} className={`chat-message ${m.from === 'user' ? 'user' : 'bot'}`}>
                    {m.text}
                  </div>
                ))}
              </div>

              <div className="chat-quick">
                <span>Quick help:</span>
                <button onClick={() => quickAsk('Cannot login')}>Login</button>
                <button onClick={() => quickAsk('How to join a ride?')}>Join ride</button>
                <button onClick={() => quickAsk('Notifications not showing')}>Notifications</button>
                <button onClick={() => quickAsk('Map not loading')}>Map</button>
                <button onClick={() => quickAsk('I need human help')}>Need human</button>
                <button onClick={() => quickAsk('Payment or savings incorrect')}>Payment</button>
                <button onClick={() => quickAsk('Cannot find a ride')}>Find ride</button>
                <button onClick={() => quickAsk('Change my destination or time')}>Change ride</button>
                <button onClick={() => quickAsk('How to post a ride?')}>Post ride</button>
                <button onClick={() => quickAsk('Contact driver or passenger')}>Contact driver</button>
              </div>

              <div className="chat-input">
                <input
                  type="text"
                  placeholder="Type your question..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' ? send() : null}
                />
                <button onClick={send} aria-label="Send">
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
