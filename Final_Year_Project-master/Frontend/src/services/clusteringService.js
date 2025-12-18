/**
 * Ride Clustering Service
 * Groups users traveling from same community to same destination
 * Optimizes carpooling by creating ride groups
 */

/**
 * Calculate distance between two lat/lng points (Haversine formula)
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Check if two times are within acceptable window (e.g., 15 minutes)
 */
function isTimeCompatible(time1, time2, windowMinutes = 15) {
  const date1 = new Date(`2000-01-01 ${time1}`);
  const date2 = new Date(`2000-01-01 ${time2}`);
  const diffMinutes = Math.abs(date1 - date2) / (1000 * 60);
  return diffMinutes <= windowMinutes;
}

/**
 * Simple K-Means clustering for ride grouping
 * Groups rides based on pickup location, destination, and time
 */
function kMeansClustering(rides, k) {
  if (rides.length === 0) return [];
  if (rides.length <= k) {
    // If fewer rides than desired groups, each ride is its own group
    return rides.map(ride => [ride]);
  }

  // Initialize centroids randomly
  let centroids = [];
  const usedIndices = new Set();
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * rides.length);
    if (!usedIndices.has(idx)) {
      centroids.push({ ...rides[idx] });
      usedIndices.add(idx);
    }
  }

  let clusters = [];
  let maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    // Assign rides to nearest centroid
    clusters = Array.from({ length: k }, () => []);
    
    rides.forEach(ride => {
      let minDist = Infinity;
      let assignedCluster = 0;
      
      centroids.forEach((centroid, idx) => {
        const dist = calculateRideDistance(ride, centroid);
        if (dist < minDist) {
          minDist = dist;
          assignedCluster = idx;
        }
      });
      
      clusters[assignedCluster].push(ride);
    });

    // Update centroids
    const newCentroids = clusters.map(cluster => {
      if (cluster.length === 0) return centroids[0]; // Keep old centroid if cluster is empty
      
      // Average pickup location
      const avgPickupLat = cluster.reduce((sum, r) => sum + (r.pickupLat || 0), 0) / cluster.length;
      const avgPickupLng = cluster.reduce((sum, r) => sum + (r.pickupLng || 0), 0) / cluster.length;
      
      return {
        pickupLat: avgPickupLat,
        pickupLng: avgPickupLng,
        community: cluster[0].community,
        destination: cluster[0].destination
      };
    });

    centroids = newCentroids;
    iteration++;
  }

  return clusters.filter(cluster => cluster.length > 0);
}

/**
 * Calculate "distance" between two rides considering location and time
 */
function calculateRideDistance(ride1, ride2) {
  // Location distance
  const locDist = calculateDistance(
    ride1.pickupLat || 0,
    ride1.pickupLng || 0,
    ride2.pickupLat || 0,
    ride2.pickupLng || 0
  );

  // Time difference (in hours, normalized)
  const time1 = new Date(`2000-01-01 ${ride1.time}`);
  const time2 = new Date(`2000-01-01 ${ride2.time}`);
  const timeDiff = Math.abs(time1 - time2) / (1000 * 60 * 60); // hours

  // Combined distance (weight location more than time)
  return locDist * 0.7 + timeDiff * 0.3;
}

/**
 * Main clustering function
 * Groups rides based on community, destination, time, and location
 */
