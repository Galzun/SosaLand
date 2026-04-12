// Components/MediaModal/MediaModal.jsx
// Модальная галерея для просмотра медиа-вложений поста (изображения и видео).
//
// Props:
//   items             — массив медиа-вложений [{ fileUrl, fileType, fileName }]
//   initialIndex      — начальный индекс (0 по умолчанию)
//   onClose           — колбэк закрытия
//   cssVars           — CSS-переменные профиля (для страниц с кастомизацией)
//   disableScrollLock — если true, не трогаем блокировку скролла body
//                       (нужно когда MediaModal открыт поверх другой модалки, уже заблокировавшей скролл)

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './MediaModal.scss';

// Проверяет, является ли вложение видеофайлом
function isVideoFile(att) {
  return (att?.fileType || '').startsWith('video/');
}

// Очищает имя файла от timestamp-префикса
function displayName(att) {
  if (att?.fileName) return att.fileName.replace(/^\d+_/, '');
  return (att?.fileUrl || '').split('/').pop()?.replace(/^\d+_/, '') || '';
}

function MediaModal({ items, initialIndex = 0, onClose, cssVars, disableScrollLock = false }) {
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, items.length - 1))
  );

  const current = items[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  const goPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex(i => Math.min(items.length - 1, i + 1));
  }, [items.length]);

  // Клавиатурная навигация и (опционально) блокировка скролла
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')   goPrev();
      if (e.key === 'ArrowRight')  goNext();
    };

    document.addEventListener('keydown', handleKey);

    // Блокируем скролл только если нас не просят этого не делать
    let scrollY = 0;
    if (!disableScrollLock) {
      scrollY = window.scrollY;
      document.body.style.position  = 'fixed';
      document.body.style.top       = `-${scrollY}px`;
      document.body.style.left      = '0';
      document.body.style.right     = '0';
      document.body.style.overflow  = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKey);
      if (!disableScrollLock) {
        document.body.style.position  = '';
        document.body.style.top       = '';
        document.body.style.left      = '';
        document.body.style.right     = '';
        document.body.style.overflow  = '';
        window.scrollTo(0, scrollY);
      }
    };
  }, [onClose, goPrev, goNext, disableScrollLock]);

  if (!current) return null;

  return createPortal(
    <div className="media-modal" style={cssVars} onClick={onClose}>

      {/* Верхняя полоса с крестиком */}
      <div className="media-modal__top-bar" onClick={(e) => e.stopPropagation()}>
        <button
          className="media-modal__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>

      {/* Кнопки навигации — иконки по краям, всегда видны */}
      {items.length > 1 && hasPrev && (
        <button
          className="media-modal__nav-btn media-modal__nav-btn--prev"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          aria-label="Предыдущее"
        >
          ‹
        </button>
      )}
      {items.length > 1 && hasNext && (
        <button
          className="media-modal__nav-btn media-modal__nav-btn--next"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          aria-label="Следующее"
        >
          ›
        </button>
      )}

      {/* Основной контент */}
      <div className="media-modal__content" onClick={(e) => e.stopPropagation()}>
        {isVideoFile(current) ? (
          <video
            key={current.fileUrl}
            className="media-modal__video"
            src={current.fileUrl}
            controls
            autoPlay
            playsInline
            style={{ colorScheme: 'dark' }}
            onPlay={(e) => {
              document.querySelectorAll('audio, video').forEach(el => {
                if (el !== e.currentTarget) el.pause();
              });
            }}
          />
        ) : (
          <img
            key={current.fileUrl}
            className="media-modal__image"
            src={current.fileUrl}
            alt={displayName(current)}
            draggable={false}
          />
        )}
      </div>

      {/* Счётчик */}
      {items.length > 1 && (
        <div className="media-modal__footer" onClick={(e) => e.stopPropagation()}>
          <span className="media-modal__counter">
            {currentIndex + 1} / {items.length}
          </span>
        </div>
      )}

      {/* Стрип миниатюр снизу — если несколько элементов */}
      {items.length > 1 && (
        <div className="media-modal__strip" onClick={(e) => e.stopPropagation()}>
          {items.map((item, idx) => (
            <button
              key={item.fileUrl}
              className={`media-modal__thumb ${idx === currentIndex ? 'media-modal__thumb--active' : ''}`}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Медиа ${idx + 1}`}
            >
              {isVideoFile(item) ? (
                <video
                  src={item.fileUrl}
                  className="media-modal__thumb-inner"
                  preload="metadata"
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={item.fileUrl}
                  alt=""
                  className="media-modal__thumb-inner"
                  loading="lazy"
                />
              )}
              {isVideoFile(item) && (
                <span className="media-modal__thumb-play">▶</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

export default MediaModal;
