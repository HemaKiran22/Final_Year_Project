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
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTargetUserId, setRatingTargetUserId] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  // Scroll to bottom whenever messages change
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(scrollToBottom, [messages]);

  // Fetch messages in real-time
  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
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

      // Update ride as accepted/completed by passenger
      const rideRef = doc(db, "rides", ride.id);
      await updateDoc(rideRef, {
        status: "Accepted",
        passengers: arrayUnion(thisUserId),
        isCompleted: true,
      });

      // Create rating notifications both ways when accepted from chat
      const otherUserId = chatMeta?.participants?.find((p) => p && p !== thisUserId);
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
        setRatingTargetUserId(otherUserId);
        setRatingValue(5);
        setShowRatingModal(true);
      }
      
      // Delay navigating to dashboard until after rating modal
    } catch (error) {
      console.error('Error accepting ride from chat:', error);
    } finally {
      setAccepting(false);
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
          <button disabled={accepting} onClick={acceptRide}>
            {accepting ? 'Accepting...' : '✅ Accept Ride & Go to Dashboard'}
          </button>
        </div>
      )}

      {showRatingModal && (
        <div className="form-modal-overlay">
          <div className="form-modal">
            <button className="close-btn" onClick={() => { setShowRatingModal(false); navigate('/dashboard'); }}>
              ×
            </button>
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
              } catch (e) {
                console.error('Failed to submit rating', e);
              } finally {
                setShowRatingModal(false);
                setRatingTargetUserId(null);
                navigate('/dashboard');
              }
            }}>Submit Rating</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivateChat;
