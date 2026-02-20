import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import LandingPage from './Screens/LandingPage';
import Signup from './Screens/Signup';
import Login from './Screens/Login';
import Dashboard from './Screens/Dashboard';
import Profile from './Screens/Profile';
import Settings from './Screens/Settings';
import SocietyFeed from './Screens/SocietyFeed';
import Leaderboard from './Screens/Leaderboard';
import PrivateChat from './Screens/PrivateChat';
import GroupChat from './Screens/GroupChat';
import About from './Screens/About';
import Contact from './Screens/Contact';
import FloatingChatbot from './components/FloatingChatbot';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import notify from './utils/notify';

 

function NotificationListener() {
  const [currentUserId, setCurrentUserId] = useState(null);
  const shownIdsRef = useRef(new Set());

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setCurrentUserId(u?.uid || null);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const q = query(
      collection(db, 'notifications'),
      where('toUserId', '==', currentUserId),
      where('read', '==', false)
    );
    let isFirstLoad = true;
    const unsub = onSnapshot(q, (snap) => {
      // Skip the initial snapshot (existing unread notifications) to avoid flooding
      if (isFirstLoad) {
        snap.docs.forEach(d => shownIdsRef.current.add(d.id));
        isFirstLoad = false;
        return;
      }
      snap.docChanges().forEach((chg) => {
        if (chg.type !== 'added') return;
        const data = chg.doc.data();
        if (shownIdsRef.current.has(chg.doc.id)) return;
        shownIdsRef.current.add(chg.doc.id);

        // Determine title and body based on notification type
        let title = '🔔 Colony Carpool';
        let body = data.text || data.message || 'You have a new notification';
        let toastType = 'info';

        switch (data.type) {
          case 'message':
            title = '💬 New Private Message';
            body = data.text || 'You received a new private message';
            break;
          case 'group-message':
            title = '👥 New Group Message';
            body = data.text || 'New message in your ride group';
            break;
          case 'ride-joined':
            title = '🎉 Someone Joined Your Ride';
            toastType = 'success';
            break;
          case 'running-late':
            title = '🏃 Co-rider Running Late';
            toastType = 'warn';
            break;
          case 'cancellation':
            title = '👋 Co-rider Left';
            break;
          case 'late-cancellation':
            title = '⚠️ Late Cancellation';
            toastType = 'warn';
            break;
          case 'ride-cancelled':
            title = '🚫 Ride Cancelled';
            toastType = 'warn';
            break;
          case 'no-show':
            title = '🚨 No-Show Reported';
            toastType = 'warn';
            break;
          case 'rate':
            title = '⭐ Rate Your Ride';
            body = 'Your ride is complete! Please rate your co-rider.';
            break;
          default:
            break;
        }

        // Show in-app toast
        notify[toastType](body, title);
      });
    });
    return () => unsub();
  }, [currentUserId]);

  return null;
}

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/societyfeed" element={<SocietyFeed />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/privatechat/:chatId" element={<PrivateChat />} />
        <Route path="/groupchat/:rideId" element={<GroupChat />} />
      </Routes>
      <NotificationListener />
      <FloatingChatbot />
    </>
  );
}

export default App;