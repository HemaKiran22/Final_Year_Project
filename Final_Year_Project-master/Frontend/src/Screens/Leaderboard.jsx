import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import './Leaderboard.css';

const Leaderboard = () => {
  const [leaderboardData, setLeaderboardData] = useState([]);

  useEffect(() => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('ridesShared', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLeaderboardData(fetchedData);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="page-container">
      <div className="leaderboard-card">
        <h1>Leaderboard</h1>
        <p>Top members by rides shared:</p>
        <div className="leaderboard-list">
          {leaderboardData.length > 0 ? (
            leaderboardData.map((user, index) => (
              <div key={user.id} className="leaderboard-item">
                <span className="leaderboard-rank">#{index + 1}</span>
                <span className="leaderboard-name">{user.displayName || user.email?.split('@')[0] || 'Unknown User'}</span>
                <span className="leaderboard-metric">{user.ridesShared || 0} Rides Shared</span>
              </div>
            ))
          ) : (
            <p>No users on the leaderboard yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;