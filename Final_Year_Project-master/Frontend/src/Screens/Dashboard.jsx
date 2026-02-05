import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, query, where, getDocs, doc, setDoc, getDoc, updateDoc, orderBy, runTransaction } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase.js";
import { FaUserCircle, FaCog, FaSignOutAlt, FaPlus, FaComments, FaTrophy, FaRobot, FaUser, FaTimes, FaCar, FaMoneyBillWave, FaSun, FaPaperPlane, FaRoute, FaLeaf, FaStar, FaBell, FaHome, FaRoad, FaCalendarAlt, FaUsers, FaQuestionCircle, FaMapMarkerAlt, FaMoon, FaBullseye, FaBolt, FaFire, FaChartLine, FaMedal, FaBars } from 'react-icons/fa';
import logo from "../assets/logo.png";
import './Dashboard.css';
import { useNavigate } from 'react-router-dom';
import { clusterRides, formatClusterResults, getClusteringStats } from '../services/clusteringService';
import ClusteredRideGroups from '../components/ClusteredRideGroups';
import { startTrustModel, buildPersonalizedSuggestions } from '../services/trustModelService';
import { buildCommunityRecommendations, startCircleDiscussion } from '../services/communityAIService';

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
    vehicleType: 'car',
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
  const [clusteredGroups, setClusteredGroups] = useState([]);
  const [clusteringStats, setClusteringStats] = useState(null);
  const [showClusterView, setShowClusterView] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState(null);
  const [pendingChatRideId, setPendingChatRideId] = useState(null);
  const [theme, setTheme] = useState('light');
  const [rideFilters, setRideFilters] = useState({ destination: '', date: '', status: 'all', seatsMin: 0 });
  const [suggestedRides, setSuggestedRides] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState({ rides: 0, saved: 0, co2: 0 });
  const [monthlyStats, setMonthlyStats] = useState({ rides: 0, saved: 0, co2: 0 });
  const [achievements, setAchievements] = useState([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  // Trust Model states
  const [trustScore, setTrustScore] = useState(null);
  const [securityLevel, setSecurityLevel] = useState('low');
  const [securityMeasures, setSecurityMeasures] = useState([]);
  const [safetyAlerts, setSafetyAlerts] = useState([]);
  const [suggestedConnections, setSuggestedConnections] = useState([]);
  const [suggestedEvents, setSuggestedEvents] = useState([]);
  const [recommendedCircles, setRecommendedCircles] = useState([]);
  const suggestionsUnsubRef = useRef(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tourSteps = [
    {
      title: 'Explore your dashboard',
      body: 'See quick stats, notifications, and shortcuts to post or join rides.',
      targetMenu: 'dashboard',
    },
    {
      title: 'Check or post rides',
      body: 'Open My Rides to confirm rides, chat with co-riders, or post a new one.',
      targetMenu: 'rides',
    },
    {
      title: 'Join AI ride groups',
      body: 'Ride Groups clusters nearby riders so you can join the best match fast.',
      targetMenu: 'groups',
    },
    {
      title: 'Stay social & earn badges',
      body: 'Visit Society Feed to share updates and Leaderboard to track your impact.',
      targetMenu: 'leaderboard',
    },
  ];
  const shownNotifIdsRef = useRef(new Set());

  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const mapContainerStyle = {
    width: '100%',
    height: isMobile ? '240px' : '300px',
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

  // Start tour for first-time visitors
  useEffect(() => {
    const hasSeenTour = localStorage.getItem('dashboardTourSeen');
    if (!hasSeenTour) {
      setShowTour(true);
    }
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('cc-theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setTheme(savedTheme);
    }
  }, []);

  // Show a browser notification when a new chat message notification arrives
  useEffect(() => {
    if (!notificationsList.length || !userId) return;

    notificationsList.forEach((notif) => {
      if (notif.type === 'message' && notif.fromUserId !== userId) {
        if (shownNotifIdsRef.current.has(notif.id)) return;
        shownNotifIdsRef.current.add(notif.id);

        if ('Notification' in window) {
          if (Notification.permission === 'default') {
            Notification.requestPermission();
          }
          if (Notification.permission === 'granted') {
            new Notification('New chat message', {
              body: notif.text || 'You received a new message',
              icon: '/logo.png',
            });
          }
        }
      }
    });
  }, [notificationsList, userId]);

  useEffect(() => {
    localStorage.setItem('cc-theme', theme);
  }, [theme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only trigger if not typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.key.toLowerCase()) {
        case 'p':
          setShowPostRideForm(true);
          break;
        case 'g':
          setActiveMenu('groups');
          break;
        case 'r':
          setActiveMenu('rides');
          break;
        case 'd':
          setActiveMenu('dashboard');
          break;
        case '?':
          setShowShortcutsHelp(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

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

        // Start Trust Model subscriptions and personalized suggestions
        const stopTrust = startTrustModel({
          db,
          userId: user.uid,
          onUpdate: async ({ score, signals, security, alerts }) => {
            setTrustScore(score);
            setSecurityLevel(security.level);
            setSecurityMeasures(security.measures);
            setSafetyAlerts(alerts);

            try {
              const { suggestions, unsubscribe } = await buildPersonalizedSuggestions({
                currentUserId: user.uid,
                db,
                signals,
              });
              setSuggestedConnections(suggestions.connections || []);
              setSuggestedEvents(suggestions.events || []);
              if (typeof suggestionsUnsubRef.current === 'function') {
                try { suggestionsUnsubRef.current(); } catch {}
              }
              suggestionsUnsubRef.current = unsubscribe;
            } catch (e) {
              console.warn('Suggestion builder failed', e);
            }

            // Community AI: build circles and additional recommendations
            try {
              const recs = await buildCommunityRecommendations({ db, currentUserId: user.uid, signals });
              // Merge connections (AI + base)
              setSuggestedConnections(prev => {
                const map = new Map();
                [...(recs.connections || []), ...prev].forEach(c => map.set(c.id, c));
                return Array.from(map.values()).slice(0, 8);
              });
              setRecommendedCircles(recs.circles || []);
              // Events: prefer union while keeping short list
              setSuggestedEvents(prev => {
                const seen = new Set((prev || []).map(e => e.id));
                const merged = [...prev];
                for (const e of (recs.events || [])) if (!seen.has(e.id)) merged.push(e);
                return merged.slice(0, 4);
              });
            } catch (err) {
              console.warn('Community AI failed', err);
            }
          }
        });

        // Listen for unread notifications for this user
        const notifsQuery = query(
          collection(db, 'notifications'),
          where('toUserId', '==', user.uid),
          where('read', '==', false),
          orderBy('createdAt', 'desc')
        );

        // Primary listener (requires composite index)
        let unsubscribeNotifs = onSnapshot(
          notifsQuery,
          (snapshot) => {
            const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setNotificationsList(notifs);
            setNotifications(notifs.length);
          },
          (error) => {
            // Fallback path when composite index is missing
            if (error?.code === 'failed-precondition') {
              try { unsubscribeNotifs && unsubscribeNotifs(); } catch {}
              const fallbackQ = query(
                collection(db, 'notifications'),
                where('toUserId', '==', user.uid)
              );
              unsubscribeNotifs = onSnapshot(fallbackQ, (snapshot) => {
                const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                // Client-side filter and sort to avoid index requirement
                const filtered = all
                  .filter(n => n.read === false)
                  .sort((a, b) => {
                    const ad = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
                    const bd = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
                    return bd - ad; // desc
                  });
                setNotificationsList(filtered);
                setNotifications(filtered.length);
              });
            } else {
              console.warn('Notifications listener error:', error);
            }
          }
        );
        return () => { try { unsubscribeProfile(); } catch {}; try { stopTrust && stopTrust(); } catch {}; try { suggestionsUnsubRef.current && suggestionsUnsubRef.current(); } catch {} };
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
    const driverQueryRef = query(myRidesRef, where("driverId", "==", userId));
    const passengerQueryRef = query(myRidesRef, where("passengers", "array-contains", userId));

    // Collect results from both queries and merge by id
    let driverUnsub = () => {};
    let passengerUnsub = () => {};

    const mergeAndSet = (driverDocs, passengerDocs) => {
      const map = new Map();
      driverDocs.forEach(d => map.set(d.id, d));
      passengerDocs.forEach(d => map.set(d.id, d));
      const merged = Array.from(map.values());
      setMyRides(merged);

      if (merged.length > 0) {
        const userCommunity = merged[0].community;
        if (userCommunity) calculateSuggestedRides(userCommunity);
      }

      calculateStatsAndAchievements(merged);
    };

    let driverDocs = [];
    let passengerDocs = [];

    driverUnsub = onSnapshot(driverQueryRef, (snapshot) => {
      driverDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      mergeAndSet(driverDocs, passengerDocs);
    });

    passengerUnsub = onSnapshot(passengerQueryRef, (snapshot) => {
      passengerDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      mergeAndSet(driverDocs, passengerDocs);
    });

    return () => { try { driverUnsub(); } catch {} try { passengerUnsub(); } catch {} };
  }, [userId, allRides]);

  useEffect(() => {
    const ridesRef = collection(db, "rides");
    const unsubscribeAllRides = onSnapshot(ridesRef, (snapshot) => {
      const fetchedRides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllRides(fetchedRides);
      
      // Auto-cluster only active (future, non-completed) rides
      const now = new Date();
      const activeRides = fetchedRides.filter(r => {
        // Exclude completed rides
        if (r.status === 'Completed') return false;
        // If date/time missing, treat as active (draft/upcoming)
        if (!r.date || !r.time) return true;
        const rideDateTime = new Date(`${r.date} ${r.time}`);
        return rideDateTime > now;
      });
      performClustering(activeRides);
      
      // Check for ride reminders
      checkUpcomingRides(fetchedRides);
    });

    return () => unsubscribeAllRides();
  }, []);

  // Ride reminder system
  const checkUpcomingRides = (rides) => {
    if (!userId) return;
    
    const now = new Date();
    const myUpcomingRides = rides.filter(r => 
      (r.driverId === userId || (Array.isArray(r.passengers) && r.passengers.includes(userId))) &&
      r.status !== 'Completed' &&
      r.date &&
      r.time
    );

    myUpcomingRides.forEach(ride => {
      const rideDateTime = new Date(`${ride.date} ${ride.time}`);
      const timeDiff = rideDateTime - now;
      const minutesUntilRide = Math.floor(timeDiff / (1000 * 60));

      // Show reminder at 60 min and 30 min before
      if (minutesUntilRide === 60 || minutesUntilRide === 30) {
        showRideReminder(ride, minutesUntilRide);
      }
    });
  };

  const showRideReminder = (ride, minutesUntil) => {
    const reminder = {
      id: `reminder-${ride.id}-${minutesUntil}`,
      rideId: ride.id,
      message: `Upcoming ride to ${ride.destination} in ${minutesUntil} minutes!`,
      time: new Date(),
    };
    
    // Show browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ColonyCarpool Ride Reminder', {
        body: reminder.message,
        icon: '/logo.png',
      });
    }
  };

  const sendRunningLateMessage = async (ride) => {
    try {
      // Find existing chat or create notification
      const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
      const recipients = ride.driverId === userId ? passengers : [ride.driverId];
      
      for (const recipientId of recipients) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: recipientId,
          fromUserId: userId,
          rideId: ride.id,
          type: 'running-late',
          message: `${userName} is running late for the ride to ${ride.destination}`,
          createdAt: new Date(),
          read: false,
        });
      }
      alert('Notified co-riders that you are running late.');
    } catch (err) {
      console.error('Failed to send running late message:', err);
    }
  };

  // Calculate weekly/monthly stats and achievements
  const calculateStatsAndAchievements = (rides) => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Filter rides by time period
    const weeklyRides = rides.filter(r => r.createdAt?.toDate?.() > oneWeekAgo || new Date(r.createdAt) > oneWeekAgo);
    const monthlyRides = rides.filter(r => r.createdAt?.toDate?.() > oneMonthAgo || new Date(r.createdAt) > oneMonthAgo);

    // Calculate weekly stats
    const weeklySaved = weeklyRides.reduce((sum, r) => sum + (Number(r.price) || 0) / (Number(r.seats) || 1), 0);
    const weeklyCO2 = weeklyRides.length * 4.6;
    setWeeklyStats({ rides: weeklyRides.length, saved: weeklySaved, co2: weeklyCO2 });

    // Calculate monthly stats
    const monthlySaved = monthlyRides.reduce((sum, r) => sum + (Number(r.price) || 0) / (Number(r.seats) || 1), 0);
    const monthlyCO2 = monthlyRides.length * 4.6;
    setMonthlyStats({ rides: monthlyRides.length, saved: monthlySaved, co2: monthlyCO2 });

    // Calculate streak (consecutive days with rides)
    const sortedDates = rides
      .map(r => {
        const date = r.createdAt?.toDate?.() || new Date(r.createdAt);
        return date.toDateString();
      })
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => new Date(b) - new Date(a));

    let streak = 0;
    let checkDate = new Date();
    for (const dateStr of sortedDates) {
      const rideDate = new Date(dateStr);
      const diffDays = Math.floor((checkDate - rideDate) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) {
        streak++;
        checkDate = rideDate;
      } else {
        break;
      }
    }
    setCurrentStreak(streak);

    // Calculate achievements
    const newAchievements = [];
    if (rides.length >= 1) newAchievements.push({ id: 'first', title: 'First Ride', icon: <FaCar />, desc: 'Posted your first ride' });
    if (rides.length >= 5) newAchievements.push({ id: 'regular', title: 'Regular Rider', icon: <FaBullseye />, desc: '5 rides shared' });
    if (rides.length >= 10) newAchievements.push({ id: 'veteran', title: 'Veteran', icon: <FaTrophy />, desc: '10 rides shared' });
    if (weeklyRides.length >= 3) newAchievements.push({ id: 'weekly-warrior', title: 'Weekly Warrior', icon: <FaBolt />, desc: '3 rides this week' });
    if (weeklyCO2 >= 20) newAchievements.push({ id: 'eco-hero', title: 'Eco Hero', icon: <FaLeaf />, desc: 'Saved 20kg CO₂ this week' });
    if (streak >= 3) newAchievements.push({ id: 'streak', title: `${streak}-Day Streak`, icon: <FaFire />, desc: 'Riding consistently' });
    setAchievements(newAchievements);
  };

  // Calculate suggested rides based on user's community and time preferences
  const calculateSuggestedRides = (userCommunity) => {
    if (!allRides || allRides.length === 0) {
      setSuggestedRides([]);
      return;
    }

    const now = new Date();
    const suggested = allRides
      .filter(ride => 
        ride.driverId !== userId && // Not my ride
        ride.community === userCommunity && // Same community
        ride.status === 'Pending' && // Available
        new Date(`${ride.date} ${ride.time}`) > now && // Future ride
        (Array.isArray(ride.passengers) ? ride.passengers.length : 0) < (ride.seats || 1) // Has seats
      )
      .sort((a, b) => {
        const timeA = new Date(`${a.date} ${a.time}`);
        const timeB = new Date(`${b.date} ${b.time}`);
        return timeA - timeB; // Sort by soonest first
      })
      .slice(0, 3); // Top 3 suggestions

    setSuggestedRides(suggested);
  };

  // Clustering function
  const performClustering = (rides) => {
    if (!rides || rides.length === 0) {
      setClusteredGroups([]);
      setClusteringStats(null);
      return;
    }

    // Prepare ride data for clustering
    const ridesForClustering = rides.map(ride => ({
      ...ride,
      pickupLat: ride.pickupLat || 12.8420, // Default to Bangalore if not set
      pickupLng: ride.pickupLng || 77.6611,
      pickupLocation: ride.community,
      userName: ride.driverName
    }));

    // Cluster rides (max 3 per group)
    const clusters = clusterRides(ridesForClustering, {
      maxGroupSize: 3,
      timeWindowMinutes: 15,
      proximityKm: 2
    });

    // Format for display
    const formatted = formatClusterResults(clusters, { timeWindowMinutes: 15, proximityKm: 2 });
    setClusteredGroups(formatted);

    // Calculate stats
    const stats = getClusteringStats(ridesForClustering, clusters);
    setClusteringStats(stats);
  };

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
        seats: Number(newRide.seats),
        vehicleType: newRide.vehicleType,
        isCompleted: false,
        status: 'Pending',
        passengers: [],
      });
      alert('Ride posted successfully!');
      setNewRide({
        destination: '',
        date: '',
        time: '',
        seats: 1,
        community: '',
        price: 0,
        vehicleType: 'car',
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
      if (latest.chatType === 'private') {
        navigate(`/privatechat/${latest.chatId}`);
      } else {
        navigate(`/groupchat/${latest.chatId}`);
      }
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
          status: 'Completed',
        });

        // Determine who to rate based on role
        const passengerIds = Array.isArray(ride.passengers) ? ride.passengers : [];
        const isDriver = ride.driverId === userId;
        
        // Create rating notifications for driver and passengers
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
  
        alert(`Ride to ${ride.destination} confirmed! You have earned ₹${moneySavedPerPerson.toFixed(2)}.`);
        
        // Show rating modal based on role
        if (isDriver && passengerIds.length > 0) {
          // Driver rates the first passenger
          setRatingTargetUserId(passengerIds[0]);
          setRatingValue(5);
          setShowRatingModal(true);
        } else if (!isDriver && ride.driverId) {
          // Passenger rates the driver
          setRatingTargetUserId(ride.driverId);
          setRatingValue(5);
          setShowRatingModal(true);
        }
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

  const handleJoinGroup = async (group) => {
    if (!userId) {
      alert('You must be logged in to join a group.');
      navigate('/login');
      return;
    }

    // Prevent joining if current user is already in this group (as driver or passenger)
    const alreadyMember = (
      Array.isArray(group?.memberUserIds) && group.memberUserIds.includes(userId)
    ) || (
      Array.isArray(group?.rideOptions) && group.rideOptions.some(o => o.driverId === userId)
    );
    if (alreadyMember) {
      alert('You are already part of this group.');
      return;
    }

    // Prefer joining an existing ride with seats; if none, create a shared ride (driverless)
    let candidateRide = group?.rideOptions?.find(r => r.seatsRemaining > 0 && r.rideId);

    setJoiningGroupId(group.groupId);
    try {
      // If no suitable ride exists, create a shared (driverless) ride for this group
      if (!candidateRide) {
        const [community, destination] = (group.route || '').split(' → ').map(s => (s || '').trim());
        const newRide = {
          driverId: null,
          driverName: 'Shared Ride',
          isShared: true,
          community: community || 'Community',
          destination: destination || 'Destination',
          date: group.date,
          time: group.time,
          vehicleType: group.vehicleType || 'car',
          seats: group.capacity || 3,
          price: group.estimatedCost || 0,
          status: 'Forming',
          passengers: [userId],
          createdAt: new Date(),
          createdBy: userId,
        };

        const created = await addDoc(collection(db, 'rides'), newRide);
        alert('You have successfully joined the group.');
        setPendingChatRideId(created.id);
      } else {
        await runTransaction(db, async (transaction) => {
          const rideRef = doc(db, 'rides', candidateRide.rideId);
          const rideSnap = await transaction.get(rideRef);
          if (!rideSnap.exists()) {
            throw new Error('Ride no longer exists.');
          }

          const rideData = rideSnap.data();
          const seats = Number(rideData.seats) || 0;
          const passengersArr = Array.isArray(rideData.passengers) ? rideData.passengers : [];

          if (passengersArr.includes(userId)) {
            throw new Error('You already joined this ride.');
          }

          if (seats > 0 && passengersArr.length >= seats) {
            throw new Error('No seats left in this ride.');
          }

          transaction.update(rideRef, {
            passengers: [...passengersArr, userId],
          });
        });

        // Best-effort notify the ride creator (if any)
        if (candidateRide.driverId) {
          try {
            await addDoc(collection(db, 'notifications'), {
              toUserId: candidateRide.driverId,
              fromUserId: userId,
              rideId: candidateRide.rideId,
              type: 'join',
              createdAt: new Date(),
              read: false,
              message: `${userName} joined your ride group.`
            });
          } catch (notifyErr) {
            console.warn('Notification write skipped (permissions?):', notifyErr);
          }
        }

        alert('You have successfully joined the group.');
        setPendingChatRideId(candidateRide.rideId);
      }
    } catch (error) {
      console.error('Failed to join group:', error);
      const fallback = error?.code === 'permission-denied'
        ? 'You do not have permission to join this ride. Please ensure you are logged in.'
        : 'Could not join this group. Please try another.';
      alert(error.message || fallback);
    } finally {
      setJoiningGroupId(null);
    }
  };
  
  const getStatusColor = (status) => {
    switch(status) {
      case 'Pending': return '#fbbf24';
      case 'Accepted': return '#60a5fa';
      case 'Completed': return '#34d399';
      default: return '#9ca3af';
    }
  };

  const renderMyRideCard = (ride) => (
    <div key={ride.id} className="ride-card">
      <div className="ride-header">
        <div className="ride-driver">
          <div className="driver-avatar">{userName.charAt(0)}</div>
          <div className="driver-name">You</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="status-chip" style={{ background: getStatusColor(ride.status || 'Pending'), color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
            {ride.status || 'Pending'}
          </span>
          <div className="ride-date">{ride.date} at {ride.time}</div>
        </div>
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
          <>
            <button className="btn btn-primary" onClick={() => handleConfirmRide(ride)}>Confirm Ride</button>
            <button 
              className="btn btn-secondary" 
              onClick={() => sendRunningLateMessage(ride)}
              style={{ marginLeft: '10px', background: '#fbbf24', border: 'none' }}
            >
              Running Late
            </button>
          </>
        )}
        <button 
          className="btn btn-secondary"
          onClick={() => navigate(`/groupchat/${ride.id}`)}
          style={{ marginLeft: '10px' }}
        >
          Group Chat
        </button>
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

  const handleSkipTour = () => {
    localStorage.setItem('dashboardTourSeen', '1');
    setShowTour(false);
  };

  const handleTourPrev = () => {
    setTourStep((prev) => Math.max(0, prev - 1));
  };

  const handleTourNext = () => {
    if (tourStep < tourSteps.length - 1) {
      const nextStep = tourStep + 1;
      setTourStep(nextStep);
      const targetMenu = tourSteps[nextStep]?.targetMenu;
      if (targetMenu === 'leaderboard') navigate('/leaderboard');
      if (targetMenu === 'feed') navigate('/societyfeed');
      if (targetMenu === 'rides' || targetMenu === 'groups' || targetMenu === 'dashboard') setActiveMenu(targetMenu);
    } else {
      localStorage.setItem('dashboardTourSeen', '1');
      setShowTour(false);
    }
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
      case 'groups':
        return (
          <div className="dashboard-section animate-in delay-2">
            <div className="section-header">
              <h2 className="section-title">Optimized Ride Groups</h2>
              <p className="section-subtitle">AI-powered carpooling groups to save money and reduce traffic</p>
            </div>
            {pendingChatRideId && (
              <div style={{
                background: '#eef2ff',
                border: '1px solid #c7d2fe',
                padding: '12px 16px',
                borderRadius: '10px',
                marginBottom: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>You joined the group. Open the group private chat to coordinate.</span>
                <button className="btn btn-primary" onClick={() => navigate(`/groupchat/${pendingChatRideId}`)}>Group Private Chat</button>
              </div>
            )}
            <ClusteredRideGroups 
              clusters={clusteredGroups} 
              stats={clusteringStats}
              onJoinGroup={handleJoinGroup}
              joiningGroupId={joiningGroupId}
              chatRideId={pendingChatRideId}
              currentUserId={userId}
            />
          </div>
        );
      case 'rides':
        const filteredMyRides = myRides.filter(r => {
          if (rideFilters.destination && !r.destination.toLowerCase().includes(rideFilters.destination.toLowerCase())) return false;
          if (rideFilters.date && r.date !== rideFilters.date) return false;
          if (rideFilters.status !== 'all' && r.status !== rideFilters.status) return false;
          if (rideFilters.seatsMin > 0) {
            const availableSeats = (r.seats || 0) - (Array.isArray(r.passengers) ? r.passengers.length : 0);
            if (availableSeats < rideFilters.seatsMin) return false;
          }
          return true;
        });

        return (
          <div className="dashboard-section animate-in delay-2">
            <div className="section-header">
              <h2 className="section-title">My Rides</h2>
            </div>
            
            {/* Filters */}
            <div className="ride-filters" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder="Filter by destination" 
                value={rideFilters.destination}
                onChange={(e) => setRideFilters(prev => ({ ...prev, destination: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--light-gray)', flex: '1', minWidth: '150px' }}
              />
              <input 
                type="date" 
                value={rideFilters.date}
                onChange={(e) => setRideFilters(prev => ({ ...prev, date: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--light-gray)' }}
              />
              <select 
                value={rideFilters.status}
                onChange={(e) => setRideFilters(prev => ({ ...prev, status: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--light-gray)' }}
              >
                <option value="all">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Accepted">Accepted</option>
                <option value="Completed">Completed</option>
              </select>
              <input 
                type="number" 
                placeholder="Min seats" 
                min="0"
                value={rideFilters.seatsMin || ''}
                onChange={(e) => setRideFilters(prev => ({ ...prev, seatsMin: Number(e.target.value) || 0 }))}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--light-gray)', width: '120px' }}
              />
              <button 
                onClick={() => setRideFilters({ destination: '', date: '', status: 'all', seatsMin: 0 })}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--light-gray)', background: 'white', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
            
            <div className="rides-grid">
              {filteredMyRides.length > 0 ? (
                filteredMyRides.map(renderMyRideCard)
              ) : (
                <div className="no-rides">
                  <p>No rides match your filters.</p>
                  <button className="btn btn-primary" onClick={() => setRideFilters({ destination: '', date: '', status: 'all', seatsMin: 0 })}>Clear Filters</button>
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
                  <div className="legend-item">
                    <div className="legend-color" style={{ background: '#fbbf24' }}></div>
                    <span>Groups (seats left)</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ background: '#d9534f' }}></div>
                    <span>Full Groups</span>
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
                  {/* Show clustered groups on map */}
                  {clusteredGroups.map((group, idx) => {
                    const coords = getDestinationCoords(group.route.split(' → ')[1] || 'MG Road');
                    const isFull = group.isFull;
                    
                    return (
                      <Marker
                        key={`group-${group.groupId}`}
                        position={coords}
                        icon={{
                          url: isFull 
                            ? 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
                            : 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
                          scaledSize: new window.google.maps.Size(35, 35)
                        }}
                        label={{
                          text: `${group.members}/${group.capacity}`,
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                        onClick={() => {
                          setSelectedRide({ 
                            ...group, 
                            isGroup: true,
                            destination: group.route.split(' → ')[1]
                          });
                          setMapCenter(coords);
                        }}
                      />
                    );
                  })}
                  
                  {/* Show individual rides */}
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
                        {selectedRide.isGroup ? (
                          <>
                            <h3><FaCar style={{ marginRight: '8px' }} /> Group: {selectedRide.route}</h3>
                            <p>Members: {selectedRide.members}/{selectedRide.capacity}</p>
                            <p>Time: {selectedRide.time}</p>
                            <p>Cost per person: ₹{Math.round(selectedRide.costPerPerson)}</p>
                            <p style={{ color: selectedRide.isFull ? '#d9534f' : '#5cb85c', fontWeight: 'bold' }}>
                              {selectedRide.isFull ? 'Full' : `${selectedRide.remainingSeats} seats left`}
                            </p>
                            <button 
                              className="btn btn-primary"
                              onClick={() => {
                                setActiveMenu('groups');
                                setSelectedRide(null);
                              }}
                            >
                              View Groups
                            </button>
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              )}
            </div>
            
            {/* Weekly/Monthly Insights */}
            <div className="dashboard-section animate-in delay-1">
              <div className="section-header">
                <h2 className="section-title"><FaChartLine style={{ marginRight: '10px' }} /> Your Impact This Week</h2>
              </div>
              
              <div className="insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div className="insight-card" style={{ background: '#f8fafc', color: '#1f2937', padding: '20px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '14px', opacity: '0.9' }}>Rides This Week</div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '10px 0' }}>{weeklyStats.rides}</div>
                  <div style={{ fontSize: '12px', opacity: '0.8', color: '#16a34a' }}>↑ Keep it up!</div>
                </div>
                
                <div className="insight-card" style={{ background: '#f8fafc', color: '#1f2937', padding: '20px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '14px', opacity: '0.9' }}>Saved This Week</div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '10px 0' }}>₹{weeklyStats.saved.toFixed(0)}</div>
                  <div style={{ fontSize: '12px', opacity: '0.8' }}>Monthly: ₹{monthlyStats.saved.toFixed(0)}</div>
                </div>
                
                <div className="insight-card" style={{ background: '#f8fafc', color: '#1f2937', padding: '20px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '14px', opacity: '0.9' }}>CO₂ Reduced</div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '10px 0' }}>{weeklyStats.co2.toFixed(1)}kg</div>
                  <div style={{ fontSize: '12px', opacity: '0.8' }}>This week</div>
                </div>
                
                <div className="insight-card" style={{ background: '#f8fafc', color: '#1f2937', padding: '20px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '14px', opacity: '0.9' }}>Current Streak</div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '10px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#ea580c' }}><FaFire /> {currentStreak}</div>
                  <div style={{ fontSize: '12px', opacity: '0.8' }}>{currentStreak > 0 ? 'Days in a row!' : 'Start your streak'}</div>
                </div>
              </div>
              
              {/* Achievements */}
              {achievements.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h3 style={{ fontSize: '18px', marginBottom: '15px', color: 'var(--dark)', display: 'flex', alignItems: 'center', gap: '8px' }}><FaMedal /> Achievements Unlocked</h3>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {achievements.map(ach => (
                      <div key={ach.id} className="achievement-badge" style={{ 
                        background: 'var(--card-bg)', 
                        border: '2px solid var(--accent)', 
                        borderRadius: '8px', 
                        padding: '12px 16px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        boxShadow: 'var(--shadow-light)',
                        transition: 'transform 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <span style={{ fontSize: '24px' }}>{ach.icon}</span>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--dark)' }}>{ach.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--gray)' }}>{ach.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Trust & Safety */}
            <div className="dashboard-section animate-in delay-1">
              <div className="section-header">
                <h2 className="section-title">Trust &amp; Safety</h2>
                <p className="section-subtitle">Real-time trust score and safety recommendations</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px' }}>
                <div style={{ background: 'var(--card-bg)', padding: '18px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid var(--light-gray)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600, color: 'var(--dark)' }}>Trust Score</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray)' }}>Adaptive</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                    <div style={{
                      width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#f8fafc', border: `3px solid ${trustScore == null ? '#cbd5e1' : (trustScore < 40 ? '#d9534f' : (trustScore < 70 ? '#f0ad4e' : '#5cb85c'))}`
                    }}>
                      <span style={{ fontWeight: 700, color: 'var(--dark)' }}>{trustScore != null ? trustScore : '—'}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--gray)' }}>Security Level</div>
                      <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{securityLevel}</div>
                    </div>
                  </div>
                  {securityMeasures && securityMeasures.length > 0 && (
                    <ul style={{ marginTop: '12px', paddingLeft: '18px', color: 'var(--dark)', fontSize: '14px' }}>
                      {securityMeasures.slice(0, 4).map((m, i) => (<li key={i}>{m}</li>))}
                    </ul>
                  )}
                </div>

                <div style={{ background: 'var(--card-bg)', padding: '18px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid var(--light-gray)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--dark)', marginBottom: '8px' }}>Safety Alerts</div>
                  {(safetyAlerts && safetyAlerts.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {safetyAlerts.slice(0, 4).map((a, idx) => (
                        <div key={idx} style={{
                          padding: '10px', borderRadius: '8px',
                          background: a.type === 'critical' ? '#fee2e2' : (a.type === 'warning' ? '#fef3c7' : '#eef2ff'),
                          border: '1px solid var(--light-gray)'
                        }}>
                          <span style={{ fontSize: '13px', color: 'var(--dark)' }}>{a.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--gray)' }}>No safety alerts.</div>
                  )}
                </div>

                <div style={{ background: 'var(--card-bg)', padding: '18px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid var(--light-gray)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--dark)', marginBottom: '8px' }}>Suggested Connections</div>
                  {(suggestedConnections && suggestedConnections.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {suggestedConnections.map((c) => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(c.name || 'U').charAt(0)}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--gray)' }}>Shared interests: {c.overlap}</div>
                          </div>
                          <button className="btn btn-primary" onClick={() => navigate(`/privatechat/${c.id}`)}>Say Hi</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--gray)' }}>No connection suggestions yet.</div>
                  )}
                </div>

                <div style={{ background: 'var(--card-bg)', padding: '18px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid var(--light-gray)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--dark)', marginBottom: '8px' }}>Community Events</div>
                  {(suggestedEvents && suggestedEvents.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {suggestedEvents.map((evt) => (
                        <div key={evt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{evt.title}</div>
                            <div style={{ fontSize: '12px', color: 'var(--gray)' }}>{evt.desc}</div>
                          </div>
                          <button className="btn btn-primary" onClick={() => alert('Event RSVP coming soon')}>RSVP</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--gray)' }}>No upcoming suggestions.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Community AI Recommendations */}
            <div className="dashboard-section animate-in delay-1">
              <div className="section-header">
                <h2 className="section-title">Community AI</h2>
                <p className="section-subtitle">Personalized circles and discussion starters to build trust</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '15px' }}>
                <div style={{ background: 'var(--card-bg)', padding: '18px', borderRadius: '12px', boxShadow: 'var(--shadow-light)', border: '1px solid var(--light-gray)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--dark)', marginBottom: '8px' }}>Recommended Circles</div>
                  {(recommendedCircles && recommendedCircles.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {recommendedCircles.map((c) => (
                        <div key={c.id} style={{ border: '1px solid var(--light-gray)', borderRadius: '8px', padding: '12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{c.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '4px' }}>{c.reason}</div>
                          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {c.members.map(m => (
                              <span key={m.id} style={{ fontSize: '12px', background: '#eef2ff', border: '1px solid #c7d2fe', padding: '4px 8px', borderRadius: '999px' }}>{m.name}</span>
                            ))}
                          </div>
                          <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary" onClick={async () => { try { await startCircleDiscussion(db, userId, c); alert('Introductions sent!'); } catch (e) { alert('Failed to start discussion'); } } }>Start Discussion</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--gray)' }}>No circle suggestions yet.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Suggested Rides Section */}
            {suggestedRides.length > 0 && (
              <div className="dashboard-section animate-in delay-1">
                <div className="section-header">
                  <h2 className="section-title"><FaBullseye style={{ marginRight: '10px' }} /> Suggested Rides for You</h2>
                  <p className="section-subtitle">Based on your community and upcoming schedules</p>
                </div>
                
                <div className="rides-grid">
                  {suggestedRides.map(ride => (
                    <div key={ride.id} className="ride-card suggested-ride">
                      <div className="ride-header">
                        <div className="ride-driver">
                          <div className="driver-avatar">{ride.driverName?.charAt(0) || 'U'}</div>
                          <div className="driver-name">{ride.driverName || 'Driver'}</div>
                        </div>
                        <div className="ride-date">{ride.date} at {ride.time}</div>
                      </div>
                      
                      <div className="ride-details">
                        <div className="ride-route">
                          <div className="route-dot"></div>
                          <div className="route-line"></div>
                          <div className="route-dot end"></div>
                          <div className="route-info">
                            <div className="route-from">{ride.from || 'Christ University'}</div>
                            <div className="route-to">{ride.destination}</div>
                          </div>
                        </div>
                        
                        <div className="ride-meta">
                          <div className="meta-item">
                            <i className="fas fa-rupee-sign"></i> {ride.price}
                          </div>
                          <div className="meta-item">
                            <i className="fas fa-user-friends"></i> {(ride.seats || 0) - (Array.isArray(ride.passengers) ? ride.passengers.length : 0)} seats left
                          </div>
                          <div className="meta-item">
                            <i className="fas fa-home"></i> {ride.community}
                          </div>
                        </div>
                      </div>
                      
                      <div className="ride-actions">
                        <button 
                          className="btn btn-primary"
                          onClick={() => {
                            // Find matching group or show ride details
                            const matchingGroup = clusteredGroups.find(g => 
                              g.rideOptions?.some(opt => opt.rideId === ride.id)
                            );
                            if (matchingGroup) {
                              setActiveMenu('groups');
                            } else {
                              alert(`Contact ${ride.driverName} to join this ride!`);
                            }
                          }}
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
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
                  <h3>₹{(userProfile?.moneySaved || 0).toFixed(2)}</h3>
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
                <button 
                  onClick={() => setShowShortcutsHelp(true)}
                  style={{ 
                    padding: '6px 12px', 
                    borderRadius: '6px', 
                    border: '1px solid var(--light-gray)', 
                    background: 'var(--card-bg)', 
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--gray)'
                  }}
                >
                  ⌨️ Keyboard Shortcuts
                </button>
              </div>
              
              <div className="rides-grid">
                <div className="feature-card" onClick={() => setShowPostRideForm(true)}>
                  <div className="card-icon">
                    <FaPlus />
                  </div>
                  <h3>Post a Ride</h3>
                  <p>Share your ride details with the community</p>
                  <span style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '8px' }}>Press P</span>
                </div>
                
                <div className="feature-card" onClick={() => setActiveMenu('groups')}>
                  <div className="card-icon">
                    <FaUsers />
                  </div>
                  <h3>Find My Group</h3>
                  <p>Join optimized ride groups and save money</p>
                  <span style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '8px' }}>Press G</span>
                </div>
                
                <div className="feature-card" onClick={() => navigate('/aibot')}>
                  <div className="card-icon">
                    <FaRobot />
                  </div>
                  <h3>Find a Ride</h3>
                  <p>Use our AI agent to find the perfect ride</p>
                </div>
                
                <div className="feature-card" onClick={() => navigate('/societyfeed')}>
                  <div className="card-icon">
                    <FaUsers />
                  </div>
                  <h3>Society Feed</h3>
                  <p>See what's happening in your community</p>
                </div>
                
                <div className="feature-card" onClick={() => setActiveMenu('rides')}>
                  <div className="card-icon">
                    <FaRoad />
                  </div>
                  <h3>My Rides</h3>
                  <p>View and manage all your rides</p>
                  <span style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '8px' }}>Press R</span>
                </div>
                
                {myRides.length > 0 && myRides[0] && (
                  <div className="feature-card" onClick={() => {
                    const lastRide = myRides[0];
                    setNewRide({
                      destination: lastRide.destination,
                      date: '',
                      time: lastRide.time || '',
                      seats: lastRide.seats || 1,
                      community: lastRide.community || '',
                      price: lastRide.price || 0,
                      vehicleType: lastRide.vehicleType || 'car',
                    });
                    setShowPostRideForm(true);
                  }}>
                    <div className="card-icon">
                      <FaCar />
                    </div>
                    <h3>Repost Last Ride</h3>
                    <p>Quick post with previous details</p>
                    <span style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '8px' }}>To: {myRides[0].destination}</span>
                  </div>
                )}
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
    <div className={`dashboard-container theme-${theme}`}>
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
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
          <div className={`menu-item ${activeMenu === 'groups' ? 'active' : ''}`} onClick={() => setActiveMenu('groups')}>
            <FaUsers className="menu-icon" />
            <span className="menu-text">Ride Groups</span>
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
      {/* Overlay for mobile sidebar */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)}></div>
      
      {/* Main Content */}
      <div className="main-content">
        {showTour && (
          <div className="tour-overlay">
            <div className="tour-card">
              <div className="tour-header">
                <span>Quick tour for new members</span>
                <button className="tour-skip" onClick={handleSkipTour}>Skip</button>
              </div>
              <div className="tour-body">
                <p className="tour-step-label">Step {tourStep + 1} of {tourSteps.length}</p>
                <h3>{tourSteps[tourStep].title}</h3>
                <p className="tour-text">{tourSteps[tourStep].body}</p>
                <div className="tour-dots">
                  {tourSteps.map((_, idx) => (
                    <span key={idx} className={`tour-dot ${idx === tourStep ? 'active' : ''}`}></span>
                  ))}
                </div>
              </div>
              <div className="tour-actions">
                <button onClick={handleTourPrev} disabled={tourStep === 0} className="tour-btn secondary">Back</button>
                <button onClick={handleTourNext} className="tour-btn primary">
                  {tourStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="header">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(prev => !prev)} aria-label="Toggle menu">
            <FaBars />
          </button>
          <h1 className="page-title">
            {activeMenu === 'dashboard' && 'Dashboard'}
            {activeMenu === 'rides' && 'My Rides'}
            {activeMenu === 'groups' && 'Ride Groups'}
            {activeMenu === 'profile' && 'Profile'}
            {activeMenu === 'settings' && 'Settings'}
            {activeMenu === 'feed' && 'Society Feed'}
            {activeMenu === 'leaderboard' && 'Leaderboard'}
            {activeMenu === 'help' && 'Help & Support'}
          </h1>
          <div className="user-menu">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <FaMoon /> : <FaSun />}
            </button>
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
                <label>Vehicle Type:</label>
                <select name="vehicleType" value={newRide.vehicleType} onChange={handleInputChange} required>
                  <option value="car">Car (Max 4 seats)</option>
                  <option value="auto">Auto (Max 3 seats)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Seats Available:</label>
                <input 
                  type="number" 
                  name="seats" 
                  value={newRide.seats} 
                  onChange={handleInputChange} 
                  min="1" 
                  max={newRide.vehicleType === 'car' ? 4 : 3}
                  required 
                />
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Max {newRide.vehicleType === 'car' ? 4 : 3} seats for {newRide.vehicleType}
                </small>
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
            <p style={{ marginBottom: '15px', color: '#666' }}>How was your ride experience? Please rate from 1 to 5 stars.</p>
            <div className="form-group">
              <label>Rating (1-5 stars):</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={ratingValue}
                  onChange={(e) => setRatingValue(e.target.value)}
                  style={{ width: '80px', padding: '8px', fontSize: '16px' }}
                />
                <span style={{ fontSize: '24px', color: '#f39c12', display: 'inline-flex', gap: '2px' }}>
                  {Array(Math.min(5, Math.max(1, Number(ratingValue)))).fill(0).map((_, i) => <FaStar key={i} />)}
                </span>
              </div>
            </div>
            <button className="post-ride-submit-btn" onClick={submitRating}>Submit Rating</button>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcutsHelp && (
        <div className="form-modal-overlay" onClick={() => setShowShortcutsHelp(false)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className="close-btn" onClick={() => setShowShortcutsHelp(false)}>
              <FaTimes />
            </button>
            <h2 style={{ marginBottom: '20px' }}>⌨️ Keyboard Shortcuts</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--light-gray)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dark)' }}>Post a Ride</span>
                <kbd style={{ background: 'var(--card-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--gray)', fontFamily: 'monospace' }}>P</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--light-gray)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dark)' }}>View Ride Groups</span>
                <kbd style={{ background: 'var(--card-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--gray)', fontFamily: 'monospace' }}>G</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--light-gray)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dark)' }}>My Rides</span>
                <kbd style={{ background: 'var(--card-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--gray)', fontFamily: 'monospace' }}>R</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--light-gray)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dark)' }}>Dashboard</span>
                <kbd style={{ background: 'var(--card-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--gray)', fontFamily: 'monospace' }}>D</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--light-gray)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--dark)' }}>Show This Help</span>
                <kbd style={{ background: 'var(--card-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--gray)', fontFamily: 'monospace' }}>?</kbd>
              </div>
            </div>
            <p style={{ marginTop: '20px', fontSize: '14px', color: 'var(--gray)', textAlign: 'center' }}>
              Shortcuts work when not typing in input fields
            </p>
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