import { runTransaction, doc, addDoc, collection, serverTimestamp, query, where, getDocs, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';

/* ───────────────────────── helpers ───────────────────────── */

const LATE_CANCEL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Parse ride date+time into a Date object */
function parseRideDateTime(ride) {
  try {
    if (ride.startTime) return new Date(ride.startTime);
    if (ride.date && ride.time) return new Date(`${ride.date}T${ride.time}:00`);
  } catch { /* ignore */ }
  return null;
}

/** Backward-compat: resolve effective rideStatus */
function resolveRideStatus(data) {
  if (data.rideStatus) return data.rideStatus;
  if (data.isCompleted || data.status === 'Completed') return 'completed';
  return 'open';
}

/** Get participants array (backward-compat with old passengers[] of strings) */
function getParticipantIds(data) {
  // New model: participants may be array of objects {userId, joinedAt}
  const raw = Array.isArray(data.participants) ? data.participants : [];
  if (raw.length > 0 && typeof raw[0] === 'object' && raw[0].userId) {
    return raw.map(p => p.userId);
  }
  // Fallback: flat array of uids or old passengers array
  if (raw.length > 0) return raw;
  return Array.isArray(data.passengers) ? data.passengers : [];
}

function getParticipantsRaw(data) {
  return Array.isArray(data.participants) ? data.participants : [];
}

/* ─────────────────── Trust score helpers ─────────────────── */

const TRUST_PENALTY_LATE_CANCEL  = -3;
const TRUST_PENALTY_NO_SHOW      = -8;
const TRUST_PENALTY_FREQ_CANCEL  = -5; // creator cancels ride frequently

async function applyTrustPenalty(db, userId, amount, reason) {
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const prev = Number(snap.data().trustScore ?? 100);
    const next = Math.max(0, prev + amount);
    await updateDoc(userRef, {
      trustScore: next,
      trustLog: arrayUnion({ delta: amount, reason, time: new Date().toISOString() }),
    });
  } catch (e) { console.error('Trust penalty failed', e); }
}

/* ═══════════════════════════════════════════════════════════
   1.  JOIN RIDE
   ═══════════════════════════════════════════════════════════ */

export async function joinRideById(db, auth, ride, userNameHint) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not-authenticated', message: 'Please login to join a ride.' };
  if (ride.driverId === user.uid) return { ok: false, reason: 'own-ride', message: 'Cannot join your own ride.' };

  try {
    let updatedAvailable = 0;
    await runTransaction(db, async (transaction) => {
      const rideRef = doc(db, 'rides', ride.id);
      const snap = await transaction.get(rideRef);
      if (!snap.exists()) throw new Error('Ride no longer exists.');
      const data = snap.data();

      const rideStatus = resolveRideStatus(data);
      if (rideStatus === 'closed') throw new Error('This ride is closed by the creator and no longer accepting passengers.');
      if (rideStatus === 'completed') throw new Error('This ride has already been completed.');
      if (rideStatus === 'cancelled') throw new Error('This ride has been cancelled.');

      const seats = Number(data.totalSeats || data.seats) || 0;
      const pIds = getParticipantIds(data);
      const passengers = Array.isArray(data.passengers) ? data.passengers : [];

      if (passengers.includes(user.uid) || pIds.includes(user.uid)) throw new Error('You already joined this ride.');

      const currentAvailable = data.availableSeats != null ? Number(data.availableSeats) : (seats - pIds.length);
      if (currentAvailable <= 0) throw new Error('No seats left in this ride.');

      const newPassengers = [...passengers, user.uid];
      const rawParticipants = getParticipantsRaw(data);
      const newParticipantEntry = { userId: user.uid, joinedAt: new Date().toISOString() };
      // If old flat array, keep flat for compat; if new object array or empty, use objects
      const isObjModel = rawParticipants.length > 0 && typeof rawParticipants[0] === 'object' && rawParticipants[0]?.userId;
      const newParticipants = isObjModel || rawParticipants.length === 0
        ? [...rawParticipants.filter(p => (typeof p === 'object' ? p.userId : p) !== user.uid), newParticipantEntry]
        : [...new Set([...rawParticipants, user.uid])];

      const newAvailable = currentAvailable - 1;
      updatedAvailable = newAvailable;

      const updates = { passengers: newPassengers, participants: newParticipants, availableSeats: newAvailable };
      if (newAvailable <= 0) updates.rideStatus = 'closed';
      transaction.update(rideRef, updates);
    });

    // Notify driver best-effort
    if (ride.driverId) {
      try {
        await addDoc(collection(db, 'notifications'), {
          toUserId: ride.driverId, fromUserId: user.uid, rideId: ride.id,
          type: 'join', createdAt: serverTimestamp(), read: false,
          message: `${userNameHint || 'A passenger'} joined your ride to ${ride.destination}.`,
        });
      } catch {}
    }
    return { ok: true, availableSeats: updatedAvailable };
  } catch (e) {
    return { ok: false, reason: 'transaction-failed', message: e?.message || String(e) };
  }
}

