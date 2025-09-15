import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.jpg';
import './LandingPage.css';

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

      {/* Features Section */}
      <section id="features" className="features">
        <h2>Why Choose ColonyCarpool?</h2>
        <div className="features-container">
          <div className="feature-tabs">
            <div className={`feature-tab ${activeFeature === 0 ? 'active' : ''}`} onClick={() => setActiveFeature(0)}>
              <span className="feature-icon">🔒</span>
              <span>Verified Community</span>
            </div>
            <div className={`feature-tab ${activeFeature === 1 ? 'active' : ''}`} onClick={() => setActiveFeature(1)}>
              <span className="feature-icon">💰</span>
              <span>Cost Saving</span>
            </div>
            <div className={`feature-tab ${activeFeature === 2 ? 'active' : ''}`} onClick={() => setActiveFeature(2)}>
              <span className="feature-icon">🌱</span>
              <span>Eco Friendly</span>
            </div>
          </div>
          <div className="feature-content">
            {activeFeature === 0 && (
              <div className="feature-detail">
                <h3>Ride with Confidence</h3>
                <p>All users are verified residents of your housing society. Our secure platform ensures you only share rides with trusted neighbors, eliminating safety concerns associated with public ride-sharing.</p>
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
                <p>Split commuting costs with fellow residents and reduce your transportation expenses by up to 70%. No surge pricing, no hidden fees - just fair cost sharing among neighbors.</p>
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
                <p>By sharing rides, you're actively reducing traffic congestion and emissions. Join our green initiative to create a more sustainable community and track your environmental impact.</p>
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

      {/* Testimonials */}
      <section id="testimonials" className="testimonials">
        <h2>What Our Users Say</h2>
        <div className="testimonial-cards">
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"ColonyCarpool has transformed my daily commute. I've not only saved money but also made new friends in my apartment complex!"</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">👩</div>
              <div className="author-details">
                <h4>Priya S.</h4>
                <p>Green Valley Apartments</p>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"As someone who's environmentally conscious, I love how I can track my carbon footprint reduction. The app is intuitive and secure."</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">👨</div>
              <div className="author-details">
                <h4>Rahul M.</h4>
                <p>Sunrise Residency</p>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"The verification process gave me peace of mind. Now my kids can carpool to college with trusted neighbors safely."</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">👵</div>
              <div className="author-details">
                <h4>Meena K.</h4>
                <p>Prestige Enclave</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to Transform Your Commute?</h2>
          <p>Join thousands of residents already enjoying stress-free, economical, and eco-friendly travel.</p>
          <div className="cta-buttons">
            <button className="cta-button primary large">Download The App</button>
            <div className="auth-buttons">
              <Link to="/login">
                <button className="auth-button login">Login</button>
              </Link>
              <Link to="/signup">
                <button className="auth-button signup">Sign Up</button>
              </Link>
            </div>
          </div>
        </div>
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

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
            <div className="logo">
              <span className="logo-icon">🚗</span>
              <span className="logo-text">ColonyCarpool</span>
            </div>
            <p>Building connected, sustainable communities one ride at a time.</p>
            <div className="social-icons">
              <a href="#">📱</a>
              <a href="#">💻</a>
              <a href="#">📘</a>
              <a href="#">📸</a>
            </div>
          </div>
          <div className="footer-section">
            <h3>Company</h3>
            <a href="#">About Us</a>
            <a href="#">Careers</a>
            <a href="#">Blog</a>
            <a href="#">Press</a>
          </div>
          <div className="footer-section">
            <h3>Support</h3>
            <a href="#">Help Center</a>
            <a href="#">Contact Us</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
          <div className="footer-section">
            <h3>Download</h3>
            <p>Get the app from</p>
            <div className="download-buttons">
              <button className="store-button">App Store</button>
              <button className="store-button">Google Play</button>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} ColonyCarpool. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;