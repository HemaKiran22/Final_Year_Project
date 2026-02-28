import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, query, where, getDocs, doc, setDoc, getDoc, updateDoc, orderBy } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase.js";
import { FaUserCircle, FaCog, FaSignOutAlt, FaPlus, FaComments, FaTrophy, FaRobot, FaUser, FaTimes, FaCar, FaMoneyBillWave, FaSun, FaPaperPlane, FaRoute, FaLeaf, FaStar, FaBell, FaHome, FaRoad, FaCalendarAlt, FaUsers, FaQuestionCircle, FaMapMarkerAlt, FaMoon, FaBullseye, FaBolt, FaFire, FaChartLine, FaMedal, FaBars, FaSearch, FaClock } from 'react-icons/fa';
import logo from "../assets/logo.png";
import './Dashboard.css';
import { useNavigate } from 'react-router-dom';
import { createOrGetPrivateChat, joinRideById, leaveRide, cancelRideByCreator, markNoShow, resolveRideStatus, getParticipantIds, parseRideDateTime, LATE_CANCEL_WINDOW_MS } from '../services/rideActionService';
import { searchRidesByQuery } from '../services/rideSearchService';
import { refreshReliabilityScore } from '../services/reliabilityService';
import { getRecommendedRides, getQuickRecommendations, RECOMMEND_MIN_SCORE } from '../services/rideRecommendationService';
import ReliabilityBadge from '../components/ReliabilityBadge';
import ClusteredRideGroups from '../components/ClusteredRideGroups';
import notify from '../utils/notify';

import HelpSupport from './HelpSupport';

