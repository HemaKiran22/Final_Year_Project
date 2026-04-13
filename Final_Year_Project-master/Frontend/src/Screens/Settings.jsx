import React, { useState, useEffect } from 'react';
import {
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import {
  getCurrentUserRole,
  getRegistryMatchStatus,
  loadResidentRegistry,
  normalizeBlock,
  normalizeFlat,
  normalizeInviteCode,
  normalizePhone,
} from '../services/verificationService';
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

  /* ── Admin onboarding state ── */
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [residentRegistry, setResidentRegistry] = useState([]);
  const [reviewReasons, setReviewReasons] = useState({});
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState(null);
  const [inviteCodes, setInviteCodes] = useState([]);
  const [inviteForm, setInviteForm] = useState({
    code: '',
    block: '',
    flatNumber: '',
    registeredPhone: '',
    maxUses: 1,
    expiresInDays: 30,
    active: true,
  });

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

  const loadAdminData = async () => {
    if (!user) return;
    setAdminLoading(true);
    setAdminMsg(null);
    try {
      const roleInfo = await getCurrentUserRole(db, user.uid);
      if (!roleInfo.isAdmin) {
        setIsAdmin(false);
        setPendingUsers([]);
        setInviteCodes([]);
        setResidentRegistry([]);
        return;
      }

      setIsAdmin(true);

      const registry = await loadResidentRegistry(db);
      setResidentRegistry(registry);

      const usersRef = collection(db, 'users');
      const pendingQ = query(usersRef, where('status', 'in', ['pending_approval', 'request_info']));
      const pendingSnap = await getDocs(pendingQ);
      const rows = await Promise.all(pendingSnap.docs.map(async (d) => {
        const data = d.data() || {};
        const verificationSnap = await getDoc(doc(db, 'userVerification', d.id));
        const verification = verificationSnap.exists() ? verificationSnap.data() : {};
        const combined = { ...data, ...verification };
        const match = getRegistryMatchStatus(combined, registry);
        return { id: d.id, ...combined, registryMatchStatus: match.status };
      }));
      setPendingUsers(rows);

      const inviteQ = query(collection(db, 'inviteCodes'), orderBy('createdAt', 'desc'), limit(20));
      const inviteSnap = await getDocs(inviteQ);
      setInviteCodes(inviteSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setAdminMsg({ type: 'error', text: err?.message || 'Failed to load admin data.' });
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [user?.uid]);

  const createInviteCode = async (e) => {
    e.preventDefault();
    if (!isAdmin || !user) return;
    setAdminMsg(null);

    const codeNormalized = normalizeInviteCode(inviteForm.code);
    if (!codeNormalized) {
      setAdminMsg({ type: 'error', text: 'Invite code is required.' });
      return;
    }

    try {
      const existsQ = query(collection(db, 'inviteCodes'), where('codeNormalized', '==', codeNormalized));
      const existsSnap = await getDocs(existsQ);
      if (!existsSnap.empty) {
        setAdminMsg({ type: 'error', text: 'Invite code already exists.' });
        return;
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(inviteForm.expiresInDays || 30));

      await addDoc(collection(db, 'inviteCodes'), {
        code: codeNormalized,
        codeNormalized,
        block: normalizeBlock(inviteForm.block),
        flatNumber: normalizeFlat(inviteForm.flatNumber),
        registeredPhone: normalizePhone(inviteForm.registeredPhone),
        phoneLast4: normalizePhone(inviteForm.registeredPhone).slice(-4),
        createdBy: user.uid,
        createdAt: new Date(),
        expiresAt,
        maxUses: Math.max(1, Number(inviteForm.maxUses || 1)),
        usedCount: 0,
        active: Boolean(inviteForm.active),
      });

      setInviteForm({
        code: '',
        block: '',
        flatNumber: '',
        registeredPhone: '',
        maxUses: 1,
        expiresInDays: 30,
        active: true,
      });
      setAdminMsg({ type: 'success', text: 'Invite code created.' });
      loadAdminData();
    } catch (err) {
      setAdminMsg({ type: 'error', text: err?.message || 'Failed to create invite code.' });
    }
  };

  const applyUserAction = async (targetUser, action) => {
    if (!isAdmin || !user || !targetUser?.id) return;
    const reason = (reviewReasons[targetUser.id] || '').trim();
    setAdminMsg(null);

    const phoneFlagPresent = Object.prototype.hasOwnProperty.call(targetUser, 'phoneVerified');
    if (action === 'approve' && phoneFlagPresent && targetUser.phoneVerified !== true) {
      setAdminMsg({ type: 'error', text: `Cannot approve ${targetUser.name || targetUser.email}: phone is not verified.` });
      return;
    }

    const nextStatus = action === 'approve'
      ? 'approved'
      : action === 'reject'
        ? 'rejected'
        : action === 'suspend'
          ? 'suspended'
          : 'request_info';

    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        status: nextStatus,
        reviewReason: reason || '',
        reviewedAt: new Date(),
        reviewedBy: user.uid,
        reviewAction: action,
      });

      try {
        await setDoc(doc(db, 'userVerification', targetUser.id), {
          registryMatchStatus: targetUser.registryMatchStatus || 'unchecked',
          reviewedAt: new Date(),
          reviewedBy: user.uid,
          reviewAction: action,
        }, { merge: true });
      } catch {}

      await addDoc(collection(db, 'approvalAudit'), {
        adminId: user.uid,
        targetUserId: targetUser.id,
        action,
        reason: reason || '',
        previousStatus: targetUser.status || 'pending_approval',
        newStatus: nextStatus,
        timestamp: new Date(),
      });

      setAdminMsg({ type: 'success', text: `Updated ${targetUser.name || targetUser.email} to ${nextStatus}.` });
      setReviewReasons((prev) => ({ ...prev, [targetUser.id]: '' }));
      loadAdminData();
    } catch (err) {
      setAdminMsg({ type: 'error', text: err?.message || 'Failed to update user status.' });
    }
  };

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

        {/* ── Admin Verification Section ── */}
        {isAdmin && (
          <div className="settings-section">
            <div className="section-title-row">
              <div className="section-icon-wrap blue"><FaShieldAlt /></div>
              <h2>Admin Verification Console</h2>
            </div>

            <div className="settings-field-group" style={{ gap: 14 }}>
              <p className="section-description">
                Review pending users, compare registry match strength, and manage invite codes.
              </p>

              {adminMsg && (
                <div className={`settings-msg ${adminMsg.type}`}>
                  {adminMsg.type === 'success' ? <FaCheck /> : <FaTimes />} {adminMsg.text}
                </div>
              )}

              <div className="field-view-row" style={{ justifyContent: 'space-between' }}>
                <span className="field-value">Pending Users ({pendingUsers.length})</span>
                <button className="btn-edit" onClick={loadAdminData} type="button" disabled={adminLoading}>
                  {adminLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {pendingUsers.length === 0 && (
                <div className="settings-msg success">
                  <FaCheck /> No pending users right now.
                </div>
              )}

              {pendingUsers.map((u) => {
                const phoneFlagPresent = Object.prototype.hasOwnProperty.call(u, 'phoneVerified');
                const phoneVerified = !phoneFlagPresent || u.phoneVerified === true;
                return (
                  <div key={u.id} className="notif-toggle-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div className="notif-info">
                        <span className="notif-label">{u.name || u.email || u.id}</span>
                        <span className="notif-desc">
                          {u.email || 'No email'} • {u.phoneNumber || 'No phone'} • {u.block || '-'}-{u.flatNumber || '-'}
                        </span>
                        <span className="notif-desc">
                          Invite: {u.inviteCode || 'N/A'} • Match: {u.registryMatchStatus || 'unchecked'} • Phone: {phoneVerified ? 'verified' : 'not verified'}
                        </span>
                      </div>
                    </div>

                    <input
                      className="field-input"
                      placeholder="Reason (optional, required for reject/request info recommended)"
                      value={reviewReasons[u.id] || ''}
                      onChange={(e) => setReviewReasons((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    />

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn-settings-primary"
                        type="button"
                        disabled={!phoneVerified}
                        onClick={() => applyUserAction(u, 'approve')}
                      >
                        Approve
                      </button>
                      <button className="btn-edit" type="button" onClick={() => applyUserAction(u, 'request_info')}>
                        Request Info
                      </button>
                      <button className="btn-cancel-edit" type="button" onClick={() => applyUserAction(u, 'reject')}>
                        Reject
                      </button>
                      <button className="btn-settings-danger" type="button" onClick={() => applyUserAction(u, 'suspend')}>
                        Suspend
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="field-view-row" style={{ marginTop: 8 }}>
                <span className="field-value">Create Invite Code</span>
              </div>

              <form onSubmit={createInviteCode} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                <input
                  className="field-input"
                  placeholder="Code"
                  value={inviteForm.code}
                  onChange={(e) => setInviteForm((p) => ({ ...p, code: e.target.value }))}
                  required
                />
                <input
                  className="field-input"
                  placeholder="Block"
                  value={inviteForm.block}
                  onChange={(e) => setInviteForm((p) => ({ ...p, block: e.target.value }))}
                  required
                />
                <input
                  className="field-input"
                  placeholder="Flat Number"
                  value={inviteForm.flatNumber}
                  onChange={(e) => setInviteForm((p) => ({ ...p, flatNumber: e.target.value }))}
                  required
                />
                <input
                  className="field-input"
                  placeholder="Registered Phone"
                  value={inviteForm.registeredPhone}
                  onChange={(e) => setInviteForm((p) => ({ ...p, registeredPhone: e.target.value }))}
                  required
                />
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  placeholder="Max Uses"
                  value={inviteForm.maxUses}
                  onChange={(e) => setInviteForm((p) => ({ ...p, maxUses: e.target.value }))}
                  required
                />
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  placeholder="Expires In (Days)"
                  value={inviteForm.expiresInDays}
                  onChange={(e) => setInviteForm((p) => ({ ...p, expiresInDays: e.target.value }))}
                  required
                />
                <button className="btn-settings-primary" type="submit">Create Code</button>
              </form>

              <div className="notif-info">
                <span className="notif-label">Recent Invite Codes ({inviteCodes.length})</span>
                {inviteCodes.slice(0, 8).map((code) => (
                  <span className="notif-desc" key={code.id}>
                    {code.code} • {code.block || '-'}-{code.flatNumber || '-'} • used {Number(code.usedCount || 0)}/{Number(code.maxUses || 1)} • {code.active === false ? 'inactive' : 'active'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

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
