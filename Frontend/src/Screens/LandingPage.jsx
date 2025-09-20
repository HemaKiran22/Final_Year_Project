import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';
import './LandingPage.css';
import { FaLock, FaLeaf } from "react-icons/fa";
import { MdAttachMoney } from "react-icons/md";
import { motion } from "framer-motion";
import { FaShieldAlt,  FaWallet, FaQuoteLeft } from "react-icons/fa";
import { FaGooglePlay, FaAppStoreIos, FaArrowRight } from "react-icons/fa";
import { FaFacebook, FaTwitter, FaLinkedin, FaInstagram } from "react-icons/fa";


const LandingPage = () => {
  // Animated Counter Hook
  function useCountUp(end, duration = 2000) {
    const [count, setCount] = useState(0);
    const ref = useRef();
    useEffect(() => {
      let start = 0;
      const increment = end / (duration / 16);
      function update() {
        start += increment;
        if (start < end) {
          setCount(Math.floor(start));
          ref.current = requestAnimationFrame(update);
        } else {
          setCount(end);
          cancelAnimationFrame(ref.current);
        }
      }
      ref.current = requestAnimationFrame(update);
      return () => cancelAnimationFrame(ref.current);
    }, [end, duration]);
    return count;
  }
  const [activeFeature, setActiveFeature] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const featureInterval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 3);
    }, 5000);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      clearInterval(featureInterval);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email) {
      setIsSubmitted(true);
      // Here you would typically send the email to your backend
      setEmail('');
      setTimeout(() => setIsSubmitted(false), 3000);
    }
  };

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <div className="logo">
            <img src={logo} alt="Logo" className="" style={{ height: '60px', width: 'auto' }} />
            <span className="logo-text">ColonyCarpool</span>
          </div>
          <div className={`nav-links ${isMenuOpen ? 'nav-active' : ''}`}>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#testimonials">Testimonials</a>
            <a href="#faq">FAQ</a>
            <div className="auth-buttons">
              <Link to="/login">
                <button className="auth-button login">Login</button>
              </Link>
              <Link to="/signup">
                <button className="auth-button signup">Sign Up</button>
              </Link>
            </div>
          </div>
          <div className="menu-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Ride with Trusted Neighbors</h1>
          <p>Connect, commute, and contribute to a greener community with ColonyCarpool - the secure ride-sharing platform exclusively for your housing society.</p>
          <div className="hero-buttons">
            <button className="css-button-get">Get Started</button>
            <button className="cta-button secondary">Learn More</button>
          </div>
        </div>
        <div className="hero-image">
          <div className="app-mockup">
            <div className="phone-mockup">
              <div className="phone-screen">
                <div className="app-interface">
                  <div className="app-header">
                    <span>ColonyCarpool</span>
                  </div>
                  <div className="app-content">
                    <div className="ride-option active">
                      <span>To Office</span>
                      <span>8:00 AM</span>
                    </div>
                    <div className="ride-option">
                      <span>To Metro Station</span>
                      <span>9:30 AM</span>
                    </div>
                    <div className="ride-option">
                      <span>To Mall</span>
                      <span>2:00 PM</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats">
        <div className="stat-item">
          <h3>{useCountUp(500)}+</h3>
          <p>Communities Served</p>
        </div>
        <div className="stat-item">
          <h3>{useCountUp(12000).toLocaleString()}+</h3>
          <p>Active Users</p>
        </div>
        <div className="stat-item">
          <h3>{useCountUp(45)}%</h3>
          <p>Carbon Reduction</p>
        </div>
        <div className="stat-item">
          <h3>₹{useCountUp(25)}L+</h3>
          <p>Collective Savings</p>
        </div>
      </section>

     



