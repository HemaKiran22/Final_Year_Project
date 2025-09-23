import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  addDoc,
  serverTimestamp,
  arrayUnion,
  increment,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import "./RideChatbot.css";

const RideChatbot = () => {
  const [step, setStep] = useState(0);
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [rides, setRides] = useState([]);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);

  const navigate = useNavigate();

  // Track logged-in user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currUser) => {
      setUser(currUser);
    });
    return () => unsubscribe();
  }, []);

  // 🔎 Search rides from Firestore
  const searchRides = async () => {
    try {
      const q = query(
        collection(db, "rides"),
        where("destination", "==", destination),
        where("date", "==", date),
        where("time", "==", time)
      );
      const querySnapshot = await getDocs(q);
      const results = [];
      querySnapshot.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() });
      });
      setRides(results);
      setStep(3);
    } catch (err) {
      console.error("Error fetching rides:", err);
    }
  };

  // ✅ Accept ride and update dashboard stats
  const acceptRide = async (ride) => {
    if (!user) return;
    try {
      const rideRef = doc(db, "rides", ride.id);
      await updateDoc(rideRef, {
        passengers: arrayUnion(user.uid),
        status: "Accepted",
      });

      const moneySavedPerPerson = Number(ride.price || 0) / Number(ride.seats || 1);
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        ridesShared: increment(1),
        moneySaved: increment(moneySavedPerPerson || 0),
      });
      setMessage("✅ Ride successfully booked!");
    } catch (err) {
      console.error("Error accepting ride:", err);
    }
  };

  // 💬 Start private chat
  const startPrivateChat = async (ride) => {
    if (!user) return;
    try {
      const chatDoc = await addDoc(collection(db, "chats"), {
        participants: [user.uid, ride.driverId],
        rideId: ride.id,
        createdAt: serverTimestamp(),
      });
      navigate(`/privatechat/${chatDoc.id}`);
    } catch (err) {
      console.error("Error creating chat:", err);
    }
  };

  return (
    <div className="chatbot-container">
      <h2 className="chatbot-title">🚗 Society Ride-Share Assistant</h2>

      {step === 0 && (
        <div className="chat-step">
          <p>👋 Hi! Where would you like to go?</p>
          <input
            type="text"
            placeholder="Enter destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <button onClick={() => setStep(1)}>Next</button>
        </div>
      )}

      {step === 1 && (
        <div className="chat-step">
          <p>📅 Please select the date of your ride:</p>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button onClick={() => setStep(2)}>Next</button>
        </div>
      )}

      {step === 2 && (
        <div className="chat-step">
          <p>⏰ What time do you want to travel?</p>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <button onClick={searchRides}>Search Rides</button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3>🚘 Available Rides</h3>
          {rides.length === 0 && <p>No rides found for your request.</p>}
          <div className="ride-list">
            {rides.map((ride) => (
              <div key={ride.id} className="ride-card">
                {ride.isCompleted ? (
                  <p className="confirmation">✅ Ride completed</p>
                ) : (
                  <>
                    <p>
                      <strong>Driver:</strong> {ride.driverName}
                    </p>
                    <p>
                      <strong>Destination:</strong> {ride.destination}
                    </p>
                    <p>
                      <strong>Date:</strong> {ride.date} | <strong>Time:</strong>{" "}
                      {ride.time}
                    </p>
                    <button onClick={() => acceptRide(ride)}>✅ Accept</button>
                    <button onClick={() => startPrivateChat(ride)}>
                      💬 Private Chat
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {message && <p className="confirmation">{message}</p>}
    </div>
  );
};

export default RideChatbot;