export function clusterRides(rides, options = {}) {
  const {
    maxGroupSize = 3,        // Max users per auto/group
    timeWindowMinutes = 15,  // Time compatibility window
    proximityKm = 2,         // Max pickup location distance within community
    algorithm = 'kmeans',    // 'kmeans' | 'dbscan'
    epsKm = 1.5,             // neighborhood radius for DBSCAN (km)
    minPts = 2,              // minimum points to form a DBSCAN cluster
  } = options;

  if (!rides || rides.length === 0) return [];

  // Step 1: Pre-filter by community and destination
  const groupsByRoute = {};
  
  rides.forEach(ride => {
    const key = `${ride.community}|${ride.destination}`;
    if (!groupsByRoute[key]) {
      groupsByRoute[key] = [];
    }
    groupsByRoute[key].push(ride);
  });

  // Step 2: For each route, cluster by time and location
  const finalClusters = [];

  Object.entries(groupsByRoute).forEach(([route, routeRides]) => {
    // Further group by time compatibility
    const timeGroups = [];
    
    routeRides.forEach(ride => {
      let addedToGroup = false;
      
      for (let group of timeGroups) {
        // Check if ride is time-compatible with this group
        const compatible = group.every(r => isTimeCompatible(r.time, ride.time, timeWindowMinutes));
        
        if (compatible) {
          group.push(ride);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        timeGroups.push([ride]);
      }
    });

    // Step 3: Apply spatial clustering within each time group
    timeGroups.forEach(timeGroup => {
      let candidateGroups = [];

      if (timeGroup.length <= maxGroupSize) {
        candidateGroups = [timeGroup];
      } else {
        if (algorithm === 'dbscan') {
          const clusters = dbscanClustering(timeGroup, epsKm || proximityKm, minPts);
          candidateGroups = clusters.length > 0 ? clusters : [timeGroup];
        } else {
          const numGroups = Math.ceil(timeGroup.length / maxGroupSize);
          candidateGroups = kMeansClustering(timeGroup, numGroups);
        }
      }

      // Step 4: Enforce capacity based on available seats (fallback to maxGroupSize)
      candidateGroups.forEach(g => {
        const split = splitByCapacity(g, maxGroupSize);
        finalClusters.push(...split);
      });
    });
  });

  return finalClusters;
}

// --- DBSCAN (spatial) over pickupLat/pickupLng ---
function dbscanClustering(points, epsKm = 1.5, minPts = 2) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const n = points.length;
  const labels = new Array(n).fill(undefined); // undefined=unvisited, -1=noise, >=0=cluster id
  let cid = 0;

  const regionQuery = (idx) => {
    const res = [];
    const p = points[idx];
    for (let j = 0; j < n; j++) {
      if (j === idx) continue;
      const q = points[j];
      const d = calculateDistance(
        p.pickupLat || 0,
        p.pickupLng || 0,
        q.pickupLat || 0,
        q.pickupLng || 0
      );
      if (d <= epsKm) res.push(j);
    }
    return res;
  };

  const expandCluster = (idx, neighbors, clusterId) => {
    labels[idx] = clusterId;
    const queue = [...neighbors];
    while (queue.length) {
      const j = queue.shift();
      if (labels[j] === -1) {
        labels[j] = clusterId; // border point
      }
      if (labels[j] !== undefined) continue; // already processed
      labels[j] = clusterId;
      const nbs = regionQuery(j);
      if (nbs.length >= minPts) {
        // density reachable
        for (const k of nbs) queue.push(k);
      }
    }
  };

  for (let i = 0; i < n; i++) {
    if (labels[i] !== undefined) continue; // visited
    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) {
      labels[i] = -1; // noise
    } else {
      expandCluster(i, neighbors, cid);
      cid++;
    }
  }

  // Collect clusters; keep noise points as singleton clusters to not lose rides
  const clusters = [];
  for (let k = 0; k < cid; k++) clusters.push([]);
  for (let i = 0; i < n; i++) {
    if (labels[i] >= 0) {
      clusters[labels[i]].push(points[i]);
    }
  }
  // noise
  for (let i = 0; i < n; i++) {
    if (labels[i] === -1) clusters.push([points[i]]);
  }
  return clusters.filter(c => c.length > 0);
}

// Get max capacity based on vehicle type
function getVehicleCapacity(vehicleType) {
  const capacities = {
    car: 4,
    auto: 3,
  };
  return capacities[vehicleType] || 4;
}

// Calculate capacity for a cluster based on vehicle type
function getClusterCapacity(cluster, fallback) {
  if (!cluster || cluster.length === 0) return fallback || 4;
  
  // Use the first ride's vehicle type to determine capacity
  const vehicleType = cluster[0].vehicleType || 'car';
  const vehicleCapacity = getVehicleCapacity(vehicleType);
  
  // Sum of actual seats posted
  const totalSeats = cluster.reduce((sum, r) => {
    const seats = Number(r.seats);
    return sum + (Number.isFinite(seats) ? seats : 0);
  }, 0);
  
  return totalSeats > 0 ? totalSeats : fallback || vehicleCapacity;
}

// Count passengers already on a ride
function getPassengerCount(ride) {
  return Array.isArray(ride.passengers) ? ride.passengers.length : 0;
}

function getTotalPassengers(cluster) {
  return cluster.reduce((sum, r) => sum + getPassengerCount(r), 0);
}

function getRemainingSeats(cluster) {
  const totalSeats = getClusterCapacity(cluster, cluster.length);
  const taken = getTotalPassengers(cluster);
  return Math.max(0, totalSeats - taken);
}

// Split a cluster into vehicle-sized chunks (max 4 for car, 3 for auto)
function splitByCapacity(cluster, fallbackCapacity) {
  if (!cluster || cluster.length === 0) return [];
  
  // Get vehicle type from first ride
  const vehicleType = cluster[0].vehicleType || 'car';
  const vehicleCapacity = getVehicleCapacity(vehicleType);
  
  if (cluster.length <= vehicleCapacity) return [cluster];

  const chunks = [];
  for (let i = 0; i < cluster.length; i += vehicleCapacity) {
    chunks.push(cluster.slice(i, i + vehicleCapacity));
  }
  return chunks;
}

/**
 * Format cluster results for display with vehicle type info
 */
