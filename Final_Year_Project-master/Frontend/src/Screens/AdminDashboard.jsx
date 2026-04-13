import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  getCurrentUserRole,
  getRegistryMatchStatus,
  loadResidentRegistry,
  normalizeBlock,
  normalizeFlat,
  normalizeInviteCode,
  normalizePhone,
} from '../services/verificationService';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [adminUid, setAdminUid] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [inviteCodes, setInviteCodes] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [residentRegistry, setResidentRegistry] = useState([]);
  const [reviewReasons, setReviewReasons] = useState({});
  const [msg, setMsg] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    code: '',
    block: '',
    flatNumber: '',
    registeredPhone: '',
    maxUses: 1,
    expiresInDays: 30,
    active: true,
  });

  const statusSummary = useMemo(() => {
    const strong = pendingUsers.filter((u) => u.registryMatchStatus === 'strong').length;
    const partial = pendingUsers.filter((u) => u.registryMatchStatus === 'partial').length;
    const noMatch = pendingUsers.filter((u) => u.registryMatchStatus === 'no-match').length;
    return { strong, partial, noMatch };
  }, [pendingUsers]);

  const loadAll = async (uid) => {
    setLoading(true);
    setMsg(null);
    try {
      const roleInfo = await getCurrentUserRole(db, uid);
      if (!roleInfo.isAdmin) {
        setMsg({ type: 'error', text: 'Only admins can access this page.' });
        setLoading(false);
        return;
      }

      const registry = await loadResidentRegistry(db);
      setResidentRegistry(registry);

      const usersRef = collection(db, 'users');
      const pendingQ = query(usersRef, where('status', 'in', ['pending_approval', 'request_info']));
      const pendingSnap = await getDocs(pendingQ);
      const rows = await Promise.all(pendingSnap.docs.map(async (d) => {
        const data = d.data() || {};
        const verificationSnap = await getDoc(doc(db, 'userVerification', d.id));
        const verification = verificationSnap.exists() ? verificationSnap.data() : {};
        const combined = { id: d.id, ...data, ...verification };
        const match = getRegistryMatchStatus(combined, registry);
        return { ...combined, registryMatchStatus: match.status };
      }));
      setPendingUsers(rows);

      const inviteQ = query(collection(db, 'inviteCodes'), orderBy('createdAt', 'desc'), limit(25));
      const inviteSnap = await getDocs(inviteQ);
      setInviteCodes(inviteSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const auditQ = query(collection(db, 'approvalAudit'), orderBy('timestamp', 'desc'), limit(20));
      const auditSnap = await getDocs(auditQ);
      setAuditRows(auditSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      setMsg({ type: 'error', text: error?.message || 'Failed to load admin dashboard.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate('/login');
        return;
      }
      setAdminUid(u.uid);
      loadAll(u.uid);
    });
    return () => { try { unsub(); } catch {} };
  }, [navigate]);

  const applyUserAction = async (targetUser, action) => {
    if (!adminUid || !targetUser?.id) return;
    const reason = (reviewReasons[targetUser.id] || '').trim();
    const phoneFlagPresent = Object.prototype.hasOwnProperty.call(targetUser, 'phoneVerified');
    if (action === 'approve' && phoneFlagPresent && targetUser.phoneVerified !== true) {
      setMsg({ type: 'error', text: `Cannot approve ${targetUser.name || targetUser.email}: phone is not verified.` });
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
        reviewedBy: adminUid,
        reviewAction: action,
      });

      await setDoc(doc(db, 'userVerification', targetUser.id), {
        registryMatchStatus: targetUser.registryMatchStatus || 'unchecked',
        reviewedAt: new Date(),
        reviewedBy: adminUid,
        reviewAction: action,
      }, { merge: true });

      await addDoc(collection(db, 'approvalAudit'), {
        adminId: adminUid,
        targetUserId: targetUser.id,
        action,
        reason: reason || '',
        previousStatus: targetUser.status || 'pending_approval',
        newStatus: nextStatus,
        timestamp: new Date(),
      });

      setReviewReasons((prev) => ({ ...prev, [targetUser.id]: '' }));
      setMsg({ type: 'success', text: `Updated ${targetUser.name || targetUser.email} to ${nextStatus}.` });
      loadAll(adminUid);
    } catch (error) {
      setMsg({ type: 'error', text: error?.message || 'Failed to update user.' });
    }
  };

  const createInviteCode = async (e) => {
    e.preventDefault();
    if (!adminUid) return;

    const codeNormalized = normalizeInviteCode(inviteForm.code);
    if (!codeNormalized) {
      setMsg({ type: 'error', text: 'Invite code is required.' });
      return;
    }

    try {
      const existsQ = query(collection(db, 'inviteCodes'), where('codeNormalized', '==', codeNormalized));
      const existsSnap = await getDocs(existsQ);
      if (!existsSnap.empty) {
        setMsg({ type: 'error', text: 'Invite code already exists.' });
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
        createdBy: adminUid,
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
      setMsg({ type: 'success', text: 'Invite code created.' });
      loadAll(adminUid);
    } catch (error) {
      setMsg({ type: 'error', text: error?.message || 'Failed to create invite code.' });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      navigate('/login');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <button className="admin-back" onClick={() => navigate('/dashboard')}>← Dashboard</button>
        <h1>Admin Dashboard</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="admin-refresh" onClick={() => loadAll(adminUid)} disabled={loading}>Refresh</button>
          <button className="admin-refresh" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {msg && <div className={`admin-msg ${msg.type}`}>{msg.text}</div>}

      <div className="admin-grid">
        <section className="admin-card">
          <h2>Pending Approvals ({pendingUsers.length})</h2>
          <p className="admin-meta">Strong: {statusSummary.strong} • Partial: {statusSummary.partial} • No match: {statusSummary.noMatch}</p>

          {pendingUsers.length === 0 && <p className="admin-empty">No pending users.</p>}

          {pendingUsers.map((u) => (
            <div className="pending-row" key={u.id}>
              <div className="pending-main">
                <div className="pending-title">{u.name || u.email || u.id}</div>
                <div className="pending-sub">{u.email || 'No email'} • {u.phoneNumber || 'No phone'} • {u.block || '-'}-{u.flatNumber || '-'}</div>
                <div className="pending-sub">Invite: {u.inviteCode || 'N/A'} • Match: {u.registryMatchStatus || 'unchecked'} • Phone: {u.phoneVerified === true ? 'verified' : 'not verified'}</div>
              </div>

              <input
                className="admin-input"
                placeholder="Reason"
                value={reviewReasons[u.id] || ''}
                onChange={(e) => setReviewReasons((prev) => ({ ...prev, [u.id]: e.target.value }))}
              />

              <div className="pending-actions">
                <button className="btn ok" disabled={u.phoneVerified === false} onClick={() => applyUserAction(u, 'approve')}>Approve</button>
                <button className="btn neutral" onClick={() => applyUserAction(u, 'request_info')}>Request Info</button>
                <button className="btn warn" onClick={() => applyUserAction(u, 'reject')}>Reject</button>
                <button className="btn danger" onClick={() => applyUserAction(u, 'suspend')}>Suspend</button>
              </div>
            </div>
          ))}
        </section>

        <section className="admin-card">
          <h2>Create Invite Code</h2>
          <form className="invite-form" onSubmit={createInviteCode}>
            <input className="admin-input" placeholder="Code" value={inviteForm.code} onChange={(e) => setInviteForm((p) => ({ ...p, code: e.target.value }))} required />
            <input className="admin-input" placeholder="Block" value={inviteForm.block} onChange={(e) => setInviteForm((p) => ({ ...p, block: e.target.value }))} required />
            <input className="admin-input" placeholder="Flat Number" value={inviteForm.flatNumber} onChange={(e) => setInviteForm((p) => ({ ...p, flatNumber: e.target.value }))} required />
            <input className="admin-input" placeholder="Registered Phone" value={inviteForm.registeredPhone} onChange={(e) => setInviteForm((p) => ({ ...p, registeredPhone: e.target.value }))} required />
            <input className="admin-input" type="number" min="1" placeholder="Max Uses" value={inviteForm.maxUses} onChange={(e) => setInviteForm((p) => ({ ...p, maxUses: e.target.value }))} required />
            <input className="admin-input" type="number" min="1" placeholder="Expires In (Days)" value={inviteForm.expiresInDays} onChange={(e) => setInviteForm((p) => ({ ...p, expiresInDays: e.target.value }))} required />
            <button className="btn ok" type="submit">Create</button>
          </form>

          <h3 className="subhead">Recent Invite Codes</h3>
          {inviteCodes.slice(0, 10).map((code) => (
            <div key={code.id} className="invite-row">
              <span>{code.code}</span>
              <span>{code.block || '-'}-{code.flatNumber || '-'}</span>
              <span>{Number(code.usedCount || 0)}/{Number(code.maxUses || 1)}</span>
              <span>{code.active === false ? 'inactive' : 'active'}</span>
            </div>
          ))}
        </section>

        <section className="admin-card admin-card-wide">
          <h2>Approval Audit</h2>
          {auditRows.length === 0 && <p className="admin-empty">No audit entries yet.</p>}
          {auditRows.map((a) => (
            <div className="audit-row" key={a.id}>
              <strong>{a.action}</strong>
              <span>User: {a.targetUserId}</span>
              <span>Status: {a.previousStatus} → {a.newStatus}</span>
              <span>{a.reason || 'No reason'}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
