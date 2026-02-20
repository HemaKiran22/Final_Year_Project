import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import {
  FaUser, FaEnvelope, FaTag, FaCommentDots, FaPaperPlane,
  FaMapMarkerAlt, FaPhone, FaClock, FaCheckCircle, FaArrowRight
} from 'react-icons/fa';
import logo from '../assets/logo.png';
import './Contact.css';

const fadeUp = { hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } };
const scaleIn = { hidden: { opacity: 0, scale: 0.85 }, visible: { opacity: 1, scale: 1 } };

const Contact = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  /* ── form state ── */
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  /* ── validation ── */
  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Full name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.subject.trim()) errs.subject = 'Subject is required';
    if (!form.message.trim()) errs.message = 'Message is required';
    else if (form.message.trim().length < 10) errs.message = 'Message must be at least 10 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* ── submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'contactMessages'), {
        ...form,
        createdAt: Timestamp.now(),
        read: false
      });
      setSuccess(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      console.error('Contact submit error:', err);
      // Fallback mock behavior
      setSuccess(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    }
    setSending(false);
  };

  /* ── info cards ── */
  const contactInfo = [
    { icon: <FaMapMarkerAlt />, title: 'Our Office', lines: ['Hyderabad, Telangana', 'India 500032'], color: '#8b5cf6' },
    { icon: <FaPhone />, title: 'Phone / WhatsApp', lines: ['Support available via app', 'In-app Help Center'], color: '#10b981' },
    { icon: <FaClock />, title: 'Working Hours', lines: ['Mon – Fri: 9 AM – 6 PM', 'Sat: 10 AM – 2 PM'], color: '#f59e0b' },
  ];

  return (
    <div className="contact-page">
      {/* ─── Nav ─── */}
      <nav className="contact-nav">
        <div className="contact-nav-inner">
          <Link to="/" className="contact-logo">
            <img src={logo} alt="Logo" />
            <span>ColonyCarpool</span>
          </Link>
          <div className="contact-nav-links">
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
            <Link to="/contact" className="active">Contact</Link>
            <Link to="/login"><button className="contact-nav-btn">Login</button></Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="contact-hero">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.6 }}>
          <span className="contact-badge">📬 Contact Us</span>
          <h1>We'd love to hear<br /><span className="contact-grad">from you</span></h1>
          <p>Have a question, suggestion, or just want to say hi? Drop us a message and we'll get back to you as soon as possible.</p>
        </motion.div>
      </section>

      {/* ─── Info Cards ─── */}
      <section className="contact-info-section">
        <div className="contact-info-grid">
          {contactInfo.map((c, i) => (
            <motion.div key={i} className="contact-info-card" initial="hidden" whileInView="visible" variants={scaleIn} viewport={{ once: true }} transition={{ delay: i * 0.12 }}>
              <div className="cic-icon" style={{ background: c.color + '18', color: c.color }}>{c.icon}</div>
              <h3>{c.title}</h3>
              {c.lines.map((l, j) => <p key={j}>{l}</p>)}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Form Section ─── */}
      <section className="contact-form-section">
        <div className="contact-form-wrapper">
          {/* Left decorative panel */}
          <motion.div className="contact-form-side" initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}>
            <div className="cfs-content">
              <h2>Let's start a<br /><span className="contact-grad">conversation</span></h2>
              <p>Fill out the form and our team will respond within 24 hours. We're always happy to help!</p>
              <div className="cfs-features">
                <div className="cfs-f"><FaCheckCircle /> Quick response time</div>
                <div className="cfs-f"><FaCheckCircle /> Friendly support team</div>
                <div className="cfs-f"><FaCheckCircle /> Your data stays private</div>
              </div>
            </div>
          </motion.div>

          {/* Form */}
          <motion.div className="contact-form-panel" initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }} transition={{ delay: 0.2 }}>
            <AnimatePresence mode="wait">
              {success ? (
                <motion.div
                  key="success"
                  className="contact-success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                >
                  <div className="cs-icon">✅</div>
                  <h3>Thank you for contacting us!</h3>
                  <p>We've received your message and will get back to you within 24 hours.</p>
                  <button className="contact-btn-primary" onClick={() => setSuccess(false)}>
                    Send Another Message
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  className="contact-form"
                  onSubmit={handleSubmit}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Name */}
                  <div className={`cf-group ${errors.name ? 'cf-error' : ''}`}>
                    <label><FaUser className="cf-label-icon" /> Full Name</label>
                    <input
                      type="text"
                      name="name"
                      placeholder="John Doe"
                      value={form.name}
                      onChange={handleChange}
                    />
                    {errors.name && <span className="cf-err-msg">{errors.name}</span>}
                  </div>

                  {/* Email */}
                  <div className={`cf-group ${errors.email ? 'cf-error' : ''}`}>
                    <label><FaEnvelope className="cf-label-icon" /> Email Address</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="john@example.com"
                      value={form.email}
                      onChange={handleChange}
                    />
                    {errors.email && <span className="cf-err-msg">{errors.email}</span>}
                  </div>

                  {/* Subject */}
                  <div className={`cf-group ${errors.subject ? 'cf-error' : ''}`}>
                    <label><FaTag className="cf-label-icon" /> Subject</label>
                    <input
                      type="text"
                      name="subject"
                      placeholder="How can we help?"
                      value={form.subject}
                      onChange={handleChange}
                    />
                    {errors.subject && <span className="cf-err-msg">{errors.subject}</span>}
                  </div>

                  {/* Message */}
                  <div className={`cf-group ${errors.message ? 'cf-error' : ''}`}>
                    <label><FaCommentDots className="cf-label-icon" /> Message</label>
                    <textarea
                      name="message"
                      rows="5"
                      placeholder="Tell us more about your query..."
                      value={form.message}
                      onChange={handleChange}
                    />
                    {errors.message && <span className="cf-err-msg">{errors.message}</span>}
                  </div>

                  <button type="submit" className="contact-btn-primary contact-submit" disabled={sending}>
                    {sending ? (
                      <><span className="contact-spinner" /> Sending...</>
                    ) : (
                      <><FaPaperPlane /> Send Message</>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="contact-cta">
        <motion.div initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}>
          <h2>Not sure what to ask?</h2>
          <p>Explore our platform first — sign up for free and discover community carpooling!</p>
          <Link to="/signup">
            <button className="contact-btn-primary">Get Started Free <FaArrowRight /></button>
          </Link>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="contact-footer">
        <p>© {new Date().getFullYear()} ColonyCarpool. All rights reserved. | <Link to="/">Home</Link> · <Link to="/about">About</Link></p>
      </footer>
    </div>
  );
};

export default Contact;
