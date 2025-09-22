import React, { useState, useEffect } from 'react';
import { FaUserCircle, FaCar, FaMoneyBillWave } from 'react-icons/fa';
import { auth } from '../firebase.js';
import { doc as firestoreDoc, onSnapshot as firestoreOnSnapshot } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from '../firebase.js';
import './Profile.css';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editableUserInfo, setEditableUserInfo] = useState({
    displayName: '',
    email: '',
  });

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setEditableUserInfo({
          displayName: currentUser.displayName || '',
          email: currentUser.email || '',
        });
        const userRef = firestoreDoc(db, 'users', currentUser.uid);
        const unsubscribeProfile = firestoreOnSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(docSnap.data());
          }
        });
        return () => unsubscribeProfile();
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleEdit = () => {
    setIsEditing(prev => !prev);
  };

  const handleSave = async () => {
    try {
      await updateProfile(auth.currentUser, {
        displayName: editableUserInfo.displayName,
      });
      // Note: Updating the email via Firebase auth requires re-authentication for security.
      alert('Profile updated successfully!');
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      alert('Failed to update profile.');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditableUserInfo(prev => ({ ...prev, [name]: value }));
  };

  if (!user) {
    return <div className="loading">Loading profile...</div>;
  }

  return (
    <div className="page-container">
      <div className="profile-card">
        <div className="profile-header">
          <FaUserCircle size={100} className="profile-icon-large" />
          <div className="profile-info">
            {isEditing ? (
              <input 
                type="text" 
                name="displayName" 
                value={editableUserInfo.displayName} 
                onChange={handleInputChange} 
                className="editable-input" 
              />
            ) : (
              <h1>{user.displayName || 'Not provided'}</h1>
            )}
            <p className="profile-email">{user.email || 'Not provided'}</p>
            {isEditing ? (
              <button className="save-btn" onClick={handleSave}>Save Changes</button>
            ) : (
              <button className="edit-btn" onClick={handleEdit}>Edit Profile</button>
            )}
          </div>
        </div>
        
        <div className="profile-metrics-grid">
          <div className="profile-metric-card">
            <FaCar size={40} className="metric-icon" />
            <div className="metric-content">
              <span>{userProfile?.ridesShared || '0'}</span>
              <p>Rides Shared</p>
            </div>
          </div>
          <div className="profile-metric-card">
            <FaMoneyBillWave size={40} className="metric-icon" />
            <div className="metric-content">
              <span>₹{userProfile?.moneySaved || '0'}</span>
              <p>Money Saved</p>
            </div>
          </div>
        </div>

        <div className="profile-details-section">
          <h2>About Me</h2>
          <div className="profile-details">
            <p><strong>User ID:</strong> {user.uid}</p>
            <p><strong>Member Since:</strong> {user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;