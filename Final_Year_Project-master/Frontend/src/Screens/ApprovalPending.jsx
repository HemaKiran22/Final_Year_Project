import React from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const ApprovalPending = () => {
  return (
    <div className="auth-container login-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="card-header">
          <h2>Account Pending Approval</h2>
          <p>Your account is awaiting admin approval. You will be notified once approved.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="auth-button" onClick={() => signOut(auth)}>Sign Out</button>
        </div>
      </div>
    </div>
  );
};

export default ApprovalPending;
