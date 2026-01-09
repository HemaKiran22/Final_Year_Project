import { runTransaction, doc, addDoc, collection } from 'firebase/firestore';
import { searchRidesByQuery } from './rideSearchService';

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

    // Best-effort notify the driver
    if (candidate.driverId) {
      try {
        await addDoc(collection(db, 'notifications'), {
          toUserId: candidate.driverId,
          fromUserId: user.uid,
          rideId: candidate.id,
          type: 'join',
          createdAt: new Date(),
          read: false,
          message: `${userNameHint || 'A passenger'} joined your ride to ${candidate.destination}.`
        });
      } catch {
        // ignore notification failures
      }
    }

    return { ok: true, ride: candidate };
  } catch (e) {
    return { ok: false, reason: 'transaction-failed', message: e?.message || String(e) };
  }
}
