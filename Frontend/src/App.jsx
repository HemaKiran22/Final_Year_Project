import React from 'react';
import { Routes, Route } from 'react-router-dom'; // Removed useNavigate
import LandingPage from './screens/LandingPage';
import Signup from './screens/Signup'; // Import the new Signup component
import Login from './screens/Login';   // Import the new Login component

function App() {
  // Removed the useEffect and navigate. We'll handle the root path with a Route.

  return (
    <Routes>
      {/* Set the root path "/" to redirect to landing or show LandingPage */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />
      {/* Add your new routes here */}
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}

export default App;