import { runTransaction, doc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { searchRidesByQuery } from './rideSearchService';
import { createOrGetPrivateChat, resolveRideStatus, getParticipantIds } from './rideActionService';

export async function autoBookBestRide(db, auth, q, userNameHint) {
  const rides = await searchRidesByQuery(db, q);
  if (!rides || rides.length === 0) {
    return { ok: false, reason: 'no-rides', message: 'No matching rides found.' };
  }

  const candidate = rides[0];
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, reason: 'not-authenticated', message: 'Please login to book a ride.' };
  }

  // Do not book user's own ride
  if (candidate.driverId && candidate.driverId === user.uid) {
    return { ok: false, reason: 'own-ride', message: 'This is your own ride; booking skipped.' };
  }

  try {
    await runTransaction(db, async (transaction) => {
      const rideRef = doc(db, 'rides', candidate.id);
      const rideSnap = await transaction.get(rideRef);
      if (!rideSnap.exists()) {
        throw new Error('Ride no longer exists.');
      }
      const rideData = rideSnap.data();

      // Check rideStatus using shared helper
      const rideStatus = resolveRideStatus(rideData);
      if (rideStatus === 'closed') throw new Error('This ride is closed and no longer accepting passengers.');
      if (rideStatus === 'completed') throw new Error('This ride has already been completed.');
      if (rideStatus === 'cancelled') throw new Error('This ride has been cancelled.');

      const seats = Number(rideData.totalSeats || rideData.seats) || 0;
      const passengersArr = Array.isArray(rideData.passengers) ? rideData.passengers : [];
      const pIds = getParticipantIds(rideData);

      if (passengersArr.includes(user.uid) || pIds.includes(user.uid)) {
        throw new Error('You already joined this ride.');
      }

      const currentAvailable = rideData.availableSeats != null ? Number(rideData.availableSeats) : (seats - pIds.length);
      if (currentAvailable <= 0) {
        throw new Error('No seats left in this ride.');
      }

      const newPassengers = [...passengersArr, user.uid];
      const rawParticipants = Array.isArray(rideData.participants) ? rideData.participants : [];
      const isObjModel = rawParticipants.length > 0 && typeof rawParticipants[0] === 'object' && rawParticipants[0]?.userId;
      const newParticipantEntry = { userId: user.uid, joinedAt: new Date().toISOString() };
      const newParticipants = isObjModel || rawParticipants.length === 0
        ? [...rawParticipants.filter(p => (typeof p === 'object' ? p.userId : p) !== user.uid), newParticipantEntry]
        : [...new Set([...rawParticipants, user.uid])];
      const newAvailable = currentAvailable - 1;

      const updates = {
        passengers: newPassengers,
        participants: newParticipants,
        availableSeats: newAvailable,
      };
      if (newAvailable <= 0) updates.rideStatus = 'closed';

      transaction.update(rideRef, updates);
    });

    // Create or get a private chat with the driver, post a system message, and notify driver with deep link
    if (candidate.driverId) {
      try {
        const chatRes = await createOrGetPrivateChat(db, auth, candidate);
        if (chatRes.ok && chatRes.chatId) {
          // Post a lightweight system message from the passenger
          try {
            await addDoc(collection(db, 'chats', chatRes.chatId, 'messages'), {
              text: `${userNameHint || 'A passenger'} joined your ride to ${candidate.destination}.`,
              senderId: user.uid,
              createdAt: serverTimestamp(),
            });
          } catch {}

          // Notify driver with a message-type notification that links to private chat
          await addDoc(collection(db, 'notifications'), {
            toUserId: candidate.driverId,
            fromUserId: user.uid,
            chatId: chatRes.chatId,
            chatType: 'private',
            type: 'message',
            text: `${userNameHint || 'A passenger'} joined your ride to ${candidate.destination}.`,
            createdAt: serverTimestamp(),
            read: false,
          });
        } else {
          // Fallback: send a generic join notification without chat link
          await addDoc(collection(db, 'notifications'), {
            toUserId: candidate.driverId,
            fromUserId: user.uid,
            rideId: candidate.id,
            type: 'join',
            message: `${userNameHint || 'A passenger'} joined your ride to ${candidate.destination}.`,
            createdAt: serverTimestamp(),
            read: false,
          });
        }
      } catch {
        // ignore notification failures
      }
    }

    return { ok: true, ride: candidate };
  } catch (e) {
    return { ok: false, reason: 'transaction-failed', message: e?.message || String(e) };
  }
}
