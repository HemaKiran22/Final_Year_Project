import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LandingPage from './screens/LandingPage';
import Signup from './screens/Signup';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Profile from './screens/Profile';
import Settings from './screens/Settings';
import SocietyFeed from './screens/SocietyFeed';
import Leaderboard from './screens/Leaderboard';


function App() {
  return (
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
      
    </Routes>
  );
}

export default App;