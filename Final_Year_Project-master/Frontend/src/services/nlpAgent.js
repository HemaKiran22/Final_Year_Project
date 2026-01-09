// Simple NLP agent for ride queries
// Extracts destination, date, time, and min driver rating

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseRelativeDate(textLower) {
  const now = new Date();
  if (textLower.includes('tomorrow')) {
    const t = new Date(now);
    t.setDate(now.getDate() + 1);
    return toISODate(t);
  }
  if (textLower.includes('today')) {
    return toISODate(now);
  }
  return null;
}

function parseTime(textLower) {
  // Remove date substrings to avoid misreading years as times
  let cleaned = textLower
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, ' ');

  // Prefer patterns with am/pm or explicit minutes first
  const patterns = [
    /\b(?:around\s+|at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)\b/i,
    /\b(?:around\s+|at\s+)?(\d{1,2})\s*(am|pm)\b/i,
    /\b(?:around\s+|at\s+)?(\d{1,2}):(\d{2})\b/,
    /\b(?:around\s+|at\s+)?(\d{1,2})\b/,
  ];

  for (const re of patterns) {
    const m = cleaned.match(re);
    if (!m) continue;
    let hour = parseInt(m[1], 10);
    let minute = 0;
    let ampm = null;
    if (m[2] && /\d{2}/.test(m[2]) && !/(am|pm)/i.test(m[2])) {
      minute = parseInt(m[2], 10);
      ampm = m[3] || null;
    } else if (m[2] && /(am|pm)/i.test(m[2])) {
      ampm = m[2];
    }

    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hour < 12) hour += 12;
      if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
    } else {
      // Use context words to infer AM/PM
      if (cleaned.includes('evening') || cleaned.includes('night') || cleaned.includes('pm')) {
        if (hour < 12) hour += 12;
      } else if (cleaned.includes('afternoon')) {
        if (hour < 12) hour += 12;
      } else if (hour === 12 && (cleaned.includes('morning') || cleaned.includes('am'))) {
        hour = 0;
      }
    }

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseAbsoluteDate(textLower) {
  // ISO yyyy-mm-dd
  const iso = textLower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, '0');
    const d = iso[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = textLower.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    let yy = dmy[3];
    if (yy.length === 2) yy = (yy >= '70' ? '19' : '20') + yy; // simple pivot
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}

function parseDestination(text) {
  // Capture destination after "to" stopping before date/time keywords
  const lower = text.toLowerCase();
  const toIdx = lower.indexOf(' to ');
  if (toIdx === -1) return null;
  const after = text.slice(toIdx + 4);
  const afterLower = lower.slice(toIdx + 4);

  // Cut at explicit date tokens and common separators
  const stopWords = [' on ', ' tomorrow', ' today', ' around', ' at ', ' by ', ' near', ' morning', ' evening', ' night', '.', ',', ' and ', ' with ', ' where '];
  let end = after.length;
  for (const sw of stopWords) {
    const i = afterLower.indexOf(sw);
    if (i !== -1) end = Math.min(end, i);
  }
  // Also cut if an absolute date appears
  const dateMatches = [
    /(\d{4}-\d{1,2}-\d{1,2})/,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/
  ];
  for (const re of dateMatches) {
    const m = afterLower.match(re);
    if (m && m.index != null) end = Math.min(end, m.index);
  }

  let dest = after.slice(0, end).trim();
  // Trim trailing prepositions accidentally captured
  dest = dest.replace(/\b(on|at|around|by|near)$/i, '').trim();
  // Trim leading determiners
  dest = dest.replace(/^the\s+/i, '').replace(/^a\s+/i, '').replace(/^an\s+/i, '');

  if (!dest) return null;
  // Normalize capitalization word-by-word
  dest = dest.split(/\s+/).map(w => w.length ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  return dest;
}

function parseMinRating(textLower) {
  // "5-star", "5 star", "five star"
  if (/5\s*[- ]?\s*star/.test(textLower) || textLower.includes('five star')) {
    return 5;
  }
  // also accept phrases like "4+ star"
  const m = textLower.match(/(\d)\s*\+?\s*star/);
  if (m) return parseInt(m[1], 10);
  return null;
}

const AUTO_BOOK = String(import.meta.env?.VITE_AUTO_BOOK || '').toLowerCase();

function detectAction(textLower) {
  // Treat question-style prompts as search-only
  const isQuestionLike = (
    textLower.endsWith('?') ||
    textLower.startsWith('is ') ||
    textLower.startsWith('are ') ||
    textLower.includes('is anyone') ||
    textLower.includes('anyone going') ||
    textLower.includes('any rides') ||
    textLower.includes('any ride')
  );
  if (isQuestionLike) return 'search';

  // Explicit "no booking" or list-only phrases
  if (
    textLower.includes("don't book") ||
    textLower.includes('do not book') ||
    textLower.includes('only show') ||
    textLower.includes('just show') ||
    textLower.includes('search') ||
    textLower.includes('find') ||
    textLower.includes('show me')
  ) {
    return 'search';
  }

  // Booking intents (explicit commands only)
  if (
    textLower.includes('book') ||
    textLower.includes('auto-book') ||
    textLower.includes('autobook') ||
    textLower.includes('join') ||
    textLower.includes('reserve') ||
    textLower.includes('add me')
  ) {
    return 'book';
  }

  // Do NOT force booking by default; respect explicit commands.
  // If you want booking-by-default, set VITE_AUTO_BOOK=true, but only if not a question.
  if (
    (AUTO_BOOK === 'true' || AUTO_BOOK === '1' || AUTO_BOOK === 'yes') &&
    !isQuestionLike
  ) {
    return 'book';
  }

  // Default to search for safety
  return 'search';
}

export function parseRideQuery(text) {
  const textLower = text.toLowerCase();
  const action = detectAction(textLower);
  const destination = parseDestination(text);
  const dateISO = parseAbsoluteDate(textLower) || parseRelativeDate(textLower);
  const time24 = parseTime(textLower);
  const minDriverRating = parseMinRating(textLower);
  const timeWindowMinutes = 30; // default tolerance

  if (!destination && !dateISO && !time24) {
    return null; // not a ride intent we can act on
  }

  return {
    action,
    destination,
    dateISO,
    time24,
    timeWindowMinutes,
    minDriverRating: minDriverRating ?? null,
  };
}
