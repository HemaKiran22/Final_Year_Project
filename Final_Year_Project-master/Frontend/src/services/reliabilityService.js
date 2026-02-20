/**
 * ═══════════════════════════════════════════════════════════════
 *  AI-Based Trust & Reliability Prediction Service
 * ═══════════════════════════════════════════════════════════════
 *
 * Collects behavioural signals from Firestore (rides, cancellations,
 * no-shows, ratings) and computes a Reliability Score (0-100) with
 * weighted logic.  Users are classified into:
 *   • High Reliability   (75-100)
 *   • Medium Reliability  (40-74)
 *   • Low Reliability     (0-39)
 *
 * The score is persisted on the user document so other screens can
 * read it instantly without recomputing.
 *
 * This is an INSIGHT-ONLY feature — no auto-blocking.
 */

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

/* ─────────── Weights (sum ≈ 1.0 for normalised section) ─────────── */

const W_COMPLETION   = 0.35;   // rides completed / rides joined
const W_EARLY_CANCEL = 0.10;   // penalise early cancellations lightly
const W_LATE_CANCEL  = 0.15;   // penalise late cancellations moderately
const W_NO_SHOW      = 0.20;   // penalise no-shows heavily
const W_RATING       = 0.20;   // average rating (out of 5)

/* ─────────────── Tier thresholds ─────────────── */

const TIER_HIGH   = 75;
const TIER_MEDIUM = 40;

/* ─────────────── Tier classifier ─────────────── */

export function classifyReliability(score) {
  if (score >= TIER_HIGH)   return { label: 'High Reliability',   color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '🟢' };
  if (score >= TIER_MEDIUM) return { label: 'Medium Reliability', color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '🟡' };
  return                           { label: 'Low Reliability',    color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🔴' };
}

/* ═══════════════════════════════════════════════════════════════
 *  Gather behavioural signals from Firestore
 * ═══════════════════════════════════════════════════════════════ */

export async function gatherBehavioralData(db, userId) {
  const signals = {
    totalRidesJoined:    0,
    ridesCompleted:      0,
    earlyCancellations:  0,
    lateCancellations:   0,
    noShows:             0,
    averageRating:       0,
    totalRatings:        0,
  };

  try {
    // 1) User doc — averageRating, totalRatings, noShowLog
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (userSnap.exists()) {
      const u = userSnap.data();
      signals.averageRating = Number(u.averageRating || 0);
      signals.totalRatings  = Number(u.totalRatings  || 0);
      signals.noShows       = Array.isArray(u.noShowLog) ? u.noShowLog.length : 0;
    }

    // 2) Rides where user is creator OR participant
    const ridesSnap = await getDocs(collection(db, 'rides'));
    for (const d of ridesSnap.docs) {
      const r = d.data();

      // Determine if user was involved
      const pIds = extractParticipantIds(r);
      const isCreator    = (r.createdBy === userId || r.driverId === userId);
      const isParticipant = pIds.includes(userId);
      if (!isCreator && !isParticipant) continue;

      signals.totalRidesJoined++;

      const status = effectiveStatus(r);
      if (status === 'completed') signals.ridesCompleted++;

      // Cancellation log analysis
      if (Array.isArray(r.cancellationLog)) {
        for (const entry of r.cancellationLog) {
          if (entry.userId !== userId) continue;
          if (entry.type === 'late')  signals.lateCancellations++;
          else if (entry.type === 'early' || entry.type === 'creator') signals.earlyCancellations++;
          if (entry.type === 'no-show') signals.noShows++;
        }
      }
    }
  } catch (err) {
    console.error('[ReliabilityService] gatherBehavioralData error:', err);
  }

  return signals;
}

/* ═══════════════════════════════════════════════════════════════
 *  Core scoring algorithm
 * ═══════════════════════════════════════════════════════════════
 *
 *  Each factor yields 0-100; the final score is a weighted sum.
 */

export function computeReliabilityScore(signals) {
  const {
    totalRidesJoined   = 0,
    ridesCompleted     = 0,
    earlyCancellations = 0,
    lateCancellations  = 0,
    noShows            = 0,
    averageRating      = 0,
  } = signals;

  // If no ride history at all → default neutral score
  if (totalRidesJoined === 0) return { score: 70, factors: {} };

  // --- Factor 1: Completion ratio (0-100)
  const completionRatio = (ridesCompleted / totalRidesJoined) * 100;

  // --- Factor 2: Early cancellation penalty (100 → 0)
  //     Each early cancel costs 8 pts, capped
  const earlyPenalty = Math.max(0, 100 - earlyCancellations * 8);

  // --- Factor 3: Late cancellation penalty (100 → 0)
  //     Each late cancel costs 15 pts
  const latePenalty = Math.max(0, 100 - lateCancellations * 15);

  // --- Factor 4: No-show penalty (100 → 0)
  //     Each no-show costs 25 pts
  const noShowPenalty = Math.max(0, 100 - noShows * 25);

  // --- Factor 5: Rating factor (0-100)
  const ratingFactor = (averageRating / 5) * 100;

  const raw =
    W_COMPLETION   * completionRatio +
    W_EARLY_CANCEL * earlyPenalty    +
    W_LATE_CANCEL  * latePenalty     +
    W_NO_SHOW      * noShowPenalty   +
    W_RATING       * ratingFactor;

  const score = Math.round(Math.max(0, Math.min(100, raw)));

  return {
    score,
    factors: { completionRatio, earlyPenalty, latePenalty, noShowPenalty, ratingFactor },
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  Compute + persist to Firestore
 * ═══════════════════════════════════════════════════════════════ */

export async function refreshReliabilityScore(db, userId) {
  try {
    const signals  = await gatherBehavioralData(db, userId);
    const { score, factors } = computeReliabilityScore(signals);
    const tier     = classifyReliability(score);

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      reliabilityScore: score,
      reliabilityLabel: tier.label,
      reliabilityFactors: factors,
      reliabilityUpdatedAt: new Date().toISOString(),
    });

    return { score, tier, factors, signals };
  } catch (err) {
    console.error('[ReliabilityService] refreshReliabilityScore error:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
 *  Quick read (does NOT recompute — just returns stored value)
 * ═══════════════════════════════════════════════════════════════ */

export async function getStoredReliability(db, userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    const d = snap.data();
    const score = d.reliabilityScore ?? null;
    if (score === null) return null;
    return { score, tier: classifyReliability(score), label: d.reliabilityLabel };
  } catch {
    return null;
  }
}

/* ─────────── Internal helpers ─────────── */

function extractParticipantIds(data) {
  const raw = Array.isArray(data.participants) ? data.participants : [];
  if (raw.length > 0 && typeof raw[0] === 'object' && raw[0]?.userId) {
    return raw.map(p => p.userId);
  }
  if (raw.length > 0) return raw;
  return Array.isArray(data.passengers) ? data.passengers : [];
}

function effectiveStatus(data) {
  if (data.rideStatus) return data.rideStatus;
  if (data.isCompleted || data.status === 'Completed') return 'completed';
  return 'open';
}
