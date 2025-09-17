import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { FaLeaf } from 'react-icons/fa'; // FiLeaf is not available, using FaLeaf instead
import {
  FiArrowUpRight,
  FiAward,
  FiBriefcase,
  FiCalendar,
  FiClock,
  FiDollarSign,
  FiHome,
  FiLogOut,
  FiMap,
  FiMessageSquare,
  FiPlusCircle,
  FiSearch,
  FiShare2,
  FiStar,
  FiTrendingUp,
  FiUser,
  FiUsers
} from 'react-icons/fi';
import { WiDaySunny } from 'react-icons/wi';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import './Dashboard.css';
import FindRideModal from './FindRideModal';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [isFindRideOpen, setIsFindRideOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setUser({ uid: currentUser.uid, ...userDoc.data() });
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const quickActions = [
    { id: 'find-ride', label: 'Find a Ride', icon: <FiSearch size={20} />, color: '#10B981' },
    { id: 'post-ride', label: 'Post a Ride', icon: <FiPlusCircle size={20} />, color: '#3B82F6' },
    { id: 'book-agent', label: 'Book with Agent', icon: <FiBriefcase size={20} />, color: '#F59E0B' },
    { id: 'society-feed', label: 'Society Feed', icon: <FiMessageSquare size={20} />, color: '#8B5CF6' },
    { id: 'leaderboard', label: 'Leaderboard', icon: <FiAward size={20} />, color: '#EC4899' },
    { id: 'my-rides', label: 'My Rides', icon: <FiCalendar size={20} />, color: '#6366F1' }
  ];

  const recentActivities = [
    { action: 'Ride confirmed', description: 'Office commute with Neha', time: '2 hours ago', icon: <FiTrendingUp size={16} /> },
    { action: 'Payment received', description: '₹150 from Rajesh', time: '5 hours ago', icon: <FiDollarSign size={16} /> },
    { action: 'Ride posted', description: 'To Metro Station at 9 AM', time: 'Yesterday', icon: <FiPlusCircle size={16} /> },
    { action: 'New achievement', description: 'Eco Warrior badge earned!', time: '2 days ago', icon: <FiAward size={16} /> }
  ];

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">
              <FiHome size={24} />
            </div>
            <span className="logo-text">ColonyCarpool</span>
          </div>
        </div>
        <div className="header-center">
          <nav className="dashboard-nav">
            <button
              className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <FiHome size={18} />
              <span>Overview</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'rides' ? 'active' : ''}`}
              onClick={() => setActiveTab('rides')}
            >
              <FiCalendar size={18} />
              <span>Rides</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'community' ? 'active' : ''}`}
              onClick={() => setActiveTab('community')}
            >
              <FiUsers size={18} />
              <span>Community</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <FiUser size={18} />
              <span>Profile</span>
            </button>
          </nav>
        </div>
        <div className="header-right">
          <div className="user-menu">
            <span className="user-greeting">Hi, {user?.name || 'User'}!</span>
            <button className="logout-btn" onClick={handleLogout}>
              <FiLogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-content">
        {/* Welcome Section */}
        <section className="welcome-section">
          <div className="welcome-content">
            <h1>Welcome back, {user?.name || 'Neighbor'}!</h1>
            <p>Your carpooling journey is making a difference. Ready for your next ride?</p>
            <div className="welcome-stats">
              <div className="welcome-stat">
                <FiTrendingUp size={20} />
                <span>47 rides this month</span>
              </div>
              <div className="welcome-stat">
                <FiArrowUpRight size={20} />
                <span>12% more than last month</span>
              </div>
            </div>
          </div>
          <div className="weather-widget">
            <div className="weather-info">
              <WiDaySunny size={40} />
              <div className="weather-details">
                <span className="temperature">28°C</span>
                <span className="condition">Sunny</span>
              </div>
            </div>
            <p className="weather-recommendation">Perfect day for carpooling!</p>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <FiCalendar size={24} />
            </div>
            <div className="stat-content">
              <h3>47</h3>
              <p>Rides Shared</p>
            </div>
            <span className="stat-badge">+12% this month</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <FiDollarSign size={24} />
            </div>
            <div className="stat-content">
              <h3>₹8,450</h3>
              <p>Money Saved</p>
            </div>
            <span className="stat-badge">+₹1,200</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <FaLeaf size={24} /> {/* Changed from FiLeaf to FaLeaf */}
            </div>
            <div className="stat-content">
              <h3>128 kg</h3>
              <p>CO₂ Reduced</p>
            </div>
            <span className="stat-badge">6 trees saved</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <FiStar size={24} />
            </div>
            <div className="stat-content">
              <h3>4.8/5</h3>
              <p>Community Rating</p>
            </div>
            <span className="stat-badge">23 reviews</span>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="quick-actions">
          <h2>Quick Actions</h2>
          <div className="actions-grid">
            {quickActions.map(action => (
              <button
                key={action.id}
                className="action-card"
                style={{ '--action-color': action.color }}
                onClick={action.id === 'find-ride' ? () => setIsFindRideOpen(true) : undefined}
              >
                <div className="action-icon" style={{ color: action.color }}>
                  {action.icon}
                </div>
                <span className="action-label">{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent Activity & Map */}
        <section className="activity-map-section">
          <div className="recent-activity">
            <div className="section-header">
              <h2>Recent Activity</h2>
              <button className="view-all-btn">
                View All <FiArrowUpRight size={14} />
              </button>
            </div>
            <div className="activity-list">
              {recentActivities.map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-icon" style={{ color: 'var(--action-color)' }}>
                    {activity.icon}
                  </div>
                  <div className="activity-content">
                    <h4>{activity.action}</h4>
                    <p>{activity.description}</p>
                    <span className="activity-time">
                      <FiClock size={12} />
                      {activity.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="map-widget">
            <div className="section-header">
              <h2>Society Map</h2>
              <FiMap size={20} />
            </div>
            <div className="map-placeholder">
              <div className="map-visualization">
                <div className="society-layout">
                  <div className="building your-building">
                    <FiHome size={16} />
                    <span>You</span>
                  </div>
                  <div className="building">A-101</div>
                  <div className="building">A-102</div>
                  <div className="building active-ride">
                    <FiUsers size={16} />
                    <span>B-201</span>
                  </div>
                  <div className="building">B-202</div>
                  <div className="building">C-301</div>
                </div>
                <div className="map-legend">
                  <div className="legend-item">
                    <div className="legend-color your-building"></div>
                    <span>Your Location</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color active-ride"></div>
                    <span>Active Rides</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Additional Features */}
        <section className="additional-features">
          <div className="feature-card eco-impact">
            <div className="feature-header">
              <FaLeaf size={24} /> {/* Changed from FiLeaf to FaLeaf */}
              <h3>Eco Impact</h3>
            </div>
            <p>You've saved enough carbon to charge 15,000 smartphones!</p>
            <div className="progress-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: '75%' }}></div>
              </div>
              <span className="progress-text">75% to next milestone</span>
            </div>
          </div>
          
          <div className="feature-card community-spotlight">
            <div className="feature-header">
              <FiAward size={24} />
              <h3>Community Spotlight</h3>
            </div>
            <p>You're in the top 10% of most active carpoolers this month!</p>
            <button className="cta-button">
              <FiShare2 size={16} />
              Share Achievement
            </button>
          </div>
        </section>
      </main>
      {/* Find Ride Modal */}
      <FindRideModal
        isOpen={isFindRideOpen}
        onClose={() => setIsFindRideOpen(false)}
        community={user?.community || ''}
      />
    </div>
  );
};

export default Dashboard;