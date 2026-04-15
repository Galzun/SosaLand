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
import PostForm from '../PostForm/PostForm';
import PostAttachments from '../PostAttachments/PostAttachments';
import PollViewer from '../PollViewer/PollViewer';
import { showConfirm } from '../Dialog/dialogManager';
import './PostCard.scss';

const CONTENT_TRUNCATE = 300;

// Безопасно рендерит HTML-контент поста:
// допускает только <a>, <br>, блочные теги (→ <br>); остальное — текст.
// Также автоматически определяет URL в обычном тексте.
const URL_SPLIT_REGEX = /(https?:\/\/[^\s<>"']+)/g;

function processTextNode(text, prefix) {
  return text.split(URL_SPLIT_REGEX).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={`${prefix}-u${i}`} href={part} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{part}</a>
      : part
  );
}

function renderPostHtml(html, onLinkClick) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let key = 0;

  function walk(node) {
    if (node.nodeType === 3) { // TEXT_NODE
      return processTextNode(node.textContent, key++);
    }
    if (node.nodeType !== 1) return []; // не ELEMENT_NODE — пропускаем

    switch (node.tagName) {
      case 'A': {
        const href = node.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href)) {
          return [<a key={key++} href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{node.textContent}</a>];
        }
        return [node.textContent];
      }
      case 'BR':
        return [<br key={key++} />];
      case 'DIV':
      case 'P': {
        const children = Array.from(node.childNodes).flatMap(walk);
        return [...children, <br key={key++} />];
      }
      default:
        return Array.from(node.childNodes).flatMap(walk);
    }
  }

  return Array.from(doc.body.childNodes).flatMap(walk);
}

function PostCard({ post, onLike, onDelete, onEdit, onCommentAdded, cssVars, autoOpenModal }) {
  const articleRef = useRef(null);

  const [imgError,         setImgError]         = useState(false);
  const [postModalOpen,    setPostModalOpen]    = useState(!!autoOpenModal);
  const [editModalOpen,    setEditModalOpen]    = useState(false);
  const [contentExpanded,  setContentExpanded]  = useState(false);
  // Локальный счётчик комментариев — обновляется при inline-отправке
  const [localCount,       setLocalCount]       = useState(post.commentsCount ?? 0);

  const { user, token } = useAuth();

  const isOwner   = user && post.author && user.id === post.author.id;
  const isAdmin   = user && ['admin', 'creator'].includes(user.role);
  const timeText = timeAgo(post.createdAt * 1000);

  const content    = post.content || '';
  // Для обрезания считаем длину по textContent (без HTML-тегов)
  const contentText = (() => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    return doc.body.textContent || '';
  })();
  const isTrunc    = contentText.length > CONTENT_TRUNCATE;
  // В свёрнутом виде — обрезанный plain text; в раскрытом — полный HTML
  const displayContent = isTrunc && !contentExpanded
    ? contentText.slice(0, CONTENT_TRUNCATE) + '…'
    : content;

  const handleLike = () => {
    if (!user) return;
    onLike(post.id);
  };

  const handleDelete = async () => {
    if (!(await showConfirm('Удалить пост?'))) return;
    onDelete(post.id);
  };

  const handleCommentAdded = () => {
    setLocalCount(prev => prev + 1);
    onCommentAdded?.();
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

        <div className="post-card__header-actions">
          <button
            className="post-card__share"
            onClick={() => {
              const url = `${window.location.origin}/post/${post.id}`;
              navigator.clipboard?.writeText(url);
            }}
            title="Скопировать ссылку на пост"
          >
            🔗
          </button>
          {(isOwner || isAdmin) && (
            <>
              {isOwner && onEdit && (
                <button className="post-card__edit" onClick={() => setEditModalOpen(true)} title="Редактировать пост">
                  ✏️
                </button>
              )}
              <button className="post-card__delete" onClick={handleDelete} title="Удалить пост">
                🗑
              </button>
            </>
          )}
        </div>
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

      {/* Опрос прикреплённый к посту */}
      {post.pollId && (
        <div className="post-card__poll">
          <PollViewer pollId={post.pollId} cssVars={cssVars} />
        </div>
      )}

      {/* Текст поста — клик раскрывает / открывает PostModal */}
      {content && (
        <div className="post-card__content-wrap">
          <p
            className="post-card__content post-card__content--clickable"
            onClick={handleTextClick}
            title={isTrunc && !contentExpanded ? 'Нажмите, чтобы раскрыть' : 'Открыть пост'}
          >
            {renderPostHtml(displayContent)}
          </p>
          {isTrunc && contentExpanded && (
            <button className="post-card__collapse" onClick={handleCollapse}>
              Свернуть ↑
            </button>
          )}
        </div>
      )}

      {/* Метка «Изменено» — если пост редактировался */}
      {post.editCount > 0 && (
        <div className="post-card__edited">
          Изменено {post.editCount} {pluralRaz(post.editCount)} · {timeAgo(post.updatedAt * 1000)}
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
          onEdit={isOwner && onEdit ? (updatedPost) => {
            onEdit(post.id, updatedPost.content, updatedPost.attachments);
          } : undefined}
          onCommentAdded={handleCommentAdded}
          cssVars={cssVars}
        />
      )}

      {/* Модальное окно редактирования поста */}
      {editModalOpen && createPortal(
        <EditPostModal
          post={post}
          onEdit={onEdit}
          onClose={() => setEditModalOpen(false)}
          cssVars={cssVars}
        />,
        document.body
      )}
    </article>
  );
}


// ---------------------------------------------------------------------------
// pluralRaz — склонение слова «раз» по числу
// ---------------------------------------------------------------------------
function pluralRaz(n) {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'раз';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'раза';
  return 'раз';
}


// ---------------------------------------------------------------------------
// EditPostModal — модальное окно редактирования поста
// ---------------------------------------------------------------------------
function EditPostModal({ post, onEdit, onClose, cssVars }) {
  const [saving, setSaving] = useState(false);

  // Блокируем скролл страницы
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Закрытие по Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async (content, attachments) => {
    setSaving(true);
    try {
      const updated = await onEdit(post.id, content, attachments);
      onClose();
      return updated;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="post-card__edit-modal-overlay"
      style={cssVars}
    >
      <div className="post-card__edit-modal">
        <p className="post-card__edit-modal__title">✏️ Редактировать пост</p>
        <PostForm
          initialPost={post}
          onSubmit={handleSave}
          onCancel={onClose}
        />
      </div>
    </div>
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
