import { collection, query, where, getDocs } from 'firebase/firestore';
import { searchRidesByQuery } from './rideSearchService';
import { joinRideById, leaveRide, cancelRideByCreator, resolveRideStatus, getParticipantIds } from './rideActionService';
import { createRideFromPrompt } from './ridePostService';
import { getRecommendedRides } from './rideRecommendationService';

// ─── NLP ──────────────────────────────────────────────────────────────────────

function _toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _parseRelDate(l) {
  const n=new Date();
  if (l.includes('tomorrow')) { n.setDate(n.getDate()+1); return _toISO(n); }
  return l.includes('today') ? _toISO(n) : null;
}
function _parseTime(l) {
  const c=l.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g,' ').replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,' ');
  for (const re of [/\b(?:around\s+|at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)\b/i,/\b(?:around\s+|at\s+)?(\d{1,2})\s*(am|pm)\b/i,/\b(?:around\s+|at\s+)?(\d{1,2}):(\d{2})\b/,/\b(?:around\s+|at\s+)?(\d{1,2})\b/]) {
    const m=c.match(re); if(!m) continue;
    let h=parseInt(m[1],10),min=0,ap=null;
    if (m[2]&&/\d{2}/.test(m[2])&&!/(am|pm)/i.test(m[2])) { min=parseInt(m[2],10); ap=m[3]||null; }
    else if (m[2]&&/(am|pm)/i.test(m[2])) ap=m[2];
    if (ap) { if(/pm/i.test(ap)&&h<12) h+=12; if(/am/i.test(ap)&&h===12) h=0; }
    else if (/evening|night|pm/.test(c)&&h<12) h+=12;
    else if (c.includes('afternoon')&&h<12) h+=12;
    else if (h===12&&/morning|am/.test(c)) h=0;
    if (h>=0&&h<=23&&min>=0&&min<=59) return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  return null;
}
function _parseAbsDate(l) {
  const iso=l.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const dmy=l.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmy) { let y=dmy[3]; if(y.length===2) y=(y>='70'?'19':'20')+y; return `${y}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`; }
  return null;
}
function _parseDest(text) {
  const l=text.toLowerCase(), idx=l.indexOf(' to ');
  if (idx===-1) return null;
  const after=text.slice(idx+4), al=l.slice(idx+4);
  let end=after.length;
  for (const s of [' on ',' tomorrow',' today',' around',' at ',' by ',' near',' morning',' evening',' night','.',',',' and ',' with ',' where '])
    { const i=al.indexOf(s); if(i!==-1) end=Math.min(end,i); }
  for (const re of [/(\d{4}-\d{1,2}-\d{1,2})/,/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/])
    { const m=al.match(re); if(m&&m.index!=null) end=Math.min(end,m.index); }
  let d=after.slice(0,end).replace(/\b(on|at|around|by|near)$/i,'').replace(/^(the|a|an)\s+/i,'').trim();
  return d ? d.split(/\s+/).map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(' ') : null;
}
export function parseRideQuery(text) {
  const l=text.toLowerCase();
  const destination=_parseDest(text), dateISO=_parseAbsDate(l)||_parseRelDate(l), time24=_parseTime(l);
  if (!destination&&!dateISO&&!time24) return null;
  const isQ=l.endsWith('?')||/^(is|are)\s/.test(l)||/any rides?|is anyone|anyone going/.test(l);
  const action=isQ||/don.?t book|do not book|only show|just show|find|search|show me/.test(l)?'search':/book|join|reserve|add me/.test(l)?'book':'search';
  const mr=(l.match(/(\d)\s*\+?\s*star/)||[])[1];
  return { action, destination, dateISO, time24, timeWindowMinutes:30, minDriverRating:mr?parseInt(mr):null };
}

// ─── LLM (Groq only) ──────────────────────────────────────────────────────────

