import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { FaEye, FaEyeSlash, FaKey } from 'react-icons/fa';
import './Login.css';
import logo from '../assets/logo.png';

const Login = () => {
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const navigate = useNavigate();

  // Load saved credentials on mount
  useEffect(() => {
    // If already authenticated, route based on approval status
    const unsub = auth.onAuthStateChanged(async (u) => {
      try {
        if (u) {
          const userDocRef = doc(db, 'users', u.uid);
          const userDoc = await getDoc(userDocRef);
          const data = userDoc.exists() ? userDoc.data() : {};
          const status = data?.status || 'pending_approval';
          if (status === 'approved') {
            if (data?.role === 'admin' || data?.isAdmin === true) {
              navigate('/admin', { replace: true });
            } else {
              navigate('/dashboard', { replace: true });
            }
          } else {
            // Not approved yet — sign out and stay on login
            await signOut(auth);
          }
        }
      } catch {}
    });
    const savedEmail = localStorage.getItem('rememberedEmail');
    const savedPassword = localStorage.getItem('rememberedPassword');
    if (savedEmail && savedPassword) {
      setLoginData({ email: savedEmail, password: savedPassword });
      setRememberMe(true);
    }
    return () => { try { unsub(); } catch {} };
  }, [navigate]);

  const handleChange = (e) => {
    setLoginData({ ...loginData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        loginData.email,
        loginData.password
      );
      const user = userCredential.user;

      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.status === 'approved') {
          // Save credentials if Remember Me is checked
          if (rememberMe) {
            localStorage.setItem('rememberedEmail', loginData.email);
            localStorage.setItem('rememberedPassword', loginData.password);
          } else {
            localStorage.removeItem('rememberedEmail');
            localStorage.removeItem('rememberedPassword');
          }
          setMessage('Login successful! Redirecting...');
          const targetPath = (userData?.role === 'admin' || userData?.isAdmin === true) ? '/admin' : '/dashboard';
          setTimeout(() => navigate(targetPath, { replace: true }), 2000);
        } else {
          await signOut(auth);
          if (userData.status === 'rejected') {
            setMessage(userData.reviewReason
              ? `Signup rejected: ${userData.reviewReason}`
              : 'Signup rejected by admin. Please contact support.');
          } else if (userData.status === 'suspended') {
            setMessage(userData.reviewReason
              ? `Account suspended: ${userData.reviewReason}`
              : 'Account suspended by admin.');
          } else if (userData.status === 'request_info') {
            setMessage(userData.reviewReason
              ? `More details required: ${userData.reviewReason}`
              : 'Admin requested additional details. Please contact support.');
          } else {
            setMessage('Please wait until admin approval. You will be notified once approved.');
          }
        }
      } else {
        await signOut(auth);
        setMessage('User data not found. Please contact support.');
      }

    } catch (error) {
      console.error("Login error:", error);
      // Show a clear, friendly message for wrong credentials
      const code = error.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials' || code === 'auth/user-not-found') {
        setMessage('Please enter the correct details.');
      } else if (code === 'auth/too-many-requests') {
        setMessage('Too many failed attempts. Please try again later or reset your password.');
      } else if (code === 'auth/invalid-email') {
        setMessage('Please enter a valid email address.');
      } else {
        setMessage('Please enter the correct details.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setResetMessage('');
    
    if (!resetEmail) {
      setResetMessage('Please enter your email address');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage('Password reset email sent! Check your inbox.');
      setTimeout(() => {
        setShowForgotPassword(false);
        setResetEmail('');
        setResetMessage('');
      }, 3000);
    } catch (error) {
      console.error('Password reset error:', error);
      const code = error.code || '';
      if (code === 'auth/user-not-found') {
        setResetMessage('No account found with that email. Please check and try again.');
      } else if (code === 'auth/invalid-email') {
        setResetMessage('Please enter a valid email address.');
      } else {
        setResetMessage('Failed to send reset email. Please try again.');
      }
    }
  };

  return (
    <div className="auth-container login-page">
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
          <h2>Welcome Back</h2>
          <p>Sign in to your account</p>
        </div>
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <input 
              type="email" 
              name="email" 
              value={loginData.email} 
              onChange={handleChange} 
              required 
            />
            <label>Email Address</label>
            <span className="input-border"></span>
          </div>
          
          <div className="input-group password-input-group">
            <input 
              type={showPassword ? "text" : "password"} 
              name="password" 
              value={loginData.password} 
              onChange={handleChange} 
              required 
            />
            <label>Password</label>
            <button 
              type="button" 
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Toggle password visibility"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
            <span className="input-border"></span>
          </div>
          
          <div className="login-options">
            <label className="remember-me">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
            <button 
              type="button" 
              className="forgot-password-link"
              onClick={() => setShowForgotPassword(true)}
            >
              Forgot Password?
            </button>
          </div>
          
          <button type="submit" disabled={isLoading} className="auth-button">
            {isLoading ? (
              <div className="button-loader"></div>
            ) : (
              'Login to Account'
            )}
          </button>
        </form>
        
        {message && (
          <div className={`message ${
            message.includes('successful') ? 'success' :
            message.includes('wait') || message.includes('approval') ? 'warning' :
            'error'
          }`}
            style={message.includes('wait') || message.includes('approval') ? { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 18px', textAlign: 'center', fontWeight: '600' } : {}}
          >
            {(message.includes('wait') || message.includes('approval')) && <span style={{ display: 'block', fontSize: '20px', marginBottom: '6px' }}>⏳</span>}
            {message}
          </div>
        )}
        
        <div className="auth-footer">
          <p>Don't have an account? <Link to="/signup" className="auth-link">Sign up here</Link></p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="modal-overlay" onClick={() => setShowForgotPassword(false)}>
          <div className="forgot-password-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close"
              onClick={() => setShowForgotPassword(false)}
            >
              ×
            </button>
            <div className="modal-icon">
              <FaKey />
            </div>
            <h2>Reset Password</h2>
            <p>Enter your email address and we'll send you a link to reset your password.</p>
            
            <form onSubmit={handleForgotPassword}>
              <div className="input-group">
                <input 
                  type="email" 
                  value={resetEmail} 
                  onChange={(e) => setResetEmail(e.target.value)}
                  required 
                  placeholder=" "
                />
                <label>Email Address</label>
                <span className="input-border"></span>
              </div>
              
              {resetMessage && (
                <div className={`message ${resetMessage.includes('Error') ? 'error' : 'success'}`}>
                  {resetMessage}
                </div>
              )}
              
              <button type="submit" className="auth-button">
                Send Reset Link
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;