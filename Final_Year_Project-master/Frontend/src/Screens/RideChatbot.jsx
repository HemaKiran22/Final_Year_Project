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
import { createOrGetPrivateChat } from "../services/rideActionService";
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
      // Create or get private chat and notify the driver with deep link
      try {
        if (ride.driverId && ride.driverId !== user.uid) {
          const chatRes = await createOrGetPrivateChat(db, auth, ride);
          if (chatRes.ok && chatRes.chatId) {
            try {
              await addDoc(collection(db, 'chats', chatRes.chatId, 'messages'), {
                text: `${user.email || 'A passenger'} accepted your ride to ${ride.destination}.`,
                senderId: user.uid,
                createdAt: serverTimestamp(),
              });
            } catch {}

            await addDoc(collection(db, 'notifications'), {
              toUserId: ride.driverId,
              fromUserId: user.uid,
              chatId: chatRes.chatId,
              chatType: 'private',
              type: 'message',
              text: `${user.email || 'A passenger'} accepted your ride to ${ride.destination}.`,
              createdAt: serverTimestamp(),
              read: false,
            });
          } else {
            await addDoc(collection(db, 'notifications'), {
              toUserId: ride.driverId,
              fromUserId: user.uid,
              rideId: ride.id,
              type: 'accepted',
              message: `${user.email || 'A passenger'} accepted your ride to ${ride.destination}.`,
              createdAt: serverTimestamp(),
              read: false,
            });
          }
        }
      } catch (notifyErr) {
        console.warn('Acceptance notification skipped:', notifyErr);
      }
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
      <div className="chatbot-header">
        <div className="header-icon">🚗</div>
        <h2 className="chatbot-title">Society Ride-Share Assistant</h2>
        <p className="chatbot-subtitle">Find your perfect carpool match</p>
      </div>

      {step === 0 && (
        <div className="chat-step">
          <div className="step-indicator">
            <div className="step-dot active">1</div>
            <div className="step-line"></div>
            <div className="step-dot">2</div>
            <div className="step-line"></div>
            <div className="step-dot">3</div>
          </div>
          <div className="message-bubble bot-message">
            <span className="message-icon">👋</span>
            <p>Hi! Where would you like to go?</p>
          </div>
          <div className="input-group">
            <span className="input-icon">📍</span>
            <input
              type="text"
              placeholder="Enter destination (e.g., Christ University)"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="modern-input"
            />
          </div>
          <button className="modern-button" onClick={() => setStep(1)} disabled={!destination}>
            Continue
            <span className="button-arrow">→</span>
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="chat-step">
          <div className="step-indicator">
            <div className="step-dot completed">✓</div>
            <div className="step-line completed"></div>
            <div className="step-dot active">2</div>
            <div className="step-line"></div>
            <div className="step-dot">3</div>
          </div>
          <div className="message-bubble bot-message">
            <span className="message-icon">📅</span>
            <p>Great! When would you like to travel?</p>
          </div>
          <div className="user-response">
            <p>Destination: <strong>{destination}</strong></p>
          </div>
          <div className="input-group">
            <span className="input-icon">📅</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="modern-input"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="button-row">
            <button className="back-button" onClick={() => setStep(0)}>← Back</button>
            <button className="modern-button" onClick={() => setStep(2)} disabled={!date}>
              Continue
              <span className="button-arrow">→</span>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="chat-step">
          <div className="step-indicator">
            <div className="step-dot completed">✓</div>
            <div className="step-line completed"></div>
            <div className="step-dot completed">✓</div>
            <div className="step-line completed"></div>
            <div className="step-dot active">3</div>
          </div>
          <div className="message-bubble bot-message">
            <span className="message-icon">⏰</span>
            <p>Perfect! What time works best for you?</p>
          </div>
          <div className="user-response">
            <p>Destination: <strong>{destination}</strong></p>
            <p>Date: <strong>{date}</strong></p>
          </div>
          <div className="input-group">
            <span className="input-icon">⏰</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="modern-input"
            />
          </div>
          <div className="button-row">
            <button className="back-button" onClick={() => setStep(1)}>← Back</button>
            <button className="modern-button primary" onClick={searchRides} disabled={!time}>
              🔍 Find Rides
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="results-header">
            <h3 className="results-title">🚘 Available Rides</h3>
            <button className="back-button-results" onClick={() => setStep(0)}>← New Search</button>
          </div>
          <div className="search-summary">
            <div className="summary-item">
              <span className="summary-icon">📍</span>
              <span>{destination}</span>
            </div>
            <div className="summary-item">
              <span className="summary-icon">📅</span>
              <span>{date}</span>
            </div>
            <div className="summary-item">
              <span className="summary-icon">⏰</span>
              <span>{time}</span>
            </div>
          </div>
          {rides.length === 0 ? (
            <div className="no-results">
              <div className="no-results-icon">🔍</div>
              <h4>No rides found</h4>
              <p>Try adjusting your search criteria or check back later</p>
              <button className="modern-button" onClick={() => setStep(0)}>New Search</button>
            </div>
          ) : (
            <div className="ride-list">
              {rides.map((ride, index) => (
                <div key={ride.id} className="ride-card-modern" style={{ animationDelay: `${index * 0.1}s` }}>
                  {ride.isCompleted ? (
                    <div className="completed-badge">
                      <span className="badge-icon">✅</span>
                      <span>Ride Completed</span>
                    </div>
                  ) : (
                    <>
                      <div className="ride-card-header">
                        <div className="driver-avatar">
                          {ride.driverName?.charAt(0).toUpperCase() || 'D'}
                        </div>
                        <div className="driver-info">
                          <h4 className="driver-name">{ride.driverName || 'Driver'}</h4>
                          <p className="ride-status">🟢 Available Now</p>
                        </div>
                      </div>
                      <div className="ride-details">
                        <div className="detail-row">
                          <span className="detail-icon">📍</span>
                          <span className="detail-label">Destination:</span>
                          <span className="detail-value">{ride.destination}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-icon">📅</span>
                          <span className="detail-label">Date:</span>
                          <span className="detail-value">{ride.date}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-icon">⏰</span>
                          <span className="detail-label">Time:</span>
                          <span className="detail-value">{ride.time}</span>
                        </div>
                        {ride.seats && (
                          <div className="detail-row">
                            <span className="detail-icon">💺</span>
                            <span className="detail-label">Seats:</span>
                            <span className="detail-value">{ride.seats} available</span>
                          </div>
                        )}
                        {ride.price && (
                          <div className="detail-row price-row">
                            <span className="detail-icon">💰</span>
                            <span className="detail-label">Price:</span>
                            <span className="detail-value price">₹{ride.price}</span>
                          </div>
                        )}
                      </div>
                      <div className="ride-actions">
                        <button className="accept-button" onClick={() => acceptRide(ride)}>
                          <span>✅</span>
                          Accept Ride
                        </button>
                        <button className="chat-button" onClick={() => startPrivateChat(ride)}>
                          <span>💬</span>
                          Chat
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {message && <p className="confirmation">{message}</p>}
    </div>
  );
};

export default RideChatbot;