async function _callGroq(key, model, messages) {
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':`Bearer ${key}`},
    body:JSON.stringify({model,messages:messages.map(m=>({role:m.role,content:String(m.content||'')})),temperature:0.7,stream:false}),
  });
  const d=await r.json().catch(()=>null);
  if (!r.ok) throw new Error(d?.error?.message||d?.error||`Groq error (${r.status})`);
  return d?.choices?.[0]?.message?.content||'';
}
const _decomm=e=>{ const s=String(e?.message||e||'').toLowerCase(); return s.includes('decommissioned')||s.includes('no longer supported')||s.includes('model not found'); };
async function _groqFallback(key, model, msgs) {
  for (const m of [model,'llama-3.1-8b-instant','llama3-8b-8192','gemma2-9b-it']) {
    try { return { ok:true, answer:await _callGroq(key,m,msgs) }; }
    catch(e) { if(!_decomm(e)) return { ok:false, error:e?.message||String(e) }; }
  }
  return { ok:false, error:'Groq call failed' };
}
const _SYS=`You are Colony Carpool Agent for a society ride-sharing app. Rules: 1) Never invent user data or stats. 2) If asked for personal data without Context Data in the prompt, say you cannot see it and ask them to say Check my stats or My rides. 3) Only state facts from Context Data. 4) General app info is always OK. 5) Be concise, friendly, use emojis.`;
export async function askLLM(prompt, history=[], opts={}) {
  const model=opts.model||import.meta.env.VITE_LLM_MODEL||'llama-3.1-8b-instant';
  const msgs=[
    { role:'system', content:_SYS },
    ...history.map(m=>({role:m.from==='bot'?'assistant':'user',content:String(m.text||'')})),
    { role:'user', content:String(prompt||'') },
  ];
  const bk=import.meta.env.VITE_GROQ_API_KEY;
  if (bk) {
    try { return { ok:true, answer:await _callGroq(bk,model,msgs) }; }
    catch(e) { return _decomm(e)?_groqFallback(bk,model,msgs):{ ok:false, error:e?.message||String(e) }; }
  }
  try {
    const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:msgs})});
    const d=await r.json().catch(()=>null);
    return r.ok?{ ok:true, answer:d?.answer||'' }:{ ok:false, error:(d?.error||d?.message)||`Server error (${r.status})` };
  } catch(e) { return { ok:false, error:e?.message||String(e) }; }
}

// ─── INTENTS & PATTERNS ───────────────────────────────────────────────────────

