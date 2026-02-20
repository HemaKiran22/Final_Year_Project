import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from '../firebase';
import { FaUserCircle, FaImage, FaFileAlt, FaThumbsUp, FaComment, FaPaperPlane, FaHeart, FaShare, FaTimes, FaGlobeAmericas } from 'react-icons/fa';
import './SocietyFeed.css';
import notify from '../utils/notify';

const SocietyFeed = () => {
  const [feedItems, setFeedItems] = useState([]);
  const [postText, setPostText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = useRef(null);
  const auth = getAuth();
  const user = auth.currentUser;

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
      let fileType = '';
      
      if (selectedFile) {
        try {
          const fileRef = ref(storage, `feed-media/${user.uid}/${Date.now()}-${selectedFile.name}`);
          await uploadBytes(fileRef, selectedFile);
          fileUrl = await getDownloadURL(fileRef);
          fileType = selectedFile.type;
        } catch (fileError) {
          console.error("File upload error:", fileError);
          notify.warn('Failed to upload file. Posting without media.');
        }
      }

      await addDoc(collection(db, 'feed'), {
        username: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        userId: user.uid,
        message: postText.trim(),
        likes: [],
        comments: [],
        fileUrl: fileUrl,
        fileType: fileType,
        createdAt: new Date(),
      });
      
      setPostText('');
      setSelectedFile(null);
      setFilePreview(null);
      setIsPosting(false);
    } catch (error) {
      console.error("Error adding post: ", error);
      console.error("Error details:", error.message, error.code);
      notify.error(`Failed to post: ${error.message || 'Please try again.'}`);
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
          username: user.displayName || user.email?.split('@')[0] || 'Anonymous',
          userId: user.uid,
          text: commentText.trim(),
          createdAt: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("Error adding comment: ", error);
      notify.error(`Failed to add comment: ${error.message || 'Please try again.'}`);
    }
  };

  return (
    <div className="page-container">
      <div className="feed-container-modern">
        {/* Header */}
        <div className="feed-header-modern">
          <div className="header-icon-circle">
            <FaGlobeAmericas />
          </div>
          <div className="header-content">
            <h1 className="feed-title">Society Feed</h1>
            <p className="feed-subtitle">Share updates, connect with your community</p>
          </div>
        </div>

        {/* Post Creator Card */}
        <div className="post-creator-modern">
          <div className="creator-header">
            <div className="user-avatar-creator">
              {(user?.displayName || user?.email?.split('@')[0] || 'U')?.charAt(0).toUpperCase()}
            </div>
            <div className="creator-info">
              <strong>{user?.displayName || user?.email?.split('@')[0] || 'User'}</strong>
              <span className="creator-badge">Community Member</span>
            </div>
          </div>
          <form onSubmit={handlePostSubmit} className="post-form-modern">
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="Share something with your community..."
              rows="3"
              className="modern-textarea"
            ></textarea>
            
            {filePreview && (
              <div className="file-preview-modern">
                <button 
                  type="button" 
                  className="remove-preview-btn"
                  onClick={() => {
                    setSelectedFile(null);
                    setFilePreview(null);
                  }}
                >
                  <FaTimes />
                </button>
                {selectedFile.type.startsWith('image/') ? (
                  <img src={filePreview} alt="File preview" className="preview-image-modern" />
                ) : (
                  <div className="preview-document-modern">
                    <FaFileAlt size={48} />
                    <span className="file-name">{selectedFile.name}</span>
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
            
            <div className="post-actions-modern">
              <div className="media-buttons-modern">
                <button 
                  type="button" 
                  className="media-btn-modern image" 
                  onClick={handleMediaButtonClick}
                  title="Add Image"
                >
                  <FaImage />
                  <span>Photo</span>
                </button>
                <button 
                  type="button" 
                  className="media-btn-modern file" 
                  onClick={handleMediaButtonClick}
                  title="Add File"
                >
                  <FaFileAlt />
                  <span>File</span>
                </button>
              </div>
              <button 
                type="submit" 
                className="post-btn-modern" 
                disabled={isPosting || (!postText.trim() && !selectedFile)}
              >
                {isPosting ? (
                  <>
                    <span className="spinner"></span>
                    Posting...
                  </>
                ) : (
                  <>
                    <FaPaperPlane />
                    Post
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Feed Items */}
        {feedItems.length > 0 ? (
          <div className="feed-list-modern">
            {feedItems.map((item, index) => (
              <div 
                key={item.id} 
                className="feed-item-modern"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="feed-item-header-modern">
                  <div className="post-user-avatar">
                    {(item.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="post-user-info">
                    <strong className="post-username">{item.username}</strong>
                    <span className="post-timestamp">
                      {item.createdAt?.toDate()?.toLocaleString() || 'Just now'}
                    </span>
                  </div>
                </div>

                {item.message && (
                  <p className="feed-message-modern">{item.message}</p>
                )}
                
                {item.fileUrl && item.fileType.startsWith('image/') && (
                  <div className="feed-media-container">
                    <img src={item.fileUrl} alt="Post media" className="feed-image-modern" />
                  </div>
                )}
                {item.fileUrl && !item.fileType.startsWith('image/') && (
                  <a 
                    href={item.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="feed-document-modern"
                  >
                    <div className="document-icon-wrapper">
                      <FaFileAlt />
                    </div>
                    <div className="document-info">
                      <span className="document-name">
                        {item.fileUrl.split('/').pop().split('?')[0].substring(0, 30)}...
                      </span>
                      <span className="document-label">View Document</span>
                    </div>
                  </a>
                )}

                <div className="feed-actions-modern">
                  <button 
                    className={`action-btn-modern like ${item.likes?.includes(user?.uid) ? 'active' : ''}`}
                    onClick={() => handleLike(item.id, item.likes)}
                  >
                    <FaHeart />
                    <span>{item.likes?.length || 0}</span>
                  </button>
                  <button 
                    className="action-btn-modern comment"
                    onClick={() => handleComment(item.id)}
                  >
                    <FaComment />
                    <span>{item.comments?.length || 0}</span>
                  </button>
                  <button className="action-btn-modern share">
                    <FaShare />
                    <span>Share</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-feed-state">
            <div className="empty-icon">📝</div>
            <h3>No posts yet</h3>
            <p>Be the first to share something with your community!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SocietyFeed;