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
  getDoc,
} from "firebase/firestore";
import { createOrGetPrivateChat } from "../services/rideActionService";
import { searchRidesByQuery } from "../services/rideSearchService";
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

  const computeTrustHeuristic = (profile) => {
    const idVerified = profile?.status === 'approved' ? 1 : 0;
    const avgRating = Number(profile?.averageRating || 0);
    const totalRatings = Number(profile?.totalRatings || 0);
    const ridesCompleted = Number(profile?.ridesShared || 0);
    const fields = ['phoneNumber','housingSociety','flatNumber','bio','vehicleType','emergencyContact'];
    const filled = fields.filter(f => {
      const val = profile?.[f];
      return !!(val && String(val).trim().length > 0);
    }).length;
    const completeness = Math.round((filled / fields.length) * 100);
    const score01 = 0.4 * idVerified + 0.3 * (avgRating / 5) + 0.2 * (Math.min(ridesCompleted, 20) / 20) + 0.1 * (completeness / 100);
    let label = 'Neutral';
    if (score01 < 0.4) label = 'Risky';
    else if (score01 >= 0.7) label = 'Highly Trusted';
    return { score: Math.round(score01 * 100), label };
  };

  // Track logged-in user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currUser) => {
      setUser(currUser);
    });
    return () => unsubscribe();
  }, []);

  // 🔎 Search rides using flexible matching (tokens + time window)
  const searchRides = async () => {
    try {
      const results = await searchRidesByQuery(db, {
        destination,
        dateISO: date,
        time24: time,
        timeWindowMinutes: 30,
      });
      // Enrich each ride with driver profile info (ratings + trust label)
      const enriched = [];
      for (const r of results) {
        let driverAverageRating = null;
        let driverTotalRatings = null;
        let trustLabel = null;
        let trustScore = null;
        try {
          if (r.driverId) {
            const uSnap = await getDoc(doc(db, 'users', r.driverId));
            const profile = uSnap.exists() ? uSnap.data() : {};
            driverAverageRating = Number(profile.averageRating || 0);
            driverTotalRatings = Number(profile.totalRatings || 0);
            const t = computeTrustHeuristic(profile);
            trustLabel = t.label;
            trustScore = t.score;
          }
        } catch {}
        enriched.push({ ...r, driverAverageRating, driverTotalRatings, trustLabel, trustScore });
      }
      setRides(enriched);
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
      const res = await createOrGetPrivateChat(db, auth, ride);
      if (res.ok && res.chatId) {
        navigate(`/privatechat/${res.chatId}`);
      }
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
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                            <span title="Average Rating" style={{ fontSize: '0.9rem', color: '#374151' }}>
                              ⭐ {typeof ride.driverAverageRating === 'number' ? ride.driverAverageRating.toFixed(1) : '—'} ({ride.driverTotalRatings ?? 0})
                            </span>
                            {ride.trustLabel && (
                              <span style={{ padding: '2px 8px', borderRadius: 12, background: '#eef2ff', color: '#3730a3', fontSize: '0.78rem' }} title={`Trust ${ride.trustScore ?? ''}%`}>
                                {ride.trustLabel}
                              </span>
                            )}
                          </div>
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
