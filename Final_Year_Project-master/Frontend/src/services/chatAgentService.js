/**
 * Chatbot AI Agent — Intent Detection & Conversation Engine
 *
 * Detects user intent from natural language,
 * manages multi-step conversation flows,
 * and calls real Firebase services.
 */

import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { searchRidesByQuery } from './rideSearchService';
import { joinRideById, leaveRide, cancelRideByCreator, resolveRideStatus, getParticipantIds } from './rideActionService';
import { createRideFromPrompt } from './ridePostService';
import { parseRideQuery } from './nlpAgent';

/* ═══════════════════════════════════════════════════════════
   1.  INTENT DETECTION
   ═══════════════════════════════════════════════════════════ */

const INTENTS = {
  FIND_RIDE: 'find_ride',
  JOIN_RIDE: 'join_ride',
  POST_RIDE: 'post_ride',
  LEAVE_RIDE: 'leave_ride',
  CANCEL_RIDE: 'cancel_ride',
  RIDE_STATUS: 'ride_status',
  RECOMMEND_RIDE: 'recommend_ride',
  STATS: 'stats',
  MY_RIDES: 'my_rides',
  GREETING: 'greeting',
  HELP: 'help',
  RULES: 'rules',
  ABOUT: 'about',
  UNKNOWN: 'unknown',
};

