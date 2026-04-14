// pages/PostPage/PostPage.jsx
// Страница прямой ссылки на пост: /post/:id
// Загружает один пост и сразу открывает его в PostModal.

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import PostCard from '../../Components/PostCard/PostCard';
import './PostPage.scss';

export default function PostPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate  = useNavigate();

  const [post,    setPost]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    axios.get(`/api/posts/${id}`, { headers })
      .then(r => { setPost(r.data); setLoading(false); })
      .catch(e => {
        setError(e.response?.status === 404 ? 'Пост не найден' : 'Ошибка загрузки');
        setLoading(false);
      });
  }, [id, token]);

  // toggleLike вызывается с postId — делаем API-запрос сами
  const handleLike = async (postId) => {
    if (!token) return;
    try {
      const r = await axios.post(`/api/posts/${postId}/like`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPost(p => p ? { ...p, liked: r.data.liked, likesCount: r.data.likesCount } : p);
    } catch { /* noop */ }
  };
  const handleDelete  = () => navigate('/feed');
  const handleEdit = async (postId, content, attachments) => {
    if (!token) return;
    try {
      await axios.put(`/api/posts/${postId}`, { content, attachments }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const r = await axios.get(`/api/posts/${postId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPost(r.data);
      return r.data;
    } catch { /* noop */ }
  };
  const handleComment = () => setPost(p => p ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p);

  return (
    <main className="post-page">
      <div className="post-page__back">
        <Link to="/feed" className="post-page__back-link">← Лента</Link>
      </div>

      {loading && (
        <div className="post-page__loading">Загрузка поста...</div>
      )}

      {error && (
        <div className="post-page__error">{error}</div>
      )}

      {post && !loading && (
        <div className="post-page__container">
          <PostCard
            post={post}
            onLike={handleLike}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onCommentAdded={handleComment}
            autoOpenModal
          />
        </div>
      )}
    </main>
  );
}
