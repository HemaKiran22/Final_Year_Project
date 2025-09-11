import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import LandingPage from './screens/LandingPage';

function App() {
  const navigate = useNavigate();

  // This useEffect will redirect the user to the landing page if they try to access a non-existent route.
  // We can remove it later when we have more routes.
  React.useEffect(() => {
    navigate('/landing');
  }, [navigate]);

  return (
    <Routes>
      <Route path="/landing" element={<LandingPage />} />
    </Routes>
  );
}

export default App;
