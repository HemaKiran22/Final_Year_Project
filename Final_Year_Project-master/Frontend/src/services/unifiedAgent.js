/**
 * unifiedAgent.js — Unified AI + Database Chatbot Agent
 *
 * Single file for ALL chatbot-related code:
 *   • Intent constants & detection (regex + LLM fallback)
 *   • Conversation state machine
 *   • Response templates
 *   • Firebase data helpers
 *   • DB intent handlers  (Firebase ONLY — LLM never writes DB)
 *   • LLM intent handlers (askLLM ONLY — no DB access)
 *   • Flow step handler   (wizard steps, confirmations)
 *   • Entry point: handleUserMessage()
 *
 * Architecture:
 *   handleUserMessage()
 *     → detectIntent()  → routeIntent()
 *         → handleDatabaseIntent()  ← Firebase services ONLY
 *         → handleLLMIntent()       ← askLLM() ONLY, no DB writes
 */

import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { searchRidesByQuery } from './rideSearchService';
import {
  joinRideById,
  leaveRide,
  cancelRideByCreator,
  resolveRideStatus,
  getParticipantIds,
} from './rideActionService';
import { createRideFromPrompt } from './ridePostService';
import { getRecommendedRides } from './rideRecommendationService';

/* ═══════════════════════════════════════════════════════════════
   NLP AGENT  (ride query parsing)
   ═══════════════════════════════════════════════════════════════ */

function _toISODate(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function _parseRelativeDate(textLower) {
  const now = new Date();
  if (textLower.includes('tomorrow')) { const t = new Date(now); t.setDate(now.getDate() + 1); return _toISODate(t); }
  if (textLower.includes('today'))    return _toISODate(now);
  return null;
}

function _parseTime(textLower) {
  let cleaned = textLower
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, ' ');
  const patterns = [
    /\b(?:around\s+|at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)\b/i,
    /\b(?:around\s+|at\s+)?(\d{1,2})\s*(am|pm)\b/i,
    /\b(?:around\s+|at\s+)?(\d{1,2}):(\d{2})\b/,
    /\b(?:around\s+|at\s+)?(\d{1,2})\b/,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (!m) continue;
    let hour = parseInt(m[1], 10); let minute = 0; let ampm = null;
    if (m[2] && /\d{2}/.test(m[2]) && !/(am|pm)/i.test(m[2])) { minute = parseInt(m[2], 10); ampm = m[3] || null; }
    else if (m[2] && /(am|pm)/i.test(m[2])) { ampm = m[2]; }
    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hour < 12) hour += 12;
      if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
    } else {
      if (cleaned.includes('evening') || cleaned.includes('night') || cleaned.includes('pm')) { if (hour < 12) hour += 12; }
      else if (cleaned.includes('afternoon'))                                                  { if (hour < 12) hour += 12; }
      else if (hour === 12 && (cleaned.includes('morning') || cleaned.includes('am')))       { hour = 0; }
    }
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  return null;
}

function _parseAbsoluteDate(textLower) {
  const iso = textLower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = textLower.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0'); const mm = dmy[2].padStart(2, '0');
    let yy = dmy[3]; if (yy.length === 2) yy = (yy >= '70' ? '19' : '20') + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}

function _parseDestination(text) {
  const lower = text.toLowerCase();
  const toIdx = lower.indexOf(' to ');
  if (toIdx === -1) return null;
  const after = text.slice(toIdx + 4);
  const afterLower = lower.slice(toIdx + 4);
  const stopWords = [' on ', ' tomorrow', ' today', ' around', ' at ', ' by ', ' near', ' morning', ' evening', ' night', '.', ',', ' and ', ' with ', ' where '];
  let end = after.length;
  for (const sw of stopWords) { const i = afterLower.indexOf(sw); if (i !== -1) end = Math.min(end, i); }
  for (const re of [/(\d{4}-\d{1,2}-\d{1,2})/, /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/]) {
    const m = afterLower.match(re); if (m && m.index != null) end = Math.min(end, m.index);
  }
  let dest = after.slice(0, end).trim();
  dest = dest.replace(/\b(on|at|around|by|near)$/i, '').trim();
  dest = dest.replace(/^the\s+/i, '').replace(/^a\s+/i, '').replace(/^an\s+/i, '');
  if (!dest) return null;
  return dest.split(/\s+/).map(w => w.length ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

function _parseMinRating(textLower) {
  if (/5\s*[- ]?\s*star/.test(textLower) || textLower.includes('five star')) return 5;
  const m = textLower.match(/(\d)\s*\+?\s*star/); if (m) return parseInt(m[1], 10);
  return null;
}

const _AUTO_BOOK = String(import.meta.env?.VITE_AUTO_BOOK || '').toLowerCase();

function _detectAction(textLower) {
  const isQ = textLower.endsWith('?') || textLower.startsWith('is ') || textLower.startsWith('are ') ||
    textLower.includes('is anyone') || textLower.includes('anyone going') ||
    textLower.includes('any rides') || textLower.includes('any ride');
  if (isQ) return 'search';
  if (textLower.includes("don't book") || textLower.includes('do not book') ||
      textLower.includes('only show') || textLower.includes('just show') ||
      textLower.includes('search') || textLower.includes('find') || textLower.includes('show me')) return 'search';
  if (textLower.includes('book') || textLower.includes('auto-book') || textLower.includes('autobook') ||
      textLower.includes('join') || textLower.includes('reserve') || textLower.includes('add me')) return 'book';
  if ((_AUTO_BOOK === 'true' || _AUTO_BOOK === '1' || _AUTO_BOOK === 'yes') && !isQ) return 'book';
  return 'search';
}

export function parseRideQuery(text) {
  const textLower = text.toLowerCase();
  const destination    = _parseDestination(text);
  const dateISO        = _parseAbsoluteDate(textLower) || _parseRelativeDate(textLower);
  const time24         = _parseTime(textLower);
  const minDriverRating = _parseMinRating(textLower);
  if (!destination && !dateISO && !time24) return null;
  return { action: _detectAction(textLower), destination, dateISO, time24, timeWindowMinutes: 30, minDriverRating: minDriverRating ?? null };
}

/* ═══════════════════════════════════════════════════════════════
   LLM SERVICE  (Groq only)
   ═══════════════════════════════════════════════════════════════ */

async function _callGroqDirect(apiKey, model, messages) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: messages.map(m => ({ role: m.role, content: String(m.content || '') })), temperature: 0.7, stream: false }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(data?.error?.message || data?.error || `Groq error (status ${resp.status})`);
  return data?.choices?.[0]?.message?.content || '';
}

function _isDecommissioned(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return msg.includes('decommissioned') || msg.includes('no longer supported') || msg.includes('model not found');
}