export function formatClusterResults(clusters, explanationsOptions = {}) {
  const {
    timeWindowMinutes = 15,
    proximityKm = 2
  } = explanationsOptions || {};

  const toMinutes = (t) => {
    if (!t) return null;
    const [hh, mm] = String(t).split(':');
    const h = Number(hh);
    const m = Number(mm);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  return clusters.map((cluster, idx) => {
    const vehicleType = cluster[0]?.vehicleType || 'car';
    const vehicleCapacity = getVehicleCapacity(vehicleType);
    const members = cluster.length;
    const co2SavingPct = Math.max(0, Math.round((1 - 1 / Math.max(1, members)) * 100));
    // Collect member user IDs: drivers and passengers from all rides in cluster
    const memberIdSet = new Set();
    for (const r of cluster) {
      if (r.driverId) memberIdSet.add(r.driverId);
      if (Array.isArray(r.passengers)) {
        for (const pid of r.passengers) memberIdSet.add(pid);
      }
      if (r.userId) memberIdSet.add(r.userId);
    }
    
    // Compute centroid and time stats for explanations
    const latVals = cluster.map(r => Number(r.pickupLat || 0));
    const lngVals = cluster.map(r => Number(r.pickupLng || 0));
    const centroid = {
      lat: latVals.reduce((a, b) => a + b, 0) / Math.max(1, latVals.length),
      lng: lngVals.reduce((a, b) => a + b, 0) / Math.max(1, lngVals.length),
    };
    const distancesKm = cluster.map(r => calculateDistance(
      Number(r.pickupLat || 0),
      Number(r.pickupLng || 0),
      centroid.lat,
      centroid.lng
    ));
    const avgProximityKm = Number((distancesKm.reduce((a, b) => a + b, 0) / Math.max(1, distancesKm.length)).toFixed(2));
    const timesMin = cluster.map(r => toMinutes(r.time)).filter(v => v !== null);
    const timeSpreadMin = timesMin.length > 0 ? Math.max(...timesMin) - Math.min(...timesMin) : 0;
    const timeWindowOk = timeSpreadMin <= timeWindowMinutes;

    // Counterfactual tip
    let counterfactual = '';
    if (!timeWindowOk) {
      const excess = Math.max(0, timeSpreadMin - timeWindowMinutes);
      counterfactual = `Shift time by ≤ ${Math.ceil(excess)} min to fit the window.`;
    } else if (avgProximityKm > proximityKm) {
      const reduceBy = Number((avgProximityKm - proximityKm).toFixed(2));
      counterfactual = `Choose a pickup closer by ~${reduceBy} km to tighten proximity.`;
    } else {
      counterfactual = 'You already fit time and proximity for this group.';
    }

    const explanations = {
      timeWindowMinutes,
      timeSpreadMin,
      timeWindowOk,
      avgProximityKm,
      proximityKm,
      vehicleCapacity,
      capacityNote: `Capacity enforced by vehicle type (${vehicleType}).`,
      counterfactual,
    };

    return {
      groupId: idx + 1,
      route: `${cluster[0].community} → ${cluster[0].destination}`,
      members: members,
      passengers: getTotalPassengers(cluster),
      capacity: vehicleCapacity,
      vehicleType: vehicleType,
      vehicleLabel: vehicleType === 'car' ? 'Car' : 'Auto',
      time: cluster[0].time,
      date: cluster[0].date,
      remainingSeats: Math.max(0, vehicleCapacity - getTotalPassengers(cluster)),
      co2SavingPct,
      explanations,
      memberUserIds: Array.from(memberIdSet),
      rideOptions: cluster.map(r => {
        const seats = Number(r.seats) || 0;
        const passengers = getPassengerCount(r);
        const rideVehicleType = r.vehicleType || 'car';
        return {
          rideId: r.id,
          driverId: r.driverId,
          driverName: r.driverName || r.userName || 'Driver',
          vehicleType: rideVehicleType,
          seatsTotal: seats,
          seatsRemaining: Math.max(0, seats - passengers),
          passengers,
          pickupLocation: r.pickupLocation || r.community,
        };
      }),
      riders: cluster.map(r => ({
        name: r.userName || 'User',
        userId: r.userId,
        pickupLocation: r.pickupLocation || r.community
      })),
      estimatedCost: calculateGroupCost(cluster),
      costPerPerson: calculateGroupCost(cluster) / Math.max(1, cluster.length),
      isFull: Math.max(0, vehicleCapacity - getTotalPassengers(cluster)) <= 0
    };
  });
}

/**
 * Calculate cost for a group (simple example)
 */
function calculateGroupCost(cluster) {
  const baseCost = 100; // Base auto fare
  const perPersonCost = 20;
  return baseCost + (cluster.length * perPersonCost);
}

/**
 * Get clustering statistics
 */
export function getClusteringStats(originalRides, clusters) {
  return {
    totalRides: originalRides.length,
    totalGroups: clusters.length,
    ridesReduced: originalRides.length - clusters.length,
    reductionPercentage: ((originalRides.length - clusters.length) / originalRides.length * 100).toFixed(1),
    averageGroupSize: (originalRides.length / clusters.length).toFixed(1),
    costSavings: calculateTotalSavings(originalRides, clusters)
  };
}

function calculateTotalSavings(originalRides, clusters) {
  const individualCost = originalRides.length * 120; // 120 per auto
  const groupedCost = clusters.reduce((sum, cluster) => sum + calculateGroupCost(cluster), 0);
  return individualCost - groupedCost;
}
