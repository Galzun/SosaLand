// Components/PostModal/PostModal.jsx
// Модальное окно для просмотра поста — одна колонка, на всю высоту экрана.
//
// Весь контент течёт в одном скролл-контейнере:
//   автор → вложения → текст → статистика → комментарии → форма (sticky снизу)
//
// Закрытие: клик на оверлей или клавиша Escape (крестика нет).

import { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/timeFormatter';
import CommentSection from '../CommentSection/CommentSection';
import PostAttachments from '../PostAttachments/PostAttachments';
import PostForm from '../PostForm/PostForm';
import PollViewer from '../PollViewer/PollViewer';
import { showConfirm } from '../Dialog/dialogManager';
import './PostModal.scss';

const PM_MIN_WIDTH    = 400;
const PM_MAX_WIDTH    = 1280;
const PM_DEFAULT_WIDTH = 680;
const PM_LS_KEY       = 'sosaland:postModalWidth';

function PostModal({ post, onClose, onLike, onDelete, onEdit, onCommentAdded, cssVars }) {
  const { user } = useAuth();
  const [editMode, setEditMode] = useState(false);

  // ---------------------------------------------------------------------------
  // Resize — левый край модала можно тянуть для изменения ширины
  // ---------------------------------------------------------------------------
  const [modalWidth, setModalWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(PM_LS_KEY);
      if (saved) {
        const n = parseInt(saved, 10);
        if (n >= PM_MIN_WIDTH && n <= PM_MAX_WIDTH) return n;
      }
    } catch { /* noop */ }
    return PM_DEFAULT_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(modalWidth); // актуальная ширина без re-render-задержки

  const handleResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    const startX = e.clientX;
    const startW = widthRef.current;

    const onMove = (e) => {
      // Левый край: влево = расширяем. * 2 т.к. модал центрирован (растёт симметрично)
      const w = Math.max(PM_MIN_WIDTH, Math.min(PM_MAX_WIDTH, startW + (startX - e.clientX) * 2));
      widthRef.current = w;
      setModalWidth(w);
    };

    const onUp = () => {
      setIsDragging(false);
      try { localStorage.setItem(PM_LS_KEY, String(widthRef.current)); } catch { /* noop */ }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Закрытие по Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Блокируем скролл страницы (работает в т.ч. на iOS)
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

  const isOwner = user && post.author && user.id === post.author.id;
  const isAdmin = user?.role === 'admin';
  const timeText = timeAgo(post.createdAt * 1000);
  const avatarUrl = post.author?.avatarUrl;

  const handleLike = () => {
    if (!user) return;
    onLike(post.id);
  };

  const handleDelete = async () => {
    if (!(await showConfirm('Удалить пост?'))) return;
    onDelete(post.id);
    onClose();
  };

  // Определяем источник вложений: новый формат или legacy imageUrl
  const hasNewAttachments = post.attachments && post.attachments.length > 0;

  return createPortal(
    <div className="post-modal" style={cssVars} onClick={onClose}>

      {/* Один скролл-контейнер на всю высоту */}
      <div
        className="post-modal__box"
        style={{ maxWidth: modalWidth }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Автор */}
        <div className="post-modal__author-block">
          <Link
            to={`/player/${post.author?.username}`}
            className="post-modal__author"
            onClick={onClose}
          >
            <div className="post-modal__avatar">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={post.author?.username}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="post-modal__avatar-placeholder">
                  {(post.author?.username?.[0] || '?').toUpperCase()}
                </div>
              )}
            </div>
            <span className="post-modal__author-name">{post.author?.username}</span>
          </Link>

          {(isOwner || isAdmin) && (
            <div className="post-modal__header-actions">
              {isOwner && onEdit && (
                <button
                  className="post-modal__edit"
                  onClick={() => setEditMode(v => !v)}
                  title={editMode ? 'Отменить редактирование' : 'Редактировать пост'}
                >
                  ✏️
                </button>
              )}
              <button className="post-modal__delete" onClick={handleDelete} title="Удалить пост">
                🗑
              </button>
            </div>
          )}
        </div>

        {/* Режим редактирования */}
        {editMode && onEdit && (
          <div className="post-modal__edit-form">
            <PostForm
              initialPost={post}
              onSubmit={async (content, attachments) => {
                const updated = await onEdit(content, attachments);
                setEditMode(false);
                return updated;
              }}
              onCancel={() => setEditMode(false)}
            />
          </div>
        )}

        {/* Новые вложения — изображения, видео, аудио, документы */}
        {!editMode && hasNewAttachments && (
          <div className="post-modal__attachments">
            <PostAttachments
              attachments={post.attachments}
              cssVars={cssVars}
              compact={false}
              disableScrollLock={true}
            />
          </div>
        )}

        {/* Legacy: одиночный imageUrl */}
        {!editMode && !hasNewAttachments && post.imageUrl && (
          <LegacyAttachment imageUrl={post.imageUrl} />
        )}

        {/* Опрос */}
        {!editMode && post.pollId && (
          <div className="post-modal__poll">
            <PollViewer pollId={post.pollId} cssVars={cssVars} />
          </div>
        )}

        {/* Полный текст */}
        {!editMode && post.content && (
          <p className="post-modal__content">{post.content}</p>
        )}

        {/* Статистика */}
        <div className="post-modal__stats">
          <button
            className={`post-modal__like ${post.liked ? 'post-modal__like--active' : ''} ${!user ? 'post-modal__like--disabled' : ''}`}
            onClick={handleLike}
            title={user ? (post.liked ? 'Убрать лайк' : 'Поставить лайк') : 'Войдите, чтобы поставить лайк'}
          >
            <span>{post.liked ? '❤️' : '🤍'}</span>
            <span className="post-modal__like-count">{post.likesCount}</span>
          </button>

          <span className="post-modal__stat-comments">
            💬 {post.commentsCount ?? 0}
          </span>

          <span
            className="post-modal__stat-time"
            title={new Date(post.createdAt * 1000).toLocaleString()}
          >
            {timeText}
          </span>

          {post.editCount > 0 && (
            <span className="post-modal__stat-edited">
              Изменено {post.editCount} {pluralRaz(post.editCount)} · {timeAgo(post.updatedAt * 1000)}
            </span>
          )}
        </div>

        {/* Комментарии */}
        <div className="post-modal__comments-section">
          <h4 className="post-modal__comments-heading">Комментарии</h4>
          <CommentSection
            type="post"
            id={post.id}
            autoLoad={true}
            stickyForm={false}
            onCommentAdded={onCommentAdded}
          />
        </div>

      </div>

      {/* Ручка изменения ширины — снаружи скролл-контейнера, следует за viewport */}
      <div
        className={`post-modal__resize-handle${isDragging ? ' post-modal__resize-handle--active' : ''}`}
        style={{ left: `calc(50% - ${modalWidth / 2}px)` }}
        onMouseDown={handleResizeStart}
        onClick={(e) => e.stopPropagation()}
        title="Потяните, чтобы изменить ширину"
      >
        <span /><span /><span /><span /><span /><span />
      </div>

    </div>,
    document.body
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
// LegacyAttachment — отображение старого формата (posts.image_url)
// Используется только для постов, которые не прошли через миграцию.
// ---------------------------------------------------------------------------
function LegacyAttachment({ imageUrl }) {
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?|$)/i.test(imageUrl);

  if (isImage) {
    return (
      <div className="post-modal__image">
        <img src={imageUrl} alt="Изображение к посту" />
      </div>
    );
  }

  const fileName = imageUrl.split('/').pop()?.replace(/^\d+_/, '') || 'файл';

  return (
    <a
      className="post-modal__file-attachment"
      href={imageUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="post-modal__file-name">{fileName}</span>
      <span className="post-modal__file-dl">↓ Скачать</span>
    </a>
  );
}

export default PostModal;
