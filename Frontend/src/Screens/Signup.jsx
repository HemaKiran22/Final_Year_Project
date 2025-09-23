import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './Signup.css';
import logo from '../assets/logo.png';

const Signup = () => {
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    housingSociety: '',
    flatNumber: '',
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
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: formData.name
      });

      await setDoc(doc(db, 'users', user.uid), {
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        housingSociety: formData.housingSociety,
        flatNumber: formData.flatNumber,
        email: formData.email,
        status: 'pending_approval',
        createdAt: new Date()
      });

      setMessage('Signup successful! Please wait for admin approval before logging in.');
      setFormData({ name: '', phoneNumber: '', housingSociety: '', flatNumber: '', email: '', password: '' });
      
      setTimeout(() => navigate('/login'), 3000);

    } catch (error) {
      console.error("Signup error:", error);
      setMessage(`Error: ${error.message}`);
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
                onChange={handleChange} 
                required 
              />
              <label>Housing Society</label>
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