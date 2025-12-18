import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUsers, FaCar, FaMapMarkerAlt, FaClock, FaRupeeSign, FaTaxi, FaLeaf, FaChartLine, FaStar } from 'react-icons/fa';

const ClusteredRideGroups = ({ clusters, stats, onJoinGroup, joiningGroupId, chatRideId, currentUserId }) => {
  const [openExplainId, setOpenExplainId] = useState(null);
  const navigate = useNavigate();
  if (!clusters || clusters.length === 0) {
    return (
      <div className="no-clusters-modern">
        <div className="empty-state">
          <div className="empty-icon">
            <FaUsers size={64} />
          </div>
          <h3>No Ride Groups Yet</h3>
          <p>Post a ride to create or join optimized carpooling groups!</p>
          <div className="empty-benefits">
            <div className="benefit-chip">
              <FaRupeeSign /> Save Money
            </div>
            <div className="benefit-chip">
              <FaLeaf /> Eco-Friendly
            </div>
            <div className="benefit-chip">
              <FaUsers /> Meet People
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="clustered-rides-container-modern">
      {/* Stats Summary with Modern Design */}
      {stats && (
        <div className="clustering-stats-modern">
          <div className="stat-card-modern rides-reduced">
            <div className="stat-icon-wrapper">
              <FaCar className="stat-icon-modern" />
            </div>
            <div className="stat-content">
              <h4 className="stat-value">{stats.ridesReduced}</h4>
              <p className="stat-label">Rides Reduced</p>
            </div>
            <div className="stat-badge">
              <FaChartLine />
            </div>
          </div>

          <div className="stat-card-modern group-size">
            <div className="stat-icon-wrapper">
              <FaUsers className="stat-icon-modern" />
            </div>
            <div className="stat-content">
              <h4 className="stat-value">{stats.averageGroupSize}</h4>
              <p className="stat-label">Avg Group Size</p>
            </div>
            <div className="stat-badge">
              <FaStar />
            </div>
          </div>

          <div className="stat-card-modern cost-savings">
            <div className="stat-icon-wrapper">
              <FaRupeeSign className="stat-icon-modern" />
            </div>
            <div className="stat-content">
              <h4 className="stat-value">₹{stats.costSavings}</h4>
              <p className="stat-label">Total Savings</p>
            </div>
            <div className="stat-badge">
              <FaLeaf />
            </div>
          </div>

          <div className="stat-card-modern reduction-percent">
            <div className="stat-content-center">
              <div className="circular-progress">
                <span className="percentage-text">{stats.reductionPercentage}%</span>
              </div>
              <p className="stat-label">Traffic Reduction</p>
            </div>
          </div>
        </div>
      )}

      {/* Ride Groups with Modern Design */}
      <div className="ride-groups-grid-modern">
        {clusters.map((group, index) => {
          // Get vehicle icon based on vehicle type
          const vehicleIcon = group.vehicleType === 'auto' ? <FaTaxi /> : <FaCar />;
          const vehicleLabel = group.vehicleType === 'auto' ? 'Auto' : 'Car';
          const animationDelay = `${index * 0.1}s`;
          const isMine = !!currentUserId && (
            (Array.isArray(group.memberUserIds) && group.memberUserIds.includes(currentUserId)) ||
            (Array.isArray(group.rideOptions) && group.rideOptions.some(o => o.driverId === currentUserId))
          );
          
          return (
            <div 
              key={group.groupId} 
              className="ride-group-card-modern"
              style={{ animationDelay }}
            >
              {/* Card Header with Gradient */}
              <div className="card-header-modern">
                <div className="group-badge">
                  <span className="badge-icon">{vehicleIcon}</span>
                  <span className="badge-text">Group {group.groupId}</span>
                </div>
                <div className="vehicle-type-badge">
                  <span className={`vehicle-pill ${group.vehicleType}`}>
                    {vehicleLabel}
                  </span>
                </div>
              </div>

              {/* Route Information with Icon */}
              <div className="route-section">
                <div className="route-icon-circle">
                  <FaMapMarkerAlt />
                </div>
                <div className="route-details">
                  <p className="route-label">Route</p>
                  <h3 className="route-text">{group.route}</h3>
                </div>
              </div>

              {/* Time and Capacity Row */}
              <div className="info-row">
                <div className="info-item">
                  <FaClock className="info-icon" />
                  <div>
                    <p className="info-label">Time</p>
                    <p className="info-value">{group.time}</p>
                  </div>
                </div>
                <div className="info-item">
                  <FaUsers className="info-icon" />
                  <div>
                    <p className="info-label">Seats</p>
                    <p className="info-value">{group.members}/{group.capacity}</p>
                  </div>
                </div>
              </div>

              {/* Date Badge */}
              <div className="date-badge-container">
                <span className="date-badge">{group.date}</span>
                {group.isFull && <span className="full-badge">Full</span>}
              </div>

              {/* Riders List */}
              <div className="riders-section">
                <h5 className="riders-title">
                  <FaUsers /> Riders in Group
                </h5>
                <div className="riders-list">
                  {group.riders.map((rider, idx) => (
                    <div key={idx} className="rider-item">
                      <div className="rider-avatar">
                        {rider.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="rider-info">
                        <span className="rider-name-modern">{rider.name}</span>
                        <span className="rider-location">{rider.pickupLocation}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost Section with Highlight */}
              <div className="cost-section-modern">
                <div className="cost-item total">
                  <span className="cost-label">Total Cost</span>
                  <span className="cost-value">₹{group.estimatedCost}</span>
                </div>
                <div className="cost-divider"></div>
                <div className="cost-item per-person">
                  <span className="cost-label">Per Person</span>
                  <span className="cost-value-highlight">₹{Math.round(group.costPerPerson)}</span>
                </div>
              </div>

              {/* XAI: Why this group */}
              {group.explanations && (
                <div style={{ marginTop: '8px' }}>
                  <button
                    className="join-group-btn-modern"
                    style={{ background: '#6b7280' }}
                    onClick={() => setOpenExplainId(openExplainId === group.groupId ? null : group.groupId)}
                  >
                    {openExplainId === group.groupId ? 'Hide Why' : 'Why this group?'}
                  </button>
                  {openExplainId === group.groupId && (
                    <div style={{
                      marginTop: '10px',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      padding: '12px'
                    }}>
                      <div style={{ fontSize: '0.9rem', color: '#374151' }}>
                        <div>• Time spread: {group.explanations.timeSpreadMin} min (window {group.explanations.timeWindowMinutes} min)</div>
                        <div>• Avg pickup proximity: {group.explanations.avgProximityKm} km (target ≤ {group.explanations.proximityKm} km)</div>
                        <div>• Capacity: {group.capacity} seats ({group.explanations.capacityNote})</div>
                        <div>• Tip: {group.explanations.counterfactual}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Savings Badge */}
              <div className="savings-badge">
                <FaLeaf className="savings-icon" />
                <span>Save ₹{Math.round(120 - group.costPerPerson)} per ride!</span>
              </div>

              {/* CO2 Savings Estimate */}
              {typeof group.co2SavingPct === 'number' && (
                <div className="co2-savings" style={{
                  marginTop: '8px',
                  fontSize: '0.9rem',
                  color: '#065f46',
                  background: '#ecfdf5',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  display: 'inline-block'
                }}>
                  🌿 Estimated CO₂ saved: {group.co2SavingPct}% vs solo
                </div>
              )}

              {/* Join / Open Chat Buttons */}
              {onJoinGroup && !isMine && (
                <button 
                  className={`join-group-btn-modern ${group.isFull ? 'disabled' : ''} ${joiningGroupId === group.groupId ? 'loading' : ''}`}
                  onClick={() => onJoinGroup(group)}
                  disabled={group.isFull || joiningGroupId === group.groupId}
                >
                  {group.isFull
                    ? '🔒 Group is Full'
                    : joiningGroupId === group.groupId
                    ? '⏳ Joining...'
                    : '✨ Join This Group'}
                </button>
              )}

              {isMine && (
                <button
                  className="join-group-btn-modern disabled"
                  disabled
                  title="You are already part of this group"
                >
                  ✅ You’re in this group
                </button>
              )}

              {chatRideId && (
                <button
                  className="join-group-btn-modern"
                  style={{ marginTop: '8px', background: '#3b82f6' }}
                  onClick={() => navigate(`/groupchat/${chatRideId}`)}
                >
                  💬 Open Group Chat
                </button>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        /* Modern Container */
        .clustered-rides-container-modern {
          padding: 0;
          animation: fadeIn 0.6s ease-in;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Empty State */
        .no-clusters-modern {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }

        .empty-state {
          text-align: center;
          padding: 60px 40px;
          background: linear-gradient(145deg, #ffffff, #f0f4ff);
          border-radius: 24px;
          box-shadow: 0 10px 40px rgba(102, 126, 234, 0.1);
          max-width: 500px;
        }

        .empty-icon {
          color: #667eea;
          margin-bottom: 24px;
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .empty-state h3 {
          color: #1f2937;
          font-size: 1.8rem;
          margin-bottom: 12px;
        }

        .empty-state p {
          color: #6b7280;
          font-size: 1rem;
          margin-bottom: 24px;
        }

        .empty-benefits {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .benefit-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        /* Modern Stats Cards */
        .clustering-stats-modern {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 24px;
          margin-bottom: 40px;
        }

        .stat-card-modern {
          background: white;
          padding: 28px;
          border-radius: 20px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          display: flex;
          align-items: center;
          gap: 20px;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
          animation: slideUp 0.5s ease forwards;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .stat-card-modern:hover {
          transform: translateY(-8px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
        }

        .stat-card-modern::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: linear-gradient(180deg, #667eea, #764ba2);
        }

        .stat-card-modern.rides-reduced::before {
          background: linear-gradient(180deg, #f59e0b, #d97706);
        }

        .stat-card-modern.group-size::before {
          background: linear-gradient(180deg, #10b981, #059669);
        }

        .stat-card-modern.cost-savings::before {
          background: linear-gradient(180deg, #3b82f6, #2563eb);
        }

        .stat-card-modern.reduction-percent {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .stat-card-modern.reduction-percent::before {
          display: none;
        }

        .stat-icon-wrapper {
          width: 60px;
          height: 60px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f0f4ff, #e0e7ff);
        }

        .rides-reduced .stat-icon-wrapper {
          background: linear-gradient(135deg, #fef3c7, #fde68a);
        }

        .group-size .stat-icon-wrapper {
          background: linear-gradient(135deg, #d1fae5, #a7f3d0);
        }

        .cost-savings .stat-icon-wrapper {
          background: linear-gradient(135deg, #dbeafe, #bfdbfe);
        }

        .stat-icon-modern {
          font-size: 28px;
          color: #667eea;
        }

        .rides-reduced .stat-icon-modern {
          color: #f59e0b;
        }

        .group-size .stat-icon-modern {
          color: #10b981;
        }

        .cost-savings .stat-icon-modern {
          color: #3b82f6;
        }

        .stat-content {
          flex: 1;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0 0 4px 0;
          line-height: 1;
        }

        .stat-label {
          font-size: 0.9rem;
          color: #6b7280;
          margin: 0;
          font-weight: 500;
        }

        .stat-badge {
          opacity: 0.2;
          font-size: 24px;
        }

        .stat-content-center {
          width: 100%;
          text-align: center;
        }

        .circular-progress {
          width: 90px;
          height: 90px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          border: 4px solid rgba(255, 255, 255, 0.4);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .percentage-text {
          font-size: 2rem;
          font-weight: 800;
          color: white;
        }

        .reduction-percent .stat-label {
          color: rgba(255, 255, 255, 0.9);
        }

        .reduction-percent .stat-value {
          color: white;
        }
        /* Ride Groups Grid */
        .ride-groups-grid-modern {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 28px;
          margin-top: 32px;
        }

        @media (max-width: 768px) {
          .ride-groups-grid-modern {
            grid-template-columns: 1fr;
          }
        }

        .ride-group-card-modern {
          background: white;
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          animation: cardSlideUp 0.6s ease forwards;
          opacity: 0;
        }

        @keyframes cardSlideUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .ride-group-card-modern:hover {
          transform: translateY(-10px);
          box-shadow: 0 12px 40px rgba(102, 126, 234, 0.2);
        }

        .ride-group-card-modern::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 5px;
          background: linear-gradient(90deg, #667eea, #764ba2);
        }

        /* Card Header */
        .card-header-modern {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .group-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .badge-icon {
          font-size: 1.1rem;
        }

        .vehicle-type-badge {
          display: flex;
          align-items: center;
        }

        .vehicle-pill {
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .vehicle-pill.auto {
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          color: white;
        }

        .vehicle-pill.car {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
        }

        /* Route Section */
        .route-section {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          padding: 20px;
          background: linear-gradient(135deg, #f0f4ff, #e0e7ff);
          border-radius: 16px;
        }

        .route-icon-circle {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 20px;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .route-details {
          flex: 1;
        }

        .route-label {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 6px 0;
          font-weight: 600;
        }

        .route-text {
          font-size: 1.15rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0;
          line-height: 1.3;
        }

        /* Info Row */
        .info-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        .info-item {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 14px;
          background: #f9fafb;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }

        .info-icon {
          font-size: 20px;
          color: #667eea;
        }

        .info-label {
          font-size: 0.75rem;
          color: #6b7280;
          margin: 0 0 4px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-value {
          font-size: 0.95rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0;
        }

        /* Date Badge */
        .date-badge-container {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }

        .date-badge {
          padding: 8px 16px;
          background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
          color: #4338ca;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .full-badge {
          padding: 8px 16px;
          background: linear-gradient(135deg, #fee2e2, #fecaca);
          color: #dc2626;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        /* Riders Section */
        .riders-section {
          margin-bottom: 24px;
        }

        .riders-title {
          font-size: 0.9rem;
          color: #4b5563;
          margin: 0 0 16px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .riders-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .rider-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 12px;
          transition: all 0.2s ease;
        }

        .rider-item:hover {
          background: #f3f4f6;
          transform: translateX(4px);
        }

        .rider-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1rem;
          flex-shrink: 0;
        }

        .rider-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .rider-name-modern {
          font-weight: 600;
          color: #1f2937;
          font-size: 0.95rem;
        }

        .rider-location {
          font-size: 0.8rem;
          color: #9ca3af;
        }

        /* Cost Section */
        .cost-section-modern {
          background: linear-gradient(135deg, #f0fdf4, #dcfce7);
          padding: 20px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .cost-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .cost-label {
          font-size: 0.8rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .cost-value {
          font-size: 1.3rem;
          font-weight: 700;
          color: #1f2937;
        }

        .cost-value-highlight {
          font-size: 1.8rem;
          font-weight: 800;
          color: #10b981;
        }

        .cost-divider {
          width: 2px;
          height: 40px;
          background: #bbf7d0;
        }

        /* Savings Badge */
        .savings-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: linear-gradient(135deg, #fef3c7, #fde68a);
          border-radius: 12px;
          color: #92400e;
          font-weight: 600;
          font-size: 0.9rem;
          margin-bottom: 20px;
        }

        .savings-icon {
          color: #65a30d;
        }

        /* Join Button */
        .join-group-btn-modern {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border: none;
          border-radius: 14px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
          position: relative;
          overflow: hidden;
        }

        .join-group-btn-modern::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }

        .join-group-btn-modern:hover::before {
          width: 300px;
          height: 300px;
        }

        .join-group-btn-modern:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.5);
        }

        .join-group-btn-modern.disabled {
          background: linear-gradient(135deg, #d1d5db, #9ca3af);
          cursor: not-allowed;
          box-shadow: none;
        }

        .join-group-btn-modern.disabled:hover {
          transform: none;
        }

        .join-group-btn-modern.loading {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
};

export default ClusteredRideGroups;
