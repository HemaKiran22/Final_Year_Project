import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import './Leaderboard.css';

const Leaderboard = () => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [activeFilter, setActiveFilter] = useState('ridesShared');

  useEffect(() => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy(activeFilter, 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLeaderboardData(fetchedData);
    });

    return () => unsubscribe();
  }, [activeFilter]);

  const getMedalIcon = (rank) => {
    switch(rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getMetricValue = (user) => {
    switch(activeFilter) {
      case 'ridesShared':
        return `${user.ridesShared || 0} rides`;
      case 'moneySaved':
        return `₹${user.moneySaved || 0}`;
      default:
        return user[activeFilter] || 0;
    }
  };

  const getMetricLabel = () => {
    switch(activeFilter) {
      case 'ridesShared':
        return 'Rides Shared';
      case 'moneySaved':
        return 'Money Saved';
      default:
        return activeFilter;
    }
  };

  return (
    <div className="page-container">
      <div className="leaderboard-container-modern">
        {/* Header Section */}
        <div className="leaderboard-header">
          <div className="header-content">
            <div className="trophy-icon">🏆</div>
            <h1 className="leaderboard-title">Community Leaderboard</h1>
            <p className="leaderboard-subtitle">Celebrating our top eco-warriors and carpooling champions</p>
          </div>
          
          {/* Filter Tabs */}
          <div className="filter-tabs">
            <button 
              className={`filter-tab ${activeFilter === 'ridesShared' ? 'active' : ''}`}
              onClick={() => setActiveFilter('ridesShared')}
            >
              <span className="tab-icon">🚗</span>
              <span>Rides</span>
            </button>
            <button 
              className={`filter-tab ${activeFilter === 'moneySaved' ? 'active' : ''}`}
              onClick={() => setActiveFilter('moneySaved')}
            >
              <span className="tab-icon">💰</span>
              <span>Savings</span>
            </button>
          </div>
        </div>

        {/* Top 3 Podium */}
        {leaderboardData.length >= 3 && (
          <div className="podium-section">
            <div className="podium-container">
              {/* 2nd Place */}
              <div className="podium-item second-place">
                <div className="podium-avatar">
                  {(leaderboardData[1]?.displayName || leaderboardData[1]?.email?.split('@')[0] || 'U')?.charAt(0).toUpperCase()}
                </div>
                <div className="medal-badge">🥈</div>
                <h3 className="podium-name">{leaderboardData[1]?.displayName || leaderboardData[1]?.email?.split('@')[0] || 'User'}</h3>
                <p className="podium-score">{getMetricValue(leaderboardData[1])}</p>
                <div className="podium-base second">2</div>
              </div>

              {/* 1st Place */}
              <div className="podium-item first-place">
                <div className="podium-avatar champion">
                  {(leaderboardData[0]?.displayName || leaderboardData[0]?.email?.split('@')[0] || 'U')?.charAt(0).toUpperCase()}
                </div>
                <div className="medal-badge champion">🥇</div>
                <div className="crown-icon">👑</div>
                <h3 className="podium-name">{leaderboardData[0]?.displayName || leaderboardData[0]?.email?.split('@')[0] || 'Champion'}</h3>
                <p className="podium-score">{getMetricValue(leaderboardData[0])}</p>
                <div className="podium-base first">1</div>
              </div>

              {/* 3rd Place */}
              <div className="podium-item third-place">
                <div className="podium-avatar">
                  {(leaderboardData[2]?.displayName || leaderboardData[2]?.email?.split('@')[0] || 'U')?.charAt(0).toUpperCase()}
                </div>
                <div className="medal-badge">🥉</div>
                <h3 className="podium-name">{leaderboardData[2]?.displayName || leaderboardData[2]?.email?.split('@')[0] || 'User'}</h3>
                <p className="podium-score">{getMetricValue(leaderboardData[2])}</p>
                <div className="podium-base third">3</div>
              </div>
            </div>
          </div>
        )}

        {/* Full Leaderboard List */}
        <div className="leaderboard-list-modern">
          <h2 className="list-title">
            <span className="list-icon">📊</span>
            Top {getMetricLabel()} Leaders
          </h2>
          {leaderboardData.length > 0 ? (
            leaderboardData.map((user, index) => (
              <div 
                key={user.id} 
                className={`leaderboard-item-modern ${index < 3 ? 'top-three' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="rank-badge">
                  <span className={`rank-number ${index < 3 ? 'medal' : ''}`}>
                    {getMedalIcon(index + 1)}
                  </span>
                </div>
                
                <div className="user-avatar-small">
                  {(user.displayName || user.email?.split('@')[0] || 'U')?.charAt(0).toUpperCase()}
                </div>
                
                <div className="user-details">
                  <h4 className="user-name">{user.displayName || user.email?.split('@')[0] || 'Unknown User'}</h4>
                  <p className="user-stats">
                    <span className="stat-item">
                      <span className="stat-icon">🚗</span>
                      {user.ridesShared || 0} rides
                    </span>
                    {user.moneySaved > 0 && (
                      <span className="stat-item">
                        <span className="stat-icon">💰</span>
                        ₹{user.moneySaved || 0}
                      </span>
                    )}
                  </p>
                </div>
                
                <div className="metric-value">
                  <span className="metric-number">{getMetricValue(user)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>No leaders yet</h3>
              <p>Be the first to share rides and top the leaderboard!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;