import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import './PrivateChat.css';

export default function GroupChat() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('User');
  const [ride, setRide] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        navigate('/login');
      } else {
        setUser(u);
        setUserName(u.displayName || u.email?.split('@')[0] || 'User');
      }
    });
    return () => unsub();
  }, [navigate]);

  // Ride listener (members + acceptance state)
  useEffect(() => {
    if (!rideId) return;
    const rideRef = doc(db, 'rides', rideId);
    const unsub = onSnapshot(rideRef, (snap) => {
      if (snap.exists()) setRide({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [rideId]);

  // Messages listener
  useEffect(() => {
    if (!rideId) return;
    const messagesRef = collection(db, 'groupChats', rideId, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));
    const notifiedIds = new Set();
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      // popup notification for newly added messages from others
      snap.docChanges().forEach((chg) => {
        if (chg.type !== 'added') return;
        const data = chg.doc.data();
        if (!data?.senderId || data.senderId === user?.uid) return;
        if (notifiedIds.has(chg.doc.id)) return;
        notifiedIds.add(chg.doc.id);
        if ('Notification' in window) {
          if (Notification.permission === 'default') Notification.requestPermission();
          if (Notification.permission === 'granted') {
            try {
              new Notification('New group message', { body: data.text || 'You received a new message', icon: '/logo.png' });
            } catch {}
          }
        }
      });
      // scroll to bottom on new message
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return () => unsub();
  }, [rideId]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!text.trim() || !user) return;
    try {
      await addDoc(collection(db, 'groupChats', rideId, 'messages'), {
        text: text.trim(),
        senderId: user.uid,
        senderName: userName,
        createdAt: new Date(),
      });
      // Also post to Society Feed when message addresses the community
      try {
        const lower = text.trim().toLowerCase();
        if (lower.includes('hello community')) {
          await addDoc(collection(db, 'feed'), {
            username: userName,
            userId: user.uid,
            message: text.trim(),
            likes: [],
            comments: [],
            fileUrl: '',
            fileType: '',
            createdAt: new Date(),
          });
        }
      } catch (feedErr) {
        console.warn('Feed post skipped:', feedErr);
      }
      // Notify all group members except the sender
      try {
        const membersSet = new Set([
          ...(Array.isArray(ride?.passengers) ? ride.passengers : []),
          ...(ride?.driverId ? [ride.driverId] : []),
        ]);
        membersSet.delete(user.uid);
        const payloadBase = {
          type: 'group-message',
          chatId: rideId,
          fromUserId: user.uid,
          createdAt: new Date(),
          read: false,
          message: `${userName}: ${text.trim()}`,
        };
        for (const uid of membersSet) {
          await addDoc(collection(db, 'notifications'), {
            ...payloadBase,
            toUserId: uid,
          });
        }
      } catch (notifyErr) {
        console.warn('Group message notifications skipped:', notifyErr);
      }
      setText('');
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  const acceptRide = async () => {
    if (!user) return;
    try {
      const rideRef = doc(db, 'rides', rideId);
      const snap = await getDoc(rideRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const acceptedBy = Array.isArray(data.acceptedBy) ? data.acceptedBy : [];
      if (acceptedBy.includes(user.uid)) return;

      await updateDoc(rideRef, { acceptedBy: arrayUnion(user.uid) });

      // Notify the ride owner (driver) on acceptance
      try {
        if (data.driverId && data.driverId !== user.uid) {
          await addDoc(collection(db, 'notifications'), {
            toUserId: data.driverId,
            fromUserId: user.uid,
            rideId,
            chatId: rideId,
            chatType: 'group',
            type: 'accepted',
            message: `${userName} accepted your ride to ${data.destination}.`,
            createdAt: new Date(),
            read: false,
          });
        }
      } catch (notifyErr) {
        console.warn('Acceptance notification skipped:', notifyErr);
      }

      // After accepting, check if everyone accepted; if yes, set status = 'Accepted'
      const allMembers = new Set([
        ...(Array.isArray(data.passengers) ? data.passengers : []),
        ...(data.driverId ? [data.driverId] : []),
      ]);
      const newAccepted = new Set([...acceptedBy, user.uid]);
      // Only mark as Accepted if there is at least one member and all have accepted
      if (allMembers.size > 0 && allMembers.size === newAccepted.size) {
        await updateDoc(rideRef, { status: 'Accepted' });
      }
    } catch (err) {
      console.error('Failed to accept ride', err);
    }
  };

  const membersCount = (() => {
    if (!ride) return { accepted: 0, total: 0 };
    const total = new Set([
      ...(Array.isArray(ride?.passengers) ? ride.passengers : []),
      ...(ride?.driverId ? [ride.driverId] : []),
    ]).size;
    const accepted = new Set(Array.isArray(ride?.acceptedBy) ? ride.acceptedBy : []).size;
    return { accepted, total };
  })();

  return (
    <div className="private-chat-container">
      <div className="chat-header">
        <button className="back-button" onClick={() => navigate('/dashboard')}>&larr;</button>
        <div>
            <h3 style={{ margin: 0 }}>{ride?.community} → {ride?.destination}</h3>
          <small>{ride?.date} at {ride?.time} • {membersCount.accepted}/{membersCount.total} accepted</small>
        </div>
        <div>
          {ride?.isCompleted || ride?.status === 'Completed' || ride?.rideStatus === 'completed' ? (
            <span className="status-chip" style={{ marginLeft: 8 }}>✅ Ride Completed</span>
          ) : (
            <>
              {ride && (!Array.isArray(ride.acceptedBy) || !ride.acceptedBy.includes(user?.uid)) && (
                <button className="accept-button" onClick={acceptRide}>Accept</button>
              )}
              {ride?.status === 'Accepted' && (
                <span className="status-chip" style={{ marginLeft: 8 }}>All Accepted</span>
              )}
              {ride?.status === 'Accepted' && (
                <button className="accept-button" style={{ marginLeft: 8 }} onClick={async () => {
                  try {
                    const rideRef = doc(db, 'rides', rideId);
                    const snap = await getDoc(rideRef);
                    if (!snap.exists()) return navigate('/dashboard');
                    const data = snap.data();
                    const completedBy = Array.isArray(data.completedBy) ? data.completedBy : [];
                    if (!completedBy.includes(user.uid)) {
                      await updateDoc(rideRef, { completedBy: arrayUnion(user.uid) });
                    }
                    // If all members completed, set status Completed
                    const allMembers = new Set([
                      ...(Array.isArray(data.passengers) ? data.passengers : []),
                      ...(data.driverId ? [data.driverId] : []),
                    ]);
                    const newCompleted = new Set([...completedBy, user.uid]);
                    if (allMembers.size > 0 && allMembers.size === newCompleted.size) {
                      await updateDoc(rideRef, { status: 'Completed' });
                    }
                    navigate('/dashboard');
                  } catch (err) {
                    console.error('Failed to complete ride', err);
                    navigate('/dashboard');
                  }
                }}>Ride Completed & Finish</button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.senderId === user?.uid ? 'sent' : 'received'}`}>
            <div className="sender-name">{m.senderName || 'User'}</div>
            <div className="message-text">{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={sendMessage}>
        <input
          type="text"
          placeholder="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
