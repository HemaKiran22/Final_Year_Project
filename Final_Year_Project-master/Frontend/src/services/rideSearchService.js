import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';

function toMinutes(time24) {
  const [h, m] = time24.split(':').map(Number);
  return h * 60 + m;
}

function withinWindow(target, candidate, windowMin) {
  return Math.abs(candidate - target) <= windowMin;
}

export async function searchRidesByQuery(db, q) {
  // q: { destination, dateISO, time24, timeWindowMinutes, minDriverRating }
  // Strategy: fetch Pending rides and filter client-side for destination/date/time/seats
  const ridesRef = collection(db, 'rides');
  const pendingQ = query(ridesRef, where('status', '==', 'Pending'));
  const snap = await getDocs(pendingQ);
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const destLower = (q.destination || '').toLowerCase();
  const targetMinutes = q.time24 ? toMinutes(q.time24) : null;
  const windowMin = q.timeWindowMinutes || 30;

  // Filter
  let candidates = all.filter(r => {
    // Destination match (case-insensitive substring) if provided
    if (destLower) {
      const rideDestLower = (r.destination || '').toLowerCase();
      if (!rideDestLower.includes(destLower)) return false;
    }
    // Date match if provided
    if (q.dateISO) {
      if ((r.date || '') !== q.dateISO) return false;
    }
    // Seats available
    const taken = Array.isArray(r.passengers) ? r.passengers.length : 0;
    const seats = r.seats || 1;
    if (taken >= seats) return false;
    // Time window if provided
    if (targetMinutes != null && r.time) {
      const candMin = toMinutes(r.time);
      if (!withinWindow(targetMinutes, candMin, windowMin)) return false;
    }
    return true;
  });

  // Optional: filter by driver rating
  if (q.minDriverRating != null) {
    const enriched = [];
    for (const ride of candidates) {
      try {
        const uRef = doc(db, 'users', ride.driverId);
        const uSnap = await getDoc(uRef);
        const uData = uSnap.exists() ? uSnap.data() : {};
        const avg = Number(uData.averageRating || 0);
        if (avg >= q.minDriverRating) {
          enriched.push({ ...ride, driverAverageRating: avg, driverTotalRatings: Number(uData.totalRatings || 0) });
        }
      } catch {
        // if user doc fails, exclude when rating required
      }
    }
    candidates = enriched;
  }

  // If no candidates and a time was provided, relax time constraint: return nearest times on same date/destination
  if (candidates.length === 0 && targetMinutes != null) {
    const relaxed = all.filter(r => {
      if (destLower) {
        const rideDestLower = (r.destination || '').toLowerCase();
        if (!rideDestLower.includes(destLower)) return false;
      }
      if (q.dateISO && (r.date || '') !== q.dateISO) return false;
      const taken = Array.isArray(r.passengers) ? r.passengers.length : 0;
      const seats = r.seats || 1;
      if (taken >= seats) return false;
      return true; // include rides even if time is missing; we'll sort with missing times last
    });
    relaxed.sort((a, b) => {
      const aHas = Boolean(a.time);
      const bHas = Boolean(b.time);
      const adiff = aHas ? Math.abs(toMinutes(a.time) - targetMinutes) : Number.POSITIVE_INFINITY;
      const bdiff = bHas ? Math.abs(toMinutes(b.time) - targetMinutes) : Number.POSITIVE_INFINITY;
      return adiff - bdiff;
    });
    candidates = relaxed.slice(0, 5);
  }

  // Sort by time proximity if time provided, otherwise soonest
  candidates.sort((a, b) => {
    const aDT = new Date(`${a.date || ''} ${a.time || '00:00'}`);
    const bDT = new Date(`${b.date || ''} ${b.time || '00:00'}`);
    if (targetMinutes != null && a.time && b.time) {
      const aDiff = Math.abs(toMinutes(a.time) - targetMinutes);
      const bDiff = Math.abs(toMinutes(b.time) - targetMinutes);
      if (aDiff !== bDiff) return aDiff - bDiff;
    }
    return aDT - bDT;
  });

  // Limit results for UI
  return candidates.slice(0, 5);
}
