/**
 * Trust Model Service
 * Continuously analyzes user behavior, ride history, verification status
 * to calculate a real-time trust score. Also derives security measures,
 * proactive safety alerts, and personalized suggestions.
 */

import { collection, doc, onSnapshot, query, where, getDoc } from 'firebase/firestore';

// Score weights and thresholds
const DEFAULT_WEIGHTS = {
  verification: 0.25, // email/phone/gov ID
  ratings: 0.35,      // average rating and count
  rideBehavior: 0.30, // cancellations, completed rides
  recency: 0.10,      // recent incidents or trust drops
};

const THRESHOLDS = {
  low: 70,
  medium: 40,
};

/**
 * Compute trust score in [0, 100]
 */
export function computeTrustScore(signals, weights = DEFAULT_WEIGHTS) {
  const s = normalizeSignals(signals);

  const verificationScore = (s.emailVerified * 0.4 + s.phoneVerified * 0.3 + s.govIdVerified * 0.3) * 100;
  const ratingsScore = (s.avgRating / 5) * Math.min(1, s.totalRatings / 20) * 100; // saturate at 20 ratings
  const rideBehaviorScore = Math.max(0, 1 - s.cancellationRate) * 70 + Math.min(1, s.completedRides / 50) * 30; // blend
  const recencyScore = Math.max(0, 1 - s.recentIncidents) * 100; // penalize recent incidents

  const score = (
    verificationScore * weights.verification +
    ratingsScore * weights.ratings +
    rideBehaviorScore * weights.rideBehavior +
    recencyScore * weights.recency
  ) / (
    (weights.verification + weights.ratings + weights.rideBehavior + weights.recency) || 1
  );

  return Number(score.toFixed(1));
}

function normalizeSignals(signals = {}) {
  return {
    emailVerified: boolTo01(signals.emailVerified),
    phoneVerified: boolTo01(signals.phoneVerified),
    govIdVerified: boolTo01(signals.govIdVerified),
    avgRating: numOr(signals.avgRating, 0),
    totalRatings: numOr(signals.totalRatings, 0),
    cancellationRate: clamp01(signals.cancellationRate ?? computeCancellationRate(signals.rides || [])),
    completedRides: numOr(signals.completedRides ?? computeCompleted(signals.rides || []), 0),
    recentIncidents: clamp01(signals.recentIncidents ?? 0),
    interests: Array.isArray(signals.interests) ? signals.interests : [],
    community: signals.community || null,
  };
}

function boolTo01(v) { return v ? 1 : 0; }
function numOr(v, d) { return Number.isFinite(Number(v)) ? Number(v) : d; }
function clamp01(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function computeCancellationRate(rides) {
  if (!Array.isArray(rides) || rides.length === 0) return 0;
  const cancelled = rides.filter(r => (r.status || '').toLowerCase() === 'cancelled').length;
  return cancelled / rides.length;
}

function computeCompleted(rides) {
  if (!Array.isArray(rides)) return 0;
  return rides.filter(r => (r.status || '').toLowerCase() === 'completed').length;
}

/**
 * Map trust score to security level and recommended measures
 */
export function getSecurityRecommendations(score, signals) {
  if (!Number.isFinite(score)) return { level: 'unknown', measures: [] };
  const measures = [];

  if (score < THRESHOLDS.medium) {
    measures.push(
      'Require OTP for ride joins',
      'Enable enhanced identity checks',
      'Limit instant joins; require host approval',
      'Show travel safety checklist before each ride'
    );
    return { level: 'high', measures };
  }
  if (score < THRESHOLDS.low) {
    measures.push(
      'Prompt 2-step confirmation on joins',
      'Recommend profile completion and verification',
      'Enable ride reminders and geo-check-ins'
    );
    return { level: 'medium', measures };
  }

  measures.push(
    'Standard verification on-demand',
    'Optional ride reminders',
    'Fast-track group matching'
  );
  return { level: 'low', measures };
}

/**
 * Generate proactive safety alerts from signals
 */
export function getSafetyAlerts(score, signals) {
  const alerts = [];
  const s = normalizeSignals(signals);

  if (score < THRESHOLDS.medium) {
    alerts.push({ type: 'critical', text: 'Trust is low — additional checks enabled.' });
  } else if (score < THRESHOLDS.low) {
    alerts.push({ type: 'warning', text: 'Trust is moderate — consider verifying phone and ID.' });
  }

  if (s.cancellationRate > 0.3) {
    alerts.push({ type: 'info', text: 'High cancellation rate detected — confirm ride commitments.' });
  }
  if (s.recentIncidents > 0) {
    alerts.push({ type: 'critical', text: 'Recent safety incident reported. Review safety tips.' });
  }

  return alerts;
}

/**
 * Personalized connections and event suggestions
 * Finds users in the same community with overlapping interests
 */
export function buildPersonalizedSuggestions({ currentUserId, db, signals }) {
  const s = normalizeSignals(signals);
  const suggestions = {
    connections: [],
    events: [],
  };

  // If no community or interests, return empty
  if (!s.community || !Array.isArray(s.interests) || s.interests.length === 0) {
    return suggestions;
  }

  // Query users by same community, then compute overlap
  const usersRef = collection(db, 'users');
  const usersQ = query(usersRef, where('community', '==', s.community));

  return new Promise((resolve) => {
    const unsub = onSnapshot(usersQ, (snap) => {
      const peers = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.id !== currentUserId);

      const scored = peers.map(u => {
        const interests = Array.isArray(u.interests) ? u.interests : [];
        const overlap = intersectionSize(s.interests, interests);
        return { id: u.id, name: u.displayName || u.email || 'User', overlap, interests };
      })
      .filter(p => p.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5);

      suggestions.connections = scored;

      // Simple event suggestions based on top interests
      const topInterest = s.interests[0];
      if (topInterest) {
        suggestions.events = [
          { id: 'evt-1', title: `${s.community} ${topInterest} meetup`, desc: 'Community-organized event based on shared interest.' },
          { id: 'evt-2', title: `${s.community} Carpool Circle`, desc: 'Meet, match, and plan shared rides for the week.' },
        ];
      }

      resolve({ suggestions, unsubscribe: () => unsub() });
    });
  });
}

