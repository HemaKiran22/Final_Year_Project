import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, query, where, getDocs, doc, setDoc, getDoc, updateDoc, orderBy } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase.js";
import { FaUserCircle, FaCog, FaSignOutAlt, FaPlus, FaComments, FaTrophy, FaRobot, FaUser, FaTimes, FaCar, FaMoneyBillWave, FaSun, FaPaperPlane, FaRoute, FaLeaf, FaStar, FaBell, FaHome, FaRoad, FaCalendarAlt, FaUsers, FaQuestionCircle, FaMapMarkerAlt } from 'react-icons/fa';
import logo from "../assets/logo.png";
import './dashboard.css';
import { useNavigate } from 'react-router-dom';


// Import components (you'll need to create these)

import HelpSupport from './HelpSupport';

// Import Google Maps components
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from '@react-google-maps/api';

const Dashboard = () => {
  const [myRides, setMyRides] = useState([]);
  const [allRides, setAllRides] = useState([]);
  const [userName, setUserName] = useState("User");
  const [userId, setUserId] = useState(null);
  const [isAIAgentOpen, setIsAIAgentOpen] = useState(false);
  const [showPostRideForm, setShowPostRideForm] = useState(false);
  const [newRide, setNewRide] = useState({
    destination: '',
    date: '',
    time: '',
    seats: 1,
    community: '',
    price: 0,
  });
  const [userProfile, setUserProfile] = useState(null);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [notifications, setNotifications] = useState(0);
  const [notificationsList, setNotificationsList] = useState([]);
  const [selectedRide, setSelectedRide] = useState(null);
  const [mapCenter, setMapCenter] = useState({ 
    lat: 12.8420,
    lng: 77.6611
  });
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTargetUserId, setRatingTargetUserId] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);

  const navigate = useNavigate();

  const mapContainerStyle = {
    width: '100%',
    height: '300px',
    borderRadius: '12px'
  };

  const options = {
    disableDefaultUI: true,
    zoomControl: true,
  };

  // Load Google Maps script once using Vite env var
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUserName(user.displayName || user.email?.split('@')[0] || "User");
        setUserId(user.uid);

        const userRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userRef);

        if (!docSnap.exists()) {
          await setDoc(userRef, { moneySaved: 0, ridesShared: 0, averageRating: 0, totalRatings: 0 });
        }

        const unsubscribeProfile = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setUserProfile(doc.data());
          }
        });

        // Listen for unread notifications for this user
        const notifsQuery = query(
          collection(db, 'notifications'),
          where('toUserId', '==', user.uid),
          where('read', '==', false),
          orderBy('createdAt', 'desc')
        );
        const unsubscribeNotifs = onSnapshot(notifsQuery, (snapshot) => {
          const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setNotificationsList(notifs);
          setNotifications(notifs.length);
        });
        return () => unsubscribeProfile();
      } else {
        setUserId(null);
        navigate('/login');
      }
    });

    return () => unsubscribeAuth();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;

    const myRidesRef = collection(db, "rides");
    const myRidesQuery = query(myRidesRef, where("driverId", "==", userId));
    const unsubscribeMyRides = onSnapshot(myRidesQuery, (snapshot) => {
      const fetchedMyRides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMyRides(fetchedMyRides);
    });

    return () => unsubscribeMyRides();
  }, [userId]);

  useEffect(() => {
    const ridesRef = collection(db, "rides");
    const unsubscribeAllRides = onSnapshot(ridesRef, (snapshot) => {
      const fetchedRides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllRides(fetchedRides);
    });

    return () => unsubscribeAllRides();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewRide(prev => ({ ...prev, [name]: value }));
  };

  const handlePostRide = async (e) => {
    e.preventDefault();
    if (!userId) {
      alert("You must be logged in to post a ride.");
      return;
    }
    try {
      await addDoc(collection(db, "rides"), {
        ...newRide,
        from: 'Christ University',
        driverName: userName,
        driverId: userId,
        createdAt: new Date(),
        price: Number(newRide.price),
        isCompleted: false,
      });
      alert('Ride posted successfully!');
      setNewRide({
        destination: '',
        date: '',
        time: '',
        seats: 1,
        community: '',
        price: 0,
      });
      setShowPostRideForm(false);
    } catch (e) {
      console.error("Error adding document: ", e);
      alert('Failed to post ride.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("User logged out");
      navigate('/login');
    } catch (e) {
      console.error("Error signing out: ", e);
    }
  };

  const handleOpenNotifications = async () => {
    if (notificationsList.length === 0) return;
    const latest = notificationsList[0];
    try {
      if (latest.id) {
        await updateDoc(doc(db, 'notifications', latest.id), { read: true });
      }
    } catch (e) {
      console.error('Failed to mark notification as read', e);
    }
    if (latest.chatId) {
      navigate(`/privatechat/${latest.chatId}`);
    }
  };

  const handleConfirmRide = async (ride) => {
    if (ride.isCompleted) {
      alert("This ride has already been confirmed.");
      return;
    }
  
    const confirmAction = window.confirm(`Are you sure you want to confirm this ride? This action is irreversible.`);
    
    if (confirmAction) {
      try {
        const moneySavedPerPerson = ride.price / ride.seats;
        
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        const currentMoneySaved = userDoc.data().moneySaved || 0;
        const currentRidesShared = userDoc.data().ridesShared || 0;
        await updateDoc(userRef, {
          moneySaved: currentMoneySaved + moneySavedPerPerson,
          ridesShared: currentRidesShared + 1,
        });
  
        const rideRef = doc(db, 'rides', ride.id);
        await updateDoc(rideRef, {
          isCompleted: true,
        });

        // Create rating notifications for driver and passengers
        const passengerIds = Array.isArray(ride.passengers) ? ride.passengers : [];
        for (const passengerId of passengerIds) {
          // Ask passenger to rate driver
          await addDoc(collection(db, 'notifications'), {
            toUserId: passengerId,
            fromUserId: userId,
            rideId: ride.id,
            type: 'rate',
            rateUserId: ride.driverId,
            createdAt: new Date(),
            read: false,
          });
          // Ask driver to rate this passenger
          await addDoc(collection(db, 'notifications'), {
            toUserId: userId,
            fromUserId: passengerId,
            rideId: ride.id,
            type: 'rate',
            rateUserId: passengerId,
            createdAt: new Date(),
            read: false,
          });
        }
  
        // Open rating modal for the first passenger if exists
        if (passengerIds.length > 0) {
          setRatingTargetUserId(passengerIds[0]);
          setRatingValue(5);
          setShowRatingModal(true);
        }

        alert(`Ride to ${ride.destination} confirmed! You have earned ₹${moneySavedPerPerson}.`);
      } catch (error) {
        console.error("Error confirming ride:", error);
        alert("Failed to confirm the ride. Please try again.");
      }
    }
  };

  const submitRating = async () => {
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
    }
  };
  
  const renderMyRideCard = (ride) => (
    <div key={ride.id} className="ride-card">
      <div className="ride-header">
        <div className="ride-driver">
          <div className="driver-avatar">{userName.charAt(0)}</div>
          <div className="driver-name">You</div>
        </div>
        <div className="ride-date">{ride.date} at {ride.time}</div>
      </div>
      
      <div className="ride-details">
        <div className="ride-route">
          <div className="route-dot"></div>
          <div className="route-line"></div>
          <div className="route-dot end"></div>
          <div className="route-info">
            <div className="route-from">Christ University</div>
            <div className="route-to">{ride.destination}</div>
          </div>
        </div>
        
        <div className="ride-meta">
          <div className="meta-item">
            <i className="fas fa-rupee-sign"></i> {ride.price}
          </div>
          <div className="meta-item">
            <i className="fas fa-user-friends"></i> {ride.seats} seats
          </div>
          <div className="meta-item">
            <i className="fas fa-car"></i> Your Vehicle
          </div>
        </div>
      </div>
      
      <div className="ride-actions">
        {ride.isCompleted ? (
          <span className="ride-confirmed">Confirmed!</span>
        ) : (
          <button className="btn btn-primary" onClick={() => handleConfirmRide(ride)}>Confirm Ride</button>
        )}
      </div>
    </div>
  );

  const getDestinationCoords = (destination) => {
    const commonDestinations = {
      "MG Road": { lat: 12.9757, lng: 77.6053 },
      "Electronic City": { lat: 12.8456, lng: 77.6723 },
      "Koramangala": { lat: 12.9279, lng: 77.6271 },
      "Indiranagar": { lat: 12.9784, lng: 77.6408 },
      "Whitefield": { lat: 12.9698, lng: 77.7499 },
      "Yeshwantpur": { lat: 13.0292, lng: 77.5413 },
      "Jayanagar": { lat: 12.9308, lng: 77.5838 },
      "Marathahalli": { lat: 12.9592, lng: 77.6974 },
    };
    
    return commonDestinations[destination] || { lat: 12.9716, lng: 77.5946 };
  };

  const renderContent = () => {
    switch (activeMenu) {
      case 'messages':
        return <Messages userId={userId} />;
      case 'schedule':
        return <Schedule userId={userId} />;
      case 'members':
        return <Members userId={userId} />;
      case 'help':
        return <HelpSupport />;
      case 'rides':
        return (
          <div className="dashboard-section animate-in delay-2">
            <div className="section-header">
              <h2 className="section-title">My Rides</h2>
            </div>
            
            <div className="rides-grid">
              {myRides.length > 0 ? (
                myRides.map(renderMyRideCard)
              ) : (
                <div className="no-rides">
                  <p>You haven't posted any rides yet.</p>
                  <button className="btn btn-primary" onClick={() => setShowPostRideForm(true)}>Post Your First Ride</button>
                </div>
              )}
            </div>
          </div>
        );
      default:
        return (
          <>
            <div className="dashboard-section animate-in">
              <div className="section-header">
                <h2 className="section-title">
                  <FaMapMarkerAlt style={{marginRight: '10px'}} />
                  Search For Precise Location
                </h2>
                <div className="map-legend">
                  <div className="legend-item">
                    <div className="legend-color driver"></div>
                    <span>Your Rides</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color available"></div>
                    <span>Available Rides</span>
                  </div>
                </div>
              </div>
              
              {isLoaded && (
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  zoom={12}
                  center={mapCenter}
                  options={options}
                >
                  {allRides.map(ride => {
                    const isMyRide = ride.driverId === userId;
                    const coords = getDestinationCoords(ride.destination);
                    
                    return (
                      <Marker
                        key={ride.id}
                        position={coords}
                        icon={{
                          url: isMyRide 
                            ? 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                            : 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
                          scaledSize: new window.google.maps.Size(30, 30)
                        }}
                        onClick={() => {
                          setSelectedRide(ride);
                          setMapCenter(coords);
                        }}
                      />
                    );
                  })}
                  
                  {selectedRide && (
                    <InfoWindow
                      position={getDestinationCoords(selectedRide.destination)}
                      onCloseClick={() => setSelectedRide(null)}
                    >
                      <div className="map-info-window">
                        <h3>{selectedRide.destination}</h3>
                        <p>Driver: {selectedRide.driverName}</p>
                        <p>Date: {selectedRide.date} at {selectedRide.time}</p>
                        <p>Seats: {selectedRide.seats}</p>
                        <p>Price: ₹{selectedRide.price}</p>
                        <button 
                          className="btn btn-primary"
                          onClick={() => {
                            alert(`You selected ride to ${selectedRide.destination}`);
                          }}
                        >
                          View Details
                        </button>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              )}
            </div>
            
            <div className="stats-container">
              <div className="stat-card animate-in">
                <div className="stat-icon rides-icon">
                  <FaRoute />
                </div>
                <div className="stat-info">
                  <h3>{userProfile?.ridesShared || '0'}</h3>
                  <p>Rides Shared</p>
                </div>
              </div>
              
              <div className="stat-card animate-in delay-1">
                <div className="stat-icon money-icon">
                  <FaMoneyBillWave />
                </div>
                <div className="stat-info">
                  <h3>₹{userProfile?.moneySaved || '0'}</h3>
                  <p>Money Saved</p>
                </div>
              </div>
              
              <div className="stat-card animate-in delay-2">
                <div className="stat-icon carbon-icon">
                  <FaLeaf />
                </div>
                <div className="stat-info">
                  <h3>{(((userProfile?.ridesShared || 0) * 4.6).toFixed(2))} kg</h3>
                  <p>CO₂ Reduced</p>
                </div>
              </div>
              
              <div className="stat-card animate-in delay-3">
                <div className="stat-icon rating-icon">
                  <FaStar />
                </div>
                <div className="stat-info">
                  <h3>{(userProfile?.averageRating ? Number(userProfile.averageRating) : 0).toFixed(1)}</h3>
                  <p>Average Rating</p>
                </div>
              </div>
            </div>
            
            <div className="dashboard-section animate-in delay-1">
              <div className="section-header">
                <h2 className="section-title">Quick Actions</h2>
              </div>
              
              <div className="rides-grid">
                <div className="feature-card" onClick={() => setShowPostRideForm(true)}>
                  <div className="card-icon">
                    <FaPlus />
                  </div>
                  <h3>Post a Ride</h3>
                  <p>Share your ride details with the community</p>
                </div>
                
                <div className="feature-card" onClick={() => navigate('/aibot')}>
                  <div className="card-icon">
                    <FaRobot />
                  </div>
                  <h3>AI Agent</h3>
                  <p>Use our AI agent to find the perfect ride</p>
                </div>
                
                <div className="feature-card" onClick={() => navigate('/societyfeed')}>
                  <div className="card-icon">
                    <FaUsers />
                  </div>
                  <h3>Society Feed</h3>
                  <p>See what's happening in your community</p>
                </div>
              </div>
            </div>
            
            <div className="dashboard-section animate-in delay-2">
              <div className="section-header">
                <h2 className="section-title">My Rides</h2>
                <a href="#" className="view-all" onClick={() => setActiveMenu('rides')}>View All</a>
              </div>
              
              <div className="rides-grid">
                {myRides.slice(0, 2).map(renderMyRideCard)}
                {myRides.length === 0 && (
                  <div className="no-rides">
                    <p>You haven't posted any rides yet.</p>
                    <button className="btn btn-primary" onClick={() => setShowPostRideForm(true)}>Post Your First Ride</button>
                  </div>
                )}
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <img src={logo} alt="ColonyCarpool Logo" style={{ height: '30px' }} />
            <span className="logo-text">ColonyCarpool</span>
          </div>
        </div>
        
        <div className="sidebar-menu">
          <div className={`menu-item ${activeMenu === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveMenu('dashboard')}>
            <FaHome className="menu-icon" />
            <span className="menu-text">Dashboard</span>
          </div>
          <div className={`menu-item ${activeMenu === 'rides' ? 'active' : ''}`} onClick={() => setActiveMenu('rides')}>
            <FaRoad className="menu-icon" />
            <span className="menu-text">My Rides</span>
          </div>
          
          
          <div className="menu-label">Community</div>
          
          <div className={`menu-item ${activeMenu === 'feed' ? 'active' : ''}`} onClick={() => navigate('/societyfeed')}>
            <FaUsers className="menu-icon" />
            <span className="menu-text">Society Feed</span>
          </div>
          <div className={`menu-item ${activeMenu === 'leaderboard' ? 'active' : ''}`} onClick={() => navigate('/leaderboard')}>
            <FaTrophy className="menu-icon" />
            <span className="menu-text">Leaderboard</span>
          </div>
          
          
          <div className="menu-label">Account</div>
          
          <div className={`menu-item ${activeMenu === 'profile' ? 'active' : ''}`} onClick={() => navigate('/profile')}>
            <FaUserCircle className="menu-icon" />
            <span className="menu-text">Profile</span>
          </div>
          <div className={`menu-item ${activeMenu === 'settings' ? 'active' : ''}`} onClick={() => navigate('/settings')}>
            <FaCog className="menu-icon" />
            <span className="menu-text">Settings</span>
          </div>
          <div className={`menu-item ${activeMenu === 'help' ? 'active' : ''}`} onClick={() => setActiveMenu('help')}>
            <FaQuestionCircle className="menu-icon" />
            <span className="menu-text">Help & Support</span>
          </div>
          
          <div className="menu-item" onClick={handleLogout}>
            <FaSignOutAlt className="menu-icon" />
            <span className="menu-text">Logout</span>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <div className="header">
          <h1 className="page-title">
            {activeMenu === 'dashboard' && 'Dashboard'}
            {activeMenu === 'rides' && 'My Rides'}
            {activeMenu === 'profile' && 'Profile'}
            {activeMenu === 'settings' && 'Settings'}
            {activeMenu === 'feed' && 'Society Feed'}
            {activeMenu === 'leaderboard' && 'Leaderboard'}
            {activeMenu === 'help' && 'Help & Support'}
          </h1>
          <div className="user-menu">
            <div className="notification-bell" onClick={handleOpenNotifications}>
              <FaBell />
              <span className="notification-badge">{notifications}</span>
            </div>
            <div className="user-profile">
              <div className="user-avatar">{userName.charAt(0)}</div>
              <div className="user-name">{userName}</div>
            </div>
          </div>
        </div>
        
        {/* Content based on active menu */}
        {renderContent()}
      </div>

      {/* Post Ride Form Modal */}
      {showPostRideForm && (
        <div className="form-modal-overlay">
          <div className="form-modal">
            <button className="close-btn" onClick={() => setShowPostRideForm(false)}>
              <FaTimes />
            </button>
            <h2>Post a New Ride</h2>
            <form onSubmit={handlePostRide}>
              <div className="form-group">
                <label>From:</label>
                <input type="text" name="from" value='Christ University' readOnly />
              </div>
              <div className="form-group">
                <label>Destination:</label>
                <input type="text" name="destination" value={newRide.destination} onChange={handleInputChange} required />
              </div>
              <div className="form-group-inline">
                <div className="form-group">
                  <label>Date:</label>
                  <input type="date" name="date" value={newRide.date} onChange={handleInputChange} required />
                </div>
                <div className="form-group">
                  <label>Time:</label>
                  <input type="time" name="time" value={newRide.time} onChange={handleInputChange} required />
                </div>
              </div>
              <div className="form-group">
                <label>Seats Available:</label>
                <input type="number" name="seats" value={newRide.seats} onChange={handleInputChange} min="1" required />
              </div>
              <div className="form-group">
                <label>Price:</label>
                <input type="number" name="price" value={newRide.price} onChange={handleInputChange} required />
              </div>
              <div className="form-group">
                <label>Community/Society:</label>
                <input type="text" name="community" value={newRide.community} onChange={handleInputChange} required />
              </div>
              <button type="submit" className="post-ride-submit-btn">Post Ride</button>
            </form>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="form-modal-overlay">
          <div className="form-modal">
            <button className="close-btn" onClick={() => setShowRatingModal(false)}>
              <FaTimes />
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
            <button className="post-ride-submit-btn" onClick={submitRating}>Submit Rating</button>
          </div>
        </div>
      )}

     

      <footer className="dashboard-footer">
        <p>© 2025 Colony Carpool</p>
      </footer>
    </div>
  );
};

export default Dashboard;