/* ═══════════════════════════════════════════════════════════
   2.  CO-RIDER LEAVES RIDE  (Scenarios 1, 3, 4)
   ═══════════════════════════════════════════════════════════ */

export async function leaveRide(db, auth, ride, userNameHint) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not-authenticated', message: 'Please login.' };
  if (ride.driverId === user.uid || ride.createdBy === user.uid) {
    return { ok: false, reason: 'is-creator', message: 'Ride creators cannot leave — use Cancel Ride instead.' };
  }

  try {
    let cancelType = 'early';
    await runTransaction(db, async (transaction) => {
      const rideRef = doc(db, 'rides', ride.id);
      const snap = await transaction.get(rideRef);
      if (!snap.exists()) throw new Error('Ride no longer exists.');
      const data = snap.data();

      const rideStatus = resolveRideStatus(data);
      if (rideStatus === 'completed') throw new Error('Cannot leave a completed ride.');
      if (rideStatus === 'cancelled') throw new Error('This ride is already cancelled.');

      const pIds = getParticipantIds(data);
      const passengers = Array.isArray(data.passengers) ? data.passengers : [];
      if (!pIds.includes(user.uid) && !passengers.includes(user.uid)) {
        throw new Error('You are not part of this ride.');
      }

      // Determine early vs late
      const startDT = parseRideDateTime(data);
      if (startDT) {
        const diff = startDT.getTime() - Date.now();
        if (diff > 0 && diff <= LATE_CANCEL_WINDOW_MS) cancelType = 'late';
      }

      // Remove from passengers (flat uid array)
      const newPassengers = passengers.filter(uid => uid !== user.uid);
      // Remove from participants (may be objects or flat)
      const rawP = getParticipantsRaw(data);
      const newParticipants = rawP.filter(p => (typeof p === 'object' ? p.userId : p) !== user.uid);

      const seats = Number(data.totalSeats || data.seats) || 0;
      const currentAvailable = data.availableSeats != null ? Number(data.availableSeats) : (seats - pIds.length);
      const newAvailable = Math.min(seats, currentAvailable + 1);

      const cancellationEntry = {
        userId: user.uid,
        userName: userNameHint || 'Unknown',
        time: new Date().toISOString(),
        reason: cancelType === 'late' ? 'last-minute' : 'personal/health',
        type: cancelType,
      };

      const updates = {
        passengers: newPassengers,
        participants: newParticipants,
        availableSeats: newAvailable,
        cancellationLog: arrayUnion(cancellationEntry),
      };

      // Do NOT change rideStatus — ride stays open or closed per creator's choice
      transaction.update(rideRef, updates);
    });

    // Trust penalty for late cancellation
    if (cancelType === 'late') {
      await applyTrustPenalty(db, user.uid, TRUST_PENALTY_LATE_CANCEL, 'Late ride cancellation');
    }

    // Notify creator
    const creatorId = ride.createdBy || ride.driverId;
    if (creatorId) {
      try {
        await addDoc(collection(db, 'notifications'), {
          toUserId: creatorId, fromUserId: user.uid, rideId: ride.id,
          type: cancelType === 'late' ? 'late-cancellation' : 'cancellation',
          createdAt: serverTimestamp(), read: false,
          message: cancelType === 'late'
            ? `⚠️ ${userNameHint || 'A co-rider'} left your ride to ${ride.destination} at the last minute!`
            : `${userNameHint || 'A co-rider'} left your ride to ${ride.destination}.`,
        });
      } catch {}
    }

    return { ok: true, cancelType };
  } catch (e) {
    return { ok: false, reason: 'transaction-failed', message: e?.message || String(e) };
  }
}

/* ═══════════════════════════════════════════════════════════
   3.  CREATOR CANCELS ENTIRE RIDE  (Scenario 2)
   ═══════════════════════════════════════════════════════════ */

