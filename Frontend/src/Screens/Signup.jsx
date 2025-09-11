import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './Signup.css';

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
    <div className="auth-container">
      <div className="auth-form">
        <h2>Create Your Account</h2>
        <form onSubmit={handleSubmit}>
          <input 
            type="text" 
            name="name" 
            placeholder="Full Name" 
            value={formData.name} 
            onChange={handleChange} 
            required 
          />
          <input 
            type="tel" 
            name="phoneNumber" 
            placeholder="Phone Number" 
            value={formData.phoneNumber} 
            onChange={handleChange} 
            required 
          />
          <input 
            type="text" 
            name="housingSociety" 
            placeholder="Housing Society Name" 
            value={formData.housingSociety} 
            onChange={handleChange} 
            required 
          />
          <input 
            type="text" 
            name="flatNumber" 
            placeholder="Flat Number" 
            value={formData.flatNumber} 
            onChange={handleChange} 
            required 
          />
          <input 
            type="email" 
            name="email" 
            placeholder="Email Address" 
            value={formData.email} 
            onChange={handleChange} 
            required 
          />
          <input 
            type="password" 
            name="password" 
            placeholder="Password" 
            value={formData.password} 
            onChange={handleChange} 
            required 
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>
        {message && <p className={message.includes('Error') ? 'message error' : 'message success'}>{message}</p>}
        <p className="auth-link">
          Already have an account? <Link to="/login">Login here</Link>.
        </p>
      </div>
    </div>
  );
};

export default Signup;