const intentPatterns = [
  // MY_RIDES first so "show ride history" doesn't fall into FIND_RIDE
  { intent: INTENTS.MY_RIDES, patterns: [
    /\bmy\s+rides/i,
    /\bshow\s*(my|all)?\s*rides/i,
    /\blist\s*my\s*rides/i,
    /\bride\s*(history|records?|log)\b/i,
    /\bhistory\s+of\s+(my\s+)?rides?/i,
    /\bmy\s+(past|previous|completed|old)\s+rides?/i,
    /\bshow\s+(my\s+)?(past|previous|ride\s+history)/i,
  ]},
  { intent: INTENTS.FIND_RIDE, patterns: [
    /\b(find|search|show|look\s*for|get|any|available)\b.*\bride/i,
    /\brides?\s+(to|towards|going|heading|near)\b/i,
    /\b(search|find)\s+(for\s+)?(a\s+)?ride/i,
    /\bwho\s+(is\s+)?going\s+to\b/i,
    /\b(is|are)\s+(there|any)\s+rides?/i,
    /\bcan\s+i\s+get\s+a\s+ride/i,
  ]},
  { intent: INTENTS.STATS, patterns: [
    /\b(dash(?:board|baord|bord)|stats|statistics|analytics|summary|report|impact)\b/i,
    /\b(how\s+much|total)\s+(money|amount|cash)\s+(saved|earn)\b/i,
    /\b(how\s+much|total)\s+(co2|carbon|emissions)\b/i,
    /\b(how\s+many|total)\s+rides\s+(posted|created|shared|completed)\b/i,
    /\brecent\s+activity\b/i,
    /\bone[- ]week\s+dashboard\b/i,
    /\bweekly\s+(report|analysis)\b/i,
    /\bcheck\s+my\s+(stats|progress|impact|savings)\b/i,
    /\bhow\s+am\s+i\s+doing\b/i,
  ]},
  { intent: INTENTS.RECOMMEND_RIDE, patterns: [
    /\brecommend/i,
    /\bsuggest/i,
    /\bbest\s+ride/i,
    /\bsuitable\s+ride/i,
    /\bwhich\s+ride\s+should\s+i\s+(take|join)/i,
    /\bwhat\s+do\s+you\s+recommend/i
  ]},
  { intent: INTENTS.JOIN_RIDE, patterns: [
    /\bjoin\b.*\bride/i,
    /\bjoin\s+(this|that|the|ride\s*#?\d)/i,
    /\baccept\s+(this|that|the)\s*ride/i,
    /\bi\s+want\s+to\s+join/i,
    /\badd\s+me\s+to/i,
  ]},
  { intent: INTENTS.POST_RIDE, patterns: [
    /(?:^|\s)(?:post|create|add|offer|share)\s+(?:a\s+)?ride/i,
    /(?:^|\s)i(?:'m|\s+am)\s+(?:driving|going|heading)\b/i,
    /(?:^|\s)offer.*\bseats?\b/i,
  ]},
  { intent: INTENTS.LEAVE_RIDE, patterns: [
    /\bleave\b.*\bride/i,
    /\bexit\b.*\bride/i,
    /\bremove\s+me\s+from/i,
    /\bi\s+(want\s+to\s+)?leave/i,
    /\bdrop\s+out/i,
  ]},
  { intent: INTENTS.CANCEL_RIDE, patterns: [
    /\bcancel\b.*\bride/i,
    /\bdelete\b.*\bride/i,
    /\bremove\b.*\b(my\s+)?ride/i,
  ]},
  { intent: INTENTS.RIDE_STATUS, patterns: [
    /\bwho\s+(joined|is\s+in)\b/i,
    /\b(how\s+many\s+)?seats?\s*(left|available|remaining)/i,
    /\bride\s+status/i,
    /\bstatus\s+of\s+(my\s+)?ride/i,
    /\bmy\s+ride\s+(status|info|details)/i,
    /\bis\s+(this|the)\s+ride\s+(safe|full|open)/i,
  ]},
  { intent: INTENTS.GREETING, patterns: [
    /^(hi|hello|hey|hai|hii|yo|sup|good\s*(morning|afternoon|evening))[.!]?$/i,
  ]},
  { intent: INTENTS.HELP, patterns: [
    /\bhelp\b/i,
    /\bwhat\s+can\s+you\s+do/i,
    /\bcommands?\b/i,
    /\bguide\b/i,
    /\bhow\s+to\s+use/i,
  ]},
  { intent: INTENTS.RULES, patterns: [
    /\bwhat\s+happens?\s+if\s+i\s+cancel/i,
    /\btrust\s*(score|penalty|impact)/i,
    /\bcancel(lation)?\s+(rules?|policy|penalty)/i,
    /\bno.?show\s+(rules?|penalty)/i,
    /\bis\s+(this|ride)\s+safe/i,
    /\bsafety\s+(rules?|tips)/i,
    /\bexplain\s+(rules?|cancellation|trust)/i,
  ]},
  { intent: INTENTS.ABOUT, patterns: [
    /\bwhat\s+is\s+(colony\s*carpool|this\s+(app|website))/i,
    /\babout\s+(this\s+)?(app|website|platform)/i,
    /\bhow\s+(does\s+)?(this\s+)?(app|website|site)\s+work/i,
    /\bhow\s+it\s+works/i,
    /\bexplain\s+(this|the)\s+(app|website)/i,
  ]},
];

import { askLLM } from './llmService';

/** Detect intent from raw text (Regex + LLM Fallback) */
export async function detectIntent(text, history = []) {
  const t = (text || '').trim();
  if (!t) return { intent: INTENTS.UNKNOWN, confidence: 0 };

  // 1. Try Regex Patterns (Fast & Cheap)
  for (const { intent, patterns } of intentPatterns) {
    for (const rx of patterns) {
      if (rx.test(t)) return { intent, confidence: 0.9 };
    }
  }

  // 2. Try NLP / Query Parsing
  const q = parseRideQuery(t);
  if (q && (q.destination || (q.dateISO && q.time24))) {
    return { intent: q.action === 'search' ? INTENTS.FIND_RIDE : INTENTS.FIND_RIDE, confidence: 0.7, parsed: q };
  }

  // 3. LLM "AI" Classification (Smart Fallback)
  // Used when regex fails to catch natural language nuances
  if (t.split(' ').length > 2) {
    try {
      const prompt = `Classify this user message into one of these intents:
      - find_ride (searching for a ride, "I want to go to...")
      - post_ride (offering a ride, "I am going to...")
      - join_ride (wanting to join a specific ride)
      - ride_status (asking about ride status, seats)
      - stats (dashboard, savings, co2, activity, "check my stats")
      - recommend_ride (asking for suggestions)
      - cancel_ride
      - leave_ride
      - my_rides
      - rules
      - greeting
      - help
      - unknown (if purely conversational or unrelated)

      User Message: "${t}"

      Reply ONLY with the intent code (e.g., "find_ride"). Do not explain.`;

      // Pass empty history to keep classification focused on current message
      const { ok, answer } = await askLLM(prompt, [], { model: 'llama-3.1-8b-instant' }); // Prefer fast model
      
      if (ok && answer) {
         const cleaned = answer.trim().toLowerCase().replace(/['"`.]/g, '');
         // Validate against known intents
         const matchedIntent = Object.values(INTENTS).find(v => v === cleaned);
         if (matchedIntent) {
           return { intent: matchedIntent, confidence: 0.85, source: 'llm' };
         }
      }
    } catch (e) {
      console.warn('LLM intent detection failed:', e);
    }
  }

  return { intent: INTENTS.UNKNOWN, confidence: 0 };
}

/* ═══════════════════════════════════════════════════════════
   2.  DATA EXTRACTION
   ═══════════════════════════════════════════════════════════ */

/** Extract destination, date, time from text */
export function extractRideDetails(text) {
  const t = (text || '').trim();
  const q = parseRideQuery(t);
  const details = {
    destination: q?.destination || null,
    date: q?.dateISO || null,
    time: q?.time24 || null,
  };

  // Manual fallbacks
  if (!details.destination) {
    const m = t.match(/\bto\s+([A-Za-z0-9][\w\s,.-]{1,40})/i);
    if (m) {
      let dest = m[1].replace(/\s+(on|at|around|date|time|tomorrow|today)\b.*/i, '').trim();
      dest = dest.replace(/[.,;]+$/, '').trim();
      if (dest.length >= 2) details.destination = dest;
    }
  }
  if (!details.date) {
    const low = t.toLowerCase();
    if (low.includes('today')) {
      details.date = todayISO();
    } else if (low.includes('tomorrow')) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      details.date = isoDate(d);
    } else {
      const dm = t.match(/(\d{4}-\d{2}-\d{2})/);
      if (dm) details.date = dm[1];
    }
  }
  if (!details.time) {
    const tm = t.match(/(\d{1,2}:\d{2})\s*(am|pm)?/i);
    if (tm) {
      let h = parseInt(tm[1].split(':')[0]);
      const min = tm[1].split(':')[1];
      const period = (tm[2] || '').toLowerCase();
      if (period === 'pm' && h < 12) h += 12;
      if (period === 'am' && h === 12) h = 0;
      details.time = `${String(h).padStart(2, '0')}:${min}`;
    }
  }

  // Vehicle type
  const low = t.toLowerCase();
  details.vehicleType = low.includes('auto') ? 'auto' : null;

  // Seats
  const sm = t.match(/(\d+)\s*seats?/i);
  if (sm) details.seats = parseInt(sm[1]);

  // Price
  const pm = t.match(/(?:price|cost|₹|rs\.?)\s*(\d+)/i) || t.match(/(\d+)\s*(?:rupees|rs)/i);
  if (pm) details.price = parseInt(pm[1]);

  return details;
}

/* ═══════════════════════════════════════════════════════════
   3.  CONVERSATION STATE
   ═══════════════════════════════════════════════════════════ */

export const STATES = {
  IDLE: 'idle',
  // Find ride flow
  FIND_COLLECTING: 'find_collecting',     // collecting dest/time
  FIND_RESULTS: 'find_results',           // showing results, awaiting join choice
  // Join confirmation
  JOIN_CONFIRMING: 'join_confirming',
  // Post ride flow
  POST_DEST: 'post_dest',
  POST_DATE: 'post_date',
  POST_TIME: 'post_time',
  POST_VEHICLE: 'post_vehicle',
  POST_SEATS: 'post_seats',
  POST_PRICE: 'post_price',
  POST_CONFIRM: 'post_confirm',
  // Leave / Cancel confirmation
  LEAVE_CONFIRMING: 'leave_confirming',
  CANCEL_CONFIRMING: 'cancel_confirming',
};

export function createInitialState() {
  return {
    conversationState: STATES.IDLE,
    // Temp data for flows
    findQuery: {},        // { destination, date, time }
    findResults: [],      // array of rides from search
    selectedRide: null,   // ride chosen for join/leave/cancel
    postData: {},         // { destination, date, time, vehicleType, seats, price }
    myRidesCache: [],     // user's rides for status queries
  };
}

/* ═══════════════════════════════════════════════════════════
   4.  AGENT ACTIONS (Firebase operations)
   ═══════════════════════════════════════════════════════════ */

/** Search rides in Firebase */
export async function agentSearchRides(db, queryParams) {
  const results = await searchRidesByQuery(db, queryParams);
  // Filter to only open rides
  return results.filter(r => resolveRideStatus(r) === 'open');
}

/** Fetch user's rides (as creator or participant) */
export async function agentGetMyRides(db, userId) {
  if (!userId) return [];
  try {
    const ridesRef = collection(db, 'rides');

    // Rides created by user
    const createdQ = query(ridesRef, where('driverId', '==', userId));
    const createdSnap = await getDocs(createdQ);

    // Rides joined by user
    const joinedQ = query(ridesRef, where('passengers', 'array-contains', userId));
    const joinedSnap = await getDocs(joinedQ);

    const rideMap = new Map();
    createdSnap.docs.forEach(d => rideMap.set(d.id, { id: d.id, ...d.data(), role: 'creator' }));
    joinedSnap.docs.forEach(d => {
      if (!rideMap.has(d.id)) rideMap.set(d.id, { id: d.id, ...d.data(), role: 'passenger' });
    });

    return Array.from(rideMap.values());
  } catch (e) {
    console.error('agentGetMyRides error:', e);
    return [];
  }
}


/** Fetch comprehensive dashboard stats */
export async function agentGetDashboardStats(db, userId) {
  if (!userId) return null;
  const rides = await agentGetMyRides(db, userId);
  
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const weeklyRides = rides.filter(r => new Date(r.createdAt?.toDate?.() || r.date) > oneWeekAgo);
  const monthlyRides = rides.filter(r => new Date(r.createdAt?.toDate?.() || r.date) > oneMonthAgo);

  const calculateSaved = (rs) => rs.reduce((sum, r) => sum + (Number(r.price) || 0) / (Number(r.seats) || 1), 0);
  const calculateCO2 = (rs) => rs.length * 4.6;

  const totalPosted = rides.filter(r => r.role === 'creator').length;
  const totalJoined = rides.filter(r => r.role === 'passenger').length;

  // Recent activity log (last 5 rides)
  const recentActivity = rides
    .sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time))
    .slice(0, 5)
    .map(r => ({
      action: r.role === 'creator' ? 'Posted ride' : 'Joined ride',
      destination: r.destination,
      date: r.date,
      status: resolveRideStatus(r)
    }));

  return {
    totalRides: rides.length,
    totalPosted,
    totalJoined,
    savings: {
      weekly: Math.round(calculateSaved(weeklyRides)),
      monthly: Math.round(calculateSaved(monthlyRides)),
      total: Math.round(calculateSaved(rides)),
    },
    co2: {
      weekly: Math.round(calculateCO2(weeklyRides)),
      monthly: Math.round(calculateCO2(monthlyRides)),
      total: Math.round(calculateCO2(rides)),
    },
    recentActivity,
    weeklyRidesCount: weeklyRides.length
  };
}

/** Get ride details by ID */
export async function agentGetRideById(db, rideId) {
  try {
    const snap = await getDoc(doc(db, 'rides', rideId));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch {}
  return null;
}

/* ═══════════════════════════════════════════════════════════
   5.  RESPONSE TEMPLATES
   ═══════════════════════════════════════════════════════════ */

export const RESPONSES = {
  greeting: () =>
    "👋 Hi! I'm your **Ride Assistant**. I can help you:\n\n" +
    "🔍 **Find rides** — \"Find rides to Koramangala\"\n" +
    "📝 **Post a ride** — \"Post a ride\"\n" +
    "✅ **Join a ride** — \"Join ride\"\n" +
    "🚪 **Leave/Cancel** — \"Leave ride\" or \"Cancel ride\"\n" +
    "📊 **Ride status** — \"My rides\" or \"Who joined?\"\n" +
    "❓ **Rules** — \"What happens if I cancel?\"\n\n" +
    "How can I help you?",

  help: () =>
    "Here's what I can do:\n\n" +
    "**🔍 Find Rides**\n" +
    "Say: \"Find rides to [destination]\" or \"Rides to [place] at [time]\"\n\n" +
    "**📝 Post a Ride**\n" +
    "Say: \"Post a ride\" — I'll guide you step by step\n\n" +
    "**✅ Join a Ride**\n" +
    "After finding rides, say \"Join ride #1\" or tap the Join button\n\n" +
    "**🚪 Leave a Ride**\n" +
    "Say: \"Leave ride\" — I'll show your rides and confirm\n\n" +
    "**❌ Cancel a Ride**\n" +
    "Say: \"Cancel ride\" — for rides you created\n\n" +
    "**📊 Ride Status**\n" +
    "Say: \"My rides\", \"Who joined my ride?\", \"Seats left?\"\n\n" +
    "**📋 Rules**\n" +
    "Say: \"What happens if I cancel?\" or \"Safety rules\"",

  about: () =>
    "**🚗 ColonyCarpool**\n\n" +
    "A community-based ride-sharing platform exclusively for housing societies.\n\n" +
    "**How it works:**\n" +
    "- Post rides from the Dashboard with destination, date, time, and seats\n" +
    "- Find and join rides via this agent or the Dashboard\n" +
    "- Chat with drivers and co-riders via Private & Group Chat\n" +
    "- Get notifications when someone joins, messages, or cancels\n" +
    "- Track savings, CO₂ reduction, and climb the Leaderboard\n\n" +
    "All rides are within your verified community — no strangers!",

  rules: () =>
    "**📋 Ride Rules & Trust System**\n\n" +
    "**Cancellation Policy:**\n" +
    "- Early cancel (>15 min before ride): No penalty\n" +
    "- Late cancel (<15 min before ride): **-3 trust points**\n" +
    "- Creator cancels ride: All passengers notified. 3+ cancellations = **-5 trust penalty**\n\n" +
    "**No-Show:**\n" +
    "- If marked as no-show by the creator: **-8 trust points**\n\n" +
    "**Safety:**\n" +
    "- Ride only with verified community members\n" +
    "- Rate co-riders after each ride\n" +
    "- Report issues via Help & Support\n\n" +
    "Trust scores affect your reliability badge (High ≥75, Medium ≥40, Low <40).",

  askDestination: () => "🗺️ Where do you want to go? (e.g., Koramangala, HSR Layout)",
  askDate: () => "📅 What date? (YYYY-MM-DD, or say **today** / **tomorrow**)",
  askTime: () => "🕐 What time? (e.g., 09:00 AM, 14:30)",
  askVehicle: () => "🚗 Vehicle type?\n- 🚗 **Car** (4 seats)\n- 🛺 **Auto** (3 seats)",
  askSeats: () => "💺 How many seats to offer?",
  askPrice: () => "💰 Total price (₹)?",
  noAuth: () => "🔒 You need to be logged in to do that. Please log in from the Login page first.",
  noRides: (dest) => `😕 No open rides found${dest ? ` to "${dest}"` : ''}. Try a different destination or time, or post your own ride!`,

  formatRideCard: (ride, index) => {
    const status = resolveRideStatus(ride);
    const pIds = getParticipantIds(ride);
    const total = Number(ride.totalSeats || ride.seats) || 1;
    const available = ride.availableSeats != null ? Number(ride.availableSeats) : (total - pIds.length);
    return {
      text: `**Ride #${index + 1}** — ${ride.destination}\n` +
        `📅 ${ride.date || 'Flexible'} · 🕐 ${ride.time || 'Flexible'}\n` +
        `👤 Driver: ${ride.driverName || 'Unknown'}\n` +
        `💺 ${available} seat${available !== 1 ? 's' : ''} left · ₹${Number(ride.price || 0)}\n` +
        `📍 From: ${ride.from || 'N/A'} · ${statusEmoji(status)} ${status}`,
      rideId: ride.id,
    };
  },
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

function todayISO() {
  const d = new Date();
  return isoDate(d);
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export { INTENTS };
