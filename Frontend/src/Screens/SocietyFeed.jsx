import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getAuth } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db } from '../firebase';
import { FaUserCircle, FaImage, FaFileAlt, FaThumbsUp, FaComment, FaPaperPlane } from 'react-icons/fa';
import './SocietyFeed.css';

const SocietyFeed = () => {
  const [feedItems, setFeedItems] = useState([]);
  const [postText, setPostText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = useRef(null);
  const auth = getAuth();
  const user = auth.currentUser;
  const storage = getStorage();

  useEffect(() => {
    const feedRef = collection(db, 'feed');
    const q = query(feedRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFeedItems(fetchedItems);
    });

    return () => unsubscribe();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMediaButtonClick = () => {
    fileInputRef.current.click();
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    if (!user || (!postText.trim() && !selectedFile)) return;

    setIsPosting(true);
    try {
      let fileUrl = '';
      if (selectedFile) {
        const fileRef = ref(storage, `feed-media/${user.uid}/${Date.now()}-${selectedFile.name}`);
        await uploadBytes(fileRef, selectedFile);
        fileUrl = await getDownloadURL(fileRef);
      }

      await addDoc(collection(db, 'feed'), {
        username: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        userId: user.uid,
        message: postText,
        likes: [],
        comments: [],
        fileUrl: fileUrl,
        fileType: selectedFile ? selectedFile.type : '',
        createdAt: serverTimestamp(),
      });
      setPostText('');
      setSelectedFile(null);
      setFilePreview(null);
      setIsPosting(false);
    } catch (error) {
      console.error("Error adding post: ", error);
      alert("Failed to post. Please try again.");
      setIsPosting(false);
    }
  };

  const handleLike = async (postId, postLikes) => {
    if (!user) return;
    const postRef = doc(db, 'feed', postId);
    const userId = user.uid;

    if (postLikes.includes(userId)) {
      await updateDoc(postRef, {
        likes: arrayRemove(userId),
      });
    } else {
      await updateDoc(postRef, {
        likes: arrayUnion(userId),
      });
    }
  };

  const handleComment = async (postId) => {
    const commentText = prompt("Enter your comment:");
    if (!commentText || !commentText.trim()) return;

    try {
      const postRef = doc(db, 'feed', postId);
      await updateDoc(postRef, {
        comments: arrayUnion({
          username: user.displayName || 'Anonymous',
          userId: user.uid,
          text: commentText,
          createdAt: serverTimestamp(),
        }),
      });
    } catch (error) {
      console.error("Error adding comment: ", error);
      alert("Failed to add comment.");
    }
  };

  return (
    <div className="page-container">
      <div className="feed-card">
        <h1>Society Feed</h1>
        <div className="post-creator">
          <FaUserCircle size={40} className="post-user-icon" />
          <form onSubmit={handlePostSubmit} className="post-form">
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="What's on your mind?"
              rows="3"
            ></textarea>
            
            {filePreview && (
              <div className="file-preview-container">
                {selectedFile.type.startsWith('image/') ? (
                  <img src={filePreview} alt="File preview" className="file-preview-image" />
                ) : (
                  <div className="file-preview-document">
                    <FaFileAlt size={40} />
                    <span>{selectedFile.name}</span>
                  </div>
                )}
              </div>
            )}
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            
            <div className="post-actions">
              <div className="post-media-buttons">
                <button type="button" className="media-btn" onClick={handleMediaButtonClick}>
                  <FaImage size={20} />
                </button>
                <button type="button" className="media-btn" onClick={handleMediaButtonClick}>
                  <FaFileAlt size={20} />
                </button>
              </div>
              <button type="submit" className="post-btn" disabled={isPosting}>
                {isPosting ? 'Posting...' : <FaPaperPlane size={20} />}
              </button>
            </div>
          </form>
        </div>

        {feedItems.length > 0 ? (
          <div className="feed-list">
            {feedItems.map(item => (
              <div key={item.id} className="feed-item">
                <div className="feed-item-header">
                  <FaUserCircle size={30} className="feed-user-icon" />
                  <div className="feed-item-info">
                    <strong>{item.username}</strong>
                    <span className="feed-timestamp">{item.createdAt?.toDate()?.toLocaleString() || 'Just now'}</span>
                  </div>
                </div>
                {item.message && <p className="feed-message">{item.message}</p>}
                
                {item.fileUrl && item.fileType.startsWith('image/') && (
                  <img src={item.fileUrl} alt="Post media" className="feed-media-image" />
                )}
                {item.fileUrl && !item.fileType.startsWith('image/') && (
                  <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="feed-media-document">
                    <FaFileAlt size={30} />
                    <span>{item.fileUrl.split('/').pop().split('?')[0]}</span>
                  </a>
                )}

                <div className="feed-item-actions">
                  <button onClick={() => handleLike(item.id, item.likes)}>
                    <FaThumbsUp /> {item.likes?.length || 0}
                  </button>
                  <button onClick={() => handleComment(item.id)}>
                    <FaComment /> {item.comments?.length || 0}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-posts">No posts in the society feed yet. Be the first to post!</p>
        )}
      </div>
    </div>
  );
};

export default SocietyFeed;