export const INTENTS = {
  FIND_RIDE:'find_ride', JOIN_RIDE:'join_ride', POST_RIDE:'post_ride',
  LEAVE_RIDE:'leave_ride', CANCEL_RIDE:'cancel_ride', RIDE_STATUS:'ride_status',
  RECOMMEND_RIDE:'recommend_ride', STATS:'stats', MY_RIDES:'my_rides',
  GREETING:'greeting', HELP:'help', RULES:'rules', ABOUT:'about', UNKNOWN:'unknown',
};
const _P = [
  { i:INTENTS.MY_RIDES,       rx:[/\bmy\s+rides/i,/\bshow\s*(my|all)?\s*rides/i,/\bride\s*(history|records?|log)\b/i,/\bmy\s+(past|previous|completed|old)\s+rides?/i] },
  { i:INTENTS.FIND_RIDE,      rx:[/\b(find|search|show|look\s*for|get|any|available)\b.*\bride/i,/\brides?\s+(to|towards|going|heading|near)\b/i,/\bwho\s+(is\s+)?going\s+to\b/i,/\b(is|are)\s+(there|any)\s+rides?/i,/\bcan\s+i\s+get\s+a\s+ride/i] },
  { i:INTENTS.STATS,          rx:[/\b(dashboard|stats|statistics|analytics|summary|report|impact)\b/i,/\b(how\s+much|total)\s+(money|co2|carbon|savings)\b/i,/\brecent\s+activity\b/i,/\bcheck\s+my\s+(stats|progress|impact)\b/i,/\bhow\s+am\s+i\s+doing\b/i] },
  { i:INTENTS.RECOMMEND_RIDE, rx:[/\brecommend/i,/\bsuggest/i,/\bbest\s+ride/i,/\bwhich\s+ride\s+should\s+i/i] },
  { i:INTENTS.JOIN_RIDE,      rx:[/\bjoin\b.*\bride/i,/\bjoin\s+(this|that|the|ride\s*#?\d)/i,/\bi\s+want\s+to\s+join/i,/\badd\s+me\s+to/i] },
  { i:INTENTS.POST_RIDE,      rx:[/(?:^|\s)(?:post|create|add|offer|share)\s+(?:a\s+)?ride/i,/(?:^|\s)i(?:'m|\s+am)\s+(?:driving|going|heading)\b/i] },
  { i:INTENTS.LEAVE_RIDE,     rx:[/\bleave\b.*\bride/i,/\bremove\s+me\s+from/i,/\bi\s+(want\s+to\s+)?leave/i,/\bdrop\s+out/i] },
  { i:INTENTS.CANCEL_RIDE,    rx:[/\bcancel\b.*\bride/i,/\bdelete\b.*\bride/i,/\bremove\b.*\b(my\s+)?ride/i] },
  { i:INTENTS.RIDE_STATUS,    rx:[/\bwho\s+(joined|is\s+in)\b/i,/\bseats?\s*(left|available|remaining)/i,/\bride\s+status/i,/\bstatus\s+of\s+(my\s+)?ride/i] },
  { i:INTENTS.GREETING,       rx:[/^(hi|hello|hey|hai|hii|yo|sup|good\s*(morning|afternoon|evening))[.!]?$/i] },
  { i:INTENTS.HELP,           rx:[/\bhelp\b/i,/\bwhat\s+can\s+you\s+do/i,/\bcommands?\b/i,/\bhow\s+to\s+use/i] },
  { i:INTENTS.RULES,          rx:[/\bwhat\s+happens?\s+if\s+i\s+cancel/i,/\btrust\s*(score|penalty)/i,/\bcancel(lation)?\s+(rules?|policy)/i,/\bno.?show\s+(rules?|penalty)/i,/\bsafety\s+(rules?|tips)/i] },
  { i:INTENTS.ABOUT,          rx:[/\bwhat\s+is\s+(colony\s*carpool|this\s+(app|website))/i,/\babout\s+(this\s+)?(app|website|platform)/i,/\bhow\s+(does\s+this|it)\s+(app\s+)?work/i] },
];

// ─── STATE ────────────────────────────────────────────────────────────────────

export const STATES = {
  IDLE:'idle', FIND_COLLECTING:'find_collecting', FIND_RESULTS:'find_results',
  JOIN_CONFIRMING:'join_confirming', POST_DEST:'post_dest', POST_DATE:'post_date',
  POST_TIME:'post_time', POST_VEHICLE:'post_vehicle', POST_SEATS:'post_seats',
  POST_PRICE:'post_price', POST_CONFIRM:'post_confirm',
  LEAVE_CONFIRMING:'leave_confirming', CANCEL_CONFIRMING:'cancel_confirming',
};
export const createInitialState = () => ({
  conversationState:STATES.IDLE, findQuery:{}, findResults:[], selectedRide:null, postData:{}, myRidesCache:[],
});

// ─── INTENT DETECTION ─────────────────────────────────────────────────────────

export async function detectIntent(text, history=[]) {
  const t=(text||'').trim();
  if (!t) return { intent:INTENTS.UNKNOWN, confidence:0 };
  for (const { i, rx } of _P) for (const r of rx) if (r.test(t)) return { intent:i, confidence:0.9 };
  const q=parseRideQuery(t);
  if (q&&(q.destination||(q.dateISO&&q.time24))) return { intent:INTENTS.FIND_RIDE, confidence:0.7 };
  if (t.split(' ').length>2) {
    try {
      const { ok, answer }=await askLLM(
        `Classify into one of: find_ride,post_ride,join_ride,ride_status,stats,recommend_ride,cancel_ride,leave_ride,my_rides,rules,greeting,help,unknown\n\nMessage: "${t}"\n\nReply ONLY with the intent code.`,[],{ model:'llama-3.1-8b-instant' }
      );
      if (ok&&answer) { const v=answer.trim().toLowerCase().replace(/['"`.]/g,''); const m=Object.values(INTENTS).find(x=>x===v); if(m) return { intent:m, confidence:0.85 }; }
    } catch(e) { console.warn('[agent] intent failed:',e); }
  }
  return { intent:INTENTS.UNKNOWN, confidence:0 };
}

// ─── DATA EXTRACTION ──────────────────────────────────────────────────────────

export function extractRideDetails(text) {
  const t=(text||'').trim(), q=parseRideQuery(t)||{};
  const d={ destination:q.destination||null, date:q.dateISO||null, time:q.time24||null };
  if (!d.destination) {
    const m=t.match(/\bto\s+([A-Za-z0-9][\w\s,.-]{1,40})/i);
    if (m) { const s=m[1].replace(/\s+(on|at|around|date|time|tomorrow|today)\b.*/i,'').replace(/[.,;]+$/,'').trim(); if(s.length>=2) d.destination=s; }
  }
  if (!d.date) {
    const l=t.toLowerCase();
    if (l.includes('today')) d.date=_toISO(new Date());
    else if (l.includes('tomorrow')) { const n=new Date(); n.setDate(n.getDate()+1); d.date=_toISO(n); }
    else { const m=t.match(/(\d{4}-\d{2}-\d{2})/); if(m) d.date=m[1]; }
  }
  const l=t.toLowerCase();
  d.vehicleType=l.includes('auto')?'auto':null;
  const sm=t.match(/(\d+)\s*seats?/i); if(sm) d.seats=parseInt(sm[1]);
  const pm=t.match(/(?:price|cost|rs\.?)\s*(\d+)/i)||t.match(/(\d+)\s*(?:rupees|rs)/i); if(pm) d.price=parseInt(pm[1]);
  return d;
}

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────────

export async function agentSearchRides(db, params) {
  return (await searchRidesByQuery(db,params)).filter(r=>resolveRideStatus(r)==='open');
}
export async function agentGetMyRides(db, userId) {
  if (!userId) return [];
  try {
    const ref=collection(db,'rides');
    const [cs,js]=await Promise.all([
      getDocs(query(ref,where('driverId','==',userId))),
      getDocs(query(ref,where('passengers','array-contains',userId))),
    ]);
    const m=new Map();
    cs.docs.forEach(d=>m.set(d.id,{id:d.id,...d.data(),role:'creator'}));
    js.docs.forEach(d=>{ if(!m.has(d.id)) m.set(d.id,{id:d.id,...d.data(),role:'passenger'}); });
    return [...m.values()];
  } catch(e) { console.error('[agent] getMyRides:',e); return []; }
}
export async function agentGetDashboardStats(db, userId) {
  if (!userId) return null;
  const rides=await agentGetMyRides(db,userId);
  const now=new Date(), wk=new Date(now-7*864e5), mo=new Date(now-30*864e5);
  const inW=(r,s)=>new Date(r.createdAt?.toDate?.()||r.date)>s;
  const wr=rides.filter(r=>inW(r,wk)), mr=rides.filter(r=>inW(r,mo));
  const saved=rs=>rs.reduce((s,r)=>s+(Number(r.price)||0)/(Number(r.seats)||1),0);
  return {
    totalRides:rides.length,
    totalPosted:rides.filter(r=>r.role==='creator').length,
    totalJoined:rides.filter(r=>r.role==='passenger').length,
    savings:{ weekly:Math.round(saved(wr)), monthly:Math.round(saved(mr)), total:Math.round(saved(rides)) },
    co2:{ weekly:Math.round(wr.length*4.6), monthly:Math.round(mr.length*4.6), total:Math.round(rides.length*4.6) },
    weeklyRidesCount:wr.length,
    recentActivity:rides.sort((a,b)=>new Date(b.date+' '+b.time)-new Date(a.date+' '+a.time)).slice(0,5)
      .map(r=>({ action:r.role==='creator'?'Posted ride':'Joined ride', destination:r.destination, date:r.date, status:resolveRideStatus(r) })),
  };
}

// ─── RESPONSES ────────────────────────────────────────────────────────────────

export const RESPONSES = {
  greeting: ()=>"Hi! I'm your Ride Assistant.\n\nFind rides - Post a ride - Join - Leave/Cancel - My rides - Rules\n\nHow can I help?",
  help:     ()=>"What I can do:\n\nFind - Find rides to Koramangala\nPost - Post a ride\nJoin - Join ride #1\nLeave - Leave ride\nCancel - Cancel ride\nStatus - My rides / Who joined?\nRules - What if I cancel?",
  about:    ()=>"ColonyCarpool - Community ride-sharing for housing societies.\n\nPost/find/join rides, chat, track CO2 and savings, Leaderboard. All rides within your verified community.",
  rules:    ()=>"Rules and Trust:\n\nEarly cancel (>15 min): No penalty\nLate cancel (<15 min): -3 trust pts\nCreator cancel: Passengers notified, 3+ = -5 pts\nNo-show: -8 trust pts\n\nBadges: High 75+ / Medium 40+ / Low <40",
  askDestination: ()=>"Where to? (e.g., Koramangala, HSR Layout)",
  askDate:        ()=>"What date? (YYYY-MM-DD, today, or tomorrow)",
  askTime:        ()=>"What time? (e.g., 09:00 AM, 14:30)",
  askVehicle:     ()=>"Vehicle type?\n- Car (4 seats)\n- Auto (3 seats)",
  askSeats:       ()=>"How many seats to offer?",
  askPrice:       ()=>"Total price (Rs)?",
  noAuth:         ()=>"Please log in first.",
  noRides: dest=>`No open rides found${dest?` to "${dest}"`:''}. Try posting your own!`,
};

// ─── CONSTANTS & UTILS ────────────────────────────────────────────────────────

const VS={ car:4, auto:3 };
const VE={ car:'Car', auto:'Auto' };
const DB_INTENTS=new Set([INTENTS.FIND_RIDE,INTENTS.POST_RIDE,INTENTS.JOIN_RIDE,INTENTS.LEAVE_RIDE,INTENTS.CANCEL_RIDE,INTENTS.RIDE_STATUS,INTENTS.MY_RIDES,INTENTS.STATS,INTENTS.RECOMMEND_RIDE]);
const ESCAPE_INTENTS=new Set([INTENTS.CANCEL_RIDE,INTENTS.STATS,INTENTS.HELP,INTENTS.RULES,INTENTS.MY_RIDES,INTENTS.FIND_RIDE,INTENTS.GREETING]);
const sEmoji=s=>({open:'open',closed:'closed',completed:'done',cancelled:'cancelled'}[s]||s);
const isYes=t=>/^(yes|y|yep|yeah|sure|ok|confirm|go|proceed|absolutely)\b/i.test(t.trim());
const isNo =t=>/^(no|n|nope|nah|cancel|stop|never|don.?t)\b/i.test(t.trim());
const mk=(text,extras={})=>({type:'text',text,...extras});
const QA=[{label:'Find Rides',action:'find_ride'},{label:'Post Ride',action:'post_ride'},{label:'My Rides',action:'my_rides'}];

// ─── ROUTING & LLM HANDLER ────────────────────────────────────────────────────

export const routeIntent=intent=>DB_INTENTS.has(intent)?'database':'llm';

export async function handleLLMIntent(intent, text, history=[]) {
  if (intent===INTENTS.GREETING) return mk(RESPONSES.greeting());
  if (intent===INTENTS.HELP)     return mk(RESPONSES.help(),{ quickActions:QA });
  if (intent===INTENTS.RULES)    return mk(RESPONSES.rules());
  if (intent===INTENTS.ABOUT)    return mk(RESPONSES.about());
  try { const { ok, answer }=await askLLM(text,history.slice(-6)); if(ok&&answer) return mk(answer); } catch(e) {}
  return mk("Not sure how to help with that. Try: Find rides, Post a ride, My rides");
}

// ─── DATABASE HANDLER ─────────────────────────────────────────────────────────

export async function handleDatabaseIntent(intent, text, userId, db, auth, userName, state, history=[]) {
  if (!userId) return { result:mk(RESPONSES.noAuth()), newState:state };

  switch (intent) {
    case INTENTS.FIND_RIDE: {
      const d=extractRideDetails(text);
      if (!d.destination) return { result:mk(RESPONSES.askDestination()), newState:{...state,conversationState:STATES.FIND_COLLECTING,findQuery:{...d}} };
      return _search(db,{ destination:d.destination, dateISO:d.date||null, time24:d.time||null, timeWindowMinutes:30 },state);
    }

    case INTENTS.POST_RIDE: {
      const d=extractRideDetails(text);
      if (d.destination&&d.date&&d.time) {
        const pd={ destination:d.destination, date:d.date, time:d.time, vehicleType:d.vehicleType||'car', seats:d.seats||VS[d.vehicleType||'car'], price:d.price||0 };
        return { result:_postConfirm(pd), newState:{...state,postData:pd,conversationState:STATES.POST_CONFIRM} };
      }
      if (!d.destination) return { result:mk("Let's post a ride!\n\n"+RESPONSES.askDestination()), newState:{...state,conversationState:STATES.POST_DEST,postData:d} };
      if (!d.date)        return { result:mk(`Destination: ${d.destination}\n\n`+RESPONSES.askDate()), newState:{...state,conversationState:STATES.POST_DATE,postData:d} };
      if (!d.time)        return { result:mk(RESPONSES.askTime()), newState:{...state,conversationState:STATES.POST_TIME,postData:d} };
      return { result:mk(RESPONSES.askVehicle(),{quickActions:[{label:'Car',action:'vehicle_car'},{label:'Auto',action:'vehicle_auto'}]}), newState:{...state,conversationState:STATES.POST_VEHICLE,postData:d} };
    }

    case INTENTS.JOIN_RIDE: {
      const { findResults }=state, idx=(text.match(/#?(\d+)/)||[])[1], i=idx?parseInt(idx)-1:-1;
      if (!findResults.length) return { result:mk("No results yet. "+RESPONSES.askDestination()), newState:{...state,conversationState:STATES.FIND_COLLECTING,findQuery:{}} };
      if (findResults.length===1||(i>=0&&i<findResults.length)) return _joinConfirm(findResults[Math.max(i,0)],userId,state);
      return { result:mk(`Which ride? Say "Join ride #1" to "#${Math.min(findResults.length,5)}".`), newState:state };
    }

    case INTENTS.LEAVE_RIDE: {
      const rides=(await agentGetMyRides(db,userId)).filter(r=>r.role==='passenger'&&resolveRideStatus(r)==='open');
      if (!rides.length) return { result:mk("No active rides to leave."), newState:{...state,conversationState:STATES.IDLE} };
      if (rides.length===1) {
        const r=rides[0];
        return { result:mk(`Leave ride to ${r.destination}?\n${r.date} - ${r.time||'Flex'}\nNote: Late cancel = -3 trust pts\n\nReply yes or no`,{quickActions:[{label:'Yes, Leave',action:'confirm_leave'},{label:'No, Stay',action:'cancel_action'}]}), newState:{...state,conversationState:STATES.LEAVE_CONFIRMING,selectedRide:r} };
      }
      return { result:mk(`Your joined rides:\n${rides.slice(0,5).map((r,i)=>`#${i+1} ${r.destination} - ${r.date}`).join('\n')}\n\nSay "leave #1" etc.`), newState:{...state,findResults:rides,conversationState:STATES.LEAVE_CONFIRMING} };
    }

    case INTENTS.CANCEL_RIDE: {
      const rides=(await agentGetMyRides(db,userId)).filter(r=>r.role==='creator'&&['open','closed'].includes(resolveRideStatus(r)));
      if (!rides.length) return { result:mk("No active rides to cancel."), newState:{...state,conversationState:STATES.IDLE} };
      if (rides.length===1) {
        const r=rides[0], pc=getParticipantIds(r).filter(id=>id!==userId).length;
        return { result:mk(`Cancel ride to ${r.destination}?\n${r.date} - ${pc} passenger${pc!==1?'s':''}\nNote: 3+ cancels = -5 trust pts\n\nReply yes or no`,{quickActions:[{label:'Yes, Cancel',action:'confirm_cancel'},{label:'Keep It',action:'cancel_action'}]}), newState:{...state,conversationState:STATES.CANCEL_CONFIRMING,selectedRide:r} };
      }
      return { result:mk(`Your rides:\n${rides.slice(0,5).map((r,i)=>`#${i+1} ${r.destination} - ${r.date}`).join('\n')}\n\nSay "cancel #1" etc.`), newState:{...state,findResults:rides,conversationState:STATES.CANCEL_CONFIRMING} };
    }

    case INTENTS.RIDE_STATUS: {
      const rides=(await agentGetMyRides(db,userId)).filter(r=>['open','closed'].includes(resolveRideStatus(r)));
      if (!rides.length) return { result:mk("No active rides."), newState:{...state,conversationState:STATES.IDLE} };
      const r=rides[0], ids=getParticipantIds(r), tot=Number(r.totalSeats||r.seats)||1, av=r.availableSeats!=null?Number(r.availableSeats):tot-ids.length;
      return { result:mk(`${r.destination} - ${sEmoji(resolveRideStatus(r))}\n${r.date} - ${r.time||'Flex'} - Driver: ${r.driverName||'Unknown'}\n${ids.length}/${tot} filled (${av} left) - Rs${Number(r.price||0)}`), newState:{...state,conversationState:STATES.IDLE} };
    }

    case INTENTS.MY_RIDES: {
      const rides=await agentGetMyRides(db,userId);
      if (!rides.length) return { result:mk("No rides yet.",{quickActions:QA}), newState:{...state,conversationState:STATES.IDLE} };
      const lines=rides.slice(0,6).map((r,i)=>{
        const st=resolveRideStatus(r),ids=getParticipantIds(r),tot=Number(r.totalSeats||r.seats)||1,av=r.availableSeats!=null?Number(r.availableSeats):tot-ids.length;
        return `#${i+1} [${sEmoji(st)}] ${r.destination} - ${r.role==='creator'?'Driver':'Passenger'} - ${r.date} - ${av}/${tot} seats - Rs${Number(r.price||0)}`;
      }).join('\n\n');
      return { result:mk(`Your Rides (${rides.length})\n\n${lines}`), newState:{...state,conversationState:STATES.IDLE} };
    }

    case INTENTS.STATS: {
      const s=await agentGetDashboardStats(db,userId);
      const act=s.recentActivity.map(r=>`- ${r.action}: "${r.destination}" on ${r.date} (${r.status})`).join('\n');
      try {
        const { ok, answer }=await askLLM(`User asked: "${text}"\n\nContext Data:\nPosted:${s.totalPosted} Joined:${s.totalJoined} Total:${s.totalRides}\nSaved:Rs${s.savings.total} (Weekly Rs${s.savings.weekly}) CO2:${s.co2.total}kg (Weekly ${s.co2.weekly}kg)\nRecent:\n${act||'None'}\n\nAnswer ONLY from this data.`,[]);
        if (ok&&answer) return { result:mk(answer), newState:{...state,conversationState:STATES.IDLE} };
      } catch(e) {}
      return { result:mk(`Stats: ${s.totalRides} rides - Rs${s.savings.total} saved - ${s.co2.total}kg CO2`), newState:{...state,conversationState:STATES.IDLE} };
    }

    case INTENTS.RECOMMEND_RIDE: {
      const all=await agentSearchRides(db,{});
      const top=(await getRecommendedRides(db,all,{userId})).map(s=>s.ride);
      if (!top.length) return { result:mk("No recommendations right now.",{quickActions:[{label:'Post Ride',action:'post_ride'}]}), newState:{...state,conversationState:STATES.IDLE} };
      return { result:mk(`Top pick: ${top[0].destination} by ${top[0].driverName||'Unknown'}`,{type:'ride-results',rides:top.slice(0,4)}), newState:{...state,findResults:top,conversationState:STATES.FIND_RESULTS} };
    }

    default: return { result:mk("Unknown intent."), newState:state };
  }
}

// ─── FLOW STEP HANDLER ────────────────────────────────────────────────────────

export async function handleFlowStep(text, userId, db, auth, userName, state) {
  const { conversationState:cs, selectedRide, postData, findResults }=state;
  const low=text.toLowerCase().trim();

  if (/^(cancel|stop|quit|abort|exit|back|no thanks)\b/i.test(low))
    return { result:mk("Cancelled. What else?",{quickActions:QA}), newState:createInitialState() };

  const confirmStates=[STATES.JOIN_CONFIRMING,STATES.POST_CONFIRM,STATES.LEAVE_CONFIRMING,STATES.CANCEL_CONFIRMING];
  if (confirmStates.includes(cs)) {
    if (isNo(text))  return { result:mk("Cancelled.",{quickActions:QA}), newState:createInitialState() };
    if (isYes(text)) {
      if (cs===STATES.JOIN_CONFIRMING   &&selectedRide) return _doJoin(db,auth,selectedRide,userId,userName);
      if (cs===STATES.POST_CONFIRM)                     return _doPost(db,auth,postData,userName);
      if (cs===STATES.LEAVE_CONFIRMING  &&selectedRide) return _doLeave(db,auth,selectedRide,userName);
      if (cs===STATES.CANCEL_CONFIRMING &&selectedRide) return _doCancel(db,auth,selectedRide,userName);
    }
    const m=text.match(/#?(\d+)/);
    if (m&&findResults.length) {
      const ride=findResults[parseInt(m[1])-1];
      if (ride) {
        if (cs===STATES.LEAVE_CONFIRMING)  return { result:mk(`Leave ride to ${ride.destination}?\nNote: Late = -3 pts - Reply yes or no`,{quickActions:[{label:'Yes, Leave',action:'confirm_leave'},{label:'No, Stay',action:'cancel_action'}]}), newState:{...state,selectedRide:ride} };
        if (cs===STATES.CANCEL_CONFIRMING) return { result:mk(`Cancel ride to ${ride.destination}?\nNote: 3+ cancels = -5 pts - Reply yes or no`,{quickActions:[{label:'Yes, Cancel',action:'confirm_cancel'},{label:'Keep It',action:'cancel_action'}]}), newState:{...state,selectedRide:ride} };
      }
    }
    return null;
  }

  const postStates=[STATES.POST_DEST,STATES.POST_DATE,STATES.POST_TIME,STATES.POST_VEHICLE,STATES.POST_SEATS,STATES.POST_PRICE];
  if (postStates.includes(cs)) return _postStep(text,low,cs,postData,state);

  if (cs===STATES.FIND_COLLECTING) {
    const d=extractRideDetails(text);
    return _search(db,{ destination:d.destination||text.trim(), dateISO:d.date||state.findQuery.date||null, time24:d.time||state.findQuery.time||null, timeWindowMinutes:30 },state);
  }

  if (cs===STATES.FIND_RESULTS) {
    const m=text.match(/#?(\d+)/);
    if ((m||/join/i.test(text))&&findResults.length) {
      const i=m?parseInt(m[1])-1:0;
      if (i>=0&&i<findResults.length) return _joinConfirm(findResults[i],userId,state);
      if (findResults.length===1) return _joinConfirm(findResults[0],userId,state);
    }
  }

  return null;
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

export async function handleUserMessage(text, userId, db, auth, userName, state, history=[]) {
  const t=(text||'').trim();
  if (!t) return { result:mk(''), newState:state };

  if (/\bam\s+i\s+(logged|signed)\s+in\b|\bwho\s+am\s+i\b|\bmy\s+account\b/i.test(t))
    return { result:mk(`Logged in as ${userName||'User'}!`,{quickActions:QA}), newState:state };

  let cur=state;
  if (cur.conversationState!==STATES.IDLE) {
    const { intent }=await detectIntent(t,history);
    if (ESCAPE_INTENTS.has(intent)) cur=createInitialState();
    else { const r=await handleFlowStep(t,userId,db,auth,userName,cur); if(r) return r; }
  }

  const { intent }=await detectIntent(t,history);
  if (routeIntent(intent)==='database') return handleDatabaseIntent(intent,t,userId,db,auth,userName,cur,history);
  return { result:await handleLLMIntent(intent,t,history), newState:cur };
}

// ─── PRIVATE HELPERS ──────────────────────────────────────────────────────────

async function _search(db, params, state) {
  try {
    const r=await agentSearchRides(db,params);
    if (!r.length) return { result:mk(RESPONSES.noRides(params.destination)+"\n\nWant to post instead?",{quickActions:[{label:'Post Ride',action:'post_ride'}]}), newState:createInitialState() };
    return {
      result:mk(`Found ${r.length} ride${r.length>1?'s':''} to "${params.destination}"${params.dateISO?' on '+params.dateISO:''}.\nTap Join or say "Join ride #1".`,{type:'ride-results',rides:r.slice(0,5)}),
      newState:{...state,conversationState:STATES.FIND_RESULTS,findResults:r,findQuery:params},
    };
  } catch(e) { return { result:mk(`Search error: ${e.message}`), newState:createInitialState() }; }
}

function _joinConfirm(ride, userId, state) {
  const st=resolveRideStatus(ride), ids=getParticipantIds(ride), tot=Number(ride.totalSeats||ride.seats)||1, av=ride.availableSeats!=null?Number(ride.availableSeats):tot-ids.length;
  if (ids.includes(userId))    return { result:mk("Already in this ride!"), newState:createInitialState() };
  if (ride.driverId===userId)  return { result:mk("This is your own ride."), newState:createInitialState() };
  if (st!=='open')             return { result:mk(`Ride is ${st}.`), newState:createInitialState() };
  if (av<=0)                   return { result:mk("No seats left."), newState:state };
  return {
    result:mk(`Join this ride?\n${ride.destination} - ${ride.date} - ${ride.time||'Flex'}\nDriver: ${ride.driverName||'Unknown'} - ${av} seat${av!==1?'s':''} left - Rs${Number(ride.price||0)}\n\nReply yes or no`,{quickActions:[{label:'Yes, Join!',action:'confirm_join'},{label:'No',action:'cancel_action'}]}),
    newState:{...state,conversationState:STATES.JOIN_CONFIRMING,selectedRide:ride},
  };
}

function _postConfirm(d) {
  return mk(
    `Confirm Ride\n${d.destination}\n${d.date}\n${d.time}\n${VE[d.vehicleType]||'Car'} - ${d.seats||VS[d.vehicleType]||4} seats - Rs${d.price||0}\n\nReply yes or no`,
    {quickActions:[{label:'Yes, Post!',action:'confirm_post'},{label:'Cancel',action:'cancel_action'}]}
  );
}

async function _doJoin(db, auth, ride, userId, userName) {
  try {
    const r=await joinRideById(db,auth,ride,userName);
    return r.ok
      ? { result:mk(`Joined ${ride.destination} on ${ride.date}! (${r.availableSeats} seats left)`,{quickActions:[{label:'My Rides',action:'my_rides'}]}), newState:createInitialState() }
      : { result:mk(`Could not join: ${r.message}`), newState:createInitialState() };
  } catch(e) { return { result:mk(`Error: ${e.message}`), newState:createInitialState() }; }
}

async function _doPost(db, auth, data, userName) {
  try {
    const r=await createRideFromPrompt(db,auth,`post ride to ${data.destination} on ${data.date} at ${data.time}, seats ${data.seats||4}, price ${data.price||0}, ${data.vehicleType||'car'}`,userName);
    return r.ok
      ? { result:mk(`Ride posted! ${r.ride.destination} - ${r.ride.date} - Rs${r.ride.price}`,{quickActions:[{label:'My Rides',action:'my_rides'}]}), newState:createInitialState() }
      : { result:mk(`Could not post ride: ${r.message}`), newState:createInitialState() };
  } catch(e) { return { result:mk(`Error posting ride: ${e.message}`), newState:createInitialState() }; }
}

async function _doLeave(db, auth, ride, userName) {
  try {
    const r=await leaveRide(db,auth,ride,userName);
    return r.ok
      ? { result:mk(`Left ${ride.destination}.${r.cancelType==='late'?' Note: Late cancel, trust penalty applied.':''} Driver notified.`), newState:createInitialState() }
      : { result:mk(r.message), newState:createInitialState() };
  } catch(e) { return { result:mk(`Error: ${e.message}`), newState:createInitialState() }; }
}

async function _doCancel(db, auth, ride, userName) {
  try {
    const r=await cancelRideByCreator(db,auth,ride,userName);
    return r.ok
      ? { result:mk(`${ride.destination} cancelled. Passengers notified.`), newState:createInitialState() }
      : { result:mk(r.message), newState:createInitialState() };
  } catch(e) { return { result:mk(`Error: ${e.message}`), newState:createInitialState() }; }
}

function _postStep(text, low, cs, postData, state) {
  switch (cs) {
    case STATES.POST_DEST: {
      const u={...postData,destination:text.trim()};
      return { result:mk(`Destination: ${u.destination}\n\n`+RESPONSES.askDate()), newState:{...state,postData:u,conversationState:STATES.POST_DATE} };
    }
    case STATES.POST_DATE: {
      const n=new Date(); n.setDate(n.getDate()+1);
      const date=low.includes('today')?_toISO(new Date()):low.includes('tomorrow')?_toISO(n):text.trim();
      const u={...postData,date};
      return { result:mk(`Date: ${date}\n\n`+RESPONSES.askTime()), newState:{...state,postData:u,conversationState:STATES.POST_TIME} };
    }
    case STATES.POST_TIME: {
      const time=extractRideDetails(`at ${text}`).time||text.trim(), u={...postData,time};
      return { result:mk(`Time: ${time}\n\n`+RESPONSES.askVehicle(),{quickActions:[{label:'Car',action:'vehicle_car'},{label:'Auto',action:'vehicle_auto'}]}), newState:{...state,postData:u,conversationState:STATES.POST_VEHICLE} };
    }
    case STATES.POST_VEHICLE: {
      const v=low.includes('auto')?'auto':'car', u={...postData,vehicleType:v,seats:VS[v]};
      return { result:mk(`Vehicle: ${VE[v]}\n\n`+RESPONSES.askSeats()), newState:{...state,postData:u,conversationState:STATES.POST_SEATS} };
    }
    case STATES.POST_SEATS: {
      const u={...postData,seats:parseInt(text)||VS[postData.vehicleType||'car']};
      return { result:mk(`Seats: ${u.seats}\n\n`+RESPONSES.askPrice()), newState:{...state,postData:u,conversationState:STATES.POST_PRICE} };
    }
    case STATES.POST_PRICE: {
      const u={...postData,price:parseInt(text.replace(/[^0-9]/g,''))||0};
      return { result:_postConfirm(u), newState:{...state,postData:u,conversationState:STATES.POST_CONFIRM} };
    }
    default: return null;
  }
}