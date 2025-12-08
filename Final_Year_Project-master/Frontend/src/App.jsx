import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import LandingPage from './Screens/LandingPage';
import Signup from './Screens/Signup';
import Login from './Screens/Login';
import Dashboard from './Screens/Dashboard';
import Profile from './Screens/Profile';
import Settings from './Screens/Settings';
import SocietyFeed from './Screens/SocietyFeed';
import Leaderboard from './Screens/Leaderboard';
import RideChatbot from './Screens/RideChatbot';
import PrivateChat from './Screens/PrivateChat';
import FloatingChatbot from './components/FloatingChatbot';

 

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/societyfeed" element={<SocietyFeed />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/aibot" element={<RideChatbot />} />
        <Route path="/privatechat/:chatId" element={<PrivateChat />} />
      </Routes>
      <FloatingChatbot />
    </>
  );
}

export default App;