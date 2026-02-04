/**
 * Community AI Service
 * Analyzes user profiles and interests to suggest personalized
 * connections, recommend circles/groups/events, and facilitate discussions.
 */

import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';

function intersection(a = [], b = []) {
  const setA = new Set(a);
  const res = [];
  for (const x of b) if (setA.has(x)) res.push(x);
  return res;
}

function overlapRatio(a = [], b = []) {
  const inter = intersection(a, b);
  const denom = Math.max(1, Math.max(a.length, b.length));
  return inter.length / denom; // 0..1
}

function ratingProximity(a = 0, b = 0) {
  const diff = Math.abs(Number(a || 0) - Number(b || 0));
  return Math.max(0, 1 - (diff / 5)); // 0..1
}

/**
 * Build AI-driven recommendations for connections, circles and events.
 */
export async function buildCommunityRecommendations({ db, currentUserId, signals }) {
  const interests = Array.isArray(signals?.interests) ? signals.interests : [];
  const community = signals?.community || null;
  const myAvgRating = Number(signals?.avgRating || 0);

  const out = { connections: [], circles: [], events: [] };
  if (!community || interests.length === 0) return out;

  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('community', '==', community));
  const snap = await getDocs(q);
  const peers = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== currentUserId);

  // Score peers by interest overlap + rating proximity
  const scored = peers.map(u => {
    const peerInterests = Array.isArray(u.interests) ? u.interests : [];
    const interScore = overlapRatio(interests, peerInterests);
    const ratingScore = ratingProximity(myAvgRating, Number(u.averageRating || 0));
    const affinity = 0.7 * interScore + 0.3 * ratingScore;
    return {
      id: u.id,
      name: u.displayName || u.email || 'User',
      interests: peerInterests,
      averageRating: Number(u.averageRating || 0),
      affinity: Number(affinity.toFixed(3)),
      overlap: intersection(interests, peerInterests),
    };
  })
  .filter(p => p.affinity > 0)
  .sort((a, b) => b.affinity - a.affinity)
  .slice(0, 8);

  out.connections = scored;

  // Recommend a circle based on top interest
  const topInterest = interests[0];
  if (topInterest) {
    const membersForCircle = scored.filter(p => p.interests.includes(topInterest)).slice(0, 6);
    if (membersForCircle.length >= 2) {
      out.circles.push({
        id: `circle-${community}-${topInterest}`,
        title: `${community} • ${topInterest} Circle`,
        topic: topInterest,
        members: membersForCircle,
        reason: `Shared interest: ${topInterest} in ${community}`,
      });
    }
  }

  // Recommend events tailored to interests
  if (topInterest) {
    out.events = [
      { id: `evt-${community}-${topInterest}-weekly`, title: `${community} Weekly ${topInterest} Meetup`, desc: 'Casual get-together to meet neighbors and plan carpools.' },
      { id: `evt-${community}-carpool-planning`, title: `${community} Carpool Planning Circle`, desc: 'Coordinate routes and timings for the week.' },
    ];
  }

  return out;
}

/**
 * Facilitate a discussion by sending intro notifications to selected users.
 */
export async function sendIntroNotification(db, fromUserId, toUserId, message, extra = {}) {
  const notif = {
    toUserId,
    fromUserId,
    type: 'intro',
    message: message || 'Let\'s connect! We share interests in our community.',
    createdAt: new Date(),
    read: false,
    ...extra,
  };
  await addDoc(collection(db, 'notifications'), notif);
}

export async function startCircleDiscussion(db, fromUserId, circle) {
  const msg = `Hi! Starting a ${circle.topic} circle in ${circle.title}.`;
  for (const m of circle.members) {
    await sendIntroNotification(db, fromUserId, m.id, msg, { circleId: circle.id, topic: circle.topic });
  }
  return true;
}
