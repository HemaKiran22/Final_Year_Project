import { runTransaction, doc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { searchRidesByQuery } from './rideSearchService';
import { createOrGetPrivateChat } from './rideActionService';

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
      const seats = Number(rideData.seats) || 0;
      const passengersArr = Array.isArray(rideData.passengers) ? rideData.passengers : [];

      if (passengersArr.includes(user.uid)) {
        throw new Error('You already joined this ride.');
      }
      if (seats > 0 && passengersArr.length >= seats) {
        throw new Error('No seats left in this ride.');
      }

      transaction.update(rideRef, {
        passengers: [...passengersArr, user.uid],
        status: 'Pending',
      });
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