export async function cancelRideByCreator(db, auth, ride, userNameHint) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not-authenticated', message: 'Please login.' };
  const creatorId = ride.createdBy || ride.driverId;
  if (creatorId !== user.uid) {
    return { ok: false, reason: 'not-creator', message: 'Only the ride creator can cancel the entire ride.' };
  }

  try {
    const rideRef = doc(db, 'rides', ride.id);
    const snap = await getDoc(rideRef);
    if (!snap.exists()) return { ok: false, message: 'Ride no longer exists.' };
    const data = snap.data();

    const rideStatus = resolveRideStatus(data);
    if (rideStatus === 'completed') return { ok: false, message: 'Cannot cancel a completed ride.' };
    if (rideStatus === 'cancelled') return { ok: false, message: 'Ride is already cancelled.' };

    const pIds = getParticipantIds(data);
    const cancellationEntry = {
      userId: user.uid,
      userName: userNameHint || 'Creator',
      time: new Date().toISOString(),
      reason: 'creator-cancelled',
      type: 'creator',
    };

    await updateDoc(rideRef, {
      rideStatus: 'cancelled',
      status: 'Cancelled',
      cancellationLog: arrayUnion(cancellationEntry),
    });

    // Notify ALL participants (excluding creator)
    const otherIds = pIds.filter(uid => uid !== user.uid);
    for (const pid of otherIds) {
      try {
        await addDoc(collection(db, 'notifications'), {
          toUserId: pid, fromUserId: user.uid, rideId: ride.id,
          type: 'ride-cancelled',
          createdAt: serverTimestamp(), read: false,
          message: `🚫 ${userNameHint || 'The ride creator'} cancelled the ride to ${ride.destination}.`,
        });
      } catch {}
    }

    // Check frequent cancellations → trust penalty
    try {
      const ridesRef = collection(db, 'rides');
      const creatorRides = await getDocs(query(ridesRef, where('createdBy', '==', user.uid)));
      const cancelledCount = creatorRides.docs.filter(d => resolveRideStatus(d.data()) === 'cancelled').length;
      if (cancelledCount >= 3) {
        await applyTrustPenalty(db, user.uid, TRUST_PENALTY_FREQ_CANCEL, `Frequent ride cancellations (${cancelledCount} total)`);
      }
    } catch {}

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: e?.message || String(e) };
  }
}

/* ═══════════════════════════════════════════════════════════
   4.  NO-SHOW  (Scenario 5)
   ═══════════════════════════════════════════════════════════ */

export async function markNoShow(db, auth, ride, targetUserId) {
  const user = auth.currentUser;
  if (!user) return { ok: false, message: 'Please login.' };
  const creatorId = ride.createdBy || ride.driverId;
  if (creatorId !== user.uid) return { ok: false, message: 'Only the ride creator can mark no-shows.' };

  const rideStatus = resolveRideStatus(ride);
  if (rideStatus !== 'completed') return { ok: false, message: 'No-shows can only be marked after ride completion.' };

  try {
    const rideRef = doc(db, 'rides', ride.id);
    const noShowEntry = {
      userId: targetUserId,
      markedBy: user.uid,
      time: new Date().toISOString(),
      type: 'no-show',
    };

    await updateDoc(rideRef, {
      cancellationLog: arrayUnion(noShowEntry),
    });

    // Strong trust penalty
    await applyTrustPenalty(db, targetUserId, TRUST_PENALTY_NO_SHOW, `No-show on ride to ${ride.destination}`);

    // Store in user's noShowLog
    try {
      const targetRef = doc(db, 'users', targetUserId);
      await updateDoc(targetRef, {
        noShowLog: arrayUnion({ rideId: ride.id, time: new Date().toISOString(), destination: ride.destination }),
      });
    } catch {}

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

/* ═══════════════════════════════════════════════════════════
   5.  PRIVATE CHAT  (unchanged logic)
   ═══════════════════════════════════════════════════════════ */

export async function createOrGetPrivateChat(db, auth, ride) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not-authenticated', message: 'Please login to start a chat.' };
  const participants = [user.uid, ride?.driverId].filter(Boolean);
  if (participants.length < 2) return { ok: false, reason: 'missing-participants', message: 'Private chat is only available when a driver is attached to the ride. Use Group Chat to coordinate.' };

  try {
    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('rideId', '==', ride.id), where('participants', 'array-contains', user.uid));
    const snap = await getDocs(q);
    const existing = snap.docs.find(d => {
      const p = d.data().participants || [];
      return Array.isArray(p) && p.includes(user.uid) && p.includes(ride.driverId);
    });
    if (existing) return { ok: true, chatId: existing.id };

    const docRef = await addDoc(chatsRef, { participants, rideId: ride.id, createdAt: serverTimestamp() });
    return { ok: true, chatId: docRef.id };
  } catch (e) {
    const msg = e?.code === 'permission-denied'
      ? 'You do not have permission to start a private chat. Please ensure your Firestore rules are deployed.'
      : e?.code === 'failed-precondition'
        ? 'Index required for private chats search. Please create the composite index for chats on (rideId ==, participants array-contains) in Firebase.'
        : (e?.message || 'Failed to open private chat.');
    return { ok: false, reason: 'error', message: msg };
  }
}

/* ═══════════════════════════════════════════════════════════
   6.  HELPERS  (exported for reuse)
   ═══════════════════════════════════════════════════════════ */

export { resolveRideStatus, getParticipantIds, parseRideDateTime, LATE_CANCEL_WINDOW_MS };