async function _groqWithFallback(apiKey, primaryModel, messages) {
  const candidates = [primaryModel, 'llama-3.1-8b-instant', 'llama3-8b-8192', 'gemma2-9b-it'];
  const tried = new Set(); let lastError = null;
  for (const m of candidates) {
    if (tried.has(m)) continue; tried.add(m);
    try { return { ok: true, answer: await _callGroqDirect(apiKey, m, messages), model: m }; }
    catch (e) { lastError = e; if (!_isDecommissioned(e)) break; }
  }
  return { ok: false, error: (lastError && (lastError.message || String(lastError))) || 'Groq call failed' };
}

const _SYSTEM_PROMPT = `You are 'Colony Carpool Agent', a helpful assistant for a society ride-sharing app.
CRITICAL RULES & DATA INTEGRITY:
1. **NO HALLUCINATIONS**: Do NOT simulate, invent, or guess user data. Do not print placeholders like "[Your Username]", "Ride #1234", or fake stats.
2. **MISSING DATA**: If the user asks for their stats, dashboard, or rides, and you do NOT see "Context Data" in this prompt, you MUST reply: "I can't see your personal data right now. Please explicitly say **'Check my stats'** or **'My rides'** so I can fetch it for you."
3. **CONTEXT IS KING**: Only answer factual questions about the user's activity if the *Context Data* section below explicitly provides it.
4. **GENERAL INFO**: You *can* explain how the app works (rules, safety, policies) without data.
5. Be concise, friendly, and use emojis.
6. Your goal is to guide the user to the correct command if you can't help directly.`;

