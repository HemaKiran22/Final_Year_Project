/**
 * AI-based Ride Clustering Service
 * 
 * Uses a DBSCAN-inspired density-based algorithm to group users
 * with similar travel patterns into suggested ride groups.
 * 
 * Factors: destination similarity, time proximity, pickup proximity,
 *          vehicle type preference.
 * 
 * This is an ASSISTIVE recommendation layer — it never auto-joins users.
 */

import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { resolveRideStatus, getParticipantIds } from './rideActionService';

/* ═══════════════════════════════════════════════════════════
   1.  CONSTANTS & CONFIG
   ═══════════════════════════════════════════════════════════ */

const CLUSTER_CONFIG = {
  TIME_WINDOW_MINUTES: 30,        // max time difference to cluster together
  DESTINATION_SIM_THRESHOLD: 0.4, // min token similarity for destinations
  MIN_CLUSTER_SIZE: 2,            // min members to form a cluster
  MAX_CLUSTER_SIZE: 6,            // max suggested group size
  CACHE_TTL_MS: 3 * 60 * 1000,   // cache results for 3 minutes
  VEHICLE_SEATS: { car: 4, auto: 3 },
};

/* ═══════════════════════════════════════════════════════════
   2.  SIMILARITY FUNCTIONS
   ═══════════════════════════════════════════════════════════ */

/** Tokenize a string into lowercase words */
function tokenize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2);
}

/** Jaccard + substring similarity between two destination strings */
function destinationSimilarity(a, b) {
  if (!a || !b) return 0;
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1;
  // Substring containment
  if (al.includes(bl) || bl.includes(al)) return 0.9;

  // Token-based Jaccard
  const tokA = new Set(tokenize(al));
  const tokB = new Set(tokenize(bl));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let intersection = 0;
  tokA.forEach(t => { if (tokB.has(t)) intersection++; });
  const jaccard = intersection / (tokA.size + tokB.size - intersection);

  // Partial token overlap bonus
  let partialBonus = 0;
  tokA.forEach(ta => {
    tokB.forEach(tb => {
      if (ta !== tb && (ta.includes(tb) || tb.includes(ta))) partialBonus += 0.15;
    });
  });

  return Math.min(1, jaccard + partialBonus);
}

/** Convert "HH:MM" (24h) to minutes since midnight */
function timeToMinutes(time24) {
  if (!time24) return null;
  const [h, m] = time24.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/** Time proximity score (1 = identical, 0 = outside window) */
function timeSimilarity(t1, t2, windowMin = CLUSTER_CONFIG.TIME_WINDOW_MINUTES) {
  const m1 = timeToMinutes(t1);
  const m2 = timeToMinutes(t2);
  if (m1 === null || m2 === null) return 0.5; // unknown time — moderate match
  const diff = Math.abs(m1 - m2);
  if (diff > windowMin) return 0;
  return 1 - (diff / windowMin);
}

/** Overall pairwise similarity between two ride data objects */
function rideSimilarity(r1, r2) {
  const destSim = destinationSimilarity(r1.destination, r2.destination);
  if (destSim < CLUSTER_CONFIG.DESTINATION_SIM_THRESHOLD) return 0; // hard cutoff

  const timeSim = timeSimilarity(r1.time, r2.time);
  if (timeSim === 0) return 0; // outside time window

  // Pickup proximity (same community = high, different = low)
  const pickupSim = (r1.from || '').toLowerCase() === (r2.from || '').toLowerCase() ? 1 : 0.3;

  // Vehicle type match bonus
  const vehicleSim = r1.vehicleType === r2.vehicleType ? 1 : 0.4;

  // Weighted composite
  return (destSim * 0.40) + (timeSim * 0.30) + (pickupSim * 0.15) + (vehicleSim * 0.15);
}

/* ═══════════════════════════════════════════════════════════
   3.  DBSCAN-STYLE CLUSTERING
   ═══════════════════════════════════════════════════════════ */

const SIMILARITY_THRESHOLD = 0.45; // min composite similarity to be neighbors

/**
 * Run DBSCAN-inspired clustering on an array of ride objects.
 * Returns array of clusters: { members: [...rideObjects] }
 */
function dbscanCluster(rides) {
  const n = rides.length;
  const visited = new Array(n).fill(false);
  const clusterAssignment = new Array(n).fill(-1);
  const clusters = [];

  // Precompute similarity matrix
  const simMatrix = [];
  for (let i = 0; i < n; i++) {
    simMatrix[i] = [];
    for (let j = 0; j < n; j++) {
      simMatrix[i][j] = i === j ? 1 : rideSimilarity(rides[i], rides[j]);
    }
  }

  // Get neighbors
  function getNeighbors(idx) {
    const neighbors = [];
    for (let j = 0; j < n; j++) {
      if (j !== idx && simMatrix[idx][j] >= SIMILARITY_THRESHOLD) {
        neighbors.push(j);
      }
    }
    return neighbors;
  }

  let clusterId = 0;
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    const neighbors = getNeighbors(i);
    if (neighbors.length < CLUSTER_CONFIG.MIN_CLUSTER_SIZE - 1) continue; // noise

    // Start a new cluster
    const cluster = [i];
    clusterAssignment[i] = clusterId;
    const queue = [...neighbors];

    while (queue.length > 0) {
      const j = queue.shift();
      if (clusterAssignment[j] === clusterId) continue;
      if (cluster.length >= CLUSTER_CONFIG.MAX_CLUSTER_SIZE) break;

      if (!visited[j]) {
        visited[j] = true;
        const jNeighbors = getNeighbors(j);
        if (jNeighbors.length >= CLUSTER_CONFIG.MIN_CLUSTER_SIZE - 1) {
          for (const k of jNeighbors) {
            if (!queue.includes(k) && clusterAssignment[k] !== clusterId) queue.push(k);
          }
        }
      }
      clusterAssignment[j] = clusterId;
      cluster.push(j);
    }

    if (cluster.length >= CLUSTER_CONFIG.MIN_CLUSTER_SIZE) {
      clusters.push({ members: cluster.map(idx => rides[idx]) });
      clusterId++;
    }
  }

  return clusters;
}

