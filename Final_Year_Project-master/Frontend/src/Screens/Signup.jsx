import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile, signOut, deleteUser } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  consumeInviteCode,
  normalizeBlock,
  normalizeFlat,
  normalizeInviteCode,
  normalizePhone,
} from '../services/verificationService';
import './Signup.css';
import logo from '../assets/logo.png';

const Signup = () => {
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    housingSociety: 'Brigade',
    block: '',
    flatNumber: '',
    inviteCode: '',
    phoneVerified: false,
    email: '',
    password: ''
  });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const normalizedPhone = normalizePhone(formData.phoneNumber);
      const normalizedBlock = normalizeBlock(formData.block);
      const normalizedFlat = normalizeFlat(formData.flatNumber);
      const normalizedInviteCode = normalizeInviteCode(formData.inviteCode);

      if (normalizedPhone.length < 10) {
        setMessage('Error: Please enter a valid phone number.');
        setIsLoading(false);
        return;
      }
      if (!normalizedBlock || !normalizedFlat) {
        setMessage('Error: Block and flat number are required.');
        setIsLoading(false);
        return;
      }
      if (!normalizedInviteCode) {
        setMessage('Error: Invite code is required.');
        setIsLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: formData.name
      });

      const inviteConsume = await consumeInviteCode(db, normalizedInviteCode, {
        userId: user.uid,
        phoneLast4: normalizedPhone.slice(-4),
      });
      if (!inviteConsume.ok) {
        try { await deleteUser(user); } catch {}
        setMessage(`Error: ${inviteConsume.message}`);
        setIsLoading(false);
        return;
      }

      await setDoc(doc(db, 'users', user.uid), {
        name: formData.name.trim(),
        housingSociety: formData.housingSociety,
        flatNumber: normalizedFlat,
        email: formData.email,
        status: 'pending_approval',
        reviewReason: '',
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date()
      });

      await setDoc(doc(db, 'userVerification', user.uid), {
        userId: user.uid,
        phoneNumber: normalizedPhone,
        phoneLast4: normalizedPhone.slice(-4),
        phoneVerified: Boolean(formData.phoneVerified),
        phoneVerificationMode: 'otp-placeholder',
        block: normalizedBlock,
        flatNumber: normalizedFlat,
        inviteCode: normalizedInviteCode,
        inviteCodeRef: inviteConsume?.invite?.id || null,
        registryMatchStatus: 'unchecked',
        otpIntegrationTodo: true,
        createdAt: new Date(),
      });

      setMessage('Signup successful! Redirecting to login...');
      setFormData({
        name: '',
        phoneNumber: '',
        housingSociety: 'Brigade',
        block: '',
        flatNumber: '',
        inviteCode: '',
        phoneVerified: false,
        email: '',
        password: ''
      });
      
      try {
        await signOut(auth);
      } catch {}
      navigate('/login');

    } catch (error) {
      console.error("Signup error:", error);
      const msg = String(error?.message || 'Signup failed.');
      if (msg.toLowerCase().includes('insufficient permissions')) {
        setMessage('Error: Signup blocked by Firestore rules. Please ask admin to publish the latest rules.');
      } else if (msg.toLowerCase().includes("reading 'path'")) {
        setMessage('Error: Invite code config issue. Please refresh once and ask admin to recreate the invite code.');
      } else {
        setMessage(`Error: ${msg}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container signup-page">
      <div className="auth-background">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
      </div>
      
      <div className="auth-card">
        <div className="card-header">
          
          <div className="logo">
            <img src={logo} alt="Logo" className="" style={{ height: '60px', width: 'auto' }} />
            <span className="logo-text">ColonyCarpool</span>
          </div>
          <h2>Create Account</h2>
          <p>Join your community today</p>
        </div>
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-row">
            <div className="input-group">
              <input 
                type="text" 
                name="name" 
                value={formData.name} 
                onChange={handleChange} 
                required 
              />
              <label>Full Name</label>
              <span className="input-border"></span>
            </div>
            
            <div className="input-group">
              <input 
                type="tel" 
                name="phoneNumber" 
                value={formData.phoneNumber} 
                onChange={handleChange} 
                required 
              />
              <label>Phone Number</label>
              <span className="input-border"></span>
            </div>
          </div>
          
          <div className="form-row">
            <div className="input-group">
              <input 
                type="text" 
                name="housingSociety" 
                value={formData.housingSociety} 
                readOnly 
                required 
              />
              <label>Housing Society (fixed)</label>
              <span className="input-border"></span>
            </div>

            <div className="input-group">
              <input
                type="text"
                name="block"
                value={formData.block}
                onChange={handleChange}
                required
              />
              <label>Block</label>
              <span className="input-border"></span>
            </div>
            
            <div className="input-group">
              <input 
                type="text" 
                name="flatNumber" 
                value={formData.flatNumber} 
                onChange={handleChange} 
                required 
              />
              <label>Flat Number</label>
              <span className="input-border"></span>
            </div>
          </div>

          <div className="input-group">
            <input
              type="text"
              name="inviteCode"
              value={formData.inviteCode}
              onChange={handleChange}
              required
            />
            <label>Invite Code</label>
            <span className="input-border"></span>
          </div>
          
          <div className="input-group">
            <input 
              type="email" 
              name="email" 
              value={formData.email} 
              onChange={handleChange} 
              required 
            />
            <label>Email Address</label>
            <span className="input-border"></span>
          </div>
          
          <div className="input-group">
            <input 
              type="password" 
              name="password" 
              value={formData.password} 
              onChange={handleChange} 
              required 
            />
            <label>Password</label>
            <span className="input-border"></span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569' }}>
            <input
              type="checkbox"
              name="phoneVerified"
              checked={Boolean(formData.phoneVerified)}
              onChange={(e) => setFormData((prev) => ({ ...prev, phoneVerified: e.target.checked }))}
            />
            I have verified my phone (OTP placeholder for current prototype)
          </label>
          
          <button type="submit" disabled={isLoading} className="auth-button">
            {isLoading ? (
              <div className="button-loader"></div>
            ) : (
              'Create Account'
            )}
          </button>
        </form>
        
        {message && (
          <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
        
        <div className="auth-footer">
          <p>Already have an account? <Link to="/login" className="auth-link">Login here</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Signup;