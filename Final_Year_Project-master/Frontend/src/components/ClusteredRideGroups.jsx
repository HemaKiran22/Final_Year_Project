import React from 'react';
import { FaUsers, FaCar, FaMapMarkerAlt, FaClock, FaRupeeSign, FaTaxi } from 'react-icons/fa';

const ClusteredRideGroups = ({ clusters, stats, onJoinGroup, joiningGroupId }) => {
  if (!clusters || clusters.length === 0) {
    return (
      <div className="no-clusters">
        <p>No ride groups available yet. Post a ride to get started!</p>
      </div>
    );
  }

  return (
    <div className="clustered-rides-container">
      {/* Stats Summary */}
      {stats && (
        <div className="clustering-stats">
          <div className="stat-card">
            <FaCar className="stat-icon" />
            <div>
              <h4>{stats.ridesReduced}</h4>
              <p>Rides Reduced</p>
            </div>
          </div>
          <div className="stat-card">
            <FaUsers className="stat-icon" />
            <div>
              <h4>{stats.averageGroupSize}</h4>
              <p>Avg Group Size</p>
            </div>
          </div>
          <div className="stat-card">
            <FaRupeeSign className="stat-icon" />
            <div>
              <h4>₹{stats.costSavings}</h4>
              <p>Total Savings</p>
            </div>
          </div>
          <div className="stat-card success">
            <span className="reduction-badge">{stats.reductionPercentage}%</span>
            <p>Reduction</p>
          </div>
        </div>
      )}

      {/* Ride Groups */}
      <div className="ride-groups-grid">
        {clusters.map((group) => {
          // Get vehicle icon based on vehicle type
          const vehicleIcon = group.vehicleType === 'auto' ? <FaTaxi /> : <FaCar />;
          const vehicleLabel = group.vehicleType === 'auto' ? 'Auto' : 'Car';
          
          return (
            <div key={group.groupId} className="ride-group-card">
              <div className="group-header">
                <div className="group-id">
                  {vehicleIcon}
                  <span>Group {group.groupId}</span>
                </div>
                <div className="vehicle-type">
                  <span className="vehicle-badge">{vehicleLabel}</span>
                </div>
              </div>

              <div className="members-count">
                <FaUsers />
                <span>{group.members}/{group.capacity} seats</span>
                {group.isFull && <span className="full-chip">Full</span>}
              </div>

            <div className="group-route">
              <FaMapMarkerAlt className="route-icon" />
              <div className="route-text">
                <strong>{group.route}</strong>
              </div>
            </div>

            <div className="group-time">
              <FaClock />
              <span>{group.time} • {group.date}</span>
            </div>

            <div className="group-members">
              <h5>Riders:</h5>
              <ul>
                {group.riders.map((rider, idx) => (
                  <li key={idx}>
                    <span className="rider-name">{rider.name}</span>
                    <span className="rider-pickup">{rider.pickupLocation}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="group-cost">
              <div className="cost-breakdown">
                <span>Total Cost:</span>
                <strong>₹{group.estimatedCost}</strong>
              </div>
              <div className="cost-per-person">
                <span>Per Person:</span>
                <strong className="highlight">₹{Math.round(group.costPerPerson)}</strong>
              </div>
            </div>

            {onJoinGroup && (
              <button 
                className="join-group-btn"
                onClick={() => onJoinGroup(group)}
                disabled={group.isFull || joiningGroupId === group.groupId}
              >
                {group.isFull
                  ? 'Group is Full'
                  : joiningGroupId === group.groupId
                    ? 'Joining...'
                    : 'Join This Group'}
              </button>
            )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .clustered-rides-container {
          padding: 20px;
        }

        .clustering-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin-bottom: 30px;
        }

        .stat-card {
          background: white;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .stat-card.success {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .stat-icon {
          font-size: 2rem;
          color: #667eea;
        }

        .stat-card.success .reduction-badge {
          font-size: 1.8rem;
          font-weight: bold;
        }

        .stat-card h4 {
          margin: 0;
          font-size: 1.5rem;
          color: #333;
        }

        .stat-card p {
          margin: 0;
          font-size: 0.9rem;
          color: #666;
        }

        .stat-card.success h4,
        .stat-card.success p {
          color: white;
        }

        .ride-groups-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }

        .ride-group-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .ride-group-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }

        .group-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 15px;
          border-bottom: 2px solid #f0f0f0;
        }

        .group-id {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: bold;
          color: #667eea;
          font-size: 1.1rem;
        }

        .vehicle-type {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .vehicle-badge {
          background: #e8f0ff;
          color: #667eea;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .members-count {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #666;
          font-size: 0.9rem;
          margin-top: 10px;
        }

        .full-chip {
          background: #ffe5e5;
          color: #c0392b;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          margin-left: 6px;
          font-weight: 600;
        }

        .group-route {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 12px;
        }

        .route-icon {
          color: #667eea;
          margin-top: 3px;
        }

        .route-text strong {
          color: #333;
          font-size: 1.05rem;
        }

        .group-time {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #666;
          font-size: 0.9rem;
          margin-bottom: 15px;
        }

        .group-members {
          margin: 15px 0;
        }

        .group-members h5 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 0.95rem;
        }

        .group-members ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .group-members li {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #f5f5f5;
        }

        .rider-name {
          font-weight: 500;
          color: #333;
        }

        .rider-pickup {
          color: #999;
          font-size: 0.85rem;
        }

        .group-cost {
          background: #f8f9fa;
          padding: 12px;
          border-radius: 8px;
          margin-top: 15px;
        }

        .cost-breakdown,
        .cost-per-person {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .cost-breakdown span,
        .cost-per-person span {
          color: #666;
          font-size: 0.9rem;
        }

        .cost-per-person .highlight {
          color: #10b981;
          font-size: 1.2rem;
        }

        .join-group-btn {
          width: 100%;
          margin-top: 15px;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .join-group-btn:hover {
          opacity: 0.9;
        }

        .join-group-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .no-clusters {
          text-align: center;
          padding: 40px;
          color: #999;
        }
      `}</style>
    </div>
  );
};

export default ClusteredRideGroups;