/* ═══════════════════════════════════════════════════════════
   4.  CLUSTER ENRICHMENT
   ═══════════════════════════════════════════════════════════ */

/** Build the output structure for one cluster */
function enrichCluster(members, clusterId) {
  // Determine destination (most common)
  const destCounts = {};
  members.forEach(m => {
    const d = (m.destination || '').toLowerCase();
    destCounts[d] = (destCounts[d] || 0) + 1;
  });
  const topDest = Object.entries(destCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const displayDest = members.find(m => (m.destination || '').toLowerCase() === topDest)?.destination || topDest;

  // Time range
  const times = members.map(m => timeToMinutes(m.time)).filter(t => t !== null).sort((a, b) => a - b);
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const formatT = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const timeRange = times.length > 0
    ? (minTime === maxTime ? formatT(minTime) : `${formatT(minTime)} – ${formatT(maxTime)}`)
    : 'Flexible';

  // Vehicle type (majority)
  const vehicleCounts = {};
  members.forEach(m => { vehicleCounts[m.vehicleType || 'car'] = (vehicleCounts[m.vehicleType || 'car'] || 0) + 1; });
  const suggestedVehicle = Object.entries(vehicleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'car';

  // Seats
  const maxSeats = CLUSTER_CONFIG.VEHICLE_SEATS[suggestedVehicle] || 4;
  const suggestedGroupSize = Math.min(members.length, maxSeats);

  // Cost estimation
  const avgPrice = members.reduce((sum, m) => sum + (Number(m.price) || 0), 0) / members.length;
  const estimatedCostPerPerson = suggestedGroupSize > 0 ? Math.round(avgPrice / suggestedGroupSize) : 0;

  // Confidence score — based on average pairwise similarity
  let totalSim = 0, pairCount = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      totalSim += rideSimilarity(members[i], members[j]);
      pairCount++;
    }
  }
  const avgSim = pairCount > 0 ? totalSim / pairCount : 0;
  const confidenceScore = Math.round(avgSim * 100);

  // Explanation
  const reasons = [];
  if (avgSim >= 0.7) reasons.push('Very similar travel patterns');
  else if (avgSim >= 0.5) reasons.push('Similar destination & time');
  else reasons.push('Overlapping travel routes');
  if (times.length > 1 && maxTime - minTime <= 15) reasons.push('Nearly identical departure times');
  if (members.length >= 3) reasons.push(`${members.length} riders heading the same way`);

  // Collect user info
  const suggestedMembers = members.map(m => ({
    oderId: m.driverId || m.createdBy,
    userId: m.driverId || m.createdBy,
    userName: m.driverName || 'Rider',
    rideId: m.id,
    destination: m.destination,
    time: m.time,
    date: m.date,
    from: m.from,
    vehicleType: m.vehicleType,
    price: Number(m.price) || 0,
  }));

  // Check if there's an existing ride that can be joined
  const existingRides = members.filter(m => {
    const status = resolveRideStatus(m);
    return status === 'open' && m.id;
  });

  return {
    clusterId: `cluster_${clusterId}`,
    destination: displayDest,
    timeRange,
    suggestedVehicleType: suggestedVehicle,
    suggestedGroupSize,
    estimatedCostPerPerson,
    confidenceScore,
    explanation: reasons.join(' · '),
    suggestedMembers,
    existingRides,
    memberCount: members.length,
  };
}