export async function askLLM(prompt, history = [], opts = {}) {
  const model = opts.model || import.meta.env.VITE_LLM_MODEL || 'llama-3.1-8b-instant';
  const messages = [
    { role: 'system', content: _SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.from === 'bot' ? 'assistant' : 'user', content: String(m.text || '') })),
    { role: 'user', content: String(prompt || '') },
  ];

  // Try browser-side direct call first (VITE_GROQ_API_KEY)
  const browserKey = import.meta.env.VITE_GROQ_API_KEY;
  if (browserKey) {
    try {
      return { ok: true, answer: await _callGroqDirect(browserKey, model, messages) };
    } catch (e) {
      if (_isDecommissioned(e)) {
        const r = await _groqWithFallback(browserKey, model, messages);
        if (r.ok) return { ok: true, answer: r.answer };
        return { ok: false, error: r.error };
      }
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // Fallback: server-side /api/chat (uses GROQ_API_KEY env var)
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages }),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) return { ok: false, error: (data && (data.error || data.message)) || `Server error (${resp.status})` };
    return { ok: true, answer: data?.answer || '' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/* ═══════════════════════════════════════════════════════════════
   INTENTS
   ═══════════════════════════════════════════════════════════════ */

export const INTENTS = {
  FIND_RIDE:     'find_ride',
  JOIN_RIDE:     'join_ride',
  POST_RIDE:     'post_ride',
  LEAVE_RIDE:    'leave_ride',
  CANCEL_RIDE:   'cancel_ride',
  RIDE_STATUS:   'ride_status',
  RECOMMEND_RIDE:'recommend_ride',
  STATS:         'stats',
  MY_RIDES:      'my_rides',
  GREETING:      'greeting',
  HELP:          'help',
  RULES:         'rules',
  ABOUT:         'about',
  UNKNOWN:       'unknown',
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
    /\bwhat\s+do\s+you\s+recommend/i,
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

/* ═══════════════════════════════════════════════════════════════
   CONVERSATION STATE
   ═══════════════════════════════════════════════════════════════ */

export const STATES = {
  IDLE: 'idle',
  FIND_COLLECTING:  'find_collecting',
  FIND_RESULTS:     'find_results',
  JOIN_CONFIRMING:  'join_confirming',
  POST_DEST:        'post_dest',
  POST_DATE:        'post_date',
  POST_TIME:        'post_time',
  POST_VEHICLE:     'post_vehicle',
  POST_SEATS:       'post_seats',
  POST_PRICE:       'post_price',
  POST_CONFIRM:     'post_confirm',
  LEAVE_CONFIRMING: 'leave_confirming',
  CANCEL_CONFIRMING:'cancel_confirming',
};

export function createInitialState() {
  return {
    conversationState: STATES.IDLE,
    findQuery:    {},
    findResults:  [],
    selectedRide: null,
    postData:     {},
    myRidesCache: [],
  };
}

/* ═══════════════════════════════════════════════════════════════
   INTENT DETECTION  (regex → NLP → LLM fallback)
   ═══════════════════════════════════════════════════════════════ */

export async function detectIntent(text, history = []) {
  const t = (text || '').trim();
  if (!t) return { intent: INTENTS.UNKNOWN, confidence: 0 };

  // 1. Regex patterns
  for (const { intent, patterns } of intentPatterns) {
    for (const rx of patterns) {
      if (rx.test(t)) return { intent, confidence: 0.9 };
    }
  }

  // 2. NLP query parser
  const q = parseRideQuery(t);
  if (q && (q.destination || (q.dateISO && q.time24))) {
    return { intent: INTENTS.FIND_RIDE, confidence: 0.7, parsed: q };
  }

  // 3. LLM classification (slow path)
  if (t.split(' ').length > 2) {
    try {
      const prompt =
        `Classify this user message into one of these intents:\n` +
        `find_ride, post_ride, join_ride, ride_status, stats, recommend_ride,\n` +
        `cancel_ride, leave_ride, my_rides, rules, greeting, help, unknown\n\n` +
        `User Message: "${t}"\n\nReply ONLY with the intent code. Do not explain.`;
      const { ok, answer } = await askLLM(prompt, [], { model: 'llama-3.1-8b-instant' });
      if (ok && answer) {
        const cleaned = answer.trim().toLowerCase().replace(/['"`.]/g, '');
        const matched = Object.values(INTENTS).find(v => v === cleaned);
        if (matched) return { intent: matched, confidence: 0.85, source: 'llm' };
      }
    } catch (e) {
      console.warn('[unifiedAgent] LLM intent detection failed:', e);
    }
  }

  return { intent: INTENTS.UNKNOWN, confidence: 0 };
}

/* ═══════════════════════════════════════════════════════════════
   DATA EXTRACTION
   ═══════════════════════════════════════════════════════════════ */

function _isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function extractRideDetails(text) {
  const t = (text || '').trim();
  const q = parseRideQuery(t);
  const details = {
    destination: q?.destination || null,
    date:        q?.dateISO    || null,
    time:        q?.time24     || null,
  };

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
    if      (low.includes('today'))    details.date = _isoDate(new Date());
    else if (low.includes('tomorrow')) { const d = new Date(); d.setDate(d.getDate() + 1); details.date = _isoDate(d); }
    else { const dm = t.match(/(\d{4}-\d{2}-\d{2})/); if (dm) details.date = dm[1]; }
  }
  if (!details.time) {
    const tm = t.match(/(\d{1,2}:\d{2})\s*(am|pm)?/i);
    if (tm) {
      let h = parseInt(tm[1].split(':')[0]);
      const min = tm[1].split(':')[1];
      const p = (tm[2] || '').toLowerCase();
      if (p === 'pm' && h < 12) h += 12;
      if (p === 'am' && h === 12) h = 0;
      details.time = `${String(h).padStart(2, '0')}:${min}`;
    }
  }
  const low = t.toLowerCase();
  details.vehicleType = low.includes('auto') ? 'auto' : null;
  const sm = t.match(/(\d+)\s*seats?/i); if (sm) details.seats = parseInt(sm[1]);
  const pm = t.match(/(?:price|cost|₹|rs\.?)\s*(\d+)/i) || t.match(/(\d+)\s*(?:rupees|rs)/i);
  if (pm) details.price = parseInt(pm[1]);
  return details;
}

/* ═══════════════════════════════════════════════════════════════
   FIREBASE DATA HELPERS
   ═══════════════════════════════════════════════════════════════ */

export async function agentSearchRides(db, queryParams) {
  const results = await searchRidesByQuery(db, queryParams);
  return results.filter(r => resolveRideStatus(r) === 'open');
}

export async function agentGetMyRides(db, userId) {
  if (!userId) return [];
  try {
    const ridesRef   = collection(db, 'rides');
    const createdSnap = await getDocs(query(ridesRef, where('driverId',   '==',            userId)));
    const joinedSnap  = await getDocs(query(ridesRef, where('passengers', 'array-contains', userId)));
    const rideMap = new Map();
    createdSnap.docs.forEach(d => rideMap.set(d.id, { id: d.id, ...d.data(), role: 'creator' }));
    joinedSnap.docs.forEach(d => { if (!rideMap.has(d.id)) rideMap.set(d.id, { id: d.id, ...d.data(), role: 'passenger' }); });
    return Array.from(rideMap.values());
  } catch (e) {
    console.error('[unifiedAgent] agentGetMyRides error:', e);
    return [];
  }
}

export async function agentGetDashboardStats(db, userId) {
  if (!userId) return null;
  const rides = await agentGetMyRides(db, userId);
  const now         = new Date();
  const oneWeekAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const inWindow    = (r, since) => new Date(r.createdAt?.toDate?.() || r.date) > since;
  const weeklyRides  = rides.filter(r => inWindow(r, oneWeekAgo));
  const monthlyRides = rides.filter(r => inWindow(r, oneMonthAgo));
  const calcSaved = rs => rs.reduce((s, r) => s + (Number(r.price) || 0) / (Number(r.seats) || 1), 0);
  const calcCO2   = rs => rs.length * 4.6;
  const recentActivity = rides
    .sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time))
    .slice(0, 5)
    .map(r => ({ action: r.role === 'creator' ? 'Posted ride' : 'Joined ride', destination: r.destination, date: r.date, status: resolveRideStatus(r) }));
  return {
    totalRides: rides.length,
    totalPosted: rides.filter(r => r.role === 'creator').length,
    totalJoined: rides.filter(r => r.role === 'passenger').length,
    savings: { weekly: Math.round(calcSaved(weeklyRides)), monthly: Math.round(calcSaved(monthlyRides)), total: Math.round(calcSaved(rides)) },
    co2:     { weekly: Math.round(calcCO2(weeklyRides)),   monthly: Math.round(calcCO2(monthlyRides)),   total: Math.round(calcCO2(rides))   },
    recentActivity,
    weeklyRidesCount: weeklyRides.length,
  };
}

export async function agentGetRideById(db, rideId) {
  try {
    const snap = await getDoc(doc(db, 'rides', rideId));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch {}
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   RESPONSE TEMPLATES
   ═══════════════════════════════════════════════════════════════ */

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
    "**🔍 Find Rides**\nSay: \"Find rides to [destination]\" or \"Rides to [place] at [time]\"\n\n" +
    "**📝 Post a Ride**\nSay: \"Post a ride\" — I'll guide you step by step\n\n" +
    "**✅ Join a Ride**\nAfter finding rides, say \"Join ride #1\" or tap the Join button\n\n" +
    "**🚪 Leave a Ride**\nSay: \"Leave ride\" — I'll show your rides and confirm\n\n" +
    "**❌ Cancel a Ride**\nSay: \"Cancel ride\" — for rides you created\n\n" +
    "**📊 Ride Status**\nSay: \"My rides\", \"Who joined my ride?\", \"Seats left?\"\n\n" +
    "**📋 Rules**\nSay: \"What happens if I cancel?\" or \"Safety rules\"",

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
  askDate:        () => "📅 What date? (YYYY-MM-DD, or say **today** / **tomorrow**)",
  askTime:        () => "🕐 What time? (e.g., 09:00 AM, 14:30)",
  askVehicle:     () => "🚗 Vehicle type?\n- 🚗 **Car** (4 seats)\n- 🛺 **Auto** (3 seats)",
  askSeats:       () => "💺 How many seats to offer?",
  askPrice:       () => "💰 Total price (₹)?",
  noAuth:         () => "🔒 You need to be logged in to do that. Please log in from the Login page first.",
  noRides: (dest) => `😕 No open rides found${dest ? ` to "${dest}"` : ''}. Try a different destination or time, or post your own ride!`,
};

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const VEHICLE_SEATS = { car: 4, auto: 3 };
const VEHICLE_EMOJI = { car: '🚗 Car', auto: '🛺 Auto' };

/**
 * Intents that MUST be handled by Firebase services.
 * These must NEVER use the LLM to derive factual ride data.
 */
const DB_INTENTS = new Set([
  INTENTS.FIND_RIDE,
  INTENTS.POST_RIDE,
  INTENTS.JOIN_RIDE,
  INTENTS.LEAVE_RIDE,
  INTENTS.CANCEL_RIDE,
  INTENTS.RIDE_STATUS,
  INTENTS.MY_RIDES,
  INTENTS.STATS,
  INTENTS.RECOMMEND_RIDE,
]);

/**
 * Intents that always escape an active conversation flow.
 * When detected mid-flow, the current flow is abandoned.
 */
const ESCAPE_INTENTS = new Set([
  INTENTS.CANCEL_RIDE,
  INTENTS.STATS,
  INTENTS.HELP,
  INTENTS.RULES,
  INTENTS.MY_RIDES,
  INTENTS.FIND_RIDE,
  INTENTS.GREETING,
]);

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function statusEmoji(s) {
  switch (s) {
    case 'open':      return '🟢';
    case 'closed':    return '🔴';
    case 'completed': return '✅';
    case 'cancelled': return '🚫';
    default:          return '⚪';
  }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const isAffirmative = (t) =>
  /^(yes|y|yep|yeah|sure|ok|confirm|go|do\s*it|proceed|absolutely)\b/i.test(t.trim());
const isNegative = (t) =>
  /^(no|n|nope|nah|cancel|stop|never|don'?t)\b/i.test(t.trim());

/** Build a standard AgentResponse object. */
function mkResponse(text, extras = {}) {
  return { type: 'text', text, ...extras };
}

/* ═══════════════════════════════════════════════════════════════
   1. INTENT ROUTING
   ═══════════════════════════════════════════════════════════════ */

/**
 * Determines whether an intent should be served by the database or the LLM.
 *
 * @param   {string} intent  - an INTENTS constant
 * @returns {'database'|'llm'}
 */
export function routeIntent(intent) {
  return DB_INTENTS.has(intent) ? 'database' : 'llm';
}

/* ═══════════════════════════════════════════════════════════════
   2. LLM HANDLER  (read-only, no DB access whatsoever)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Handles GREETING, HELP, RULES, ABOUT, and UNKNOWN intents.
 * For UNKNOWN, delegates to askLLM() with recent conversation history.
 * NEVER touches Firebase.
 *
 * @param   {string} intent
 * @param   {string} text
 * @param   {Array}  history  - [{from:'user'|'bot', text:string}]
 * @returns {AgentResponse}
 */
export async function handleLLMIntent(intent, text, history = []) {
  switch (intent) {
    case INTENTS.GREETING:
      return mkResponse(RESPONSES.greeting());

    case INTENTS.HELP:
      return mkResponse(RESPONSES.help(), {
        quickActions: [
          { label: '🔍 Find Rides', action: 'find_ride' },
          { label: '📝 Post Ride',  action: 'post_ride'  },
          { label: '📊 My Rides',   action: 'my_rides'   },
        ],
      });

    case INTENTS.RULES:
      return mkResponse(RESPONSES.rules());

    case INTENTS.ABOUT:
      return mkResponse(RESPONSES.about());

    default: {
      // UNKNOWN — let the LLM handle general / conversational queries
      try {
        const { ok, answer } = await askLLM(text, history.slice(-6));
        if (ok && answer) return mkResponse(answer);
      } catch (e) {
        console.warn('[unifiedAgent] LLM fallback error:', e);
      }

      return mkResponse(
        "I'm not sure about that. Here's what I can do:\n\n" +
        "🔍 Find rides · 📝 Post rides · ✅ Join · 🚪 Leave · ❌ Cancel · 📊 Status",
        {
          quickActions: [
            { label: '🔍 Find Rides', action: 'find_ride' },
            { label: '📝 Post Ride',  action: 'post_ride'  },
          ],
        }
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   3. DATABASE HANDLER  (Firebase only — LLM never writes DB)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Handles all intents that require Firebase read/write access.
 *
 * Important: In STATS, the LLM is used ONLY to narrate pre-fetched verified
 * data. It does NOT query the database itself and cannot fabricate numbers.
 *
 * @param   {string} intent
 * @param   {string} text
 * @param   {string} userId    - Firebase UID
 * @param   {object} db        - Firestore db instance
 * @param   {object} auth      - Firebase auth instance
 * @param   {string} userName  - display name for Firestore writes
 * @param   {object} state     - current conversation state
 * @param   {Array}  history   - message history (STATS narration only)
 * @returns {{ result: AgentResponse, newState: object }}
 */
export async function handleDatabaseIntent(
  intent, text, userId, db, auth, userName, state, history = []
) {
  if (!userId) {
    return { result: mkResponse(RESPONSES.noAuth()), newState: state };
  }

  switch (intent) {

    /* ── FIND RIDE ──────────────────────────────────────────────── */
    case INTENTS.FIND_RIDE: {
      const details = extractRideDetails(text);
      if (!details.destination) {
        return {
          result:   mkResponse(RESPONSES.askDestination()),
          newState: { ...state, conversationState: STATES.FIND_COLLECTING, findQuery: { ...details } },
        };
      }
      return _executeRideSearch(db, {
        destination:       details.destination,
        dateISO:           details.date || null,
        time24:            details.time || null,
        timeWindowMinutes: 30,
      }, state);
    }

    /* ── POST RIDE ──────────────────────────────────────────────── */
    case INTENTS.POST_RIDE: {
      const details = extractRideDetails(text);

      // All key details supplied inline → jump straight to confirmation
      if (details.destination && details.date && details.time) {
        const postData = {
          destination: details.destination,
          date:        details.date,
          time:        details.time,
          vehicleType: details.vehicleType || 'car',
          seats:       details.seats || VEHICLE_SEATS[details.vehicleType || 'car'],
          price:       details.price || 0,
        };
        return {
          result:   _buildPostConfirmation(postData),
          newState: { ...state, postData, conversationState: STATES.POST_CONFIRM },
        };
      }

      // Start guided wizard from the first missing field
      const postData = { ...details };
      if (!postData.destination) {
        return {
          result:   mkResponse("📝 **Let's post a ride!**\n\n" + RESPONSES.askDestination()),
          newState: { ...state, conversationState: STATES.POST_DEST, postData },
        };
      }
      if (!postData.date) {
        return {
          result:   mkResponse(`📍 Destination: **${postData.destination}**\n\n` + RESPONSES.askDate()),
          newState: { ...state, conversationState: STATES.POST_DATE, postData },
        };
      }
      if (!postData.time) {
        return {
          result:   mkResponse(RESPONSES.askTime()),
          newState: { ...state, conversationState: STATES.POST_TIME, postData },
        };
      }
      return {
        result: mkResponse(RESPONSES.askVehicle(), {
          quickActions: [
            { label: '🚗 Car',  action: 'vehicle_car'  },
            { label: '🛺 Auto', action: 'vehicle_auto' },
          ],
        }),
        newState: { ...state, conversationState: STATES.POST_VEHICLE, postData },
      };
    }

    /* ── JOIN RIDE ──────────────────────────────────────────────── */
    case INTENTS.JOIN_RIDE: {
      const numMatch   = text.match(/#?(\d+)/);
      const rideIndex  = numMatch ? parseInt(numMatch[1]) - 1 : -1;
      const { findResults } = state;

      if (findResults.length > 0 && rideIndex >= 0 && rideIndex < findResults.length) {
        return _buildJoinConfirmation(findResults[rideIndex], userId, state);
      }
      if (findResults.length === 0) {
        return {
          result:   mkResponse("I don't have any ride results. Let me find rides first.\n\n" + RESPONSES.askDestination()),
          newState: { ...state, conversationState: STATES.FIND_COLLECTING, findQuery: {} },
        };
      }
      if (findResults.length === 1) {
        return _buildJoinConfirmation(findResults[0], userId, state);
      }
      return {
        result:   mkResponse(`Which ride? Say **"Join ride #1"** through **"Join ride #${Math.min(findResults.length, 5)}"**.`),
        newState: state,
      };
    }

    /* ── LEAVE RIDE ─────────────────────────────────────────────── */
    case INTENTS.LEAVE_RIDE: {
      const myRides    = await agentGetMyRides(db, userId);
      const joinedRides = myRides.filter(
        r => r.role === 'passenger' && resolveRideStatus(r) === 'open'
      );

      if (joinedRides.length === 0) {
        return {
          result:   mkResponse("ℹ️ You haven't joined any active rides. Nothing to leave."),
          newState: { ...state, conversationState: STATES.IDLE },
        };
      }

      if (joinedRides.length === 1) {
        const ride = joinedRides[0];
        return {
          result: mkResponse(
            `**🚪 Leave this ride?**\n\n🗺️ ${ride.destination}\n📅 ${ride.date} · 🕐 ${ride.time || 'Flexible'}\n` +
            `👤 Driver: ${ride.driverName || 'Unknown'}\n\n` +
            `⚠️ **Note:** Leaving within 15 min of the ride = **-3 trust points**.\n\n` +
            `**Reply "yes" to leave or "no" to stay.**`,
            { quickActions: [
              { label: '🚪 Yes, Leave', action: 'confirm_leave'  },
              { label: '❌ Stay',       action: 'cancel_action'  },
            ]}
          ),
          newState: { ...state, conversationState: STATES.LEAVE_CONFIRMING, selectedRide: ride },
        };
      }

      const list = joinedRides.slice(0, 5)
        .map((r, i) => `**#${i + 1}** — ${r.destination} on ${r.date} at ${r.time || 'Flexible'}`)
        .join('\n');
      return {
        result:   mkResponse(`You've joined ${joinedRides.length} active ride(s):\n\n${list}\n\nWhich ride to leave? Say **"leave #1"** etc.`),
        newState: { ...state, findResults: joinedRides, conversationState: STATES.LEAVE_CONFIRMING },
      };
    }

    /* ── CANCEL RIDE ────────────────────────────────────────────── */
    case INTENTS.CANCEL_RIDE: {
      const myRides     = await agentGetMyRides(db, userId);
      const createdRides = myRides.filter(
        r => r.role === 'creator' && ['open', 'closed'].includes(resolveRideStatus(r))
      );

      if (createdRides.length === 0) {
        return {
          result:   mkResponse("ℹ️ No active rides to cancel.\n\nTo **leave** a ride you joined, say **\"leave ride\"**."),
          newState: { ...state, conversationState: STATES.IDLE },
        };
      }

      if (createdRides.length === 1) {
        const ride = createdRides[0];
        const pIds = getParticipantIds(ride);
        const passengerCount = pIds.filter(id => id !== userId).length;
        return {
          result: mkResponse(
            `**❌ Cancel this ride?**\n\n🗺️ ${ride.destination}\n📅 ${ride.date} · 🕐 ${ride.time || 'Flexible'}\n` +
            `👥 ${passengerCount} passenger${passengerCount !== 1 ? 's' : ''} joined\n\n` +
            `⚠️ All passengers will be notified. Frequent cancellations (3+) = **-5 trust penalty**.\n\n` +
            `**Reply "yes" or "no".**`,
            { quickActions: [
              { label: '❌ Yes, Cancel', action: 'confirm_cancel' },
              { label: '✅ Keep It',     action: 'cancel_action'  },
            ]}
          ),
          newState: { ...state, conversationState: STATES.CANCEL_CONFIRMING, selectedRide: ride },
        };
      }

      const list = createdRides.slice(0, 5)
        .map((r, i) => `**#${i + 1}** — ${r.destination} on ${r.date} at ${r.time || 'Flexible'}`)
        .join('\n');
      return {
        result:   mkResponse(`You have ${createdRides.length} active ride(s):\n\n${list}\n\nWhich to cancel? Say **"cancel #1"** etc.`),
        newState: { ...state, findResults: createdRides, conversationState: STATES.CANCEL_CONFIRMING },
      };
    }

    /* ── RIDE STATUS ────────────────────────────────────────────── */
    case INTENTS.RIDE_STATUS: {
      const myRides    = await agentGetMyRides(db, userId);
      const activeRides = myRides.filter(r => ['open', 'closed'].includes(resolveRideStatus(r)));

      if (activeRides.length === 0) {
        return {
          result:   mkResponse("No active rides found."),
          newState: { ...state, conversationState: STATES.IDLE },
        };
      }

      const ride  = activeRides[0];
      const pIds  = getParticipantIds(ride);
      const total = Number(ride.totalSeats || ride.seats) || 1;
      const avail = ride.availableSeats != null
        ? Number(ride.availableSeats)
        : total - pIds.length;
      const status = resolveRideStatus(ride);
      const low    = text.toLowerCase();

      let msg;
      if (low.includes('who joined') || low.includes('who is in')) {
        msg = `📊 **Ride to ${ride.destination}**\n\n${statusEmoji(status)} Status: **${status}**\n` +
              `👥 ${pIds.length} participant${pIds.length !== 1 ? 's' : ''} · 💺 ${avail} seat${avail !== 1 ? 's' : ''} left\n` +
              `Driver: ${ride.driverName || 'Unknown'}`;
      } else if (low.includes('seat')) {
        msg = `💺 **Seats for ride to ${ride.destination}:**\nTotal: ${total} · Available: ${avail} · Taken: ${pIds.length}`;
      } else {
        msg = `📊 **Ride Status — ${ride.destination}**\n\n${statusEmoji(status)} Status: **${status}**\n` +
              `📅 ${ride.date} · 🕐 ${ride.time || 'Flexible'}\n` +
              `👤 Driver: ${ride.driverName || 'Unknown'}\n` +
              `👥 ${pIds.length}/${total} seats filled · ${avail} available\n` +
              `💰 ₹${Number(ride.price || 0)}`;
      }

      return {
        result:   mkResponse(msg),
        newState: { ...state, conversationState: STATES.IDLE },
      };
    }

    /* ── MY RIDES ───────────────────────────────────────────────── */
    case INTENTS.MY_RIDES: {
      const myRides = await agentGetMyRides(db, userId);

      if (myRides.length === 0) {
        return {
          result: mkResponse("You don't have any rides yet.", {
            quickActions: [
              { label: '🔍 Find Rides',  action: 'find_ride' },
              { label: '📝 Post a Ride', action: 'post_ride' },
            ],
          }),
          newState: { ...state, conversationState: STATES.IDLE },
        };
      }

      const rideLines = myRides.slice(0, 6).map((r, i) => {
        const st    = resolveRideStatus(r);
        const pIds  = getParticipantIds(r);
        const total = Number(r.totalSeats || r.seats) || 1;
        const avail = r.availableSeats != null ? Number(r.availableSeats) : total - pIds.length;
        const role  = r.role === 'creator' ? '🚗 Creator' : '🧑‍🤝‍🧑 Passenger';
        return `**#${i + 1}** ${statusEmoji(st)} ${r.destination}\n  ${role} · ${r.date} · ${r.time || 'Flex'} · ${avail}/${total} seats · ₹${Number(r.price || 0)}`;
      }).join('\n\n');

      return {
        result:   mkResponse(`📊 **Your Rides (${myRides.length})**\n\n${rideLines}`),
        newState: { ...state, conversationState: STATES.IDLE },
      };
    }

    /* ── STATS ──────────────────────────────────────────────────── */
    case INTENTS.STATS: {
      const stats = await agentGetDashboardStats(db, userId);

      // LLM narrates ONLY the pre-fetched verified data — it cannot invent numbers
      const activitySummary = stats.recentActivity
        .map(r => `- ${r.action}: "${r.destination}" on ${r.date} (${r.status})`)
        .join('\n');

      const prompt =
        `User asked: "${text}"\n\n` +
        `Context Data (Verified Real-time from Database):\n` +
        `- Total Posted Rides: ${stats.totalPosted}\n` +
        `- Total Joined Rides: ${stats.totalJoined}\n` +
        `- Total Rides: ${stats.totalRides}\n` +
        `- Money Saved: ₹${stats.savings.total} (Weekly: ₹${stats.savings.weekly})\n` +
        `- CO2 Reduced: ${stats.co2.total} kg (Weekly: ${stats.co2.weekly} kg)\n` +
        `- Recent Activity:\n${activitySummary || 'No recent activity.'}\n\n` +
        `Instructions:\n` +
        `- Answer based ONLY on the data above.\n` +
        `- Do NOT make up any other rides.\n` +
        `- If data is zero, be encouraging.`;

      try {
        const { ok, answer } = await askLLM(prompt, []);
        if (ok && answer) {
          return { result: mkResponse(answer), newState: { ...state, conversationState: STATES.IDLE } };
        }
      } catch (e) {
        console.warn('[unifiedAgent] Stats LLM narration failed:', e);
      }

      // Plain fallback card if LLM unavailable
      return {
        result: mkResponse(
          `📊 **Dashboard Stats**\n\n` +
          `Total Rides: ${stats.totalRides}\n` +
          `💰 Total Saved: ₹${stats.savings.total}\n` +
          `🌱 CO₂ Reduced: ${stats.co2.total} kg`
        ),
        newState: { ...state, conversationState: STATES.IDLE },
      };
    }

    /* ── RECOMMEND RIDE ─────────────────────────────────────────── */
    case INTENTS.RECOMMEND_RIDE: {
      const allRides = await agentSearchRides(db, {});
      const scored   = await getRecommendedRides(db, allRides, { userId });
      const topPicks = scored.map(s => s.ride);

      if (topPicks.length === 0) {
        return {
          result: mkResponse(
            "I couldn't find any recommended rides right now. Try **posting a ride**!",
            { quickActions: [{ label: '📝 Post Ride', action: 'post_ride' }] }
          ),
          newState: { ...state, conversationState: STATES.IDLE },
        };
      }

      const best   = topPicks[0];
      const others = topPicks.slice(1, 4);
      const header =
        `🌟 **Top Recommendation:**\n\nTo **${best.destination}**\n` +
        `Driver: ${best.driverName || 'Unknown'} (Reliability: High)\n\n` +
        `I also found these other good options:`;

      return {
        result:   mkResponse(header, { type: 'ride-results', rides: [best, ...others] }),
        newState: { ...state, findResults: topPicks, conversationState: STATES.FIND_RESULTS },
      };
    }

    default:
      return { result: mkResponse("⚠️ Unrecognized database intent."), newState: state };
  }
}

/* ═══════════════════════════════════════════════════════════════
   4. FLOW-STEP HANDLER
      Manages wizard steps, confirmations, and mid-flow responses.
      Returns null when no active flow matches the input.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Processes a message against the current conversation flow state.
 * Handles: yes/no confirmations, post wizard steps, find-collecting,
 * find-results join pick, and leave/cancel list selection.
 *
 * @returns {{ result: AgentResponse, newState: object } | null}
 */
export async function handleFlowStep(text, userId, db, auth, userName, state) {
  const { conversationState, selectedRide, postData, findResults } = state;
  const low = text.toLowerCase().trim();

  /* Universal escape hatch — works in any active flow */
  if (/^(cancel|stop|quit|abort|exit|back|no thanks)\b/i.test(low)) {
    return {
      result: mkResponse("👍 Action cancelled. What else would you like to do?", {
        quickActions: [
          { label: '🔍 Find Rides', action: 'find_ride' },
          { label: '📝 Post Ride',  action: 'post_ride'  },
          { label: '📊 My Rides',   action: 'my_rides'   },
        ],
      }),
      newState: createInitialState(),
    };
  }

  /* ── Confirmation states (yes / no) ─────────────────────────── */
  if ([STATES.JOIN_CONFIRMING, STATES.POST_CONFIRM,
       STATES.LEAVE_CONFIRMING, STATES.CANCEL_CONFIRMING].includes(conversationState)) {

    if (isNegative(text)) {
      return {
        result: mkResponse("👍 No problem! Action cancelled. What else?", {
          quickActions: [
            { label: '🔍 Find Rides', action: 'find_ride' },
            { label: '📝 Post Ride',  action: 'post_ride'  },
            { label: '📊 My Rides',   action: 'my_rides'   },
          ],
        }),
        newState: createInitialState(),
      };
    }

    if (isAffirmative(text)) {
      switch (conversationState) {
        case STATES.JOIN_CONFIRMING:
          if (selectedRide) return _executeJoinRide(db, auth, selectedRide, userId, userName);
          break;
        case STATES.POST_CONFIRM:
          return _executePostRide(db, auth, postData, userName);
        case STATES.LEAVE_CONFIRMING:
          if (selectedRide) return _executeLeaveRide(db, auth, selectedRide, userName);
          break;
        case STATES.CANCEL_CONFIRMING:
          if (selectedRide) return _executeCancelRide(db, auth, selectedRide, userName);
          break;
      }
    }

    /* Number selection for leave/cancel ride lists */
    const numMatch = text.match(/#?(\d+)/);
    if (numMatch && findResults.length > 0) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < findResults.length) {
        const ride = findResults[idx];

        if (conversationState === STATES.LEAVE_CONFIRMING) {
          return {
            result: mkResponse(
              `**🚪 Leave ride to ${ride.destination}?**\n\n⚠️ Late cancel = -3 trust pts\n\n**Reply "yes" or "no".**`,
              { quickActions: [
                { label: '🚪 Yes, Leave', action: 'confirm_leave' },
                { label: '❌ Stay',       action: 'cancel_action' },
              ]}
            ),
            newState: { ...state, selectedRide: ride },
          };
        }

        if (conversationState === STATES.CANCEL_CONFIRMING) {
          return {
            result: mkResponse(
              `**❌ Cancel ride to ${ride.destination}?**\n\n⚠️ Passengers notified. 3+ cancels = -5 trust.\n\n**Reply "yes" or "no".**`,
              { quickActions: [
                { label: '❌ Yes, Cancel', action: 'confirm_cancel' },
                { label: '✅ Keep It',     action: 'cancel_action'  },
              ]}
            ),
            newState: { ...state, selectedRide: ride },
          };
        }
      }
    }

    return null; // not handled — fall through to fresh intent detection
  }

  /* ── Post wizard steps ───────────────────────────────────────── */
  if ([STATES.POST_DEST, STATES.POST_DATE, STATES.POST_TIME,
       STATES.POST_VEHICLE, STATES.POST_SEATS, STATES.POST_PRICE].includes(conversationState)) {
    return _handlePostWizardStep(text, low, conversationState, postData, state);
  }

  /* ── Find collecting ─────────────────────────────────────────── */
  if (conversationState === STATES.FIND_COLLECTING) {
    const details = extractRideDetails(text);
    const dest    = details.destination || text.trim();
    return _executeRideSearch(db, {
      destination:       dest,
      dateISO:           details.date  || state.findQuery.date  || null,
      time24:            details.time  || state.findQuery.time  || null,
      timeWindowMinutes: 30,
    }, state);
  }

  /* ── Find results → join pick ────────────────────────────────── */
  if (conversationState === STATES.FIND_RESULTS) {
    const numMatch = text.match(/#?(\d+)/);
    if (numMatch || /join/i.test(text)) {
      const idx = numMatch ? parseInt(numMatch[1]) - 1 : -1;
      if (findResults.length > 0 && idx >= 0 && idx < findResults.length) {
        return _buildJoinConfirmation(findResults[idx], userId, state);
      }
      if (findResults.length === 1) {
        return _buildJoinConfirmation(findResults[0], userId, state);
      }
    }
  }

  return null; // not in any active flow
}

/* ═══════════════════════════════════════════════════════════════
   5. MAIN ENTRY POINT
   ═══════════════════════════════════════════════════════════════ */

/**
 * Primary entry point for every user message.
 *
 * Flow:
 *  0. Auth shortcut ("am I logged in?")
 *  1. If in active flow, try handleFlowStep() first
 *     — unless a high-priority escape intent is detected (resets flow)
 *  2. Detect fresh intent with detectIntent()
 *  3. route → handleDatabaseIntent() OR handleLLMIntent()
 *
 * @param   {string} text        - raw user message
 * @param   {string} userId      - Firebase UID (null if not authenticated)
 * @param   {object} db          - Firestore db instance
 * @param   {object} auth        - Firebase auth instance
 * @param   {string} userName    - display name
 * @param   {object} state       - current state (from createInitialState())
 * @param   {Array}  history     - [{from:'user'|'bot', text:string}]
 * @returns {{ result: AgentResponse, newState: object }}
 *
 * AgentResponse:
 *   { type: 'text'|'ride-results', text: string,
 *     data?: any, rides?: array, quickActions?: array }
 */
export async function handleUserMessage(
  text, userId, db, auth, userName, state, history = []
) {
  const t = (text || '').trim();
  if (!t) return { result: mkResponse(''), newState: state };

  /* 0. Auth status shortcut (works even without userId) */
  if (/\bam\s+i\s+(logged|signed)\s+in\b|\bwho\s+am\s+i\b|\bmy\s+account\b/i.test(t)) {
    const name = userName || 'User';
    return {
      result: mkResponse(
        `✅ Yes, you're **logged in** as **${name}**! How can I help you today?`,
        { quickActions: [
          { label: '🔍 Find Rides', action: 'find_ride' },
          { label: '📝 Post Ride',  action: 'post_ride'  },
          { label: '📊 My Rides',   action: 'my_rides'   },
        ]}
      ),
      newState: state,
    };
  }

  /* 1. Check active flow */
  let currentState = state;
  const { conversationState } = currentState;

  if (conversationState !== STATES.IDLE) {
    // Quick intent check to see if the user wants to escape the current flow
    const escapeCheck = await detectIntent(t, history);
    if (ESCAPE_INTENTS.has(escapeCheck.intent)) {
      // Reset flow and fall through to fresh intent handling
      currentState = createInitialState();
    } else {
      // Try to advance within the current flow
      const flowResult = await handleFlowStep(t, userId, db, auth, userName, currentState);
      if (flowResult) return flowResult;
      // Not handled by active flow — fall through to fresh intent detection
    }
  }

  /* 2. Detect fresh intent */
  const { intent } = await detectIntent(t, history);

  /* 3. Route to database or LLM handler */
  if (routeIntent(intent) === 'database') {
    return handleDatabaseIntent(intent, t, userId, db, auth, userName, currentState, history);
  }

  const result = await handleLLMIntent(intent, t, history);
  return { result, newState: currentState };
}

/* ═══════════════════════════════════════════════════════════════
   PRIVATE IMPLEMENTATION HELPERS
   ═══════════════════════════════════════════════════════════════ */

async function _executeRideSearch(db, searchParams, state) {
  try {
    const results = await agentSearchRides(db, searchParams);

    if (results.length === 0) {
      return {
        result: mkResponse(
          RESPONSES.noRides(searchParams.destination) + "\n\nWould you like to **post a ride** instead?",
          { quickActions: [
            { label: '📝 Post a Ride', action: 'post_ride'    },
            { label: '🔍 Search Again', action: 'search_again' },
          ]}
        ),
        newState: createInitialState(),
      };
    }

    const header =
      `🔍 Found **${results.length} ride${results.length > 1 ? 's' : ''}**` +
      ` to "${searchParams.destination}"` +
      (searchParams.dateISO ? ` on ${searchParams.dateISO}` : '') + ':\n';

    return {
      result: mkResponse(
        header + "\n💡 Tap **Join** on a ride or say **\"Join ride #1\"**.",
        { type: 'ride-results', rides: results.slice(0, 5) }
      ),
      newState: {
        ...state,
        conversationState: STATES.FIND_RESULTS,
        findResults:       results,
        findQuery:         searchParams,
      },
    };
  } catch (err) {
    return {
      result:   mkResponse(`❌ Error searching rides: ${err.message || 'Unknown error'}`),
      newState: createInitialState(),
    };
  }
}

function _buildJoinConfirmation(ride, userId, state) {
  const status = resolveRideStatus(ride);
  const pIds   = getParticipantIds(ride);
  const total  = Number(ride.totalSeats || ride.seats) || 1;
  const avail  = ride.availableSeats != null ? Number(ride.availableSeats) : total - pIds.length;

  if (pIds.includes(userId)) {
    return { result: mkResponse("✅ You're already in this ride!"), newState: createInitialState() };
  }
  if (ride.driverId === userId) {
    return { result: mkResponse("ℹ️ This is your own ride — you can't join it."), newState: createInitialState() };
  }
  if (status !== 'open') {
    return { result: mkResponse(`⚠️ This ride is **${status}** and cannot be joined.`), newState: createInitialState() };
  }
  if (avail <= 0) {
    return { result: mkResponse("⚠️ No seats left in this ride. Try another one!"), newState: state };
  }

  return {
    result: mkResponse(
      `**Join this ride?**\n\n` +
      `🗺️ To: ${ride.destination}\n📅 ${ride.date} · 🕐 ${ride.time || 'Flexible'}\n` +
      `👤 Driver: ${ride.driverName || 'Unknown'}\n💺 ${avail} seat${avail !== 1 ? 's' : ''} left · ₹${Number(ride.price || 0)}\n\n` +
      `**Reply "yes" to confirm or "no" to cancel.**`,
      { quickActions: [
        { label: '✅ Yes, Join!', action: 'confirm_join'  },
        { label: '❌ No',         action: 'cancel_action' },
      ]}
    ),
    newState: { ...state, conversationState: STATES.JOIN_CONFIRMING, selectedRide: ride },
  };
}

function _buildPostConfirmation(data) {
  const vehicle = VEHICLE_EMOJI[data.vehicleType] || '🚗 Car';
  return mkResponse(
    `**📋 Ride Summary — Please Confirm**\n\n` +
    `🗺️ Destination: **${data.destination}**\n` +
    `📅 Date:        **${data.date}**\n` +
    `🕐 Time:        **${data.time}**\n` +
    `🚗 Vehicle:     **${vehicle}**\n` +
    `💺 Seats:       **${data.seats || VEHICLE_SEATS[data.vehicleType] || 4}**\n` +
    `💰 Price:       **₹${data.price || 0}**\n\n` +
    `**Reply "yes" to post or "no" to cancel.**`,
    { quickActions: [
      { label: '✅ Post Ride!', action: 'confirm_post'  },
      { label: '❌ Cancel',     action: 'cancel_action' },
    ]}
  );
}

async function _executeJoinRide(db, auth, ride, userId, userName) {
  try {
    const res = await joinRideById(db, auth, ride, userName);
    if (res.ok) {
      return {
        result: mkResponse(
          `🎉 **Successfully joined!**\n\nYou're in the ride to **${ride.destination}** on ${ride.date}.\nSeats remaining: ${res.availableSeats}`,
          { quickActions: [{ label: '📊 My Rides', action: 'my_rides' }] }
        ),
        newState: createInitialState(),
      };
    }
    return { result: mkResponse(`❌ Could not join: ${res.message}`), newState: createInitialState() };
  } catch (err) {
    return { result: mkResponse(`❌ Error: ${err.message}`), newState: createInitialState() };
  }
}

async function _executePostRide(db, auth, postData, userName) {
  try {
    const prompt =
      `post ride to ${postData.destination} on ${postData.date} at ${postData.time}, ` +
      `seats ${postData.seats || 4}, price ${postData.price || 0}, ${postData.vehicleType || 'car'}`;
    const res = await createRideFromPrompt(db, auth, prompt, userName);
    if (res.ok) {
      return {
        result: mkResponse(
          `🎉 **Ride posted successfully!**\n\n` +
          `🗺️ ${res.ride.destination}\n📅 ${res.ride.date} · 🕐 ${res.ride.time}\n` +
          `💺 ${res.ride.seats} seats · ₹${res.ride.price}\n\nYour ride is now live!`,
          { quickActions: [
            { label: '📊 My Rides',   action: 'my_rides'  },
            { label: '🔍 Find Rides', action: 'find_ride' },
          ]}
        ),
        newState: createInitialState(),
      };
    }
    return { result: mkResponse(`❌ Could not post ride: ${res.message}`), newState: createInitialState() };
  } catch (err) {
    return { result: mkResponse(`❌ Error posting ride: ${err.message}`), newState: createInitialState() };
  }
}

async function _executeLeaveRide(db, auth, ride, userName) {
  try {
    const res = await leaveRide(db, auth, ride, userName);
    if (res.ok) {
      const penalty = res.cancelType === 'late' ? '\n⚠️ Late cancellation — trust penalty applied.' : '';
      return {
        result:   mkResponse(`✅ **You've left the ride to ${ride.destination}.**${penalty}\n\nThe driver has been notified.`),
        newState: createInitialState(),
      };
    }
    return { result: mkResponse(`❌ ${res.message}`), newState: createInitialState() };
  } catch (err) {
    return { result: mkResponse(`❌ Error: ${err.message}`), newState: createInitialState() };
  }
}

async function _executeCancelRide(db, auth, ride, userName) {
  try {
    const res = await cancelRideByCreator(db, auth, ride, userName);
    if (res.ok) {
      return {
        result:   mkResponse(`🚫 **Ride to ${ride.destination} cancelled.** All passengers notified.`),
        newState: createInitialState(),
      };
    }
    return { result: mkResponse(`❌ ${res.message}`), newState: createInitialState() };
  } catch (err) {
    return { result: mkResponse(`❌ Error: ${err.message}`), newState: createInitialState() };
  }
}

function _handlePostWizardStep(text, low, conversationState, postData, state) {
  switch (conversationState) {
    case STATES.POST_DEST: {
      const dest    = text.trim();
      const updated = { ...postData, destination: dest };
      return {
        result:   mkResponse(`📍 Destination: **${dest}**\n\n` + RESPONSES.askDate()),
        newState: { ...state, postData: updated, conversationState: STATES.POST_DATE },
      };
    }
    case STATES.POST_DATE: {
      let date = text.trim();
      if (low.includes('today'))    date = todayISO();
      else if (low.includes('tomorrow')) date = tomorrowISO();
      const updated = { ...postData, date };
      return {
        result:   mkResponse(`📅 Date: **${date}**\n\n` + RESPONSES.askTime()),
        newState: { ...state, postData: updated, conversationState: STATES.POST_TIME },
      };
    }
    case STATES.POST_TIME: {
      const details = extractRideDetails(`at ${text}`);
      const time    = details.time || text.trim();
      const updated = { ...postData, time };
      return {
        result: mkResponse(`🕐 Time: **${time}**\n\n` + RESPONSES.askVehicle(), {
          quickActions: [
            { label: '🚗 Car',  action: 'vehicle_car'  },
            { label: '🛺 Auto', action: 'vehicle_auto' },
          ],
        }),
        newState: { ...state, postData: updated, conversationState: STATES.POST_VEHICLE },
      };
    }
    case STATES.POST_VEHICLE: {
      const vehicle = low.includes('auto') ? 'auto' : 'car';
      const updated = { ...postData, vehicleType: vehicle, seats: VEHICLE_SEATS[vehicle] };
      return {
        result:   mkResponse(`🚗 Vehicle: **${VEHICLE_EMOJI[vehicle]}**\n\n` + RESPONSES.askSeats()),
        newState: { ...state, postData: updated, conversationState: STATES.POST_SEATS },
      };
    }
    case STATES.POST_SEATS: {
      const seats   = parseInt(text) || VEHICLE_SEATS[postData.vehicleType || 'car'];
      const updated = { ...postData, seats };
      return {
        result:   mkResponse(`💺 Seats: **${seats}**\n\n` + RESPONSES.askPrice()),
        newState: { ...state, postData: updated, conversationState: STATES.POST_PRICE },
      };
    }
    case STATES.POST_PRICE: {
      const price   = parseInt(text.replace(/[^0-9]/g, '')) || 0;
      const updated = { ...postData, price };
      return {
        result:   _buildPostConfirmation(updated),
        newState: { ...state, postData: updated, conversationState: STATES.POST_CONFIRM },
      };
    }
    default:
      return null;
  }
}
