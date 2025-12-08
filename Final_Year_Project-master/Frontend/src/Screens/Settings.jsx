import React from 'react';
import { FaCog } from 'react-icons/fa';
import './Settings.css';

const Settings = () => {
  return (
    <div className="page-container">
      <div className="settings-card">
        <h1>Settings</h1>
        <FaCog size={100} className="settings-icon-large" />
        <p>This is where your settings will be managed.</p>
        <p>Future features may include notification preferences, password changes, etc.</p>
      </div>
    </div>
  );
};

export default Settings;