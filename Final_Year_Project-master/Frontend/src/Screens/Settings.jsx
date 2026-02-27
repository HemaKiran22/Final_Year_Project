import React, { useState, useEffect } from 'react';
import {
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import {
  FaUser, FaLock, FaBell, FaSignOutAlt, FaCheck, FaTimes,
  FaEye, FaEyeSlash, FaShieldAlt, FaSave, FaPencilAlt,
} from 'react-icons/fa';
import { MdToggleOn, MdToggleOff } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const user = auth.currentUser;

  /* ── Profile state ── */
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [editingName, setEditingName] = useState(false);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);

  /* ── Password state ── */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  /* ── Notification prefs ── */
  const [notifPrefs, setNotifPrefs] = useState({
    rideUpdates: true,
    chatMessages: true,
    rideRequests: true,
    systemAlerts: true,
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifMsg, setNotifMsg] = useState(null);

  /* ── Load notification prefs from Firestore ── */
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists() && snap.data().notifPrefs) {
          setNotifPrefs(prev => ({ ...prev, ...snap.data().notifPrefs }));
        }
      } catch (_) {}
    };
    load();
  }, [user]);

  /* ─────────────────────────────────────────── */
  /* HANDLERS                                    */
  /* ─────────────────────────────────────────── */

  const handleUpdateName = async () => {
    if (!displayName.trim()) return;
    setNameLoading(true);
    setNameMsg(null);
    try {
      await updateProfile(user, { displayName: displayName.trim() });
      await setDoc(doc(db, 'users', user.uid), { displayName: displayName.trim() }, { merge: true });
      setNameMsg({ type: 'success', text: 'Display name updated!' });
      setEditingName(false);
    } catch (err) {
      setNameMsg({ type: 'error', text: err.message || 'Failed to update name.' });
    }
    setNameLoading(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setPwLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPwMsg({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const code = err.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPwMsg({ type: 'error', text: 'Current password is incorrect.' });
      } else if (code === 'auth/weak-password') {
        setPwMsg({ type: 'error', text: 'New password is too weak. Use 6+ characters.' });
      } else {
        setPwMsg({ type: 'error', text: err.message || 'Failed to change password.' });
      }
    }
    setPwLoading(false);
  };

  const handleToggleNotif = (key) => {
    setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveNotifPrefs = async () => {
    if (!user) return;
    setNotifLoading(true);
    setNotifMsg(null);
    try {
      await setDoc(doc(db, 'users', user.uid), { notifPrefs }, { merge: true });
      setNotifMsg({ type: 'success', text: 'Notification preferences saved!' });
    } catch (err) {
      setNotifMsg({ type: 'error', text: 'Failed to save preferences.' });
    }
    setNotifLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  /* ─────────────────────────────────────────── */
  /* RENDER                                     */
  /* ─────────────────────────────────────────── */

  const notifLabels = {
    rideUpdates: { label: 'Ride Updates', desc: 'When your ride status changes or seats fill up.' },
    chatMessages: { label: 'Chat Messages', desc: 'New private and group chat notifications.' },
    rideRequests: { label: 'Ride Requests', desc: 'When someone requests to join your ride.' },
    systemAlerts: { label: 'System Announcements', desc: 'Important platform-wide notifications.' },
  };

  return (
    <div className="settings-page">
      {/* Top nav bar */}
      <div className="settings-topbar">
        <button className="settings-back-btn" onClick={() => navigate('/dashboard')}>
          ← Dashboard
        </button>
        <span className="settings-topbar-title">Settings</span>
        <div style={{ width: 90 }} />
      </div>

      <div className="settings-container">
        <div className="settings-header">
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">Manage your account, security &amp; preferences</p>
        </div>

        {/* ── Profile Section ── */}
        <div className="settings-section">
          <div className="section-title-row">
            <div className="section-icon-wrap blue"><FaUser /></div>
            <h2>Profile</h2>
          </div>

          <div className="settings-field-group">
            <div className="settings-info-row">
              <div className="info-avatar">
                {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="info-details">
                <div className="info-pair">
                  <span className="info-label">Email</span>
                  <span className="info-value">{user?.email || '—'}</span>
                </div>
                <div className="info-pair">
                  <span className="info-label">Member since</span>
                  <span className="info-value">
                    {user?.metadata?.creationTime
                      ? new Date(user.metadata.creationTime).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="settings-field">
              <label className="field-label">Display Name</label>
              {editingName ? (
                <div className="field-edit-row">
                  <input
                    className="field-input"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    disabled={nameLoading}
                    autoFocus
                  />
                  <button className="btn-save" onClick={handleUpdateName} disabled={nameLoading}>
                    {nameLoading ? 'Saving…' : <><FaSave /> Save</>}
                  </button>
                  <button className="btn-cancel-edit" onClick={() => { setEditingName(false); setDisplayName(user?.displayName || ''); }}>
                    <FaTimes />
                  </button>
                </div>
              ) : (
                <div className="field-view-row">
                  <span className="field-value">{user?.displayName || <em style={{ color: '#9ca3af' }}>Not set</em>}</span>
                  <button className="btn-edit" onClick={() => setEditingName(true)}>
                    <FaPencilAlt /> Edit
                  </button>
                </div>
              )}
              {nameMsg && (
                <div className={`settings-msg ${nameMsg.type}`}>
                  {nameMsg.type === 'success' ? <FaCheck /> : <FaTimes />} {nameMsg.text}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Security Section ── */}
        <div className="settings-section">
          <div className="section-title-row">
            <div className="section-icon-wrap purple"><FaLock /></div>
            <h2>Security</h2>
          </div>

          <form className="settings-field-group" onSubmit={handleChangePassword}>
            <div className="section-description">
              <FaShieldAlt style={{ marginRight: 6, color: '#6366f1' }} />
              Update your password. You'll need your current password to confirm.
            </div>

            <div className="settings-field">
              <label className="field-label">Current Password</label>
              <div className="pw-input-wrap">
                <input
                  className="field-input"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  disabled={pwLoading}
                  autoComplete="current-password"
                />
                <button type="button" className="pw-toggle" onClick={() => setShowCurrent(v => !v)}>
                  {showCurrent ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="settings-field">
              <label className="field-label">New Password</label>
              <div className="pw-input-wrap">
                <input
                  className="field-input"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  disabled={pwLoading}
                  autoComplete="new-password"
                />
                <button type="button" className="pw-toggle" onClick={() => setShowNew(v => !v)}>
                  {showNew ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="settings-field">
              <label className="field-label">Confirm New Password</label>
              <input
                className="field-input"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                disabled={pwLoading}
                autoComplete="new-password"
              />
            </div>

            {pwMsg && (
              <div className={`settings-msg ${pwMsg.type}`}>
                {pwMsg.type === 'success' ? <FaCheck /> : <FaTimes />} {pwMsg.text}
              </div>
            )}

            <button
              className="btn-settings-primary"
              type="submit"
              disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
            >
              {pwLoading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* ── Notifications Section ── */}
        <div className="settings-section">
          <div className="section-title-row">
            <div className="section-icon-wrap green"><FaBell /></div>
            <h2>Notifications</h2>
          </div>

          <div className="settings-field-group">
            {Object.entries(notifLabels).map(([key, { label, desc }]) => (
              <div className="notif-toggle-row" key={key}>
                <div className="notif-info">
                  <span className="notif-label">{label}</span>
                  <span className="notif-desc">{desc}</span>
                </div>
                <button
                  className={`toggle-btn ${notifPrefs[key] ? 'on' : 'off'}`}
                  onClick={() => handleToggleNotif(key)}
                  aria-label={`Toggle ${label}`}
                  type="button"
                >
                  {notifPrefs[key]
                    ? <MdToggleOn style={{ fontSize: 32, color: '#22c55e' }} />
                    : <MdToggleOff style={{ fontSize: 32, color: '#9ca3af' }} />}
                </button>
              </div>
            ))}

            {notifMsg && (
              <div className={`settings-msg ${notifMsg.type}`}>
                {notifMsg.type === 'success' ? <FaCheck /> : <FaTimes />} {notifMsg.text}
              </div>
            )}

            <button className="btn-settings-primary" onClick={handleSaveNotifPrefs} disabled={notifLoading} type="button">
              {notifLoading ? 'Saving…' : <><FaSave style={{ marginRight: 6 }} />Save Preferences</>}
            </button>
          </div>
        </div>

        {/* ── Account Section ── */}
        <div className="settings-section danger-section">
          <div className="section-title-row">
            <div className="section-icon-wrap red"><FaSignOutAlt /></div>
            <h2>Account</h2>
          </div>
          <div className="settings-field-group">
            <p className="section-description">
              Sign out of your ColonyCarpool account on this device.
            </p>
            <button className="btn-settings-danger" onClick={handleLogout} type="button">
              <FaSignOutAlt style={{ marginRight: 8 }} /> Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
