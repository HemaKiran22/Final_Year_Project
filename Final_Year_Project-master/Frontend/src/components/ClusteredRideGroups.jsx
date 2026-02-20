import React, { useState, useEffect, useCallback } from 'react';
import { FaUsers, FaMapMarkerAlt, FaClock, FaCar, FaMoneyBillWave, FaBolt, FaStar, FaChevronDown, FaChevronUp, FaTimes, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';
import { getClusteredRideGroups, invalidateClusterCache, CLUSTER_CONFIG } from '../services/clusteringService';
import { joinRideById, getParticipantIds, resolveRideStatus } from '../services/rideActionService';
import notify from '../utils/notify';
import './ClusteredRideGroups.css';

const VEHICLE_EMOJI = { car: '🚗', auto: '🛺' };
const VEHICLE_SEATS = CLUSTER_CONFIG.VEHICLE_SEATS;

const ClusteredRideGroups = ({ db, userId, userName, community, allRides, onJoinRide, navigate }) => {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [ignored, setIgnored] = useState(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem('_ignoredClusters') || '[]'));
    } catch { return new Set(); }
  });
  const [joiningId, setJoiningId] = useState(null);
  const [showSection, setShowSection] = useState(true);

  /* ── Fetch clusters ── */
  const loadClusters = useCallback(async () => {
    if (!db || !userId) return;
    setLoading(true);
    try {
      const result = await getClusteredRideGroups(db, userId, { community });
      setClusters(result.filter(c => !ignored.has(c.clusterId)));
    } catch (err) {
      console.error('ClusteredRideGroups: fetch error', err);
    }
    setLoading(false);
  }, [db, userId, community, ignored]);

  useEffect(() => { loadClusters(); }, [loadClusters]);

  /* ── Refresh when allRides changes ── */
  useEffect(() => {
    invalidateClusterCache();
    loadClusters();
  }, [allRides?.length]);

  /* ── Actions ── */
  const handleIgnore = (clusterId) => {
    const next = new Set([...ignored, clusterId]);
    setIgnored(next);
    setClusters(prev => prev.filter(c => c.clusterId !== clusterId));
    sessionStorage.setItem('_ignoredClusters', JSON.stringify([...next]));
    notify.info('Suggestion dismissed');
  };

  const handleJoinBestRide = async (cluster) => {
    const openRides = cluster.existingRides || [];
    if (openRides.length === 0) {
      notify.warn('No open rides in this group right now.');
      return;
    }
    // Pick the best ride (most seats, highest confidence)
    const bestRide = openRides.sort((a, b) => {
      const aAvail = (Number(a.availableSeats) || 0);
      const bAvail = (Number(b.availableSeats) || 0);
      return bAvail - aAvail;
    })[0];

    if (!bestRide?.id) {
      notify.warn('Could not find a joinable ride.');
      return;
    }

    setJoiningId(cluster.clusterId);
    try {
      if (onJoinRide) {
        await onJoinRide(bestRide);
      } else {
        await joinRideById(db, bestRide.id, userId, userName || 'Rider');
        notify.success(`Joined ride to ${bestRide.destination}!`);
      }
      invalidateClusterCache();
      loadClusters();
    } catch (err) {
      notify.error(err.message || 'Failed to join ride.');
    }
    setJoiningId(null);
  };

  const toggleExpand = (clusterId) => {
    setExpanded(prev => ({ ...prev, [clusterId]: !prev[clusterId] }));
  };

  /* ── Confidence badge color ── */
  const confidenceColor = (score) => {
    if (score >= 70) return '#10b981';
    if (score >= 45) return '#f59e0b';
    return '#ef4444';
  };

  const reliabilityBadge = (score) => {
    if (score == null) return null;
    const color = score >= 75 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
    const label = score >= 75 ? 'High' : score >= 40 ? 'Medium' : 'Low';
    return (
      <span className="crg-reliability-badge" style={{ background: color + '22', color, border: `1px solid ${color}55` }}>
        ★ {Math.round(score)} ({label})
      </span>
    );
  };

  /* ── Don't render if nothing to show ── */
  if (!loading && clusters.length === 0) return null;

  return (
    <div className="crg-container dashboard-section animate-in delay-1">
      <div className="section-header crg-header">
        <h2 className="section-title">
          <FaUsers style={{ marginRight: '10px', color: '#8b5cf6' }} />
          Suggested Ride Groups
          {clusters.length > 0 && (
            <span className="crg-count-badge">{clusters.length}</span>
          )}
        </h2>
        <button className="crg-toggle-btn" onClick={() => setShowSection(s => !s)}>
          {showSection ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="section-subtitle">AI-clustered groups based on similar destinations, times &amp; routes</p>

      {showSection && (
        <>
          {loading && (
            <div className="crg-loading">
              <div className="crg-loading-spinner" />
              <span>Analyzing ride patterns…</span>
            </div>
          )}

          {!loading && clusters.length > 0 && (
            <div className="crg-grid">
              {clusters.map((cluster) => {
                const isExpanded = expanded[cluster.clusterId];
                const isJoining = joiningId === cluster.clusterId;
                const hasJoinable = (cluster.existingRides || []).length > 0;
                const alreadyInCluster = cluster.suggestedMembers?.some(m => m.userId === userId);

                return (
                  <div key={cluster.clusterId} className="crg-card">
                    {/* Header */}
                    <div className="crg-card-header">
                      <div className="crg-dest-row">
                        <FaMapMarkerAlt className="crg-icon" />
                        <span className="crg-destination">{cluster.destination}</span>
                      </div>
                      <div className="crg-confidence" style={{ background: confidenceColor(cluster.confidenceScore) + '22', color: confidenceColor(cluster.confidenceScore) }}>
                        <FaBolt /> {cluster.confidenceScore}% match
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="crg-meta">
                      <div className="crg-meta-item">
                        <FaClock className="crg-meta-icon" />
                        <span>{cluster.timeRange}</span>
                      </div>
                      <div className="crg-meta-item">
                        <FaUsers className="crg-meta-icon" />
                        <span>{cluster.memberCount} rider{cluster.memberCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="crg-meta-item">
                        <span>{VEHICLE_EMOJI[cluster.suggestedVehicleType] || '🚗'}</span>
                        <span>{cluster.suggestedVehicleType} ({VEHICLE_SEATS[cluster.suggestedVehicleType] || 4} seats)</span>
                      </div>
                      {cluster.estimatedCostPerPerson > 0 && (
                        <div className="crg-meta-item crg-cost">
                          <FaMoneyBillWave className="crg-meta-icon" />
                          <span>~₹{cluster.estimatedCostPerPerson}/person</span>
                        </div>
                      )}
                    </div>

                    {/* Explanation */}
                    <div className="crg-explanation">
                      <FaInfoCircle style={{ marginRight: '6px', opacity: 0.7 }} />
                      {cluster.explanation}
                    </div>

                    {/* Expandable members */}
                    <button className="crg-expand-btn" onClick={() => toggleExpand(cluster.clusterId)}>
                      {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                      {isExpanded ? 'Hide members' : `Show ${cluster.memberCount} members`}
                    </button>

                    {isExpanded && (
                      <div className="crg-members">
                        {cluster.suggestedMembers.map((m, i) => (
                          <div key={i} className={`crg-member ${m.userId === userId ? 'crg-member-self' : ''}`}>
                            <div className="crg-member-name">
                              {m.userName} {m.userId === userId && <span className="crg-you-tag">You</span>}
                            </div>
                            <div className="crg-member-details">
                              <span>{m.destination}</span>
                              <span>{m.time || 'Flexible'}</span>
                              {reliabilityBadge(m.reliabilityScore)}
                              {m.averageRating && (
                                <span className="crg-member-rating"><FaStar style={{ color: '#f59e0b', marginRight: '2px' }} />{Number(m.averageRating).toFixed(1)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="crg-actions">
                      {hasJoinable && !alreadyInCluster && (
                        <button
                          className="crg-btn crg-btn-join"
                          disabled={isJoining}
                          onClick={() => handleJoinBestRide(cluster)}
                        >
                          {isJoining ? 'Joining…' : '✓ Join Group'}
                        </button>
                      )}
                      {alreadyInCluster && (
                        <span className="crg-already-in">
                          <FaCheckCircle /> You're in this group
                        </span>
                      )}
                      <button
                        className="crg-btn crg-btn-dismiss"
                        onClick={() => handleIgnore(cluster.clusterId)}
                        title="Dismiss this suggestion"
                      >
                        <FaTimes /> Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ClusteredRideGroups;
