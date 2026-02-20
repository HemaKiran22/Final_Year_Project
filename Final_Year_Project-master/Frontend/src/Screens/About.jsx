import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FaShieldAlt, FaLeaf, FaCar, FaUsers, FaMoneyBillWave, FaRoute,
  FaHandshake, FaChartLine, FaArrowRight, FaQuoteLeft, FaHeart,
  FaLightbulb, FaGlobe, FaRocket
} from 'react-icons/fa';
import { HiUserGroup } from 'react-icons/hi';
import logo from '../assets/logo.png';
import './About.css';

/* ─── animation helpers ─── */
const fadeUp = { hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } };
const fadeIn = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const scaleIn = { hidden: { opacity: 0, scale: 0.8 }, visible: { opacity: 1, scale: 1 } };

const About = () => {
  const navigate = useNavigate();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  /* goal cards */
  const goals = [
    { icon: <FaShieldAlt />, title: 'Build Trust', desc: 'Ride only with verified members of your housing society — no strangers, ever.', color: '#8b5cf6' },
    { icon: <FaMoneyBillWave />, title: 'Save Money', desc: 'Split fuel, tolls & parking with neighbors heading the same way.', color: '#10b981' },
    { icon: <FaCar />, title: 'Reduce Congestion', desc: 'Fewer cars on the road means smoother commutes for everyone.', color: '#f59e0b' },
    { icon: <FaLeaf />, title: 'Go Green', desc: 'Carpooling cuts CO₂ emissions — every shared ride helps the planet.', color: '#06b6d4' },
  ];

  /* how it works steps */
  const steps = [
    { num: '01', title: 'Join Your Community', desc: 'Sign up and verify your housing society. You\'re instantly connected with neighbors.', icon: <HiUserGroup /> },
    { num: '02', title: 'Post or Find a Ride', desc: 'Share your route and timing, or browse rides going your way. Our AI suggests the best matches.', icon: <FaRoute /> },
    { num: '03', title: 'Ride Together', desc: 'Coordinate via in-app chat, share costs fairly, and enjoy a safer commute.', icon: <FaHandshake /> },
    { num: '04', title: 'Rate & Grow', desc: 'Rate your experience and build a trusted reputation within your community.', icon: <FaChartLine /> },
  ];

  /* team values */
  const values = [
    { icon: <FaHeart />, title: 'Community First', desc: 'Everything we build strengthens neighborhood bonds.' },
    { icon: <FaLightbulb />, title: 'Smart Technology', desc: 'AI-powered matching, clustering, and reliability scoring.' },
    { icon: <FaGlobe />, title: 'Sustainability', desc: 'Every feature is designed to reduce environmental impact.' },
    { icon: <FaRocket />, title: 'Continuous Innovation', desc: 'We ship improvements every week based on user feedback.' },
  ];

  return (
    <div className="about-page">
      {/* ─── Navbar ─── */}
      <nav className="about-nav">
        <div className="about-nav-inner">
          <Link to="/" className="about-logo">
            <img src={logo} alt="Logo" />
            <span>ColonyCarpool</span>
          </Link>
          <div className="about-nav-links">
            <Link to="/">Home</Link>
            <Link to="/about" className="active">About</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/login"><button className="about-nav-btn">Login</button></Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="about-hero">
        <motion.div className="about-hero-content" initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.7 }}>
          <span className="about-hero-badge">🌟 About CommunityCarpool</span>
          <h1>Safer rides start with<br /><span className="about-gradient-text">trusted neighbors</span></h1>
          <p className="about-hero-sub">
            We're on a mission to transform daily commutes by connecting neighbors who travel the same routes —
            making ride-sharing <strong>safe</strong>, <strong>affordable</strong>, and <strong>sustainable</strong>.
          </p>
          <div className="about-hero-btns">
            <button className="about-btn-primary" onClick={() => navigate('/signup')}>Join the Community <FaArrowRight /></button>
            <button className="about-btn-outline" onClick={() => navigate('/contact')}>Get in Touch</button>
          </div>
        </motion.div>
        <div className="about-hero-visual">
          <motion.div className="about-hero-card" initial="hidden" animate="visible" variants={scaleIn} transition={{ delay: 0.3, duration: 0.6 }}>
            <div className="ahc-icon">🏘️</div>
            <div className="ahc-stat">50+</div>
            <div className="ahc-label">Communities</div>
          </motion.div>
          <motion.div className="about-hero-card" initial="hidden" animate="visible" variants={scaleIn} transition={{ delay: 0.5, duration: 0.6 }}>
            <div className="ahc-icon">🚗</div>
            <div className="ahc-stat">12,500+</div>
            <div className="ahc-label">Rides Shared</div>
          </motion.div>
          <motion.div className="about-hero-card" initial="hidden" animate="visible" variants={scaleIn} transition={{ delay: 0.7, duration: 0.6 }}>
            <div className="ahc-icon">🌍</div>
            <div className="ahc-stat">57 Tons</div>
            <div className="ahc-label">CO₂ Saved</div>
          </motion.div>
        </div>
      </section>

      {/* ─── The Problem ─── */}
      <section className="about-problem">
        <motion.div className="about-section-header" initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}>
          <span className="about-section-badge">🔍 The Problem</span>
          <h2>Ride-sharing shouldn't mean<br />riding with <span className="about-highlight">strangers</span></h2>
          <p>Traditional ride-sharing apps connect you with random people — creating safety concerns, trust issues, and an impersonal experience. Your daily commute deserves better.</p>
        </motion.div>
        <div className="about-problem-grid">
          {[
            { emoji: '⚠️', title: 'Safety Risks', desc: 'Sharing rides with unknown drivers or passengers creates anxiety and potential danger.' },
            { emoji: '💸', title: 'Rising Costs', desc: 'Solo driving means bearing the full burden of fuel, tolls, and parking every single day.' },
            { emoji: '🚦', title: 'Traffic Chaos', desc: 'Single-occupancy vehicles clog roads, making everyone\'s commute longer and stressful.' },
            { emoji: '🏭', title: 'Pollution', desc: 'Millions of cars emitting CO₂ daily — when many could share just one ride.' },
          ].map((item, i) => (
            <motion.div key={i} className="about-problem-card" initial="hidden" whileInView="visible" variants={scaleIn} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <div className="apc-emoji">{item.emoji}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Our Solution / Goals ─── */}
      <section className="about-goals">
        <motion.div className="about-section-header" initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}>
          <span className="about-section-badge">🎯 Our Goals</span>
          <h2>Building a better way to <span className="about-gradient-text">commute together</span></h2>
          <p>ColonyCarpool is community-based ride-sharing — you only ride with verified members of your housing society.</p>
        </motion.div>
        <div className="about-goals-grid">
          {goals.map((g, i) => (
            <motion.div key={i} className="about-goal-card" initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }} transition={{ delay: i * 0.12 }}>
              <div className="agc-icon" style={{ background: g.color + '18', color: g.color }}>{g.icon}</div>
              <h3>{g.title}</h3>
              <p>{g.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="about-how">
        <motion.div className="about-section-header" initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}>
          <span className="about-section-badge">⚡ How It Works</span>
          <h2>Four simple steps to<br /><span className="about-gradient-text">smarter commuting</span></h2>
        </motion.div>
        <div className="about-steps">
          {steps.map((s, i) => (
            <motion.div key={i} className="about-step" initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }} transition={{ delay: i * 0.15 }}>
              <div className="as-num">{s.num}</div>
              <div className="as-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              {i < steps.length - 1 && <div className="as-connector" />}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Our Values ─── */}
      <section className="about-values">
        <motion.div className="about-section-header" initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}>
          <span className="about-section-badge">💎 Our Values</span>
          <h2>What drives us <span className="about-gradient-text">every day</span></h2>
        </motion.div>
        <div className="about-values-grid">
          {values.map((v, i) => (
            <motion.div key={i} className="about-value-card" initial="hidden" whileInView="visible" variants={scaleIn} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <div className="avc-icon">{v.icon}</div>
              <h3>{v.title}</h3>
              <p>{v.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Quote / Tagline ─── */}
      <motion.section className="about-quote" initial="hidden" whileInView="visible" variants={fadeIn} viewport={{ once: true }}>
        <FaQuoteLeft className="about-quote-icon" />
        <blockquote>"Your neighbors are your best co-riders. We just make it easy to find them."</blockquote>
        <span>— The ColonyCarpool Team</span>
      </motion.section>

      {/* ─── CTA ─── */}
      <section className="about-cta">
        <motion.div initial="hidden" whileInView="visible" variants={fadeUp} viewport={{ once: true }}>
          <h2>Ready to ride smarter?</h2>
          <p>Join thousands of neighbors already saving money and reducing their carbon footprint.</p>
          <div className="about-cta-btns">
            <button className="about-btn-primary" onClick={() => navigate('/signup')}>Get Started Free <FaArrowRight /></button>
            <button className="about-btn-outline" onClick={() => navigate('/contact')}>Contact Us</button>
          </div>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="about-footer">
        <p>© {new Date().getFullYear()} ColonyCarpool. All rights reserved. | <Link to="/">Home</Link> · <Link to="/contact">Contact</Link></p>
      </footer>
    </div>
  );
};

export default About;
