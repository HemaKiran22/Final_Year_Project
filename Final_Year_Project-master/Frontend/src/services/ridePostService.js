import { addDoc, collection } from 'firebase/firestore';
import { parseRideQuery } from './nlpAgent';

function yyyyMmDd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseRelativeDate(text) {
  const low = text.toLowerCase();
  const now = new Date();
  if (low.includes('tomorrow')) {
    const dt = new Date(now);
    dt.setDate(now.getDate() + 1);
    return yyyyMmDd(dt);
  }
  if (low.includes('today')) {
    return yyyyMmDd(now);
  }
  return null;
}

function refineDestination(destRaw, fullText) {
  if (!destRaw) return null;
  const cutWords = [' on ', ' at ', ' with ', ' seats', ' seat', ' price', ' cost', ' auto', ' car', ' community'];
  let dest = destRaw.trim();
  const low = fullText.toLowerCase();
  for (const kw of cutWords) {
    const idx = dest.toLowerCase().indexOf(kw);
    if (idx > 0) {
      dest = dest.substring(0, idx).trim();
      break;
    }
  }
  // Clean trailing punctuation
  dest = dest.replace(/[.,;]+$/,'').trim();
  return dest;
}

function parsePostText(text) {
  const t = String(text || '').trim();
  const low = t.toLowerCase();
  const intent = low.includes('post ride') || low.includes('create ride') || low.includes('add ride') || low.includes('post a ride');
  if (!intent) return null;

  const destinationMatch = t.match(/to\s+([A-Za-z0-9 ,.-]+)/i) || t.match(/destination\s*[:=]\s*([^\n]+)/i);
  const dateMatch = t.match(/(\d{4}-\d{2}-\d{2})/) || t.match(/date\s*[:=]\s*(\d{4}-\d{2}-\d{2})/i);
  const timeMatch = t.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i) || t.match(/time\s*[:=]\s*([0-9:apm ]+)/i) || t.match(/(\d{1,2})\s*o\s*'?clock\b/i);
  const seatsMatch = t.match(/seats?\s*[:=]?\s*(\d+)/i);
  const priceMatch = t.match(/price\s*[:=]?\s*(\d+)/i) || t.match(/(?:₹|rs\.?|rupees)\s*(\d+)/i);
  const vehicleMatch = (low.includes('auto') ? 'auto' : (low.includes('car') ? 'car' : null));
  const communityMatch = t.match(/community\s*[:=]\s*([^\n]+)/i);

  let destination = destinationMatch ? refineDestination(destinationMatch[1], t) : null;
  let date = dateMatch ? dateMatch[1].trim() : (parseRelativeDate(t) || null);
  let time;
  if (timeMatch) {
    const raw = timeMatch[1];
    if (/o\s*'?clock/i.test(timeMatch[0])) {
      const hour = Number(raw);
      const contextPM = /(pm|evening|night)/i.test(t);
      const h24 = contextPM ? (hour % 12) + 12 : (hour % 12);
      time = `${String(h24).padStart(2,'0')}:00`;
    } else {
      time = String(raw).trim().toUpperCase();
    }
  } else {
    time = null;
  }
  const seats = seatsMatch ? Number(seatsMatch[1]) : 1;
  const price = priceMatch ? Number(priceMatch[1]) : 0;
  const vehicleType = vehicleMatch || 'car';
  const community = communityMatch ? communityMatch[1].trim() : '';

  // Use NLP agent for better destination/date/time if available
  const q = parseRideQuery(t);
  destination = (q && q.destination) ? q.destination : destination;
  date = (q && q.dateISO) ? q.dateISO : date;
  time = (q && q.time24) ? q.time24 : time;

  return { intent: true, destination, date, time, seats, price, vehicleType, community };
}

export async function createRideFromPrompt(db, auth, text, userName) {
  const parsed = parsePostText(text);
  if (!parsed) return { ok: false, message: 'No post ride intent detected.' };
  const { destination, date, time, seats, price, vehicleType, community } = parsed;

  const user = auth?.currentUser;
  if (!user) return { ok: false, message: 'You must be logged in to post a ride.' };
  if (!destination || !date || !time) {
    const missing = [!destination ? 'destination' : null, !date ? 'date' : null, !time ? 'time' : null].filter(Boolean).join(', ');
    return { ok: false, message: `Missing ${missing}. Provide like: 'post ride to Kumbalagodu on 2026-01-03 at 12:00, seats 3, price 120, car'` };
  }

  try {
    const docRef = await addDoc(collection(db, 'rides'), {
      from: 'Brigade',
      destination,
      date,
      time,
      vehicleType,
      seats: Number(seats || 1),
      price: Number(price || 0),
      community: community || '',
      driverName: userName || user.email || 'Driver',
      driverId: user.uid,
      createdAt: new Date(),
      isCompleted: false,
      status: 'Pending',
      passengers: [],
    });
    return { ok: true, id: docRef.id, ride: { id: docRef.id, destination, date, time, seats, price, vehicleType, community } };
  } catch (e) {
    return { ok: false, message: e?.message || 'Failed to post ride.' };
  }
}