function intersectionSize(a, b) {
  const setA = new Set(a || []);
  let cnt = 0;
  for (const x of (b || [])) if (setA.has(x)) cnt++;
  return cnt;
}

/**
 * Subscribe to all relevant signals for a user and emit computed trust score
 */
export function startTrustModel({ db, userId, onUpdate }) {
  if (!db || !userId || !onUpdate) return () => {};

  let ridesSnapshotCancel = () => {};
  let userSnapshotCancel = () => {};

  // Aggregate rides where user is driver or passenger
  const ridesRef = collection(db, 'rides');
  const driverQ = query(ridesRef, where('driverId', '==', userId));
  const passengerQ = query(ridesRef, where('passengers', 'array-contains', userId));

  let driverRides = [];
  let passengerRides = [];

  const mergeRidesAndEmit = (profile) => {
    const rides = [...driverRides, ...passengerRides];

    const signals = {
      rides,
      avgRating: profile?.averageRating ?? 0,
      totalRatings: profile?.totalRatings ?? 0,
      emailVerified: !!profile?.emailVerified,
      phoneVerified: !!profile?.phoneVerified,
      govIdVerified: !!profile?.govIdVerified,
      interests: Array.isArray(profile?.interests) ? profile.interests : [],
      community: profile?.community || null,
      recentIncidents: profile?.recentIncidents ?? 0,
    };

    const score = computeTrustScore(signals);
    const sec = getSecurityRecommendations(score, signals);
    const alerts = getSafetyAlerts(score, signals);

    onUpdate({ score, signals, security: sec, alerts });
  };

  const driverUnsub = onSnapshot(driverQ, (snap) => {
    driverRides = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });
  ridesSnapshotCancel = driverUnsub;

  const passengerUnsub = onSnapshot(passengerQ, (snap) => {
    passengerRides = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

  // Listen to user profile
  const userRef = doc(db, 'users', userId);
  const userUnsub = onSnapshot(userRef, (docSnap) => {
    const profile = docSnap.exists() ? docSnap.data() : {};
    mergeRidesAndEmit(profile);
  });
  userSnapshotCancel = userUnsub;

  return () => {
    try { ridesSnapshotCancel(); } catch {}
    try { driverUnsub(); } catch {}
    try { passengerUnsub(); } catch {}
    try { userSnapshotCancel(); } catch {}
  };
}

/**
 * Fetch a one-time snapshot of the user profile (optional helper)
 */
export async function getUserProfile(db, userId) {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}
