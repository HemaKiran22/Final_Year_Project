import React, { useState, useEffect, useMemo } from 'react';
import { FaUserCircle, FaCar, FaMoneyBillWave, FaPhone, FaHome, FaIdBadge, FaShieldAlt, FaStar } from 'react-icons/fa';
import { auth } from '../firebase.js';
import { doc as firestoreDoc, onSnapshot as firestoreOnSnapshot, updateDoc } from "firebase/firestore";
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
    phoneNumber: '',
    housingSociety: '',
    flatNumber: '',
    bio: '',
    vehicleType: '',
    emergencyContact: ''
  });

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setEditableUserInfo(prev => ({
          ...prev,
          displayName: currentUser.displayName || '',
          email: currentUser.email || '',
        }));
        const userRef = firestoreDoc(db, 'users', currentUser.uid);
        const unsubscribeProfile = firestoreOnSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile(data);
            setEditableUserInfo(prev => ({
              ...prev,
              phoneNumber: data.phoneNumber || '',
              housingSociety: data.housingSociety || '',
              flatNumber: data.flatNumber || '',
              bio: data.bio || '',
              vehicleType: data.vehicleType || '',
              emergencyContact: data.emergencyContact || ''
            }));
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
      // Save additional profile fields to Firestore
      if (auth.currentUser?.uid) {
        const uref = firestoreDoc(db, 'users', auth.currentUser.uid);
        await updateDoc(uref, {
          phoneNumber: editableUserInfo.phoneNumber || '',
          housingSociety: editableUserInfo.housingSociety || '',
          flatNumber: editableUserInfo.flatNumber || '',
          bio: editableUserInfo.bio || '',
          vehicleType: editableUserInfo.vehicleType || '',
          emergencyContact: editableUserInfo.emergencyContact || ''
        });
      }
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

  // Derived: profile completeness and trust category
  const completeness = useMemo(() => {
    const fields = ['displayName','phoneNumber','housingSociety','flatNumber','bio','vehicleType','emergencyContact'];
    const filled = fields.filter(f => {
      const val = (f === 'displayName') ? (editableUserInfo.displayName || user?.displayName) : userProfile?.[f];
      return !!(val && String(val).trim().length > 0);
    }).length;
    return Math.round((filled / fields.length) * 100);
  }, [editableUserInfo.displayName, user?.displayName, userProfile]);

  const trust = useMemo(() => {
    const idVerified = userProfile?.status === 'approved' ? 1 : 0;
    const avgRating = Number(userProfile?.averageRating || 0);
    const ridesCompleted = Number(userProfile?.ridesShared || 0);
    const comp = completeness; // 0-100
    // Simple heuristic score in [0,1]
    const score = 0.4 * idVerified + 0.3 * (avgRating / 5) + 0.2 * (Math.min(ridesCompleted, 20) / 20) + 0.1 * (comp / 100);
    let label = 'Neutral';
    let color = 'neutral';
    if (score < 0.4) { label = 'Risky'; color = 'risky'; }
    else if (score >= 0.7) { label = 'Highly Trusted'; color = 'trusted'; }
    return { score: Math.round(score * 100), label, color };
  }, [userProfile, completeness]);

  if (!user) {
    return <div className="loading">Loading profile...</div>;
  }

  return (
    <div className="page-container">
      <div className="profile-card">
        <div className="profile-header">
          <div className="avatar-ring">
            <FaUserCircle size={100} className="profile-icon-large" />
          </div>
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
            <div className={`trust-badge ${trust.color}`} title={`Score: ${trust.score}/100`}>
              {trust.label}
            </div>
            <div className="trust-meter" aria-label={`Trust ${trust.score}%`} title={`Trust ${trust.score}%`}>
              <div
                className="trust-meter-ring"
                style={{ background: `conic-gradient(#22c55e ${trust.score * 3.6}deg, #e5e7eb 0deg)` }}
              >
                <div className="trust-meter-inner">{trust.score}</div>
              </div>
              <span className="trust-meter-label">Trust</span>
            </div>

            {/* Info chips */}
            <div className="info-chips">
              {(userProfile?.phoneNumber) && (
                <div className="chip"><FaPhone /> {userProfile.phoneNumber}</div>
              )}
              {(userProfile?.housingSociety) && (
                <div className="chip"><FaHome /> {userProfile.housingSociety}{userProfile?.flatNumber ? ` • ${userProfile.flatNumber}` : ''}</div>
              )}
              {(userProfile?.vehicleType) && (
                <div className="chip"><FaCar /> {userProfile.vehicleType}</div>
              )}
              {(userProfile?.status) && (
                <div className="chip"><FaIdBadge /> {String(userProfile.status).toUpperCase()}</div>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <details style={{ cursor: 'pointer' }}>
                <summary style={{ color: '#4b5563' }}>How is trust computed?</summary>
                <div style={{ fontSize: '0.9rem', color: '#374151', marginTop: 6 }}>
                  <div>• Verification: 40% (approved account)</div>
                  <div>• Average rating: 30% (out of 5)</div>
                  <div>• Ride history: 20% (capped at 20 rides)</div>
                  <div>• Profile completeness: 10%</div>
                  <div style={{ marginTop: 6, color: '#6b7280' }}>Tip: Complete your profile and maintain high ratings to improve your trust.</div>
                </div>
              </details>
            </div>
            {isEditing ? (
              <button className="save-btn" onClick={handleSave}>Save Changes</button>
            ) : (
              <button className="edit-btn" onClick={handleEdit}>Edit Profile</button>
            )}
          </div>
        </div>
        
        {/* Completeness progress */}
        <div className="completeness-section">
          <div className="completeness-label">
            Profile completeness
            <span>{completeness}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${completeness}%` }} />
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
              <span>₹{Number(userProfile?.moneySaved || 0).toFixed(2)}</span>
              <p>Money Saved</p>
            </div>
          </div>
          <div className="profile-metric-card">
            <div className="metric-icon rating">⭐</div>
            <div className="metric-content">
              <span>{(userProfile?.averageRating || 0).toFixed(1)}</span>
              <p>Avg Rating ({userProfile?.totalRatings || 0})</p>
            </div>
          </div>
        </div>

        {/* Identity & Safety */}
        <div className="cards-grid">
          <div className="info-card">
            <div className="info-card-title"><FaShieldAlt /> Identity & Safety</div>
            <div className="info-list">
              <div className="info-row"><span>Status</span><strong>{userProfile?.status || 'N/A'}</strong></div>
              <div className="info-row"><span>Member Since</span><strong>{user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'N/A'}</strong></div>
              <div className="info-row">
                <span>Ratings</span>
                <strong>
                  {Array.from({ length: Math.round(Number(userProfile?.averageRating || 0)) }).map((_, i) => (
                    <FaStar key={i} color="#f59e0b" />
                  ))}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-details-section">
          <h2>About Me</h2>
          <div className="profile-details">
            <p><strong>User ID:</strong> {user.uid}</p>
            <p><strong>Member Since:</strong> {user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'N/A'}</p>
            <p><strong>Status:</strong> {userProfile?.status || 'N/A'}</p>
            {!isEditing ? (
              <>
                <p><strong>Phone:</strong> {userProfile?.phoneNumber || '—'}</p>
                <p><strong>Society:</strong> {userProfile?.housingSociety || '—'} {userProfile?.flatNumber ? `(Flat ${userProfile.flatNumber})` : ''}</p>
                {userProfile?.vehicleType && <p><strong>Vehicle:</strong> {userProfile.vehicleType}</p>}
                {userProfile?.emergencyContact && <p><strong>Emergency Contact:</strong> {userProfile.emergencyContact}</p>}
                {userProfile?.bio && <p><strong>Bio:</strong> {userProfile.bio}</p>}
              </>
            ) : (
              <div className="edit-grid">
                <div className="field">
                  <label>Phone</label>
                  <input name="phoneNumber" value={editableUserInfo.phoneNumber} onChange={handleInputChange} />
                </div>
                <div className="field">
                  <label>Housing Society</label>
                  <input name="housingSociety" value={editableUserInfo.housingSociety} onChange={handleInputChange} />
                </div>
                <div className="field">
                  <label>Flat Number</label>
                  <input name="flatNumber" value={editableUserInfo.flatNumber} onChange={handleInputChange} />
                </div>
                <div className="field">
                  <label>Vehicle Type</label>
                  <input name="vehicleType" value={editableUserInfo.vehicleType} onChange={handleInputChange} placeholder="car / auto / bike" />
                </div>
                <div className="field">
                  <label>Emergency Contact</label>
                  <input name="emergencyContact" value={editableUserInfo.emergencyContact} onChange={handleInputChange} />
                </div>
                <div className="field full">
                  <label>Bio</label>
                  <textarea name="bio" value={editableUserInfo.bio} onChange={handleInputChange} rows={3} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;