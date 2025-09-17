import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import './ChatScreen.css';

const ChatScreen = ({ chatId, rideDetails, otherUser }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isRideAccepted, setIsRideAccepted] = useState(false);
  const messagesEndRef = useRef(null);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (chatId) {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const messagesData = [];
        snapshot.forEach((doc) => {
          messagesData.push({ id: doc.id, ...doc.data() });
        });
        setMessages(messagesData);
      });

      return () => unsubscribe();
    }
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        text: newMessage,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        timestamp: serverTimestamp()
      });

      // Update last message in chat
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        lastMessage: newMessage,
        lastMessageTime: serverTimestamp()
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleAcceptRide = async () => {
    try {
      // Update ride status in database
      const rideRef = doc(db, 'rides', rideDetails.id);
      await updateDoc(rideRef, {
        acceptedBy: currentUser.uid,
        status: 'accepted',
        acceptedAt: serverTimestamp()
      });

      setIsRideAccepted(true);
      // Send confirmation message
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        text: `✅ ${currentUser.displayName} has accepted the ride!`,
        system: true,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error accepting ride:', error);
    }
  };

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <h3>Chat with {otherUser}</h3>
        <div className="ride-info">
          <span>To: {rideDetails.destination}</span>
          <span>When: {rideDetails.date} at {rideDetails.time}</span>
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.senderId === currentUser.uid ? 'sent' : 'received'} ${message.system ? 'system' : ''}`}
          >
            {!message.system && (
              <span className="sender">{message.senderName}:</span>
            )}
            <span className="text">{message.text}</span>
            <span className="time">
              {message.timestamp?.toDate().toLocaleTimeString()}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {!isRideAccepted && (
        <div className="ride-acceptance">
          <button onClick={handleAcceptRide} className="accept-ride-btn">
            ✅ Accept This Ride
          </button>
        </div>
      )}

      <form onSubmit={sendMessage} className="message-input">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={isRideAccepted}
        />
        <button type="submit" disabled={!newMessage.trim() || isRideAccepted}>
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatScreen;