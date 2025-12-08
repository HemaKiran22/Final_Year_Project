import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './Login.css';
import logo from '../assets/logo.png';

const Login = () => {
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

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
          setMessage('Login successful! Redirecting...');
          setTimeout(() => navigate('/dashboard'), 2000);
        } else {
          await signOut(auth);
          setMessage('Your account is pending admin approval. Please wait.');
        }
      } else {
        await signOut(auth);
        setMessage('User data not found. Please contact support.');
      }

    } catch (error) {
      console.error("Login error:", error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
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
          
          <div className="input-group">
            <input 
              type="password" 
              name="password" 
              value={loginData.password} 
              onChange={handleChange} 
              required 
            />
            <label>Password</label>
            <span className="input-border"></span>
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
          <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
        
        <div className="auth-footer">
          <p>Don't have an account? <Link to="/signup" className="auth-link">Sign up here</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Login;