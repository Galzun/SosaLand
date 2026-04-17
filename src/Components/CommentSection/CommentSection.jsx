// Components/CommentSection/CommentSection.jsx
// Универсальный компонент для отображения и добавления комментариев.
//
// Props:
//   type       — 'post' | 'image' | 'profile'
//   id         — ID объекта
//   autoLoad   — загружать сразу (по умолчанию false)
//   stickyForm — форма прилипает к низу (режим модального окна)

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import { timeAgo } from '../../utils/timeFormatter';
import { getMentionAtCursor } from '../../utils/mentionUtils';
import useComments from '../../hooks/useComments';
import EmojiPicker from '../EmojiPicker/EmojiPicker';
import MentionDropdown from '../MentionDropdown/MentionDropdown';
import { showConfirm } from '../Dialog/dialogManager';
import './CommentSection.scss';

// Парсит текст и превращает @username в ссылки на профили
export function renderWithMentions(text) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (/^@\w+$/.test(part)) {
      const username = part.slice(1);
      return (
        <Link key={i} to={`/player/${username}`} className="comment-section__mention">
          {part}
        </Link>
      );
    }
    return part;
  });
}

const TRUNCATE_LIMIT = 250; // символов до кнопки «Ещё»

// onCommentAdded — вызывается после успешной отправки (для обновления счётчика в родителе)
// paged — режим постраничной навигации (для профиля: max 10 per page)
function CommentSection({ type, id, autoLoad = false, stickyForm = false, stickyBottom = false, onCommentAdded, paged = false }) {
  const { user, token } = useAuth();
  const { allPlayers } = usePlayer();
  const {
    comments,
    loading,
    hasMore,
    loaded,
    page,
    totalPages,
    fetchComments,
    loadMore,
    fetchPage,
    addComment,
    deleteComment,
  } = useComments({ type, id, paged, pageSize: paged ? 10 : undefined });

  const [text,        setText]        = useState('');
  const [imageUrl,    setImageUrl]    = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);
  const [showEmoji,   setShowEmoji]   = useState(false);
  const [mentionState,  setMentionState]  = useState(null); // {query, startIndex} | null
  const [mentionIndex,  setMentionIndex]  = useState(0);
  const fileRef         = useRef(null);
  const emojiWrapRef    = useRef(null);
  const textareaRef     = useRef(null);
  const mentionDropRef  = useRef(null);

  // Список кандидатов для дропдауна
  const mentionSuggestions = mentionState
    ? allPlayers
        .filter(p => p.name.toLowerCase().startsWith(mentionState.query))
        .slice(0, 7)
    : [];

  // Закрываем дропдаун при клике вне
  useEffect(() => {
    if (!mentionState) return;
    const handler = (e) => {
      if (
        mentionDropRef.current && !mentionDropRef.current.contains(e.target) &&
        textareaRef.current && !textareaRef.current.contains(e.target)
      ) {
        setMentionState(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mentionState]);

  const handleTextChange = (e) => {
    const value = e.target.value;
    setText(value);
    const cursor = e.target.selectionStart;
    const mention = getMentionAtCursor(value, cursor);
    setMentionState(mention);
    setMentionIndex(0);
  };

  const handleTextKeyDown = (e) => {
    if (!mentionState || mentionSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMentionUser(mentionSuggestions[mentionIndex].name);
    } else if (e.key === 'Escape') {
      setMentionState(null);
    }
  };

  const insertMentionUser = (username) => {
    const before = text.slice(0, mentionState.startIndex);
    const after  = text.slice(mentionState.startIndex + 1 + mentionState.query.length);
    const newText = before + '@' + username + ' ' + after;
    setText(newText);
    setMentionState(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + username.length + 2;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd   = pos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  // Закрываем emoji-пикер при клике вне него
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e) => {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  useEffect(() => {
    if (autoLoad && id) {
      if (paged) {
        fetchPage(0);
      } else {
        fetchComments(true);
      }
    }
  }, [autoLoad, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Загрузка изображения для комментария
  const handleImagePick = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await axios.post('/api/upload', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setImageUrl(data.url);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка загрузки изображения');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleEmojiSelect = (emoji) => {
    setText(prev => prev + emoji);
    setShowEmoji(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imageUrl) return;
    setSubmitting(true);
    setError(null);
    try {
      await addComment(text.trim(), imageUrl || null);
      setText('');
      setImageUrl('');
      // Уведомляем родителя об успешном добавлении (например, для обновления счётчика)
      onCommentAdded?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при отправке');
    } finally {
      setSubmitting(false);
    }
  };

  const listContent = (
    <>
      {!loaded && !loading && (
        <button
          className="comment-section__toggle"
          onClick={() => paged ? fetchPage(0) : fetchComments(true)}
        >
          Показать комментарии
        </button>
      )}

      {loading && !loaded && (
        <div className="comment-section__loading">Загрузка...</div>
      )}

      {loaded && (
        <>
          {comments.length === 0 && (
            <p className="comment-section__empty">Комментариев пока нет. Будьте первым!</p>
          )}
          {comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onDelete={deleteComment}
              currentUser={user}
            />
          ))}
          {loading && <div className="comment-section__loading">Загрузка...</div>}

          {/* Режим «load more» */}
          {!paged && hasMore && !loading && (
            <button className="comment-section__more" onClick={loadMore}>
              Загрузить ещё
            </button>
          )}

          {/* Режим постраничной навигации */}
          {paged && totalPages > 1 && (
            <div className="comment-section__pagination">
              <button
                className="comment-section__page-btn"
                onClick={() => fetchPage(page - 1)}
                disabled={page === 0 || loading}
              >
                ← Назад
              </button>
              <span className="comment-section__page-info">
                {page + 1} / {totalPages}
              </span>
              <button
                className="comment-section__page-btn"
                onClick={() => fetchPage(page + 1)}
                disabled={page >= totalPages - 1 || loading}
              >
                Далее →
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  const charsLeft = 1000 - text.length;

  const formContent = user ? (
    <form className="comment-section__form" onSubmit={handleSubmit}>
      {/* Textarea + иконки внутри единого визуального блока */}
      <div className="comment-section__input-box">
        {/* Предпросмотр прикреплённого изображения */}
        {imageUrl && (
          <div className="comment-section__img-preview">
            <img src={imageUrl} alt="Прикреплённое фото" />
            <button
              type="button"
              className="comment-section__img-remove"
              onClick={() => setImageUrl('')}
            >
              ✕
            </button>
          </div>
        )}

        <div className="comment-section__textarea-wrap">
          <textarea
            ref={textareaRef}
            className="comment-section__textarea"
            placeholder="Написать комментарий..."
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            onClick={(e) => {
              const mention = getMentionAtCursor(e.target.value, e.target.selectionStart);
              setMentionState(mention);
              setMentionIndex(0);
            }}
            maxLength={1000}
            rows={2}
          />
          <MentionDropdown
            players={mentionSuggestions}
            activeIndex={mentionIndex}
            onSelect={insertMentionUser}
            onHover={setMentionIndex}
            dropRef={mentionDropRef}
          />
        </div>

        {/* Нижняя панель: иконки слева + счётчик/отправить справа */}
        <div className="comment-section__form-footer">
          <div className="comment-section__footer-left">
            <button
              type="button"
              className="comment-section__icon-btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Прикрепить фото"
            >
              {uploading ? '...' : '📎'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              onChange={handleImagePick}
              className="comment-section__file-input"
            />
            <div ref={emojiWrapRef} className="comment-section__emoji-wrap">
              <button
                type="button"
                className="comment-section__icon-btn"
                onClick={() => setShowEmoji(v => !v)}
                title="Смайлики"
              >
                😊
              </button>
              {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} />}
            </div>
          </div>

          <div className="comment-section__footer-right">
            <span className={`comment-section__char-count${charsLeft < 50 ? ' comment-section__char-count--warn' : ''}`}>
              {charsLeft}
            </span>
            <button
              type="submit"
              className="comment-section__submit"
              disabled={submitting || uploading || (!text.trim() && !imageUrl)}
            >
              {submitting ? '...' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>  {/* comment-section__input-box */}

      {error && <p className="comment-section__error">{error}</p>}
    </form>
  ) : (
    <p className="comment-section__login-hint">
      <Link to="/auth">Войдите</Link>, чтобы оставить комментарий
    </p>
  );

  if (stickyBottom) {
    // Режим страницы (document scroll): форма прилипает к низу viewport через position:sticky
    return (
      <div className="comment-section comment-section--sticky-bottom">
        {listContent}
        <div className="comment-section__form-sticky">
          {formContent}
        </div>
      </div>
    );
  }

  if (stickyForm) {
    // Режим модального окна: список скроллится, форма прилипает снизу
    return (
      <div className="comment-section comment-section--modal">
        <div className="comment-section__list-wrap">
          {listContent}
        </div>
        <div className="comment-section__form-wrap">
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <div className="comment-section">
      {listContent}
      {formContent}
    </div>
  );
}


// ---------------------------------------------------------------------------
// CommentItem — один комментарий
// ---------------------------------------------------------------------------
const TRUNCATE_LEN = 250;

function CommentItem({ comment, onDelete, currentUser }) {
  const [avatarError, setAvatarError] = useState(false);
  const [expanded,    setExpanded]    = useState(false);

  const isOwner = currentUser && currentUser.id === comment.author.id;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'creator';

  const handleDelete = async () => {
    if (!(await showConfirm('Удалить комментарий?'))) return;
    onDelete(comment.id);
  };

  const text          = comment.content || '';
  const isTruncatable = text.length > TRUNCATE_LEN;
  const displayText   = isTruncatable && !expanded ? text.slice(0, TRUNCATE_LEN) + '…' : text;

  return (
    <div className="comment-section__item">
      <Link to={`/player/${comment.author.username}`} className="comment-section__avatar-link">
        {comment.author.avatarUrl && !avatarError ? (
          <img
            className="comment-section__avatar"
            src={comment.author.avatarUrl}
            alt={comment.author.username}
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div className="comment-section__avatar-placeholder">
            {(comment.author.username?.[0] || '?').toUpperCase()}
          </div>
        )}
      </Link>

      <div className="comment-section__content">
        <div className="comment-section__meta">
          <Link to={`/player/${comment.author.username}`} className="comment-section__author">
            {comment.author.username}
          </Link>
          <span
            className="comment-section__date"
            title={new Date(comment.createdAt * 1000).toLocaleString()}
          >
            {timeAgo(comment.createdAt * 1000)}
          </span>
          {(isOwner || isAdmin) && (
            <button className="comment-section__delete" onClick={handleDelete} title="Удалить">
              🗑
            </button>
          )}
        </div>

        {/* Текст (с обрезкой) */}
        {text.length > 0 && (
          <p className="comment-section__text">
            {renderWithMentions(displayText)}
            {isTruncatable && (
              <button
                className="comment-section__expand"
                onClick={() => setExpanded(v => !v)}
              >
                {expanded ? ' Свернуть' : ' Ещё'}
              </button>
            )}
          </p>
        )}

        {/* Прикреплённое изображение */}
        {comment.imageUrl && (
          <div className="comment-section__comment-img">
            <img
              src={comment.imageUrl}
              alt="Фото в комментарии"
              onClick={() => window.open(comment.imageUrl, '_blank')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default CommentSection;
