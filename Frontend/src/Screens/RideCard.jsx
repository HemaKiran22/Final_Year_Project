import React from 'react';
import { doc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import './RideCard.css';

const RideCard = ({ ride, onClose }) => {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;

  const handleAccept = async () => {
    // Implement ride acceptance logic
    alert('Ride accepted! The driver will be notified.');
    onClose();
  };

  const handleChat = async () => {
    try {
      // Create or get chat room
      const chatId = [currentUser.uid, ride.driverId].sort().join('_');
      const chatRef = doc(db, 'chats', chatId);
      
      await setDoc(chatRef, {
        participants: [currentUser.uid, ride.driverId],
        rideId: ride.id,
        createdAt: serverTimestamp(),
        lastMessage: null,
        lastMessageTime: null
      }, { merge: true });

      // Navigate to chat
      navigate(`/chat/${chatId}`, { 
        state: { 
          rideDetails: ride,
          otherUser: ride.driverName 
        }
      });
      
      onClose();
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  return (
    <div className="ride-card">
      <div className="ride-header">
        <div className="driver-info">
          <div className="driver-avatar">
            {ride.driverName?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h4>{ride.driverName}</h4>
            <p className="rating">⭐ {ride.rating || '4.8'}</p>
          </div>
        </div>
        <div className="ride-price">
          <span className="price">₹{ride.price}</span>
          <span className="per-seat">per seat</span>
        </div>
      </div>

      <div className="ride-details">
        <div className="route">
          <div className="location">
            <span className="dot start"></span>
            <span>{ride.community}</span>
          </div>
          <div className="location">
            <span className="dot end"></span>
            <span>{ride.destination}</span>
          </div>
        </div>

        <div className="timing">
          <div className="time-info">
            <span>🕒 {ride.time}</span>
            <span>📅 {ride.date}</span>
          </div>
          <div className="seats">
            <span>💺 {ride.availableSeats} seats left</span>
          </div>
        </div>

        {ride.notes && (
          <div className="notes">
            <p>📝 {ride.notes}</p>
          </div>
        )}
      </div>

      <div className="ride-actions">
        <button onClick={handleAccept} className="accept-btn">
          Accept Ride
        </button>
        <button onClick={handleChat} className="chat-btn">
          Chat
        </button>
      </div>
    </div>
  );
};

export default RideCard;