/**
 * ReliabilityBadge – reusable component that shows a user's
 * AI-predicted reliability score and tier label.
 *
 * Props:
 *   userId   (string)  – Firestore user id to look up
 *   size     ('sm'|'md'|'lg')  – badge size variant (default 'sm')
 *   inline   (bool)    – render as inline-flex (for chat headers, ride cards)
 *
 * The component lazy-loads the score from Firestore; if none is stored
 * it triggers a one-time background refresh.
 */

import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { classifyReliability, refreshReliabilityScore } from '../services/reliabilityService';
import './ReliabilityBadge.css';

const ReliabilityBadge = ({ userId, size = 'sm', inline = false }) => {
  const [score, setScore] = useState(null);
  const [tier, setTier] = useState(null);

  useEffect(() => {
    if (!userId) return;

    // Real-time listener so the badge updates whenever the score changes
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      const s = d.reliabilityScore;
      if (s != null) {
        setScore(s);
        setTier(classifyReliability(s));
      } else {
        // No score yet → trigger background refresh
        refreshReliabilityScore(db, userId).catch(() => {});
      }
    });

    return () => unsub();
  }, [userId]);

  if (score === null || !tier) return null;

  const sizeClass = `rb-${size}`;

  return (
    <span
      className={`reliability-badge ${sizeClass} ${inline ? 'rb-inline' : ''}`}
      style={{ background: tier.bg, color: tier.color, borderColor: tier.border }}
      title={`Reliability Score: ${score}/100 — ${tier.label}`}
    >
      <span className="rb-icon">{tier.icon}</span>
      <span className="rb-score">{score}</span>
      {size !== 'sm' && <span className="rb-label">{tier.label}</span>}
    </span>
  );
};

export default ReliabilityBadge;