/* ═══════════════════════════════════════════════════════════
   5.  MAIN PUBLIC API
   ═══════════════════════════════════════════════════════════ */

let _clusterCache = { ts: 0, data: [] };

/**
 * Run the full clustering pipeline.
 * @param {Firestore} db
 * @param {string} currentUserId - The logged-in user's ID
 * @param {Object} opts - Optional: { community }
 * @returns {Promise<Array>} clusters sorted by confidence score
 */
export async function getClusteredRideGroups(db, currentUserId, opts = {}) {
  // Check cache
  if (_clusterCache.data.length > 0 && Date.now() - _clusterCache.ts < CLUSTER_CONFIG.CACHE_TTL_MS) {
    return _clusterCache.data;
  }

  try {
    // 1. Fetch all rides and filter client-side (mirrors Dashboard — avoids
    //    missing rides whose status field uses a different naming convention)
    const ridesRef = collection(db, 'rides');
    const snapAll = await getDocs(ridesRef);
    let rides = snapAll.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter to only open rides with available seats, future dates
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    rides = rides.filter(r => {
      const status = resolveRideStatus(r);
      if (status !== 'open') return false;
      const pIds = getParticipantIds(r);
      const totalSeats = Number(r.totalSeats || r.seats) || 1;
      const available = r.availableSeats != null ? Number(r.availableSeats) : (totalSeats - pIds.length);
      if (available <= 0) return false;
      if (r.date && r.date < todayStr) return false;
      return true;
    });

    if (rides.length < CLUSTER_CONFIG.MIN_CLUSTER_SIZE) {
      _clusterCache = { ts: Date.now(), data: [] };
      return [];
    }

    // 2. Run DBSCAN clustering
    const rawClusters = dbscanCluster(rides);

    // 3. Enrich each cluster
    const enrichedClusters = rawClusters.map((c, i) => enrichCluster(c.members, i));

    // 4. Filter: only show clusters relevant to the current user
    //    (either user is in a member ride, or cluster has rides from same community)
    const userCommunity = opts.community?.toLowerCase() || '';
    const relevantClusters = enrichedClusters.filter(c => {
      // User already in one of the rides
      const userInCluster = c.suggestedMembers.some(m => m.userId === currentUserId);
      if (userInCluster) return true;
      // Same community
      if (userCommunity) {
        const clusterCommunities = c.suggestedMembers.map(m => (m.from || '').toLowerCase());
        if (clusterCommunities.some(cc => cc.includes(userCommunity) || userCommunity.includes(cc))) return true;
      }
      // Show all clusters if user has no community filter to maximize suggestions
      return !userCommunity;
    });

    // 5. Sort by confidence (highest first)
    relevantClusters.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // 6. Fetch reliability scores for members (best-effort)
    for (const cluster of relevantClusters) {
      for (const member of cluster.suggestedMembers) {
        try {
          const userRef = doc(db, 'users', member.userId);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const d = snap.data();
            member.reliabilityScore = d.reliabilityScore || null;
            member.reliabilityLabel = d.reliabilityLabel || null;
            member.averageRating = d.averageRating || null;
          }
        } catch {}
      }
    }

    // Cache
    _clusterCache = { ts: Date.now(), data: relevantClusters };
    return relevantClusters;

  } catch (err) {
    console.error('Clustering service error:', err);
    return [];
  }
}

/** Invalidate cluster cache (e.g. after joining/posting a ride) */
export function invalidateClusterCache() {
  _clusterCache = { ts: 0, data: [] };
}

/** Export config for UI */
export { CLUSTER_CONFIG };
