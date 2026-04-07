// Components/ImageModal/ImageModal.jsx
// Модальное окно для просмотра фото и видео в полном размере.
//
// Props:
//   images        — массив медиа-объектов (imageUrl/fileUrl, fileType, isVideo, ...)
//   initialIndex  — начальный индекс
//   onClose       — callback закрытия
//   commentType   — тип комментариев: 'image' | 'post' (по умолчанию 'image')
//   commentId     — ID объекта для комментариев (по умолчанию — id текущего фото)
//   cssVars       — CSS-переменные профиля (передаются на корневой элемент)

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { timeAgo } from '../../utils/timeFormatter';
import CommentSection from '../CommentSection/CommentSection';
import './ImageModal.scss';

function ImageModal({ images, initialIndex = 0, onClose, commentType, commentId, cssVars }) {
  const [currentIndex,   setCurrentIndex]   = useState(initialIndex);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const current = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) setCurrentIndex(i => i - 1);
  }, [hasPrev]);

  const goNext = useCallback(() => {
    if (hasNext) setCurrentIndex(i => i + 1);
  }, [hasNext]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!current) return null;

  const avatarUrl = current.author?.minecraftUuid
    ? `https://crafatar.icehost.xyz/avatars/${current.author.minecraftUuid}?size=40&overlay`
    : null;

  const resolvedCommentType = commentType || 'image';
  const resolvedCommentId   = commentId   || current.id;

  // URL медиафайла — поддерживаем оба поля
  const mediaUrl  = current.imageUrl || current.fileUrl;
  const isVideo   = current.isVideo || current.fileType?.startsWith('video/');

  return createPortal(
    <div className="image-modal" style={cssVars} onClick={onClose}>

      {/* Стрелки навигации */}
      {hasPrev && (
        <button
          className="image-modal__arrow image-modal__arrow--prev"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          aria-label="Предыдущее"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          className={`image-modal__arrow image-modal__arrow--next ${!sidebarVisible ? 'image-modal__arrow--next-full' : ''}`}
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          aria-label="Следующее"
        >
          ›
        </button>
      )}

      {/* Кнопки управления */}
      <div className="image-modal__controls" onClick={(e) => e.stopPropagation()}>
        <button
          className="image-modal__toggle-sidebar"
          onClick={() => setSidebarVisible(v => !v)}
          title={sidebarVisible ? 'Скрыть комментарии' : 'Показать комментарии'}
        >
          {sidebarVisible ? '▶' : '◀'}
        </button>
        <button
          className="image-modal__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>

      {/* Двухколоночный контент */}
      <div
        className={`image-modal__layout ${!sidebarVisible ? 'image-modal__layout--no-sidebar' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Левая колонка — медиа */}
        <div className="image-modal__image-side">
          {isVideo ? (
            <video
              key={mediaUrl}
              src={mediaUrl}
              controls
              autoPlay
              playsInline
              className="image-modal__video"
              style={{ colorScheme: 'dark' }}
            />
          ) : (
            <img
              src={mediaUrl}
              alt={current.title || 'Фото'}
              className="image-modal__image"
            />
          )}

          {images.length > 1 && (
            <span className="image-modal__counter">
              {currentIndex + 1} / {images.length}
            </span>
          )}
        </div>

        {/* Правая колонка — боковая панель */}
        {sidebarVisible && (
          <div className="image-modal__sidebar">

            <div className="image-modal__author-block">
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt={current.author?.username}
                  className="image-modal__author-avatar"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div className="image-modal__author-info">
                <Link
                  to={`/player/${current.author?.username}`}
                  className="image-modal__author-name"
                  onClick={onClose}
                >
                  {current.author?.username}
                </Link>
                <span className="image-modal__date">
                  {timeAgo(current.createdAt * 1000)}
                </span>
              </div>
            </div>

            {current.title && (
              <p className="image-modal__title">{current.title}</p>
            )}

            <div className="image-modal__comments-scroll">
              <h4 className="image-modal__comments-heading">Комментарии</h4>
              <CommentSection
                key={`${resolvedCommentType}-${resolvedCommentId}`}
                type={resolvedCommentType}
                id={resolvedCommentId}
                autoLoad={true}
                stickyForm={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default ImageModal;
