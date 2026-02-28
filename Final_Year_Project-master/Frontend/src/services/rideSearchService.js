import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { resolveRideStatus, getParticipantIds } from './rideActionService';

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
  // Fetch all rides and filter client-side (mirrors Dashboard behaviour —
  // avoids missing rides whose status field uses a different naming convention).
  const snapAll = await getDocs(ridesRef);
  const all = snapAll.docs.map(d => ({ id: d.id, ...d.data() }));

  const destLower = (q.destination || '').toLowerCase();
  const destTokens = destLower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length >= 3);
  const targetMinutes = q.time24 ? toMinutes(q.time24) : null;
  const windowMin = q.timeWindowMinutes || 30;

  // Filter
  let candidates = all.filter(r => {
    // Only show open rides
    const rideStatus = resolveRideStatus(r);
    if (rideStatus !== 'open') return false;

    // Destination match (case-insensitive substring) if provided
    if (destLower) {
      const rideDestLower = (r.destination || '').toLowerCase();
      const directMatch = rideDestLower.includes(destLower) || destLower.includes(rideDestLower);
      const tokenMatch = destTokens.length
        ? destTokens.some(tok => rideDestLower.includes(tok))
        : false;
      if (!directMatch && !tokenMatch) return false;
    }
    // Date match if provided
    if (q.dateISO) {
      if ((r.date || '') !== q.dateISO) return false;
    } else {
      // If no specific date requested, filter out PAST dates (yesterday or older)
      // We assume rides generally happen on the date specified.
      if (r.date) {
        const rideDate = new Date(r.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // start of today
        if (rideDate < today) return false;
      }
    }
    // Seats available (backward-compatible)
    const totalSeats = Number(r.totalSeats || r.seats) || 1;
    const pIds = getParticipantIds(r);
    const available = r.availableSeats != null ? Number(r.availableSeats) : (totalSeats - pIds.length);
    if (available <= 0) return false;
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
      const rideStatus = resolveRideStatus(r);
      if (rideStatus !== 'open') return false;
      if (destLower) {
        const rideDestLower = (r.destination || '').toLowerCase();
        if (!rideDestLower.includes(destLower)) return false;
      }
      if (q.dateISO && (r.date || '') !== q.dateISO) return false;
      const totalSeats = Number(r.totalSeats || r.seats) || 1;
      const pIds = getParticipantIds(r);
      const available = r.availableSeats != null ? Number(r.availableSeats) : (totalSeats - pIds.length);
      if (available <= 0) return false;
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
