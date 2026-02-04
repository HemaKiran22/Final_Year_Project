import { runTransaction, doc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

export async function joinRideById(db, auth, ride, userNameHint) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not-authenticated', message: 'Please login to join a ride.' };
  if (ride.driverId === user.uid) return { ok: false, reason: 'own-ride', message: 'Cannot join your own ride.' };

  try {
    await runTransaction(db, async (transaction) => {
      const rideRef = doc(db, 'rides', ride.id);
      const snap = await transaction.get(rideRef);
      if (!snap.exists()) throw new Error('Ride no longer exists.');
      const data = snap.data();
      const seats = Number(data.seats) || 0;
      const passengers = Array.isArray(data.passengers) ? data.passengers : [];
      if (passengers.includes(user.uid)) throw new Error('You already joined this ride.');
      if (seats > 0 && passengers.length >= seats) throw new Error('No seats left in this ride.');
      // Only append to passengers to satisfy Firestore join rules.
      // Status changes (Accepted/Completed) are handled from chat flow.
      transaction.update(rideRef, { passengers: [...passengers, user.uid] });
    });

    // Notify driver best-effort
    if (ride.driverId) {
      try {
        await addDoc(collection(db, 'notifications'), {
          toUserId: ride.driverId,
          fromUserId: user.uid,
          rideId: ride.id,
          type: 'join',
          createdAt: serverTimestamp(),
          read: false,
          message: `${userNameHint || 'A passenger'} joined your ride to ${ride.destination}.`,
        });
      } catch {}
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'transaction-failed', message: e?.message || String(e) };
  }
}

export async function createOrGetPrivateChat(db, auth, ride) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not-authenticated', message: 'Please login to start a chat.' };
  const participants = [user.uid, ride?.driverId].filter(Boolean);
  if (participants.length < 2) return { ok: false, reason: 'missing-participants', message: 'Private chat is only available when a driver is attached to the ride. Use Group Chat to coordinate.' };

  try {
    // Try to find existing chat for this ride & participants
    const chatsRef = collection(db, 'chats');
    // Query only chats where the caller is a participant to satisfy read rules
    const q = query(chatsRef, where('rideId', '==', ride.id), where('participants', 'array-contains', user.uid));
    const snap = await getDocs(q);
    const existing = snap.docs.find(d => {
      const p = d.data().participants || [];
      return Array.isArray(p) && p.includes(user.uid) && p.includes(ride.driverId);
    });
    if (existing) return { ok: true, chatId: existing.id };

    // Create new chat
    const docRef = await addDoc(chatsRef, {
      participants,
      rideId: ride.id,
      createdAt: serverTimestamp(),
    });
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
