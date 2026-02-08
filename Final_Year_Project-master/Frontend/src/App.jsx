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
import ApprovalPending from './Screens/ApprovalPending';
import GroupChat from './Screens/GroupChat';
import FloatingChatbot from './components/FloatingChatbot';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

 

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
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((chg) => {
        if (chg.type !== 'added') return;
        const data = chg.doc.data();
        if (shownIdsRef.current.has(chg.doc.id)) return;
        shownIdsRef.current.add(chg.doc.id);
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const title = data.type === 'message' || data.type === 'group-message'
              ? 'New chat message'
              : 'ColonyCarpool Notification';
            const body = data.text || data.message || 'You have a new notification';
            new Notification(title, { body, icon: '/logo.png' });
          } catch {}
        }
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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/approval" element={<ApprovalPending />} />
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