import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  increment,
} from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import "./PrivateChat.css";

const PrivateChat = () => {
  const { chatId } = useParams(); // Get chatId from URL
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatMeta, setChatMeta] = useState(null);
  const [ride, setRide] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTargetUserId, setRatingTargetUserId] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState(false);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  // Scroll to bottom whenever messages change
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(scrollToBottom, [messages]);

  // Fetch messages in real-time + show browser popup on new incoming messages
  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const notifiedIds = new Set();
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      // Trigger popup only for newly added messages from the other user
      snapshot.docChanges().forEach((chg) => {
        if (chg.type !== 'added') return;
        const data = chg.doc.data();
        if (!data?.senderId || data.senderId === auth.currentUser?.uid) return;
        if (notifiedIds.has(chg.doc.id)) return;
        notifiedIds.add(chg.doc.id);
        if ('Notification' in window) {
          if (Notification.permission === 'default') Notification.requestPermission();
          if (Notification.permission === 'granted') {
            try {
              new Notification('New private message', { body: data.text || 'You received a new message', icon: '/logo.png' });
            } catch {}
          }
        }
      });
    });

    return () => unsubscribe();
  }, [chatId]);

  // Fetch chat metadata and ride details
  useEffect(() => {
    const fetchMeta = async () => {
      if (!chatId) return;
      const chatRef = doc(db, "chats", chatId);
      const chatSnap = await getDoc(chatRef);
      if (chatSnap.exists()) {
        const chatData = chatSnap.data();
        setChatMeta({ id: chatId, ...chatData });
        if (chatData.rideId) {
          const rideRef = doc(db, "rides", chatData.rideId);
          const rideSnap = await getDoc(rideRef);
          if (rideSnap.exists()) {
            setRide({ id: rideSnap.id, ...rideSnap.data() });
          }
        }
      }
    };
    fetchMeta();
  }, [chatId]);

  // Send a new message
  const sendMessage = async () => {
    if (newMessage.trim() === "") return;
    if (!auth.currentUser) {
      alert("Please log in to send messages.");
      return;
    }
    if (!chatId) {
      console.warn("sendMessage called without a valid chatId");
      return;
    }

    try {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        text: newMessage,
        senderId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      // Also post to Society Feed when message addresses the community
      try {
        const lower = newMessage.trim().toLowerCase();
        if (lower.includes('hello community')) {
          const username = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Anonymous';
          await addDoc(collection(db, 'feed'), {
            username,
            userId: auth.currentUser.uid,
            message: newMessage.trim(),
            likes: [],
            comments: [],
            fileUrl: '',
            fileType: '',
            createdAt: new Date(),
          });
        }
      } catch (feedErr) {
        console.warn('Feed post skipped:', feedErr);
      }
      // Send a notification to the other participant
      let participants = Array.isArray(chatMeta?.participants) ? chatMeta.participants : [];
      let otherUserId = participants.find((p) => p && p !== auth.currentUser.uid);
      if (!otherUserId) {
        // Fallback: fetch chat document to get participants if meta not ready
        try {
          const chatRef = doc(db, 'chats', chatId);
          const chatSnap = await getDoc(chatRef);
          if (chatSnap.exists()) {
            const data = chatSnap.data();
            participants = Array.isArray(data.participants) ? data.participants : [];
            otherUserId = participants.find((p) => p && p !== auth.currentUser.uid);
          }
        } catch (e) {
          console.warn('Failed to fetch chat participants for notification');
        }
      }
      if (otherUserId) {
        await addDoc(collection(db, "notifications"), {
          toUserId: otherUserId,
          fromUserId: auth.currentUser.uid,
          chatId,
          chatType: 'private',
          type: "message",
          text: newMessage,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      setNewMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // Handle pressing Enter key
  const handleKeyPress = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  // Accept ride: mark acceptance and update stats, then navigate
  const acceptRide = async () => {
    if (!auth.currentUser || !chatMeta || !ride) return;
    setAccepting(true);
    try {
      const thisUserId = auth.currentUser.uid;
      const chatRef = doc(db, "chats", chatMeta.id);
      // Mark current user as accepted
      await updateDoc(chatRef, { acceptedBy: arrayUnion(thisUserId) });

      // Update current user's stats immediately
      const moneySavedPerPerson = Number(ride.price || 0) / Number(ride.seats || 1);
      const userRef = doc(db, "users", thisUserId);
      await updateDoc(userRef, {
        ridesShared: increment(1),
        moneySaved: increment(moneySavedPerPerson || 0),
      });

      // Update ride as accepted by passenger (do not mark completed here)
      const rideRef = doc(db, "rides", ride.id);
      await updateDoc(rideRef, {
        status: "Accepted",
        passengers: arrayUnion(thisUserId),
      });

      // Notify the ride owner (driver) on acceptance
      try {
        if (ride.driverId && ride.driverId !== thisUserId) {
          await addDoc(collection(db, 'notifications'), {
            toUserId: ride.driverId,
            fromUserId: thisUserId,
            rideId: ride.id,
            chatId: chatMeta.id,
            chatType: 'private',
            type: 'accepted',
            message: `${auth.currentUser.email || 'A passenger'} accepted your ride to ${ride.destination}.`,
            createdAt: new Date(),
            read: false,
          });
        }
      } catch (notifyErr) {
        console.warn('Acceptance notification skipped:', notifyErr);
      }

      // Stay in private chat after acceptance
    } catch (error) {
      console.error('Error accepting ride from chat:', error);
    } finally {
      setAccepting(false);
    }
  };

  // Complete ride and show rating modal
  const completeRide = async () => {
    if (!auth.currentUser || !chatMeta || !ride) {
      console.warn('completeRide: Missing data', { auth: !!auth.currentUser, chatMeta: !!chatMeta, ride: !!ride });
      return;
    }
    setCompleting(true);
    try {
      const thisUserId = auth.currentUser.uid;
      const otherUserId = chatMeta?.participants?.find((p) => p && p !== thisUserId);
      
      console.log('Completing ride for:', thisUserId, 'Other user:', otherUserId);
      
      // Mark ride as completed
      const rideRef = doc(db, "rides", ride.id);
      await updateDoc(rideRef, {
        isCompleted: true,
      });

      console.log('Ride marked as completed');

      // Create rating notifications for both users
      if (otherUserId) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: otherUserId,
          fromUserId: thisUserId,
          rideId: ride.id,
          type: 'rate',
          rateUserId: thisUserId,
          createdAt: new Date(),
          read: false,
        });
        await addDoc(collection(db, 'notifications'), {
          toUserId: thisUserId,
          fromUserId: otherUserId,
          rideId: ride.id,
          type: 'rate',
          rateUserId: otherUserId,
          createdAt: new Date(),
          read: false,
        });
        console.log('Showing rating modal');
        setRatingTargetUserId(otherUserId);
        setRatingValue(5);
        setShowRatingModal(true);
      } else {
        console.warn('No other user found in chat');
      }
    } catch (error) {
      console.error('Error completing ride:', error);
      alert('Error: ' + error.message);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <h3>💬 Private Chat</h3>
        <button onClick={() => navigate(-1)}>⬅ Back</button>
      </div>

      <div className="messages">
        {messages.map((msg) => (
          <p
            key={msg.id}
            className={
              msg.senderId === auth.currentUser.uid ? "my-message" : "their-message"
            }
          >
            {msg.text}
          </p>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <input
          type="text"
          placeholder="Type your message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyPress}
        />
        <button onClick={sendMessage}>Send</button>
      </div>

      {ride && (
        <div className="chat-actions">
          {!chatMeta?.acceptedBy?.includes(auth.currentUser?.uid) ? (
            <button disabled={accepting} onClick={acceptRide} className="accept-btn">
              {accepting ? 'Accepting...' : '✅ Accept Ride'}
            </button>
          ) : (
            <button disabled={completing} onClick={completeRide} className="complete-btn">
              {completing ? 'Completing...' : '🏁 Ride Complete - Rate & Finish'}
            </button>
          )}
        </div>
      )}

      {showRatingModal && (
        <div className="form-modal-overlay">
          <div className="form-modal">
            <button className="close-btn" onClick={() => { setShowRatingModal(false); navigate('/dashboard'); }}>
              ×
            </button>
            
            {ratingSuccess ? (
              <div className="rating-success">
                <div className="success-icon">✅</div>
                <h2>Rating Submitted!</h2>
                <p>You successfully rated your co-rider ⭐</p>
                <p>Redirecting to Dashboard...</p>
              </div>
            ) : (
              <>
                <h2>Rate Your Co-rider</h2>
                <div className="form-group">
                  <label>Rating (1-5):</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={ratingValue}
                    onChange={(e) => setRatingValue(e.target.value)}
                  />
                </div>
            <button className="post-ride-submit-btn" onClick={async () => {
              setSubmittingRating(true);
              try {
                if (!ratingTargetUserId || !Number.isFinite(Number(ratingValue))) return;
                const ratedUserRef = doc(db, 'users', ratingTargetUserId);
                const ratedSnap = await getDoc(ratedUserRef);
                const prevAvg = ratedSnap.data()?.averageRating || 0;
                const prevCount = ratedSnap.data()?.totalRatings || 0;
                const val = Math.max(1, Math.min(5, Number(ratingValue)));
                const newAvg = ((prevAvg * prevCount) + val) / (prevCount + 1);
                await updateDoc(ratedUserRef, {
                  averageRating: newAvg,
                  totalRatings: prevCount + 1,
                });
                console.log('Rating submitted successfully');
                setRatingSuccess(true);
                
                // Show success message for 2 seconds then redirect
                setTimeout(() => {
                  setShowRatingModal(false);
                  setRatingTargetUserId(null);
                  setRatingSuccess(false);
                  navigate('/dashboard');
                }, 2000);
              } catch (e) {
                console.error('Failed to submit rating', e);
                alert('Error submitting rating: ' + e.message);
              } finally {
                setSubmittingRating(false);
              }
            }} disabled={submittingRating}>
              {submittingRating ? 'Submitting...' : '⭐ Submit Rating'}
            </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivateChat;
