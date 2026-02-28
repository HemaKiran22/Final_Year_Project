/**
 * FloatingChatbot — AI Ride Agent
 *
 * A conversational agent that understands intent, fetches real data
 * from Firebase, and guides users step-by-step through ride operations.
 * NEVER auto-books without explicit user confirmation.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaComments, FaTimes, FaPaperPlane, FaRobot, FaMinus } from 'react-icons/fa';
import './FloatingChatbot.css';
import { db, auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import {
  detectIntent, extractRideDetails, INTENTS, STATES,
  createInitialState, agentSearchRides, agentGetMyRides, agentGetDashboardStats,
  RESPONSES,
} from '../services/chatAgentService';
import {
  joinRideById, leaveRide, cancelRideByCreator,
  createOrGetPrivateChat, resolveRideStatus, getParticipantIds,
} from '../services/rideActionService';
import { createRideFromPrompt } from '../services/ridePostService';
import { askLLM } from '../services/llmService';
import { getRecommendedRides } from '../services/rideRecommendationService';

/* ─── Constants ─── */
const VEHICLE_SEATS = { car: 4, auto: 3 };
const VEHICLE_EMOJI = { car: '🚗 Car', auto: '🛺 Auto' };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

  const getUserId = () => auth?.currentUser?.uid || null;
  const getUserName = () =>
    auth?.currentUser?.displayName || auth?.currentUser?.email?.split('@')[0] || 'User';

  const updateState = (updates) => setAgentState(prev => ({ ...prev, ...updates }));

  const resetFlow = () => {
    updateState({
      conversationState: STATES.IDLE,
      findQuery: {},
      findResults: [],
      selectedRide: null,
      postData: {},
    });
  };

  /* ═══════════════════════════════════════════════════════
     FIND RIDE FLOW
     ═══════════════════════════════════════════════════════ */

  const handleFindRide = async (text) => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    const details = extractRideDetails(text);

    if (!details.destination) {
      updateState({ conversationState: STATES.FIND_COLLECTING, findQuery: { ...details } });
      replaceBotThinking(RESPONSES.askDestination());
      return;
    }

    await executeRideSearch({
      ...details,
      destination: details.destination,
      date: details.date || null,
      time: details.time || null,
    });
  };

  const executeRideSearch = async (q) => {
    const searchParams = {
      destination: q.destination,
      // If user didn't specify a date, search ALL future dates (pass null).
      // DO NOT default to today, or we miss tomorrow's rides.
      dateISO: q.date || null,
      time24: q.time || null,
      timeWindowMinutes: 30,
    };

    try {
      const results = await agentSearchRides(db, searchParams);

      if (results.length === 0) {
        replaceBotThinking(
          RESPONSES.noRides(q.destination) + "\n\nWould you like to **post a ride** instead?",
          { quickActions: [
            { label: '📝 Post a Ride', action: 'post_ride' },
            { label: '🔍 Search Again', action: 'search_again' },
          ]}
        );
        resetFlow();
        return;
      }

      updateState({
        conversationState: STATES.FIND_RESULTS,
        findResults: results,
        findQuery: q,
      });

      const header = `🔍 Found **${results.length} ride${results.length > 1 ? 's' : ''}** to "${q.destination}"${q.date ? ` on ${q.date}` : ''}:\n`;
      replaceBotThinking(header + "\n💡 Tap **Join** on a ride or say **\"Join ride #1\"**.", {
        type: 'ride-results',
        rides: results.slice(0, 5),
      });
    } catch (err) {
      replaceBotThinking(`❌ Error searching rides: ${err.message || 'Unknown error'}`);
      resetFlow();
    }
  };

  /* ═══════════════════════════════════════════════════════
     JOIN RIDE FLOW
     ═══════════════════════════════════════════════════════ */

  const handleJoinRide = async (text) => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    const numMatch = text.match(/#?(\d+)/);
    const rideIndex = numMatch ? parseInt(numMatch[1]) - 1 : -1;
    const { findResults } = agentState;

    if (findResults.length > 0 && rideIndex >= 0 && rideIndex < findResults.length) {
      await confirmAndJoin(findResults[rideIndex]);
      return;
    }

    if (findResults.length === 0) {
      replaceBotThinking("I don't have any ride results right now. Let me find rides first.\n\n" + RESPONSES.askDestination());
      updateState({ conversationState: STATES.FIND_COLLECTING, findQuery: {} });
      return;
    }

    if (findResults.length === 1) {
      await confirmAndJoin(findResults[0]);
      return;
    }

    replaceBotThinking(`Which ride? Say **"Join ride #1"** through **"Join ride #${Math.min(findResults.length, 5)}"**.`);
  };

  const confirmAndJoin = async (ride) => {
    const status = resolveRideStatus(ride);
    const pIds = getParticipantIds(ride);
    const total = Number(ride.totalSeats || ride.seats) || 1;
    const avail = ride.availableSeats != null ? Number(ride.availableSeats) : (total - pIds.length);
    const userId = getUserId();

    if (pIds.includes(userId)) { replaceBotThinking("✅ You're already in this ride!"); resetFlow(); return; }
    if (ride.driverId === userId) { replaceBotThinking("ℹ️ This is your own ride — you can't join it."); resetFlow(); return; }
    if (status !== 'open') { replaceBotThinking(`⚠️ This ride is **${status}** and cannot be joined.`); resetFlow(); return; }
    if (avail <= 0) { replaceBotThinking("⚠️ No seats left in this ride. Try another one!"); return; }

    // NEVER auto-join — ask confirmation
    updateState({ conversationState: STATES.JOIN_CONFIRMING, selectedRide: ride });
    replaceBotThinking(
      `**Join this ride?**\n\n` +
      `🗺️ To: ${ride.destination}\n` +
      `📅 ${ride.date} · 🕐 ${ride.time || 'Flexible'}\n` +
      `👤 Driver: ${ride.driverName || 'Unknown'}\n` +
      `💺 ${avail} seat${avail !== 1 ? 's' : ''} left · ₹${Number(ride.price || 0)}\n\n` +
      `**Reply "yes" to confirm or "no" to cancel.**`,
      { quickActions: [
        { label: '✅ Yes, Join!', action: 'confirm_join' },
        { label: '❌ No', action: 'cancel_action' },
      ]}
    );
  };

  const executeJoinRide = async (ride) => {
    showThinking();
    setIsLoading(true);
    try {
      const res = await joinRideById(db, auth, ride, getUserName());
      setIsLoading(false);
      if (res.ok) {
        replaceBotThinking(
          `🎉 **Successfully joined!**\n\nYou're in the ride to **${ride.destination}** on ${ride.date}.\nSeats remaining: ${res.availableSeats}`,
          { quickActions: [
            { label: '💬 Message Driver', action: 'chat_driver', ride },
            { label: '📊 My Rides', action: 'my_rides' },
          ]}
        );
      } else {
        replaceBotThinking(`❌ Could not join: ${res.message}`);
      }
    } catch (err) {
      setIsLoading(false);
      replaceBotThinking(`❌ Error: ${err.message}`);
    }
    resetFlow();
  };

  /* ═══════════════════════════════════════════════════════
     POST RIDE FLOW (step-by-step wizard)
     ═══════════════════════════════════════════════════════ */

  const handlePostRide = async (text) => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    const details = extractRideDetails(text);

    // If all key details inline → jump to confirmation
    if (details.destination && details.date && details.time) {
      const postData = {
        destination: details.destination,
        date: details.date,
        time: details.time,
        vehicleType: details.vehicleType || 'car',
        seats: details.seats || VEHICLE_SEATS[details.vehicleType || 'car'],
        price: details.price || 0,
      };
      updateState({ postData, conversationState: STATES.POST_CONFIRM });
      showPostConfirmation(postData);
      return;
    }

    // Start guided wizard
    const postData = { ...details };
    if (!postData.destination) {
      updateState({ conversationState: STATES.POST_DEST, postData });
      replaceBotThinking("📝 **Let's post a ride!**\n\n" + RESPONSES.askDestination());
    } else if (!postData.date) {
      updateState({ conversationState: STATES.POST_DATE, postData });
      replaceBotThinking(`📍 Destination: **${postData.destination}**\n\n` + RESPONSES.askDate());
    } else if (!postData.time) {
      updateState({ conversationState: STATES.POST_TIME, postData });
      replaceBotThinking(RESPONSES.askTime());
    } else {
      updateState({ conversationState: STATES.POST_VEHICLE, postData });
      replaceBotThinking(RESPONSES.askVehicle(),
        { quickActions: [
          { label: '🚗 Car', action: 'vehicle_car' },
          { label: '🛺 Auto', action: 'vehicle_auto' },
          { label: '🏍️ Bike', action: 'vehicle_bike' },
        ]}
      );
    }
  };

  const showPostConfirmation = (data) => {
    const vehicle = VEHICLE_EMOJI[data.vehicleType] || '🚗 Car';
    replaceBotThinking(
      `**📋 Ride Summary — Please Confirm**\n\n` +
      `🗺️ Destination: **${data.destination}**\n` +
      `📅 Date: **${data.date}**\n` +
      `🕐 Time: **${data.time}**\n` +
      `🚗 Vehicle: **${vehicle}**\n` +
      `💺 Seats: **${data.seats || VEHICLE_SEATS[data.vehicleType] || 4}**\n` +
      `💰 Price: **₹${data.price || 0}**\n\n` +
      `**Reply "yes" to post or "no" to cancel.**`,
      { quickActions: [
        { label: '✅ Post Ride!', action: 'confirm_post' },
        { label: '❌ Cancel', action: 'cancel_action' },
      ]}
    );
  };

  const executePostRide = async () => {
    const { postData } = agentState;
    showThinking();
    setIsLoading(true);
    try {
      const prompt = `post ride to ${postData.destination} on ${postData.date} at ${postData.time}, seats ${postData.seats || 4}, price ${postData.price || 0}, ${postData.vehicleType || 'car'}`;
      const res = await createRideFromPrompt(db, auth, prompt, getUserName());
      setIsLoading(false);
      if (res.ok) {
        replaceBotThinking(
          `🎉 **Ride posted successfully!**\n\n` +
          `🗺️ ${res.ride.destination}\n📅 ${res.ride.date} · 🕐 ${res.ride.time}\n` +
          `💺 ${res.ride.seats} seats · ₹${res.ride.price}\n\nYour ride is now live!`,
          { quickActions: [
            { label: '📊 My Rides', action: 'my_rides' },
            { label: '🔍 Find Rides', action: 'find_ride' },
          ]}
        );
      } else {
        replaceBotThinking(`❌ Could not post ride: ${res.message}`);
      }
    } catch (err) {
      setIsLoading(false);
      replaceBotThinking(`❌ Error posting ride: ${err.message}`);
    }
    resetFlow();
  };

  /* ═══════════════════════════════════════════════════════
     LEAVE RIDE FLOW
     ═══════════════════════════════════════════════════════ */

  const handleLeaveRide = async () => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    showThinking();
    setIsLoading(true);
    const myRides = await agentGetMyRides(db, userId);
    setIsLoading(false);

    const joinedRides = myRides.filter(r => r.role === 'passenger' && resolveRideStatus(r) === 'open');

    if (joinedRides.length === 0) {
      replaceBotThinking("ℹ️ You haven't joined any active rides. Nothing to leave.");
      resetFlow();
      return;
    }

    if (joinedRides.length === 1) {
      const ride = joinedRides[0];
      updateState({ conversationState: STATES.LEAVE_CONFIRMING, selectedRide: ride });
      replaceBotThinking(
        `**🚪 Leave this ride?**\n\n🗺️ ${ride.destination}\n📅 ${ride.date} · 🕐 ${ride.time || 'Flexible'}\n` +
        `👤 Driver: ${ride.driverName || 'Unknown'}\n\n` +
        `⚠️ **Note:** Leaving within 15 minutes of the ride costs **-3 trust points**.\n\n**Reply "yes" to leave or "no" to stay.**`,
        { quickActions: [
          { label: '🚪 Yes, Leave', action: 'confirm_leave' },
          { label: '❌ Stay', action: 'cancel_action' },
        ]}
      );
      return;
    }

    const list = joinedRides.slice(0, 5).map((r, i) =>
      `**#${i + 1}** — ${r.destination} on ${r.date} at ${r.time || 'Flexible'}`
    ).join('\n');
    updateState({ findResults: joinedRides, conversationState: STATES.LEAVE_CONFIRMING });
    replaceBotThinking(`You've joined ${joinedRides.length} active ride(s):\n\n${list}\n\nWhich ride to leave? Say **"leave #1"** etc.`);
  };

  const executeLeaveRide = async (ride) => {
    showThinking();
    setIsLoading(true);
    try {
      const res = await leaveRide(db, auth, ride, getUserName());
      setIsLoading(false);
      if (res.ok) {
        const penalty = res.cancelType === 'late' ? '\n⚠️ Late cancellation — trust penalty applied.' : '';
        replaceBotThinking(`✅ **You've left the ride to ${ride.destination}.**${penalty}\n\nThe driver has been notified.`);
      } else {
        replaceBotThinking(`❌ ${res.message}`);
      }
    } catch (err) {
      setIsLoading(false);
      replaceBotThinking(`❌ Error: ${err.message}`);
    }
    resetFlow();
  };

  /* ═══════════════════════════════════════════════════════
     CANCEL RIDE FLOW (creator only)
     ═══════════════════════════════════════════════════════ */

  const handleCancelRide = async () => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    showThinking();
    setIsLoading(true);
    const myRides = await agentGetMyRides(db, userId);
    setIsLoading(false);

    const createdRides = myRides.filter(r =>
      r.role === 'creator' && ['open', 'closed'].includes(resolveRideStatus(r))
    );

    if (createdRides.length === 0) {
      replaceBotThinking("ℹ️ No active rides to cancel.\n\nTo **leave** a ride you joined, say **\"leave ride\"**.");
      resetFlow();
      return;
    }

    if (createdRides.length === 1) {
      const ride = createdRides[0];
      const pIds = getParticipantIds(ride);
      const passengerCount = pIds.filter(id => id !== userId).length;
      updateState({ conversationState: STATES.CANCEL_CONFIRMING, selectedRide: ride });
      replaceBotThinking(
        `**❌ Cancel this ride?**\n\n🗺️ ${ride.destination}\n📅 ${ride.date} · 🕐 ${ride.time || 'Flexible'}\n` +
        `👥 ${passengerCount} passenger${passengerCount !== 1 ? 's' : ''} joined\n\n` +
        `⚠️ **Warning:** All passengers will be notified. Frequent cancellations (3+) = **-5 trust penalty**.\n\n**Reply "yes" or "no".**`,
        { quickActions: [
          { label: '❌ Yes, Cancel', action: 'confirm_cancel' },
          { label: '✅ Keep It', action: 'cancel_action' },
        ]}
      );
      return;
    }

    const list = createdRides.slice(0, 5).map((r, i) =>
      `**#${i + 1}** — ${r.destination} on ${r.date} at ${r.time || 'Flexible'}`
    ).join('\n');
    updateState({ findResults: createdRides, conversationState: STATES.CANCEL_CONFIRMING });
    replaceBotThinking(`You have ${createdRides.length} active ride(s):\n\n${list}\n\nWhich to cancel? Say **"cancel #1"** etc.`);
  };

  const executeCancelRide = async (ride) => {
    showThinking();
    setIsLoading(true);
    try {
      const res = await cancelRideByCreator(db, auth, ride, getUserName());
      setIsLoading(false);
      if (res.ok) {
        replaceBotThinking(`🚫 **Ride to ${ride.destination} cancelled.** All passengers notified.`);
      } else {
        replaceBotThinking(`❌ ${res.message}`);
      }
    } catch (err) {
      setIsLoading(false);
      replaceBotThinking(`❌ Error: ${err.message}`);
    }
    resetFlow();
  };

  /* ═══════════════════════════════════════════════════════
     RECOMMENDATION FLOW
     ═══════════════════════════════════════════════════════ */

  const handleStats = async (text) => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    showThinking();
    setIsLoading(true);

    try {
      const stats = await agentGetDashboardStats(db, userId);
      
      // Inject real data into LLM prompt
      const activitySummary = stats.recentActivity.map(r => 
        `- ${r.action}: "${r.destination}" on ${r.date} (${r.status})`
      ).join('\n');

      const prompt = `User asked: "${text}"
      
      Context Data (Verified Real-time from Database):
      - Total Posted Rides: ${stats.totalPosted}
      - Total Joined Rides: ${stats.totalJoined}
      - Total Rides: ${stats.totalRides}
      - Money Saved: ₹${stats.savings.total} (Weekly: ₹${stats.savings.weekly})
      - CO2 Reduced: ${stats.co2.total} kg (Weekly: ${stats.co2.weekly} kg)
      - Recent Activity:
      ${activitySummary || "No recent activity."}
      
      Instructions:
      - Answer based ONLY on the data above.
      - If the user asks "How much CO2?", say "You have reduced ${stats.co2.total} kg of CO2!".
      - If the data is zero, say so encouragedly.
      - Do NOT make up any other rides.
      `;

      const { ok, answer } = await askLLM(prompt, []); // No history needed for factual query
      
      if (ok && answer) {
        replaceBotThinking(answer);
      } else {
        replaceBotThinking(`📊 **Dashboard Stats**\n\nTotal Rides: ${stats.totalRides}\n💰 Total Saved: ₹${stats.savings.total}\n🌱 CO₂ Reduced: ${stats.co2.total} kg`);
      }

    } catch (err) {
      console.error(err);
      replaceBotThinking("❌ Could not fetch dashboard stats.");
    }
    setIsLoading(false);
  };

  const handleRecommendation = async () => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    showThinking();
    setIsLoading(true);

    try {
      // 1. Get all open rides
      const allRides = await agentSearchRides(db, {});
      
      // 2. Score them
      const scored = await getRecommendedRides(db, allRides, { userId });
      const topPicks = scored.map(s => s.ride);

      if (topPicks.length === 0) {
        replaceBotThinking("I couldn't find any recommended rides right now. Try **posting a ride**!", {
          quickActions: [{ label: '📝 Post Ride', action: 'post_ride' }]
        });
        resetFlow();
        return;
      }

      // 3. Show top result with specific "Recommended" messaging
      const best = topPicks[0];
      const others = topPicks.slice(1, 4); 
      
      // Store state for potential joining
      updateState({
        findResults: topPicks,
        conversationState: STATES.FIND_RESULTS // allows "join #1" etc
      });

      const header = `🌟 **Top Recommendation:**\n\nTo **${best.destination}**\nDriver: ${best.driverName || 'Unknown'} (Reliability: High)\n\nI also found these other good options:`;
      
      replaceBotThinking(header, {
        type: 'ride-results',
        rides: [best, ...others]
      });

    } catch (err) {
      console.error(err);
      replaceBotThinking("❌ Sorry, I had trouble generating recommendations.");
    }
    setIsLoading(false);
  };

  /* ═══════════════════════════════════════════════════════
     MY RIDES / STATUS
     ═══════════════════════════════════════════════════════ */

  const handleMyRides = async () => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    showThinking();
    setIsLoading(true);
    const myRides = await agentGetMyRides(db, userId);
    setIsLoading(false);

    if (myRides.length === 0) {
      replaceBotThinking("You don't have any rides yet.",
        { quickActions: [
          { label: '🔍 Find Rides', action: 'find_ride' },
          { label: '📝 Post a Ride', action: 'post_ride' },
        ]}
      );
      resetFlow();
      return;
    }

    const rideLines = myRides.slice(0, 6).map((r, i) => {
      const status = resolveRideStatus(r);
      const pIds = getParticipantIds(r);
      const total = Number(r.totalSeats || r.seats) || 1;
      const avail = r.availableSeats != null ? Number(r.availableSeats) : (total - pIds.length);
      const role = r.role === 'creator' ? '🚗 Creator' : '🧑‍🤝‍🧑 Passenger';
      return `**#${i + 1}** ${statusEmoji(status)} ${r.destination}\n  ${role} · ${r.date} · ${r.time || 'Flex'} · ${avail}/${total} seats · ₹${Number(r.price || 0)}`;
    }).join('\n\n');

    replaceBotThinking(`📊 **Your Rides (${myRides.length})**\n\n${rideLines}`);
  };

  const handleRideStatus = async (text) => {
    const userId = getUserId();
    if (!userId) { replaceBotThinking(RESPONSES.noAuth()); return; }

    showThinking();
    setIsLoading(true);
    const myRides = await agentGetMyRides(db, userId);
    setIsLoading(false);

    const activeRides = myRides.filter(r => ['open', 'closed'].includes(resolveRideStatus(r)));
    if (activeRides.length === 0) { replaceBotThinking("No active rides found."); resetFlow(); return; }

    const ride = activeRides[0];
    const pIds = getParticipantIds(ride);
    const total = Number(ride.totalSeats || ride.seats) || 1;
    const avail = ride.availableSeats != null ? Number(ride.availableSeats) : (total - pIds.length);
    const status = resolveRideStatus(ride);
    const low = text.toLowerCase();

    if (low.includes('who joined') || low.includes('who is in')) {
      replaceBotThinking(`📊 **Ride to ${ride.destination}**\n\n${statusEmoji(status)} Status: **${status}**\n👥 ${pIds.length} participant${pIds.length !== 1 ? 's' : ''} · 💺 ${avail} seat${avail !== 1 ? 's' : ''} left\nDriver: ${ride.driverName || 'Unknown'}`);
    } else if (low.includes('seat')) {
      replaceBotThinking(`💺 **Seats for ride to ${ride.destination}:**\nTotal: ${total} · Available: ${avail} · Taken: ${pIds.length}`);
    } else if (low.includes('safe')) {
      replaceBotThinking(`🛡️ **Safety info — ${ride.destination}**\n\n- Status: ${status}\n- All riders are verified community members\n- Driver: ${ride.driverName || 'Unknown'}\n- ${pIds.length} verified participant(s)\n- Message the driver via Private Chat\n- Report issues via Help & Support`);
    } else {
      replaceBotThinking(`📊 **Ride Status — ${ride.destination}**\n\n${statusEmoji(status)} Status: **${status}**\n📅 ${ride.date} · 🕐 ${ride.time || 'Flexible'}\n👤 Driver: ${ride.driverName || 'Unknown'}\n👥 ${pIds.length}/${total} seats filled · ${avail} available\n💰 ₹${Number(ride.price || 0)}`);
    }
    resetFlow();
  };

  function statusEmoji(s) {
    switch (s) {
      case 'open': return '🟢';
      case 'closed': return '🔴';
      case 'completed': return '✅';
      case 'cancelled': return '🚫';
      default: return '⚪';
    }
  }

  /* ═══════════════════════════════════════════════════════
     CONFIRMATION HANDLER (yes/no)
     ═══════════════════════════════════════════════════════ */

  const isAffirmative = (t) => /^(yes|y|yep|yeah|sure|ok|confirm|go|do\s*it|proceed|absolutely)\b/i.test(t.trim());
  const isNegative = (t) => /^(no|n|nope|nah|cancel|stop|never|don'?t)\b/i.test(t.trim());

  const handleConfirmation = async (text) => {
    const { conversationState, selectedRide } = agentState;

    if (isNegative(text)) {
      replaceBotThinking("👍 No problem! Action cancelled. What else?",
        { quickActions: [
          { label: '🔍 Find Rides', action: 'find_ride' },
          { label: '📝 Post Ride', action: 'post_ride' },
          { label: '📊 My Rides', action: 'my_rides' },
        ]}
      );
      resetFlow();
      return true;
    }

    if (!isAffirmative(text)) return false;

    switch (conversationState) {
      case STATES.JOIN_CONFIRMING:
        if (selectedRide) await executeJoinRide(selectedRide);
        return true;
      case STATES.POST_CONFIRM:
        await executePostRide();
        return true;
      case STATES.LEAVE_CONFIRMING:
        if (selectedRide) await executeLeaveRide(selectedRide);
        return true;
      case STATES.CANCEL_CONFIRMING:
        if (selectedRide) await executeCancelRide(selectedRide);
        return true;
      default:
        return false;
    }
  };

  /* ═══════════════════════════════════════════════════════
     POST WIZARD STEP HANDLER
     ═══════════════════════════════════════════════════════ */

  const handlePostWizardStep = (text) => {
    const { conversationState, postData } = agentState;
    const low = text.toLowerCase().trim();

    // Allow user to escape the post wizard at any step by typing cancel/stop/quit/no
    if (/^(cancel|stop|quit|abort|exit|back|no thanks)\b/i.test(low)) {
      replaceBotThinking("👍 Ride posting cancelled. What else would you like to do?",
        { quickActions: [
          { label: '🔍 Find Rides', action: 'find_ride' },
          { label: '📝 Post Ride', action: 'post_ride' },
          { label: '📊 My Rides', action: 'my_rides' },
        ]}
      );
      resetFlow();
      return true;
    }

    switch (conversationState) {
      case STATES.POST_DEST: {
        const dest = text.trim();
        const updated = { ...postData, destination: dest };
        updateState({ postData: updated, conversationState: STATES.POST_DATE });
        addBotMsg(`📍 Destination: **${dest}**\n\n` + RESPONSES.askDate());
        return true;
      }
      case STATES.POST_DATE: {
        let date = text.trim();
        if (low.includes('today')) date = todayISO();
        else if (low.includes('tomorrow')) date = tomorrowISO();
        const updated = { ...postData, date };
        updateState({ postData: updated, conversationState: STATES.POST_TIME });
        addBotMsg(`📅 Date: **${date}**\n\n` + RESPONSES.askTime());
        return true;
      }
      case STATES.POST_TIME: {
        const details = extractRideDetails(`at ${text}`);
        const time = details.time || text.trim();
        const updated = { ...postData, time };
        updateState({ postData: updated, conversationState: STATES.POST_VEHICLE });
        addBotMsg(
          `🕐 Time: **${time}**\n\n` + RESPONSES.askVehicle(),
          { quickActions: [
            { label: '🚗 Car', action: 'vehicle_car' },
            { label: '🛺 Auto', action: 'vehicle_auto' },
          ]}
        );
        return true;
      }
      case STATES.POST_VEHICLE: {
        let vehicle = 'car';
        if (low.includes('auto')) vehicle = 'auto';
        const updated = { ...postData, vehicleType: vehicle, seats: VEHICLE_SEATS[vehicle] };
        updateState({ postData: updated, conversationState: STATES.POST_SEATS });
        addBotMsg(`🚗 Vehicle: **${VEHICLE_EMOJI[vehicle]}**\n\n` + RESPONSES.askSeats());
        return true;
      }
      case STATES.POST_SEATS: {
        const seats = parseInt(text) || VEHICLE_SEATS[postData.vehicleType || 'car'];
        const updated = { ...postData, seats };
        updateState({ postData: updated, conversationState: STATES.POST_PRICE });
        addBotMsg(`💺 Seats: **${seats}**\n\n` + RESPONSES.askPrice());
        return true;
      }
      case STATES.POST_PRICE: {
        const price = parseInt(text.replace(/[^0-9]/g, '')) || 0;
        const updated = { ...postData, price };
        updateState({ postData: updated, conversationState: STATES.POST_CONFIRM });
        showPostConfirmation(updated);
        return true;
      }
      default:
        return false;
    }
  };

  /* ═══════════════════════════════════════════════════════
     FIND COLLECTING HANDLER
     ═══════════════════════════════════════════════════════ */

  const handleFindCollecting = async (text) => {
    const { findQuery } = agentState;
    const details = extractRideDetails(text);
    const dest = details.destination || text.trim();
    const updated = {
      ...findQuery,
      destination: dest,
      date: details.date || findQuery.date,
      time: details.time || findQuery.time,
    };

    showThinking();
    setIsLoading(true);
    await executeRideSearch(updated);
    setIsLoading(false);
    return true;
  };

  /* ═══════════════════════════════════════════════════════
     QUICK ACTION HANDLER
     ═══════════════════════════════════════════════════════ */

  const handleQuickAction = async (action, ride) => {
    if (isLoading) return;

    switch (action) {
      case 'confirm_join':
        addUserMsg('Yes, join!');
        if (agentState.selectedRide) await executeJoinRide(agentState.selectedRide);
        break;
      case 'confirm_post':
        addUserMsg('Yes, post it!');
        await executePostRide();
        break;
      case 'confirm_leave':
        addUserMsg('Yes, leave');
        if (agentState.selectedRide) await executeLeaveRide(agentState.selectedRide);
        break;
      case 'confirm_cancel':
        addUserMsg('Yes, cancel');
        if (agentState.selectedRide) await executeCancelRide(agentState.selectedRide);
        break;
      case 'cancel_action':
        addUserMsg('No');
        addBotMsg("👍 Cancelled! What else can I help with?");
        resetFlow();
        break;
      case 'find_ride':
        addUserMsg('Find rides');
        updateState({ conversationState: STATES.FIND_COLLECTING, findQuery: {} });
        addBotMsg(RESPONSES.askDestination());
        break;
      case 'search_again':
        addUserMsg('Search again');
        updateState({ conversationState: STATES.FIND_COLLECTING, findQuery: {} });
        addBotMsg(RESPONSES.askDestination());
        break;
      case 'post_ride':
        addUserMsg('Post a ride');
        await handlePostRide('');
        break;
      case 'my_rides':
        addUserMsg('My rides');
        await handleMyRides();
        break;
      case 'join_ride':
        if (ride) {
          addUserMsg(`Join ride to ${ride.destination}`);
          await confirmAndJoin(ride);
        }
        break;
      case 'chat_driver':
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
      case 'vehicle_car':
        addUserMsg('Car');
        handlePostWizardStep('car');
        break;
      case 'vehicle_auto':
        addUserMsg('Auto');
        handlePostWizardStep('auto');
        break;
      default:
        break;
    }
  };

  /* ═══════════════════════════════════════════════════════
     MAIN SEND HANDLER
     ═══════════════════════════════════════════════════════ */

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    addUserMsg(text);
    setInput('');
    showThinking();
    setIsLoading(true);

    try {
      const { conversationState } = agentState;
      let detectedIntent = { intent: INTENTS.UNKNOWN };

      // Quick auth-status shortcut — "am I logged in?", "who am I?", etc.
      if (/\bam\s+i\s+(logged|signed)\s+in\b|\bwho\s+am\s+i\b|\bmy\s+account\b/i.test(text)) {
        const name = getUserName();
        replaceBotThinking(
          `✅ Yes, you're **logged in** as **${name}**! How can I help you today?`,
          { quickActions: [
            { label: '🔍 Find Rides', action: 'find_ride' },
            { label: '📝 Post Ride', action: 'post_ride' },
            { label: '📊 My Rides', action: 'my_rides' },
          ]}
        );
        setIsLoading(false);
        return;
      }

      // Pre-check for strong commands that should interrupt flows
      // Only check if we are in an interactive flow (not idle)
      if (conversationState !== STATES.IDLE) {
         // Fast regex check first
         detectedIntent = await detectIntent(text, messages);
         const escapeIntents = [
             INTENTS.CANCEL_RIDE, 
             INTENTS.STATS, 
             INTENTS.HELP, 
             INTENTS.RULES, 
             INTENTS.MY_RIDES, 
             INTENTS.FIND_RIDE,
             INTENTS.GREETING
         ];
         
         // If a strong escape intent is found, abandon the current flow
         if (escapeIntents.includes(detectedIntent.intent)) {
             resetFlow(); // Reset state to IDLE
             // We will process this intent in the switch statement below
             // Skip the flow handlers
         } else {
             // Reset detectedIntent to UNKNOWN so we don't accidentally triggering something later
             // unless we want to use the flow handlers
             detectedIntent = { intent: INTENTS.UNKNOWN }; 
         }
      }

      /* 1. Confirmation states (yes/no) */
      // Only process if we didn't just escape
      if (agentState.conversationState !== STATES.IDLE && [STATES.JOIN_CONFIRMING, STATES.POST_CONFIRM, STATES.LEAVE_CONFIRMING, STATES.CANCEL_CONFIRMING].includes(conversationState)) {
        const handled = await handleConfirmation(text);
        if (handled) { setIsLoading(false); return; }

        /* Number selection in leave/cancel lists */
        const numMatch = text.match(/#?(\d+)/);
        if (numMatch && agentState.findResults.length > 0) {
          const idx = parseInt(numMatch[1]) - 1;
          if (idx >= 0 && idx < agentState.findResults.length) {
            const ride = agentState.findResults[idx];
            if (conversationState === STATES.LEAVE_CONFIRMING) {
              updateState({ selectedRide: ride });
              replaceBotThinking(
                `**🚪 Leave ride to ${ride.destination}?**\n\n⚠️ Late cancel = -3 trust pts\n\n**Reply "yes" or "no".**`,
                { quickActions: [
                  { label: '🚪 Yes, Leave', action: 'confirm_leave' },
                  { label: '❌ Stay', action: 'cancel_action' },
                ]}
              );
              setIsLoading(false);
              return;
            }
            if (conversationState === STATES.CANCEL_CONFIRMING) {
              updateState({ selectedRide: ride });
              replaceBotThinking(
                `**❌ Cancel ride to ${ride.destination}?**\n\n⚠️ Passengers notified. 3+ cancels = -5 trust.\n\n**Reply "yes" or "no".**`,
                { quickActions: [
                  { label: '❌ Yes, Cancel', action: 'confirm_cancel' },
                  { label: '✅ Keep It', action: 'cancel_action' },
                ]}
              );
              setIsLoading(false);
              return;
            }
          }
        }
      }

      /* 2. Post wizard steps */
      if (agentState.conversationState !== STATES.IDLE && [STATES.POST_DEST, STATES.POST_DATE, STATES.POST_TIME, STATES.POST_VEHICLE, STATES.POST_SEATS, STATES.POST_PRICE].includes(conversationState)) {
        const handled = handlePostWizardStep(text);
        if (handled) { setIsLoading(false); return; }
      }

      /* 3. Find collecting */
      if (agentState.conversationState === STATES.FIND_COLLECTING) {
        await handleFindCollecting(text);
        setIsLoading(false);
        return;
      }

      /* 4. Find results → join */
      if (agentState.conversationState === STATES.FIND_RESULTS) {
        const numMatch = text.match(/#?(\d+)/);
        if (numMatch || /join/i.test(text)) {
          await handleJoinRide(text);
          setIsLoading(false);
          return;
        }
      }

      /* 5. Detect fresh intent */
      // If we already detected an intent during escape check, use it; otherwise detect now
      const finalIntent = (detectedIntent && detectedIntent.intent !== INTENTS.UNKNOWN) 
          ? detectedIntent 
          : await detectIntent(text, messages);

      switch (finalIntent.intent) {
        case INTENTS.FIND_RIDE:   await handleFindRide(text); break;
        case INTENTS.JOIN_RIDE:   await handleJoinRide(text); break;
        case INTENTS.POST_RIDE:   await handlePostRide(text); break;
        case INTENTS.RECOMMEND_RIDE: await handleRecommendation(); break;
        case INTENTS.STATS:       await handleStats(text); break;
        case INTENTS.LEAVE_RIDE:  await handleLeaveRide(); break;
        case INTENTS.CANCEL_RIDE: await handleCancelRide(); break;
        case INTENTS.RIDE_STATUS: await handleRideStatus(text); break;
        case INTENTS.MY_RIDES:    await handleMyRides(); break;
        case INTENTS.GREETING:    replaceBotThinking(RESPONSES.greeting()); break;
        case INTENTS.HELP:
          replaceBotThinking(RESPONSES.help(),
            { quickActions: [
              { label: '🔍 Find Rides', action: 'find_ride' },
              { label: '📝 Post Ride', action: 'post_ride' },
              { label: '📊 My Rides', action: 'my_rides' },
            ]}
          );
          break;
        case INTENTS.RULES: replaceBotThinking(RESPONSES.rules()); break;
        case INTENTS.ABOUT: replaceBotThinking(RESPONSES.about()); break;
        default: {
          /* LLM fallback */
          try {
            const history = messages.slice(-6);
            const { ok, answer } = await askLLM(text, history);
            if (ok && answer) {
              replaceBotThinking(answer);
            } else {
              replaceBotThinking(
                "I'm not sure about that. Here's what I can do:\n\n🔍 Find rides · 📝 Post rides · ✅ Join · 🚪 Leave · ❌ Cancel · 📊 Status",
                { quickActions: [
                  { label: '🔍 Find Rides', action: 'find_ride' },
                  { label: '📝 Post Ride', action: 'post_ride' },
                ]}
              );
            }
          } catch {
            replaceBotThinking(
              "Try one of these:\n\n🔍 \"Find rides to [destination]\"\n📝 \"Post a ride\"\n📊 \"My rides\""
            );
          }
          break;
        }
      }
    } catch (err) {
      replaceBotThinking(`⚠️ Something went wrong: ${err.message || 'Unknown error'}. Please try again.`);
    }

    setIsLoading(false);
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
