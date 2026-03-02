

import { doc, getDoc } from 'firebase/firestore';
import { resolveRideStatus, getParticipantIds } from './rideActionService';

/* ────────────── Configurable weights (sum = 1.0) ────────────── */

const W_DESTINATION  = 0.35;
const W_TIME         = 0.25;
const W_RELIABILITY  = 0.25;
const W_SEATS        = 0.15;

/* ────────────── Configurable defaults ────────────── */

const DEFAULT_TIME_WINDOW_MIN = 60;   // minutes either side
const RECOMMEND_MIN_SCORE     = 40;   // minimum composite score (0-100) to tag as recommended
const MAX_RESULTS             = 8;

/* ═══════════════════════════════════════════════════════════════
 *  Text similarity helpers
 * ═══════════════════════════════════════════════════════════════ */

/** Tokenise a string into lowercase alpha-numeric tokens (≥ 2 chars) */
function tokenise(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

/** Simple Jaccard-like token similarity (0-1) */
function tokenSimilarity(a, b) {
  const tA = new Set(tokenise(a));
  const tB = new Set(tokenise(b));
  if (tA.size === 0 && tB.size === 0) return 1;
  if (tA.size === 0 || tB.size === 0) return 0;
  let inter = 0;
  for (const t of tA) if (tB.has(t)) inter++;
  const union = new Set([...tA, ...tB]).size;
  return inter / union;
}

/** Substring / contains bonus */
function substringBonus(query, target) {
  const q = (query || '').toLowerCase().trim();
  const t = (target || '').toLowerCase().trim();
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.includes(q) || q.includes(t)) return 0.85;
  return 0;
}

/** Combined destination score (0-100) */
function destinationScore(queryDest, rideDest) {
  const sub = substringBonus(queryDest, rideDest);
  const tok = tokenSimilarity(queryDest, rideDest);
  return Math.min(100, Math.round(Math.max(sub, tok) * 100));
}

/* ═══════════════════════════════════════════════════════════════
 *  Time proximity scoring
 * ═══════════════════════════════════════════════════════════════ */

function toMinutes(time24) {
  if (!time24) return null;
  const [h, m] = time24.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Score 0-100.  0 = outside window, 100 = exact match */
function timeScore(preferredTime24, rideTime24, windowMin = DEFAULT_TIME_WINDOW_MIN) {
  const pref = toMinutes(preferredTime24);
  const ride = toMinutes(rideTime24);
  if (pref === null || ride === null) return 50; // neutral when no time preference
  const diff = Math.abs(pref - ride);
  if (diff > windowMin) return 0;
  return Math.round((1 - diff / windowMin) * 100);
}

/* ═══════════════════════════════════════════════════════════════
 *  Reliability score factor
 * ═══════════════════════════════════════════════════════════════ */

/** Returns 0-100 (from stored reliabilityScore or default 70) */
async function fetchReliabilityScore(db, driverId) {
  if (!driverId) return 50;
  try {
    const snap = await getDoc(doc(db, 'users', driverId));
    if (!snap.exists()) return 50;
    const d = snap.data();
    return Number(d.reliabilityScore ?? 70);
  } catch {
    return 50;
  }
}

/* ═══════════════════════════════════════════════════════════════
 *  Seat availability factor
 * ═══════════════════════════════════════════════════════════════ */

function seatScore(ride) {
  const totalSeats = Number(ride.totalSeats || ride.seats) || 1;
  const pIds = getParticipantIds(ride);
  const available = ride.availableSeats != null ? Number(ride.availableSeats) : (totalSeats - pIds.length);
  if (available <= 0) return 0;
  // More available seats = slightly better (but even 1 seat is fine)
  return Math.round(Math.min(100, (available / totalSeats) * 100));
}


export async function getRecommendedRides(db, allRides, userPrefs = {}) {
  const {
    destination = '',
    time24 = null,
    timeWindowMin = DEFAULT_TIME_WINDOW_MIN,
    minReliability = null,
    userId = null,
    community = null,
  } = userPrefs;

  const now = new Date();

  // --- Step 1: Pre-filter to eligible rides ---
  const eligible = allRides.filter(ride => {
    const status = resolveRideStatus(ride);
    if (status !== 'open') return false;                          // only open
    if (userId && (ride.driverId === userId || ride.createdBy === userId)) return false; // not own
    const pIds = getParticipantIds(ride);
    if (userId && pIds.includes(userId)) return false;            // already joined
    const totalSeats = Number(ride.totalSeats || ride.seats) || 1;
    const avail = ride.availableSeats != null ? Number(ride.availableSeats) : (totalSeats - pIds.length);
    if (avail <= 0) return false;                                 // no seats
    // Must be in the future
    try {
      const dt = new Date(`${ride.date || ''}T${ride.time || '00:00'}:00`);
      if (dt <= now) return false;
    } catch { /* keep rides with unparseable dates */ }
    // Community filter (optional — soft: if provided, prefer same community)
    // We don't hard-filter; we'll give a small bonus later
    return true;
  });

  // --- Step 2: Score each ride ---
  const scored = await Promise.all(
    eligible.map(async (ride) => {
      const dScore = destination ? destinationScore(destination, ride.destination) : 50;
      const tScore = timeScore(time24, ride.time, timeWindowMin);
      const rScore = await fetchReliabilityScore(db, ride.driverId || ride.createdBy);
      const sScore = seatScore(ride);

      // Community bonus: +8 if same community
      const communityBonus = (community && ride.community && ride.community.toLowerCase() === community.toLowerCase()) ? 8 : 0;

      const composite = Math.round(
        W_DESTINATION * dScore +
        W_TIME        * tScore +
        W_RELIABILITY * rScore +
        W_SEATS       * sScore +
        communityBonus
      );

      return {
        ride,
        compositeScore: Math.min(100, composite),
        factors: { destination: dScore, time: tScore, reliability: rScore, seats: sScore, communityBonus },
        recommended: composite >= RECOMMEND_MIN_SCORE,
      };
    })
  );

  // --- Step 3: Apply minimum reliability filter if specified ---
  let results = scored;
  if (minReliability != null) {
    results = results.filter(r => r.factors.reliability >= minReliability);
  }

  // If a destination was given, require at least some match
  if (destination) {
    results = results.filter(r => r.factors.destination >= 15);
  }

  // --- Step 4: Sort descending by composite score ---
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  return results.slice(0, MAX_RESULTS);
}


export async function getQuickRecommendations(db, allRides, { userId, community, recentDestinations = [] }) {
  // If user has recent destinations, recommend rides to those places
  // Otherwise just return soonest open rides in community with reliability ranking

  if (recentDestinations.length > 0) {
    // Score against each recent destination, take best
    const all = [];
    for (const dest of recentDestinations.slice(0, 3)) {
      const recs = await getRecommendedRides(db, allRides, { destination: dest, userId, community });
      all.push(...recs);
    }
    // Deduplicate by ride id, keep highest score
    const map = new Map();
    for (const r of all) {
      const existing = map.get(r.ride.id);
      if (!existing || r.compositeScore > existing.compositeScore) map.set(r.ride.id, r);
    }
    const deduped = [...map.values()].sort((a, b) => b.compositeScore - a.compositeScore);
    return deduped.slice(0, 5);
  }

  // Fallback: just rank by reliability + time proximity (no specific destination)
  return getRecommendedRides(db, allRides, { userId, community });
}

/* ═══════════════════════════════════════════════════════════════
 *  Constants exported for UI usage
 * ═══════════════════════════════════════════════════════════════ */

export { RECOMMEND_MIN_SCORE, DEFAULT_TIME_WINDOW_MIN };
