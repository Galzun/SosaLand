// Components/ProfileComments/ProfileComments.jsx
// Компонент комментариев к профилю игрока (Steam-стиль).
//
// Показывает последние 3 комментария + форму добавления.
// Кнопка «Показать все» открывает ProfileCommentsModal.
//
// Props:
//   userId   — ID пользователя (из profile.id)
//   username — ник (для модального заголовка)

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/timeFormatter';
import ProfileCommentsModal from './ProfileCommentsModal';
import axios from 'axios';
import { showConfirm, showAlert } from '../Dialog/dialogManager';
import { renderWithMentions } from '../CommentSection/CommentSection';
import { getAvatarUrl } from '../../utils/avatarUrl';
import './ProfileComments.scss';

const PREVIEW_LIMIT = 3;

function ProfileComments({ userId, username }) {
  const { user, token } = useAuth();

  // Последние 3 комментария для превью
  const [comments,    setComments]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [totalHint,   setTotalHint]   = useState(null); // null — неизвестно
  const [modalOpen,   setModalOpen]   = useState(false);

  // Форма нового комментария
  const [text,        setText]        = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);

  // Загружаем последние 3 комментария + пробуем узнать, есть ли ещё
  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Запрашиваем на 1 больше, чтобы понять, есть ли «Показать все»
      const { data } = await axios.get(`/api/users/${userId}/profile-comments`, {
        params: { limit: PREVIEW_LIMIT + 1, offset: 0 },
      });
      setTotalHint(data.length > PREVIEW_LIMIT ? 'more' : 'exact');
      setComments(data.slice(0, PREVIEW_LIMIT));
    } catch (err) {
      console.error('Ошибка загрузки комментариев к профилю:', err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: newComment } = await axios.post(
        `/api/users/${userId}/profile-comments`,
        { content: text.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Вставляем новый комментарий в начало превью и обрезаем до 3
      setComments(prev => [newComment, ...prev].slice(0, PREVIEW_LIMIT));
      setTotalHint('more'); // точно есть ещё (или только что стало)
      setText('');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при отправке');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!(await showConfirm('Удалить комментарий?'))) return;
    try {
      await axios.delete(`/api/comments/${commentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка при удалении');
    }
  };

  return (
    <section className="profile-comments">
      {/* Заголовок секции */}
      <div className="profile-comments__header">
        <h3 className="profile-comments__title">Комментарии</h3>
        {totalHint === 'more' && (
          <button
            className="profile-comments__view-all"
            onClick={() => setModalOpen(true)}
          >
            Показать все
          </button>
        )}
      </div>

      {/* Список последних комментариев */}
      <div className="profile-comments__list">
        {loading && (
          <p className="profile-comments__loading">Загрузка...</p>
        )}

        {!loading && comments.length === 0 && (
          <p className="profile-comments__empty">Комментариев пока нет</p>
        )}

        {comments.map(comment => (
          <ProfileCommentItem
            key={comment.id}
            comment={comment}
            currentUser={user}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Форма добавления комментария (только для авторизованных) */}
      {user ? (
        <form className="profile-comments__form" onSubmit={handleSubmit}>
          <textarea
            className="profile-comments__textarea"
            placeholder="Оставить комментарий..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={2}
          />
          <button
            type="submit"
            className="profile-comments__submit"
            disabled={submitting || !text.trim()}
          >
            {submitting ? '...' : 'Отправить'}
          </button>
          {error && <p className="profile-comments__error">{error}</p>}
        </form>
      ) : (
        <p className="profile-comments__login-hint">
          <Link to="/auth">Войдите</Link>, чтобы оставить комментарий
        </p>
      )}

      {/* Модальное окно со всеми комментариями */}
      {modalOpen && (
        <ProfileCommentsModal
          userId={userId}
          username={username}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}


// ---------------------------------------------------------------------------
// ProfileCommentItem — один комментарий в превью.
// ---------------------------------------------------------------------------
function ProfileCommentItem({ comment, currentUser, onDelete }) {

  const isOwner = currentUser && currentUser.id === comment.author.id;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'creator';

  return (
    <div className="profile-comments__item">
      <Link to={`/player/${comment.author.minecraftName || comment.author.username}`} className="profile-comments__avatar-link">
        <img
          className="profile-comments__avatar"
          src={comment.author.avatarUrl || getAvatarUrl(comment.author.minecraftName || comment.author.username, null)}
          alt={comment.author.minecraftName || comment.author.username}
          onError={(e) => { e.target.onerror = null; e.target.src = getAvatarUrl(comment.author.minecraftName || comment.author.username, null); }}
        />
      </Link>

      <div className="profile-comments__item-content">
        <div className="profile-comments__item-meta">
          <Link
            to={`/player/${comment.author.minecraftName || comment.author.username}`}
            className="profile-comments__item-author"
          >
            {comment.author.minecraftName || comment.author.username}
          </Link>
          <span
            className="profile-comments__item-date"
            title={new Date(comment.createdAt * 1000).toLocaleString()}
          >
            {timeAgo(comment.createdAt * 1000)}
          </span>
          {(isOwner || isAdmin) && (
            <button
              className="profile-comments__item-delete"
              onClick={() => onDelete(comment.id)}
              title="Удалить"
            >
              ✕
            </button>
          )}
        </div>
        <p className="profile-comments__item-text">{renderWithMentions(comment.content)}</p>
      </div>
    </div>
  );
}

export default ProfileComments;