<section id="features" className="features">
  <h2>Why Choose ColonyCarpool?</h2>
  <div className="features-container">
    <div className="feature-tabs">
      <div
        className={`feature-tab ${activeFeature === 0 ? 'active' : ''}`}
        onClick={() => setActiveFeature(0)}
      >
        <span className="feature-icon"><FaLock /></span>
        <span>Verified Community</span>
      </div>
      <div
        className={`feature-tab ${activeFeature === 1 ? 'active' : ''}`}
        onClick={() => setActiveFeature(1)}
      >
        <span className="feature-icon"><MdAttachMoney /></span>
        <span>Cost Saving</span>
      </div>
      <div
        className={`feature-tab ${activeFeature === 2 ? 'active' : ''}`}
        onClick={() => setActiveFeature(2)}
      >
        <span className="feature-icon"><FaLeaf /></span>
        <span>Eco Friendly</span>
      </div>
    </div>
    <div className="feature-content">
      {activeFeature === 0 && (
        <div className="feature-detail">
          <h3>Ride with Confidence</h3>
          <p>
            All users are verified residents of your housing society. Our secure
            platform ensures you only share rides with trusted neighbors,
            eliminating safety concerns associated with public ride-sharing.
          </p>
          <ul>
            <li>Resident verification system</li>
            <li>Profile ratings and reviews</li>
            <li>Emergency contact integration</li>
            <li>Real-time ride tracking</li>
          </ul>
        </div>
      )}
      {activeFeature === 1 && (
        <div className="feature-detail">
          <h3>Save Money Together</h3>
          <p>
            Split commuting costs with fellow residents and reduce your
            transportation expenses by up to 70%. No surge pricing, no hidden
            fees - just fair cost sharing among neighbors.
          </p>
          <ul>
            <li>Flexible cost-sharing options</li>
            <li>Monthly commute packages</li>
            <li>No platform commission fees</li>
            <li>In-app secure payments</li>
          </ul>
        </div>
      )}
      {activeFeature === 2 && (
        <div className="feature-detail">
          <h3>Reduce Your Carbon Footprint</h3>
          <p>
            By sharing rides, you're actively reducing traffic congestion and
            emissions. Join our green initiative to create a more sustainable
            community and track your environmental impact.
          </p>
          <ul>
            <li>CO2 savings tracker</li>
            <li>Green leaderboards</li>
            <li>Carbon offset initiatives</li>
            <li>Eco-friendly route optimization</li>
          </ul>
        </div>
      )}
    </div>
  </div>
</section>


      {/* How It Works */}
      <section id="how-it-works" className="how-it-works">
        <h2>How ColonyCarpool Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Create Your Profile</h3>
            <p>Register with your society details and get verified as a resident.</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>Find or Offer Rides</h3>
            <p>Post your travel plans or browse existing rides in your community.</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Connect & Confirm</h3>
            <p>Chat with neighbors, agree on details, and confirm your ride.</p>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <h3>Travel & Share Costs</h3>
            <p>Enjoy your commute and split costs seamlessly through the app.</p>
          </div>
        </div>
      </section>

      <section id="testimonials" className="testimonials">
  <h2>What Our Users Say</h2>
  <div className="testimonial-cards">
    {[
      {
        text: "ColonyCarpool has transformed my daily commute. I've not only saved money but also made new friends in my apartment complex!",
        author: "Priya S.",
        society: "Green Valley Apartments",
        avatar: "👩"
      },
      {
        text: "As someone who's environmentally conscious, I love how I can track my carbon footprint reduction. The app is intuitive and secure.",
        author: "Rahul M.",
        society: "Sunrise Residency",
        avatar: "👨"
      },
      {
        text: "The verification process gave me peace of mind. Now my kids can carpool to college with trusted neighbors safely.",
        author: "Meena K.",
        society: "Prestige Enclave",
        avatar: "👵"
      }
    ].map((testimonial, index) => (
      <motion.div
        key={index}
        className="testimonial-card"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: index * 0.3 }}
        whileHover={{ scale: 1.05, rotate: -1 }}
      >
        <div className="testimonial-content">
          <FaQuoteLeft className="quote-icon" size={24} />
          <p>{testimonial.text}</p>
        </div>
        <div className="testimonial-author">
          <motion.div
            className="author-avatar"
            whileHover={{ rotate: 360 }}
            transition={{ duration: 0.8 }}
          >
            {testimonial.avatar}
          </motion.div>
          <div className="author-details">
            <h4>{testimonial.author}</h4>
            <p>{testimonial.society}</p>
          </div>
        </div>
      </motion.div>
    ))}
  </div>
</section>

     

      <section className="cta-section">
  <motion.div
    className="cta-content"
    initial={{ opacity: 0, y: 50 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8 }}
  >
    <motion.h2
      className="cta-title"
      initial={{ scale: 0.8 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.6, type: "spring" }}
    >
      Ready to Transform Your Commute?
    </motion.h2>
    <motion.p
      className="cta-subtitle"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.8 }}
    >
      Join thousands of residents already enjoying stress-free, economical, and eco-friendly travel.
    </motion.p>

    <div className="cta-buttons">
      {/* Download Buttons */}
      <motion.a
        href="#"
        className="cta-download-btn google"
        whileHover={{ scale: 1.1, boxShadow: "0px 0px 20px #34d399" }}
        whileTap={{ scale: 0.95 }}
      >
        <FaGooglePlay size={22} />
        <span>Google Play</span>
      </motion.a>

      <motion.a
        href="#"
        className="cta-download-btn apple"
        whileHover={{ scale: 1.1, boxShadow: "0px 0px 20px #60a5fa" }}
        whileTap={{ scale: 0.95 }}
      >
        <FaAppStoreIos size={22} />
        <span>App Store</span>
      </motion.a>
    </div>

    {/* Secondary CTA */}
    <motion.div
      className="cta-secondary"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
    >
      <p>Already a member?</p>
      <motion.a
        href="/login"
        className="cta-login-btn"
        whileHover={{ x: 5 }}
      >
        Login <FaArrowRight className="inline-icon" />
      </motion.a>
    </motion.div>
  </motion.div>