const Dashboard = () => {
  const [myRides, setMyRides] = useState([]);
  const [allRides, setAllRides] = useState([]);
  const navigate = useNavigate();
  const [theme, setTheme] = useState('light');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const tourSteps = [
    { title: 'Welcome', body: 'Explore your dashboard and features.', targetMenu: 'dashboard' },
    { title: 'Rides', body: 'Find and manage your rides.', targetMenu: 'rides' }
  ];
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('User');
  const [userProfile, setUserProfile] = useState(null);
  const [notifications, setNotifications] = useState(0);
  const [notificationsList, setNotificationsList] = useState([]);
  const shownNotifIdsRef = useRef(new Set());
  const [showPostRideForm, setShowPostRideForm] = useState(false);
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('00');
  const [timeAmPm, setTimeAmPm] = useState('AM');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTargetUserId, setRatingTargetUserId] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState(false);

  // Dashboard insights & helper state
  const [weeklyStats, setWeeklyStats] = useState({ rides: 0, saved: 0, co2: 0 });
  const [monthlyStats, setMonthlyStats] = useState({ rides: 0, saved: 0, co2: 0 });
  const [currentStreak, setCurrentStreak] = useState(0);
  const [achievements, setAchievements] = useState([]);

  // Recommendations & grouping
  const [suggestedRides, setSuggestedRides] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recSearchPrefs, setRecSearchPrefs] = useState({ destination: '', time24: '', minReliability: '' });
  const [showRecSearch, setShowRecSearch] = useState(false);

  // Find a Ride modal state
  const [showFindRideModal, setShowFindRideModal] = useState(false);
  const [findRideQuery, setFindRideQuery] = useState({ destination: '', date: '', time: '' });
  const [findRideResults, setFindRideResults] = useState([]);
  const [findRideLoading, setFindRideLoading] = useState(false);
  const [findRideSearched, setFindRideSearched] = useState(false);


  // Post ride form model + filters
  const [newRide, setNewRide] = useState({
    destination: '',
    date: '',
    time: '',
    seats: 1,
    community: 'Brigade',
    price: 0,
    vehicleType: 'car',
  });
  const [rideFilters, setRideFilters] = useState({ destination: '', date: '', status: 'all', seatsMin: 0 });

  // Initialize time picker to current time (rounded to next 5 minutes) when opening the form
  useEffect(() => {
    if (!showPostRideForm) return;
    const now = new Date();
    let h = now.getHours();
    let m = now.getMinutes();
    const rounded = Math.ceil(m / 5) * 5;
    if (rounded === 60) { h = (h + 1) % 24; m = 0; } else { m = rounded; }
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : (h % 12);
    applyTimeParts(String(h12), String(m).padStart(2, '0'), ap);
    // Prefill community from user profile or fixed value
    setNewRide(prev => ({ ...prev, community: userProfile?.housingSociety || 'Brigade' }));
  }, [showPostRideForm]);

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
            try {
              new Notification('New chat message', {
                body: notif.text || 'You received a new message',
                icon: logo,
              });
            } catch {}
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
          await setDoc(userRef, { status: 'pending_approval', moneySaved: 0, ridesShared: 0, averageRating: 0, totalRatings: 0, createdAt: new Date() });
        }

        const currentData = docSnap.exists() ? docSnap.data() : { status: 'pending_approval' };
        if (currentData.status !== 'approved') {
          await signOut(auth);
          navigate('/login');
          return;
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
        return () => { try { unsubscribeProfile(); } catch {} };
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
      notify.success('Notified co-riders that you are running late.', '🏃 Running Late');
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

  // AI-powered ride recommendations
  const calculateSuggestedRides = async (userCommunity) => {
    if (!allRides || allRides.length === 0) {
      setSuggestedRides([]);
      return;
    }
    setRecLoading(true);
    try {
      // Gather recent destinations from user's own rides
      const recentDests = myRides
        .filter(r => r.destination)
        .map(r => r.destination)
        .slice(0, 3);

      const recs = await getQuickRecommendations(db, allRides, {
        userId,
        community: userCommunity,
        recentDestinations: recentDests,
      });
      setSuggestedRides(recs);
    } catch (err) {
      console.error('Recommendation engine error:', err);
      setSuggestedRides([]);
    }
    setRecLoading(false);
  };

  // Explicit AI search with user preferences
  const handleRecSearch = async () => {
    if (!allRides || allRides.length === 0) return;
    setRecLoading(true);
    try {
      const recs = await getRecommendedRides(db, allRides, {
        destination: recSearchPrefs.destination || '',
        time24: recSearchPrefs.time24 || null,
        minReliability: recSearchPrefs.minReliability ? Number(recSearchPrefs.minReliability) : null,
        userId,
        community: userProfile?.housingSociety || null,
      });
      setSuggestedRides(recs);
    } catch (err) {
      console.error('Recommendation search error:', err);
    }
    setRecLoading(false);
  };

  // Find a Ride search handler
  const handleFindRideSearch = async (e) => {
    e && e.preventDefault();
    setFindRideLoading(true);
    setFindRideSearched(true);
    try {
      const results = await searchRidesByQuery(db, {
        destination: findRideQuery.destination || '',
        dateISO: findRideQuery.date || '',
        time24: findRideQuery.time || null,
        timeWindowMinutes: 60,
      });
      // Filter out own rides
      const filtered = results.filter(r => r.driverId !== userId);
      setFindRideResults(filtered);
    } catch (err) {
      console.error('Find ride search error:', err);
      setFindRideResults([]);
    }
    setFindRideLoading(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewRide(prev => ({ ...prev, [name]: value }));
  };

  const to24h = (h12, m, ampm) => {
    let h = parseInt(h12, 10) % 12;
    if ((ampm || 'AM') === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${String(parseInt(m, 10) || 0).padStart(2, '0')}`;
  };

  const applyTimeParts = (h, m, ap) => {
    setTimeHour(String(h));
    setTimeMinute(String(m).padStart(2, '0'));
    setTimeAmPm(ap);
    const t = to24h(h, m, ap);
    setNewRide(prev => ({ ...prev, time: t }));
  };

  const handlePostRide = async (e) => {
    e.preventDefault();
    if (!userId) {
      notify.warn('You must be logged in to post a ride.');
      return;
    }
    // Validate date/time: must be in the future
    try {
      const [hh, mm] = String(newRide.time || '').split(':').map(x => parseInt(x, 10));
      if (!newRide.date || isNaN(hh) || isNaN(mm)) {
        notify.warn('Please select a valid date and time.');
        return;
      }
      const selected = new Date(`${newRide.date}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);
      const now = new Date();
      if (selected.getTime() <= now.getTime()) {
        notify.warn('Please choose a future time. Past times are not allowed.');
        return;
      }
    } catch {
      notify.warn('Please select a valid date and time.');
      return;
    }
    try {
      const totalSeats = Number(newRide.seats);
      const [hh24, mm24] = String(newRide.time || '').split(':').map(x => parseInt(x, 10));
      const startTime = new Date(`${newRide.date}T${String(hh24).padStart(2,'0')}:${String(mm24).padStart(2,'0')}:00`).toISOString();
      await addDoc(collection(db, "rides"), {
        ...newRide,
        from: userProfile?.housingSociety || 'Brigade',
        driverName: userName,
        driverId: userId,
        createdBy: userId,
        createdAt: new Date(),
        startTime: startTime,
        price: Number(newRide.price),
        seats: totalSeats,
        totalSeats: totalSeats,
        availableSeats: totalSeats - 1,
        vehicleType: newRide.vehicleType,
        isCompleted: false,
        status: 'Pending',
        rideStatus: 'open',
        passengers: [userId],
        participants: [{ userId: userId, joinedAt: new Date().toISOString() }],
        cancellationLog: [],
      });
      notify.success(`Ride to ${newRide.destination} on ${newRide.date} posted successfully!`, '🚗 Ride Posted!');
      setNewRide({
        destination: '',
        date: '',
        time: '',
        seats: 1,
        community: userProfile?.housingSociety || 'Brigade',
        price: 0,
        vehicleType: 'car',
      });
      setTimeHour('');
      setTimeMinute('00');
      setTimeAmPm('AM');
      setShowPostRideForm(false);
    } catch (e) {
      console.error("Error adding document: ", e);
      notify.error('Failed to post ride. Please try again.');
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

  const [showNotifList, setShowNotifList] = useState(false);

  const handleOpenNotifications = () => {
    // Toggle dropdown list; selecting an item will navigate
    setShowNotifList(prev => !prev);
  };

  const handleSelectNotification = async (notif) => {
    try {
      if (notif?.id) await updateDoc(doc(db, 'notifications', notif.id), { read: true });
    } catch (e) { console.error('Failed to mark notification as read', e); }
    if (notif?.chatId) {
      navigate(`${notif.chatType === 'private' ? '/privatechat' : '/groupchat'}/${notif.chatId}`);
      setShowNotifList(false);
    }
  };

  const handleConfirmRide = async (ride) => {
    if (ride.isCompleted) {
      notify.warn('This ride has already been confirmed.');
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
          rideStatus: 'completed',
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
  
        notify.success(`Ride to ${ride.destination} confirmed! You earned ₹${moneySavedPerPerson.toFixed(2)}.`, '✅ Ride Confirmed!');
        
        // Refresh reliability for all participants (best-effort)
        const allIds = [ride.driverId, ...passengerIds].filter(Boolean);
        for (const uid of new Set(allIds)) {
          refreshReliabilityScore(db, uid).catch(() => {});
        }

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
        notify.error('Failed to confirm the ride. Please try again.');
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
      // Refresh reliability for the rated user (rating affects their score)
      refreshReliabilityScore(db, ratingTargetUserId).catch(() => {});
    } catch (e) {
      console.error('Failed to submit rating', e);
    } finally {
      setShowRatingModal(false);
      setRatingTargetUserId(null);
    }
  };
  
  const getStatusColor = (status) => {
    switch(status) {
      case 'Pending': return '#fbbf24';
      case 'Accepted': return '#60a5fa';
      case 'Completed': return '#34d399';
      case 'open': return '#22c55e';
      case 'closed': return '#ef4444';
      case 'completed': return '#34d399';
      case 'cancelled': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  const getRideStatusLabel = (status) => {
    switch(status) {
      case 'open': return '● Open';
      case 'closed': return '● Closed';
      case 'completed': return '✓ Completed';
      case 'cancelled': return '✕ Cancelled';
      default: return status || 'Open';
    }
  };

  const getVehicleLabel = (type) => {
    switch(type) {
      case 'car': return '🚗 Car';
      case 'auto': return '🛺 Auto';
      default: return '🚗 ' + (type || 'Car');
    }
  };

  const [joiningRideId, setJoiningRideId] = useState(null);

  const handleJoinRide = async (ride) => {
    if (!userId) {
      notify.warn('Please login to join a ride.');
      navigate('/login');
      return;
    }
    if (ride.driverId === userId) {
      notify.info('This is your own ride.');
      return;
    }
    const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
    const pIds = getParticipantIds(ride);
    if (passengers.includes(userId) || pIds.includes(userId)) {
      notify.info('You have already joined this ride.');
      return;
    }
    // Check ride status
    const rideStatus = resolveRideStatus(ride);
    if (rideStatus === 'closed') {
      notify.warn('This ride has been closed by the creator.');
      return;
    }
    if (rideStatus === 'completed') {
      notify.warn('This ride has already been completed.');
      return;
    }
    if (rideStatus === 'cancelled') {
      notify.warn('This ride has been cancelled.');
      return;
    }
    const totalSeats = Number(ride.totalSeats || ride.seats) || 0;
    const availableSeats = ride.availableSeats != null ? Number(ride.availableSeats) : (totalSeats - pIds.length);
    if (availableSeats <= 0) {
      notify.warn('No seats available on this ride.');
      return;
    }
    setJoiningRideId(ride.id);
    try {
      const res = await joinRideById(db, auth, ride, userName);
      if (res.ok) {
        notify.success(`Successfully joined the ride to ${ride.destination}! ${availableSeats - 1} seat(s) remaining.`, '🎉 Ride Joined!');
      } else {
        notify.error(res.message || 'Could not join this ride.');
      }
    } catch (e) {
      notify.error(e?.message || 'Failed to join ride.');
    } finally {
      setJoiningRideId(null);
    }
  };

  const handleCloseRide = async (ride) => {
    if (!userId || ride.driverId !== userId) {
      notify.warn('Only the ride creator can close this ride.');
      return;
    }
    if (!window.confirm('Close this ride? No new passengers will be able to join, but chat will remain active.')) return;
    try {
      const rideRef = doc(db, 'rides', ride.id);
      await updateDoc(rideRef, { rideStatus: 'closed' });
      notify.success('Ride closed successfully. No new passengers can join.', '🔒 Ride Closed');
    } catch (e) {
      console.error('Error closing ride:', e);
      notify.error('Failed to close ride.');
    }
  };

  const handleReopenRide = async (ride) => {
    if (!userId || ride.driverId !== userId) {
      notify.warn('Only the ride creator can reopen this ride.');
      return;
    }
    const totalSeats = Number(ride.totalSeats || ride.seats) || 1;
    const pIds = getParticipantIds(ride);
    const available = totalSeats - pIds.length;
    if (available <= 0) {
      notify.warn('Cannot reopen — all seats are filled.');
      return;
    }
    try {
      const rideRef = doc(db, 'rides', ride.id);
      await updateDoc(rideRef, { rideStatus: 'open', availableSeats: available });
      notify.success('Ride reopened! Passengers can now join.', '🔓 Ride Reopened');
    } catch (e) {
      console.error('Error reopening ride:', e);
      notify.error('Failed to reopen ride.');
    }
  };

  /* ── Co-rider leaves ride (Scenarios 1, 3, 4) ── */
  const [leavingRideId, setLeavingRideId] = useState(null);

  const handleLeaveRide = async (ride) => {
    if (!userId) return;
    const rideStatus = resolveRideStatus(ride);
    if (rideStatus === 'completed') { notify.warn('Cannot leave a completed ride.'); return; }
    if (rideStatus === 'cancelled') { notify.warn('This ride is already cancelled.'); return; }

    // Warn about late cancellation
    const startDT = parseRideDateTime(ride);
    const isLate = startDT && (startDT.getTime() - Date.now()) > 0 && (startDT.getTime() - Date.now()) <= LATE_CANCEL_WINDOW_MS;
    const msg = isLate
      ? 'This is a LATE cancellation (< 15 min before ride). Your trust score will be penalized. Continue?'
      : 'Leave this ride? The creator will be notified.';
    if (!window.confirm(msg)) return;

    setLeavingRideId(ride.id);
    try {
      const res = await leaveRide(db, auth, ride, userName);
      if (res.ok) {
        notify[res.cancelType === 'late' ? 'warn' : 'success'](
          res.cancelType === 'late'
            ? 'You left the ride. A late cancellation penalty was applied to your trust score.'
            : 'You have left the ride successfully.',
          res.cancelType === 'late' ? '⚠️ Late Cancellation' : '👋 Left Ride'
        );
      } else {
        notify.error(res.message || 'Could not leave ride.');
      }
    } catch (e) {
      notify.error(e?.message || 'Failed to leave ride.');
    } finally {
      setLeavingRideId(null);
    }
  };

  /* ── Creator cancels entire ride (Scenario 2) ── */
  const handleCancelRide = async (ride) => {
    if (!userId || (ride.createdBy || ride.driverId) !== userId) {
      notify.warn('Only the ride creator can cancel the entire ride.');
      return;
    }
    if (!window.confirm('Cancel this ride entirely? ALL passengers will be notified and the ride will be removed from search.')) return;
    try {
      const res = await cancelRideByCreator(db, auth, ride, userName);
      if (res.ok) {
        notify.success('Ride cancelled. All passengers have been notified.', '🚫 Ride Cancelled');
      } else {
        notify.error(res.message || 'Could not cancel ride.');
      }
    } catch (e) {
      notify.error(e?.message || 'Failed to cancel ride.');
    }
  };

  /* ── No-show marking (Scenario 5) ── */
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [noShowRide, setNoShowRide] = useState(null);

  const handleOpenNoShowModal = (ride) => {
    setNoShowRide(ride);
    setShowNoShowModal(true);
  };

  const handleMarkNoShow = async (targetUserId) => {
    if (!noShowRide) return;
    try {
      const res = await markNoShow(db, auth, noShowRide, targetUserId);
      if (res.ok) {
        notify.success('No-show recorded. A strong trust penalty has been applied.', '🚨 No-Show Recorded');
      } else {
        notify.error(res.message || 'Could not mark no-show.');
      }
    } catch (e) {
      notify.error(e?.message || 'Failed to mark no-show.');
    }
    setShowNoShowModal(false);
    setNoShowRide(null);
  };

  const getRideStatus = (ride) => {
    return resolveRideStatus(ride);
  };

  const renderMyRideCard = (ride) => {
    const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
    const pIds = getParticipantIds(ride);
    const totalSeats = Number(ride.totalSeats || ride.seats) || 1;
    const availableSeats = ride.availableSeats != null ? Number(ride.availableSeats) : (totalSeats - passengers.length);
    const costPerPerson = totalSeats > 0 ? (Number(ride.price) || 0) / totalSeats : 0;
    const seatsFilled = totalSeats - availableSeats;
    const rideStatus = getRideStatus(ride);
    const isCreator = (ride.createdBy || ride.driverId) === userId;
    const isCoRider = !isCreator && (passengers.includes(userId) || pIds.includes(userId));
    const startDT = parseRideDateTime(ride);
    const rideStarted = startDT && startDT.getTime() <= Date.now();

    return (
    <div key={ride.id} className="ride-card">
      <div className="ride-header">
        <div className="ride-driver">
          <div className="driver-avatar">{userName.charAt(0)}</div>
          <div className="driver-name">You</div>
          {userId && <ReliabilityBadge userId={userId} size="sm" inline />}
        </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`status-chip ride-status-${rideStatus}`}>
                {getRideStatusLabel(rideStatus)}
              </span>
              <div className="ride-date">{ride.date} at {ride.time}</div>
            </div>
      </div>
      
      <div className="ride-details">
        <div className="ride-route">
          <div className="route-dot"></div>
          <div className="route-line"></div>
          <div className="route-dot end"></div>
              <div className="route-info" aria-label={`Route from Brigade to ${ride.destination}`}>
                <div className="route-from"><span className="route-label from">From</span> Brigade</div>
                <div className="route-to"><span className="route-label to">To</span> {ride.destination}</div>
              </div>
        </div>
        
        <div className="ride-meta">
          <div className="meta-item">
            <FaCar /> {getVehicleLabel(ride.vehicleType)}
          </div>
          <div className="meta-item">
            <i className="fas fa-rupee-sign"></i> ₹{Number(ride.price) || 0}
          </div>
          <div className="meta-item">
            <i className="fas fa-user-friends"></i> ₹{costPerPerson.toFixed(0)}/person
          </div>
        </div>

        {/* Seat occupancy indicator - hide for completed rides */}
        {rideStatus !== 'completed' && (
        <div className="seat-indicator">
          <div className="seat-indicator-bar">
            <div className="seat-indicator-fill" style={{ width: `${totalSeats > 0 ? (seatsFilled / totalSeats) * 100 : 0}%` }}></div>
          </div>
          <div className="seat-indicator-text">
            <span>{seatsFilled}/{totalSeats} seats filled</span>
            <span className={`seats-remaining ${availableSeats === 0 ? 'full' : availableSeats <= 1 ? 'low' : ''}`}>
              {availableSeats === 0 ? 'Full' : `${availableSeats} seat${availableSeats > 1 ? 's' : ''} available`}
            </span>
          </div>
        </div>
        )}
      </div>
      
      <div className="ride-actions">
        {rideStatus === 'cancelled' ? (
          <span className="ride-cancelled-label">Ride Cancelled</span>
        ) : rideStatus === 'completed' || ride.isCompleted ? (
          <>
            <span className="ride-confirmed">✓ Completed</span>
            {/* No-show button for creator after ride completion */}
            {isCreator && pIds.filter(uid => uid !== userId).length > 0 && (
              <button
                className="btn btn-noshow"
                onClick={() => handleOpenNoShowModal(ride)}
                style={{ marginLeft: '10px' }}
              >
                Mark No-Show
              </button>
            )}
          </>
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

        {/* Creator actions: Close / Reopen / Cancel */}
        {isCreator && rideStatus !== 'completed' && rideStatus !== 'cancelled' && !ride.isCompleted && (
          <>
            {rideStatus === 'open' && (
              <button className="btn btn-close-ride" onClick={() => handleCloseRide(ride)} style={{ marginLeft: '10px' }}>
                Close Ride
              </button>
            )}
            {rideStatus === 'closed' && (
              <button className="btn btn-reopen-ride" onClick={() => handleReopenRide(ride)} style={{ marginLeft: '10px' }}>
                Reopen Ride
              </button>
            )}
            <button className="btn btn-cancel-ride" onClick={() => handleCancelRide(ride)} style={{ marginLeft: '10px' }}>
              Cancel Ride
            </button>
          </>
        )}

        {/* Co-rider: Leave Ride (only before completion/cancellation, only if not started) */}
        {isCoRider && rideStatus !== 'completed' && rideStatus !== 'cancelled' && !ride.isCompleted && (
          <button
            className="btn btn-leave-ride"
            onClick={() => handleLeaveRide(ride)}
            disabled={leavingRideId === ride.id}
            style={{ marginLeft: '10px' }}
          >
            {leavingRideId === ride.id ? 'Leaving...' : 'Leave Ride'}
          </button>
        )}

        {ride.driverId && userId && ride.driverId !== userId && rideStatus !== 'cancelled' && (
          <button 
            className="btn btn-secondary"
            onClick={() => handleOpenPrivateChat(ride)}
            style={{ marginLeft: '10px' }}
          >
            Private Chat
          </button>
        )}
        {rideStatus !== 'cancelled' && passengers.filter(id => id !== ride.driverId).length > 0 && (
        <button 
          className="btn btn-secondary"
          onClick={() => navigate(`/groupchat/${ride.id}`)}
          style={{ marginLeft: '10px' }}
        >
          Group Chat
        </button>
        )}
      </div>
    </div>
    );
  };
  const handleOpenPrivateChat = async (ride) => {
    try {
      const res = await createOrGetPrivateChat(db, auth, ride);
      if (res.ok && res.chatId) {
        navigate(`/privatechat/${res.chatId}`);
      } else {
        notify.error(res.message || 'Unable to open private chat.');
      }
    } catch (e) {
      console.error('Failed to open private chat', e);
      notify.error('Failed to open private chat.');
    }
  };

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
      if (targetMenu === 'rides' || targetMenu === 'dashboard') setActiveMenu(targetMenu);
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
            {/* Welcome Banner */}
            <div className="welcome-banner animate-in">
              <div className="welcome-text">
                <h1>Welcome back, {userName}! 👋</h1>
                <p>Ready to share your next ride?</p>
              </div>
            </div>

            {/* Quick Actions moved to top */}
            <div className="dashboard-section animate-in delay-1">
              <div className="section-header">
                <h2 className="section-title">Quick Actions</h2>
                <button 
                  className="shortcuts-btn"
                  onClick={() => setShowShortcutsHelp(true)}
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
                  <span className="shortcut-hint" style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '8px' }}>Press P</span>
                </div>
                <div className="feature-card" onClick={() => { setFindRideQuery({ destination: '', date: '', time: '' }); setFindRideResults([]); setFindRideSearched(false); setShowFindRideModal(true); }}>
                  <div className="card-icon">
                    <FaSearch />
                  </div>
                  <h3>Find a Ride</h3>
                  <p>Search rides by destination, date & time</p>
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
                  <span className="shortcut-hint" style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '8px' }}>Press R</span>
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
            {/* My Analytics */}
            <div className="dashboard-section animate-in delay-1">
              <div className="section-header">
                <h2 className="section-title"><FaChartLine style={{ marginRight: '10px' }} /> My Analytics</h2>
              </div>
              <div className="analytics-grid">
                <div className="analytics-card analytics-co2">
                  <div className="analytics-icon"><FaLeaf /></div>
                  <div className="analytics-value">{((userProfile?.ridesShared || 0) * 4.6).toFixed(1)} kg</div>
                  <div className="analytics-label">CO₂ Saved</div>
                </div>
                <div className="analytics-card analytics-rides">
                  <div className="analytics-icon"><FaCar /></div>
                  <div className="analytics-value">{userProfile?.ridesShared || 0}</div>
                  <div className="analytics-label">Rides Completed</div>
                </div>
                <div className="analytics-card analytics-money">
                  <div className="analytics-icon"><FaMoneyBillWave /></div>
                  <div className="analytics-value">₹{(userProfile?.moneySaved || 0).toFixed(0)}</div>
                  <div className="analytics-label">Money Saved</div>
                </div>
                <div className="analytics-card analytics-rating">
                  <div className="analytics-icon"><FaStar /></div>
                  <div className="analytics-value">{(userProfile?.averageRating || 0).toFixed(1)} <span className="analytics-rating-count">({userProfile?.totalRatings || 0})</span></div>
                  <div className="analytics-label">My Rating</div>
                </div>
              </div>
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

            {/* AI-Powered Ride Recommendations */}
            <div className="dashboard-section animate-in delay-1">
              <div className="section-header">
                <h2 className="section-title"><FaBullseye style={{ marginRight: '10px' }} /> AI Ride Recommendations</h2>
                <button
                  className="rec-search-toggle"
                  onClick={() => setShowRecSearch(prev => !prev)}
                >
                  {showRecSearch ? 'Hide Search' : '🔍 Search Rides'}
                </button>
              </div>
              <p className="section-subtitle">Ranked by destination match, time proximity, creator reliability &amp; seat availability</p>

              {/* Recommendation search panel */}
              {showRecSearch && (
                <div className="rec-search-panel">
                  <input
                    type="text"
                    placeholder="Destination (e.g. Koramangala)"
                    value={recSearchPrefs.destination}
                    onChange={e => setRecSearchPrefs(p => ({ ...p, destination: e.target.value }))}
                    className="rec-input"
                  />
                  <input
                    type="time"
                    value={recSearchPrefs.time24}
                    onChange={e => setRecSearchPrefs(p => ({ ...p, time24: e.target.value }))}
                    className="rec-input"
                  />
                  <input
                    type="number"
                    placeholder="Min reliability (0-100)"
                    min="0" max="100"
                    value={recSearchPrefs.minReliability}
                    onChange={e => setRecSearchPrefs(p => ({ ...p, minReliability: e.target.value }))}
                    className="rec-input rec-input-narrow"
                  />
                  <button className="btn btn-primary rec-search-btn" onClick={handleRecSearch} disabled={recLoading}>
                    {recLoading ? 'Searching...' : 'Find Rides'}
                  </button>
                </div>
              )}

              {recLoading && <div className="rec-loading">Analyzing rides...</div>}

              {!recLoading && suggestedRides.length > 0 && (
                <div className="rides-grid">
                  {suggestedRides.map(({ ride, compositeScore, factors, recommended }) => {
                    const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
                    const pIds = getParticipantIds(ride);
                    const totalSeats = Number(ride.totalSeats || ride.seats) || 1;
                    const availableSeats = ride.availableSeats != null ? Number(ride.availableSeats) : (totalSeats - pIds.length);
                    const costPerPerson = totalSeats > 0 ? (Number(ride.price) || 0) / totalSeats : 0;
                    const isFull = availableSeats <= 0;
                    const alreadyJoined = passengers.includes(userId) || pIds.includes(userId);
                    const isJoining = joiningRideId === ride.id;
                    const rideStatus = getRideStatus(ride);
                    const isClosed = rideStatus === 'closed';

                    return (
                    <div key={ride.id} className={`ride-card suggested-ride ${recommended ? 'rec-highlighted' : ''} ${isFull ? 'ride-full' : ''} ${isClosed ? 'ride-closed' : ''}`}>
                      {/* Recommended tag */}
                      {recommended && (
                        <div className="rec-tag">
                          <span className="rec-tag-icon">⚡</span> Recommended for You
                        </div>
                      )}

                      {/* AI Score bar */}
                      <div className="rec-score-bar" title={`AI Match Score: ${compositeScore}/100  |  Dest: ${factors.destination}  Time: ${factors.time}  Reliability: ${factors.reliability}  Seats: ${factors.seats}`}>
                        <div className="rec-score-fill" style={{ width: `${compositeScore}%`, background: compositeScore >= 70 ? '#22c55e' : compositeScore >= 45 ? '#f59e0b' : '#ef4444' }}></div>
                        <span className="rec-score-text">{compositeScore}% match</span>
                      </div>

                      <div className="ride-header">
                        <div className="ride-driver">
                          <div className="driver-avatar">{ride.driverName?.charAt(0) || 'U'}</div>
                          <div className="driver-name">{ride.driverName || 'Driver'}</div>
                          {ride.driverId && <ReliabilityBadge userId={ride.driverId} size="sm" inline />}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`status-chip ride-status-${rideStatus}`}>
                            {getRideStatusLabel(rideStatus)}
                          </span>
                          <div className="ride-date">{ride.date} at {ride.time}</div>
                        </div>
                      </div>
                      <div className="ride-details">
                        <div className="ride-route">
                          <div className="route-dot"></div>
                          <div className="route-line"></div>
                          <div className="route-dot end"></div>
                          <div className="route-info" aria-label={`Route from ${ride.from || 'Brigade'} to ${ride.destination}`}>
                            <div className="route-from"><span className="route-label from">From</span> {ride.from || 'Brigade'}</div>
                            <div className="route-to"><span className="route-label to">To</span> {ride.destination}</div>
                          </div>
                        </div>
                        <div className="ride-meta">
                          <div className="meta-item">
                            <FaCar /> {getVehicleLabel(ride.vehicleType)}
                          </div>
                          <div className="meta-item">
                            <i className="fas fa-rupee-sign"></i> ₹{Number(ride.price) || 0}
                          </div>
                          <div className="meta-item">
                            <i className="fas fa-user-friends"></i> ₹{costPerPerson.toFixed(0)}/person
                          </div>
                        </div>

                        {/* Seat occupancy indicator */}
                        <div className="seat-indicator">
                          <div className="seat-indicator-bar">
                            <div className="seat-indicator-fill" style={{ width: `${totalSeats > 0 ? ((totalSeats - availableSeats) / totalSeats) * 100 : 0}%` }}></div>
                          </div>
                          <div className="seat-indicator-text">
                            <span>{totalSeats - availableSeats}/{totalSeats} seats filled</span>
                            <span className={`seats-remaining ${isFull ? 'full' : availableSeats <= 1 ? 'low' : ''}`}>
                              {isFull ? 'Full' : `${availableSeats} seat${availableSeats > 1 ? 's' : ''} left`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="ride-actions">
                        <button 
                          className={`btn ${alreadyJoined ? 'btn-secondary' : 'btn-primary'} ${(isFull || isClosed) && !alreadyJoined ? 'btn-disabled' : ''}`}
                          onClick={() => !isFull && !isClosed && !alreadyJoined && !isJoining && handleJoinRide(ride)}
                          disabled={isFull || isClosed || alreadyJoined || isJoining}
                          title={isClosed ? 'Ride closed by creator' : isFull ? 'No seats available' : alreadyJoined ? 'Already joined' : 'Join this ride'}
                        >
                          {isJoining ? 'Joining...' : alreadyJoined ? '✓ Joined' : isClosed ? 'Ride Closed' : isFull ? 'Ride Full' : 'Join Ride'}
                        </button>
                        {!isFull && !isClosed && !alreadyJoined && (
                          <button 
                            className="btn btn-secondary"
                            onClick={() => createOrGetPrivateChat(db, auth, ride).then(chatId => chatId && navigate(`/privatechat/${chatId}`))}
                            style={{ marginLeft: '10px' }}
                          >
                            Message Driver
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {!recLoading && suggestedRides.length === 0 && (
                <div className="no-rides" style={{ padding: '20px', textAlign: 'center', color: 'var(--gray)' }}>
                  <p>No recommendations yet. Try searching for a destination above!</p>
                </div>
              )}
            </div>
            
            {/* AI-Powered Ride Clustering */}
            <ClusteredRideGroups
              db={db}
              userId={userId}
              userName={userName}
              community={userProfile?.society || userProfile?.community || ''}
              allRides={allRides}
              onJoinRide={handleJoinRide}
              navigate={navigate}
            />

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
            {showNotifList && (
              <div className="notif-dropdown">
                <div className="notif-header">Notifications</div>
                {notificationsList.length === 0 ? (
                  <div className="notif-empty">No unread notifications</div>
                ) : (
                  notificationsList.slice(0, 8).map(n => (
                    <div key={n.id} className="notif-item" onClick={() => handleSelectNotification(n)}>
                      <div className={`notif-type ${n.chatType === 'private' ? 'private' : 'group'}`}>{n.chatType === 'private' ? 'Private' : 'Group'}</div>
                      <div className="notif-text">{n.text || n.message || 'New activity'}</div>
                      <div className="notif-time">{(n.createdAt?.toDate?.() || new Date(n.createdAt || Date.now())).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            )}
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
                <input type="text" name="from" value='Brigade' readOnly />
              </div>
              <div className="form-group">
                <label>Destination:</label>
                <input type="text" name="destination" value={newRide.destination} onChange={handleInputChange} required />
              </div>
              <div className="form-group-inline">
                <div className="form-group">
                  <label>Date:</label>
                  <input type="date" name="date" value={newRide.date} min={new Date().toISOString().split('T')[0]} onChange={handleInputChange} required />
                </div>
                <div className="form-group">
                  <label>Time:</label>
                  <div className="time-picker">
                    <select aria-label="Hour" value={timeHour} onChange={(e) => applyTimeParts(e.target.value, timeMinute, timeAmPm)} required>
                      <option value="" disabled>HH</option>
                      {[...Array(12)].map((_, i) => {
                        const h = String(i + 1);
                        return <option key={h} value={h}>{h}</option>
                      })}
                    </select>
                    <span className="time-sep">:</span>
                    <select aria-label="Minute" value={timeMinute} onChange={(e) => applyTimeParts(timeHour, e.target.value, timeAmPm)} required>
                      {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select aria-label="AM/PM" value={timeAmPm} onChange={(e) => applyTimeParts(timeHour, timeMinute, e.target.value)} required>
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
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
              <button type="submit" className="post-ride-submit-btn">Post Ride</button>
            </form>
          </div>
        </div>
      )}

      {/* No-Show Modal */}
      {showNoShowModal && noShowRide && (
        <div className="form-modal-overlay" onClick={() => { setShowNoShowModal(false); setNoShowRide(null); }}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <button className="close-btn" onClick={() => { setShowNoShowModal(false); setNoShowRide(null); }}>
              <FaTimes />
            </button>
            <h2 style={{ marginBottom: '10px' }}>🚫 Mark No-Show</h2>
            <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
              Select a co-rider who did not show up. A strong trust penalty will be applied.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {getParticipantIds(noShowRide)
                .filter(uid => uid !== userId)
                .map(uid => (
                  <button
                    key={uid}
                    className="btn btn-noshow-select"
                    onClick={() => handleMarkNoShow(uid)}
                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: '14px', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                  >
                    👤 User: {uid.slice(0, 8)}…
                  </button>
                ))}
              {getParticipantIds(noShowRide).filter(uid => uid !== userId).length === 0 && (
                <p style={{ color: '#9ca3af' }}>No other participants to mark.</p>
              )}
            </div>
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

      {/* Find a Ride Modal */}
      {showFindRideModal && (
        <div className="form-modal-overlay" onClick={(e) => e.target.className === 'form-modal-overlay' && setShowFindRideModal(false)}>
          <div className="form-modal find-ride-modal">
            <button className="close-btn" onClick={() => setShowFindRideModal(false)}>
              <FaTimes />
            </button>
            <h2><FaSearch style={{ marginRight: '10px', color: 'var(--primary)' }} /> Find a Ride</h2>

            <form onSubmit={handleFindRideSearch} className="find-ride-form">
              <div className="form-group">
                <label><FaMapMarkerAlt style={{ marginRight: '6px' }} /> Destination</label>
                <input
                  type="text"
                  placeholder="Where are you going?"
                  value={findRideQuery.destination}
                  onChange={e => setFindRideQuery(p => ({ ...p, destination: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-group-inline">
                <div className="form-group">
                  <label><FaCalendarAlt style={{ marginRight: '6px' }} /> Date</label>
                  <input
                    type="date"
                    value={findRideQuery.date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setFindRideQuery(p => ({ ...p, date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label><FaClock style={{ marginRight: '6px' }} /> Preferred Time</label>
                  <input
                    type="time"
                    value={findRideQuery.time}
                    onChange={e => setFindRideQuery(p => ({ ...p, time: e.target.value }))}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary find-ride-search-btn" disabled={findRideLoading}>
                {findRideLoading ? 'Searching...' : 'Search Rides'}
              </button>
            </form>

            {/* Results */}
            {findRideLoading && (
              <div className="find-ride-loading">
                <div className="spinner"></div>
                <p>Searching for available rides...</p>
              </div>
            )}

            {!findRideLoading && findRideSearched && findRideResults.length === 0 && (
              <div className="find-ride-no-results">
                <FaRoute style={{ fontSize: '32px', color: 'var(--gray)', marginBottom: '10px' }} />
                <p>No rides found matching your criteria.</p>
                <p style={{ fontSize: '13px', color: 'var(--gray)' }}>Try broadening your search or changing the date/time.</p>
              </div>
            )}

            {!findRideLoading && findRideResults.length > 0 && (
              <div className="find-ride-results">
                <h3 className="find-ride-results-title">{findRideResults.length} ride{findRideResults.length > 1 ? 's' : ''} found</h3>
                <div className="find-ride-results-list">
                  {findRideResults.map(ride => {
                    const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
                    const pIds = getParticipantIds(ride);
                    const totalSeats = Number(ride.totalSeats || ride.seats) || 1;
                    const availableSeats = ride.availableSeats != null ? Number(ride.availableSeats) : (totalSeats - pIds.length);
                    const costPerPerson = totalSeats > 0 ? (Number(ride.price) || 0) / totalSeats : 0;
                    const isFull = availableSeats <= 0;
                    const alreadyJoined = passengers.includes(userId) || pIds.includes(userId);
                    const isJoining = joiningRideId === ride.id;

                    return (
                      <div key={ride.id} className={`ride-card find-ride-card ${isFull ? 'ride-full' : ''}`}>
                        <div className="ride-header">
                          <div className="ride-driver">
                            <div className="driver-avatar">{ride.driverName?.charAt(0) || 'U'}</div>
                            <div className="driver-name">{ride.driverName || 'Driver'}</div>
                            {ride.driverId && <ReliabilityBadge userId={ride.driverId} size="sm" inline />}
                          </div>
                          <div className="ride-date">{ride.date} at {ride.time}</div>
                        </div>
                        <div className="ride-details">
                          <div className="ride-route">
                            <div className="route-dot"></div>
                            <div className="route-line"></div>
                            <div className="route-dot end"></div>
                            <div className="route-info">
                              <div className="route-from"><span className="route-label from">From</span> {ride.from || 'Brigade'}</div>
                              <div className="route-to"><span className="route-label to">To</span> {ride.destination}</div>
                            </div>
                          </div>
                          <div className="ride-meta">
                            <div className="meta-item"><FaCar /> {ride.vehicleType || 'Car'}</div>
                            <div className="meta-item">₹{Number(ride.price) || 0}</div>
                            <div className="meta-item">₹{costPerPerson.toFixed(0)}/person</div>
                          </div>
                          <div className="seat-indicator">
                            <div className="seat-indicator-bar">
                              <div className="seat-indicator-fill" style={{ width: `${totalSeats > 0 ? ((totalSeats - availableSeats) / totalSeats) * 100 : 0}%` }}></div>
                            </div>
                            <div className="seat-indicator-text">
                              <span>{totalSeats - availableSeats}/{totalSeats} seats filled</span>
                              <span className={`seats-remaining ${isFull ? 'full' : availableSeats <= 1 ? 'low' : ''}`}>
                                {isFull ? 'Full' : `${availableSeats} seat${availableSeats > 1 ? 's' : ''} left`}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="ride-actions">
                          <button
                            className={`btn ${alreadyJoined ? 'btn-secondary' : 'btn-primary'} ${isFull && !alreadyJoined ? 'btn-disabled' : ''}`}
                            onClick={() => !isFull && !alreadyJoined && !isJoining && handleJoinRide(ride)}
                            disabled={isFull || alreadyJoined || isJoining}
                          >
                            {isJoining ? 'Joining...' : alreadyJoined ? '✓ Joined' : isFull ? 'Ride Full' : 'Join Ride'}
                          </button>
                          {!isFull && !alreadyJoined && (
                            <button
                              className="btn btn-secondary"
                              onClick={() => createOrGetPrivateChat(db, auth, ride).then(chatId => chatId && navigate(`/privatechat/${chatId}`))}
                              style={{ marginLeft: '10px' }}
                            >
                              Message Driver
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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