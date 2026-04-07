// Components/PostCard/PostCard.jsx
// Компонент одного поста. Используется в ленте и на странице профиля.
// Поддерживает вложения через PostAttachments (изображения, видео, аудио, документы).

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/timeFormatter';
import PostModal from '../PostModal/PostModal';
import PostAttachments from '../PostAttachments/PostAttachments';
import './PostCard.scss';

const CONTENT_TRUNCATE = 300;

function PostCard({ post, onLike, onDelete, cssVars }) {
  const articleRef = useRef(null);

  const [imgError,         setImgError]         = useState(false);
  const [postModalOpen,    setPostModalOpen]    = useState(false);
  const [contentExpanded,  setContentExpanded]  = useState(false);
  // Локальный счётчик комментариев — обновляется при inline-отправке
  const [localCount,       setLocalCount]       = useState(post.commentsCount ?? 0);

  const { user, token } = useAuth();

  const isOwner = user && post.author && user.id === post.author.id;
  const timeText = timeAgo(post.createdAt * 1000);

  const content    = post.content || '';
  const isTrunc    = content.length > CONTENT_TRUNCATE;
  const displayContent = isTrunc && !contentExpanded
    ? content.slice(0, CONTENT_TRUNCATE) + '…'
    : content;

  const handleLike = () => {
    if (!user) return;
    onLike(post.id);
  };

  const handleDelete = () => {
    if (!window.confirm('Удалить пост?')) return;
    onDelete(post.id);
  };

  const handleCommentAdded = () => {
    setLocalCount(prev => prev + 1);
  };

  // Клик по тексту: если обрезан — раскрыть; если уже раскрыт — открыть PostModal
  const handleTextClick = () => {
    if (isTrunc && !contentExpanded) {
      setContentExpanded(true);
    } else {
      setPostModalOpen(true);
    }
  };

  // Свернуть текст и прокрутить к началу поста
  const handleCollapse = (e) => {
    e.stopPropagation();
    setContentExpanded(false);
    articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Определяем, есть ли вложения (новый формат) или только imageUrl (legacy)
  const hasNewAttachments = post.attachments && post.attachments.length > 0;
  const hasLegacyImage    = !hasNewAttachments && post.imageUrl;

  return (
    <article className="post-card" ref={articleRef}>
      <div className="post-card__header">
        <Link to={`/player/${post.author?.username}`} className="post-card__author">
          <div className="post-card__avatar">
            {post.author?.avatarUrl && !imgError ? (
              <img
                src={post.author.avatarUrl}
                alt={post.author.username}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="post-card__avatar-placeholder">
                {(post.author?.username?.[0] || '?').toUpperCase()}
              </div>
            )}
          </div>
          <div className="post-card__author-info">
            <span className="post-card__author-name">{post.author?.username || 'Неизвестный'}</span>
            <span className="post-card__time" title={new Date(post.createdAt * 1000).toLocaleString()}>
              {timeText}
            </span>
          </div>
        </Link>

        {isOwner && (
          <button className="post-card__delete" onClick={handleDelete} title="Удалить пост">
            ✕
          </button>
        )}
      </div>

      {/* Новые вложения (post_attachments) — изображения, видео, аудио, документы */}
      {hasNewAttachments && (
        <div className="post-card__attachments">
          <PostAttachments
            attachments={post.attachments}
            cssVars={cssVars}
            compact={true}
          />
        </div>
      )}

      {/* Legacy: одиночный imageUrl (посты до миграции, если что-то проскочило) */}
      {hasLegacyImage && (
        <LegacyImageAttachment imageUrl={post.imageUrl} />
      )}

      {/* Текст поста — клик раскрывает / открывает PostModal */}
      {content && (
        <div className="post-card__content-wrap">
          <p
            className="post-card__content post-card__content--clickable"
            onClick={handleTextClick}
            title={isTrunc && !contentExpanded ? 'Нажмите, чтобы раскрыть' : 'Открыть пост'}
          >
            {displayContent}
          </p>
          {isTrunc && contentExpanded && (
            <button className="post-card__collapse" onClick={handleCollapse}>
              Свернуть ↑
            </button>
          )}
        </div>
      )}

      {/* Нижняя панель: лайки + кнопка обсуждения */}
      <div className="post-card__footer">
        <button
          className={`post-card__like ${post.liked ? 'post-card__like--active' : ''} ${!user ? 'post-card__like--disabled' : ''}`}
          onClick={handleLike}
          title={user ? (post.liked ? 'Убрать лайк' : 'Поставить лайк') : 'Войдите, чтобы поставить лайк'}
        >
          <span className="post-card__like-icon">{post.liked ? '❤️' : '🤍'}</span>
          <span className="post-card__like-count">{post.likesCount}</span>
        </button>

        <button
          className="post-card__comments-btn"
          onClick={() => setPostModalOpen(true)}
          title="Открыть обсуждение"
        >
          <span className="post-card__comments-icon">💬</span>
          <span className="post-card__comments-count">{localCount}</span>
        </button>
      </div>

      {/* Превью последнего комментария */}
      {post.lastComment && (
        <div
          className="post-card__last-comment"
          onClick={() => setPostModalOpen(true)}
          title="Показать все комментарии"
        >
          <LastCommentPreview comment={post.lastComment} />
          <div className="post-card__last-comment-footer">
            <span className="post-card__last-comment-more">
              Показать все комментарии{localCount > 1 ? ` (${localCount})` : ''}
            </span>
            <span className="post-card__last-comment-arrow">→</span>
          </div>
        </div>
      )}

      {/* Инлайн-форма комментария */}
      <InlineCommentForm
        postId={post.id}
        user={user}
        token={token}
        onCommentAdded={handleCommentAdded}
        onOpenModal={() => setPostModalOpen(true)}
      />

      {/* Модальное окно поста */}
      {postModalOpen && (
        <PostModal
          post={{ ...post, commentsCount: localCount }}
          onClose={() => setPostModalOpen(false)}
          onLike={onLike}
          onDelete={onDelete}
          onCommentAdded={handleCommentAdded}
          cssVars={cssVars}
        />
      )}
    </article>
  );
}


// ---------------------------------------------------------------------------
// LegacyImageAttachment — отображение старого формата (одно изображение/файл)
// Используется только для постов, созданных до миграции и не попавших в post_attachments.
// ---------------------------------------------------------------------------
function LegacyImageAttachment({ imageUrl }) {
  const [imgViewerOpen, setImgViewerOpen] = useState(false);

  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?|$)/i.test(imageUrl);

  if (isImage) {
    return (
      <>
        <div className="post-card__image" onClick={() => setImgViewerOpen(true)}>
          <img
            src={imageUrl}
            alt="Изображение к посту"
            loading="lazy"
            onError={(e) => { e.target.parentElement.style.display = 'none'; }}
          />
        </div>
        {imgViewerOpen && (
          <FullscreenImage src={imageUrl} onClose={() => setImgViewerOpen(false)} />
        )}
      </>
    );
  }

  const ext = (imageUrl || '').split('?')[0].split('.').pop()?.toLowerCase() || '';
  const mimeMap = {
    pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg',
    zip: 'application/zip', doc: 'application/msword', txt: 'text/plain',
  };
  const fileType = mimeMap[ext] || 'application/octet-stream';
  const fileName = imageUrl.split('/').pop()?.replace(/^\d+_/, '') || 'файл';

  return (
    <a
      className="post-card__file-attachment"
      href={imageUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="post-card__file-name">{fileName}</span>
      <span className="post-card__file-dl">↓</span>
    </a>
  );
}


// ---------------------------------------------------------------------------
// FullscreenImage — просмотр картинки на весь экран
// ---------------------------------------------------------------------------
function FullscreenImage({ src, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div className="fullscreen-image" onClick={onClose}>
      <button className="fullscreen-image__close" onClick={onClose} aria-label="Закрыть">✕</button>
      <img
        className="fullscreen-image__img"
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}


// ---------------------------------------------------------------------------
// InlineCommentForm — маленькая форма комментария прямо под постом
// ---------------------------------------------------------------------------
function InlineCommentForm({ postId, user, token, onCommentAdded, onOpenModal }) {
  const [text,        setText]        = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || !user || submitting) return;

    setSubmitting(true);
    try {
      await axios.post(
        `/api/posts/${postId}/comments`,
        { content: text.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setText('');
      onCommentAdded();
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
    } catch (err) {
      console.error('Ошибка отправки комментария:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="post-card__inline-comment">
        <Link to="/auth" className="post-card__inline-placeholder">
          Войдите, чтобы оставить комментарий...
        </Link>
      </div>
    );
  }

  return (
    <form className="post-card__inline-comment" onSubmit={handleSubmit}>
      <textarea
        className="post-card__inline-textarea"
        placeholder="Написать комментарий..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={1}
        onFocus={(e) => { e.target.rows = 2; }}
        onBlur={(e) => { if (!text) e.target.rows = 1; }}
      />
      {(text.trim() || submitted) && (
        <div className="post-card__inline-actions">
          {submitted ? (
            <span className="post-card__inline-success">Отправлено ✓</span>
          ) : (
            <>
              <button
                type="button"
                className="post-card__inline-cancel"
                onClick={() => setText('')}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="post-card__inline-submit"
                disabled={submitting || !text.trim()}
              >
                {submitting ? '...' : 'Отправить'}
              </button>
            </>
          )}
        </div>
      )}
    </form>
  );
}


// ---------------------------------------------------------------------------
// LastCommentPreview — превью последнего комментария
// ---------------------------------------------------------------------------
function LastCommentPreview({ comment }) {
  const [avatarErr, setAvatarErr] = useState(false);
  const text = comment.content || '';

  return (
    <div className="post-card__last-comment-inner">
      <Link
        to={`/player/${comment.author?.username}`}
        className="post-card__last-comment-avatar-link"
        onClick={(e) => e.stopPropagation()}
        title={comment.author?.username}
      >
        {comment.author?.avatarUrl && !avatarErr ? (
          <img
            className="post-card__last-comment-avatar"
            src={comment.author.avatarUrl}
            alt={comment.author.username}
            onError={() => setAvatarErr(true)}
          />
        ) : (
          <div className="post-card__last-comment-avatar-placeholder">
            {(comment.author?.username?.[0] || '?').toUpperCase()}
          </div>
        )}
      </Link>

      <div className="post-card__last-comment-body">
        <div className="post-card__last-comment-meta">
          <Link
            to={`/player/${comment.author?.username}`}
            className="post-card__last-comment-author"
            onClick={(e) => e.stopPropagation()}
          >
            {comment.author?.username}
          </Link>
          {text && (
            <span className="post-card__last-comment-text">
              {text.length > 100 ? text.slice(0, 100) + '…' : text}
            </span>
          )}
        </div>

        {comment.imageUrl && (
          <div className="post-card__last-comment-img-wrap">
            <img
              className="post-card__last-comment-img"
              src={comment.imageUrl}
              alt="фото в комментарии"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default PostCard;