</section>


      {/* FAQ Section */}
      <section id="faq" className="faq">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-items">
          <div className="faq-item">
            <h3>How do you verify users?<span>+</span></h3>
            <div className="faq-answer">
              <p>We verify users through multiple methods including society management verification, address proof submission, and in some cases, physical verification to ensure all members are genuine residents of the community.</p>
            </div>
          </div>
          <div className="faq-item">
            <h3>Is there a cost to use ColonyCarpool?<span>+</span></h3>
            <div className="faq-answer">
              <p>Basic membership is free. We offer premium features like advanced matching and priority support through a optional subscription model. Ride costs are shared only between passengers and drivers.</p>
            </div>
          </div>
          <div className="faq-item">
            <h3>How are ride costs calculated?<span>+</span></h3>
            <div className="faq-answer">
              <p>Costs are calculated based on distance, fuel prices, and vehicle type. Our algorithm suggests a fair cost that passengers can accept before confirming the ride.</p>
            </div>
          </div>
          <div className="faq-item">
            <h3>What safety measures are in place?<span>+</span></h3>
            <div className="faq-answer">
              <p>We implement multiple safety features including ride tracking, emergency contact alerts, user ratings and reviews, and verified profiles. All rides are also insured through our partnership with leading insurers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="newsletter">
        <div className="newsletter-content">
          <h2>Stay Updated</h2>
          <p>Subscribe to our newsletter to get updates on new features and communities.</p>
          <form onSubmit={handleSubmit} className="newsletter-form">
            <input 
              type="email" 
              placeholder="Enter your email address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
            <button type="submit">Subscribe</button>
          </form>
          {isSubmitted && <p className="success-message">Thank you for subscribing!</p>}
        </div>
      </section>

      <footer className="footer">
  <motion.div
    className="footer-container"
    initial={{ opacity: 0, y: 50 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8 }}
  >
    {/* Brand Section */}
    <div className="footer-brand">
      <h2>ColonyCarpool</h2>
      <p>
        Making your daily commute stress-free, affordable, and eco-friendly.  
        Together, we build a smarter community.
      </p>

      <div className="footer-socials">
        <motion.a whileHover={{ scale: 1.2 }} href="#"><FaFacebook /></motion.a>
        <motion.a whileHover={{ scale: 1.2 }} href="#"><FaTwitter /></motion.a>
        <motion.a whileHover={{ scale: 1.2 }} href="#"><FaLinkedin /></motion.a>
        <motion.a whileHover={{ scale: 1.2 }} href="#"><FaInstagram /></motion.a>
      </div>
    </div>

    {/* Links Section */}
    <div className="footer-links">
      <h3>Quick Links</h3>
      <ul>
        <motion.li whileHover={{ x: 5 }}><a href="/">Home</a></motion.li>
        <motion.li whileHover={{ x: 5 }}><a href="/about">About Us</a></motion.li>
        <motion.li whileHover={{ x: 5 }}><a href="/features">Features</a></motion.li>
        <motion.li whileHover={{ x: 5 }}><a href="/contact">Contact</a></motion.li>
      </ul>
    </div>

    {/* Resources Section */}
    <div className="footer-links">
      <h3>Resources</h3>
      <ul>
        <motion.li whileHover={{ x: 5 }}><a href="/faq">FAQ</a></motion.li>
        <motion.li whileHover={{ x: 5 }}><a href="/support">Support</a></motion.li>
        <motion.li whileHover={{ x: 5 }}><a href="/privacy">Privacy Policy</a></motion.li>
        <motion.li whileHover={{ x: 5 }}><a href="/terms">Terms & Conditions</a></motion.li>
      </ul>
    </div>

    {/* Newsletter Section */}
    <div className="footer-newsletter">
      <h3>Stay Updated</h3>
      <p>Subscribe to our newsletter to get the latest updates and offers.</p>
      <div className="newsletter-form">
        <input type="email" placeholder="Enter your email" />
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          Subscribe
        </motion.button>
      </div>
    </div>
  </motion.div>

  <div className="footer-bottom">
    <p>© {new Date().getFullYear()} ColonyCarpool. All rights reserved.</p>
  </div>
</footer>

    </div>
  );
};


export default LandingPage;