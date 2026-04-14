// Components/ImageModal/ImageModal.jsx
// "Кинотеатр" для скриншотов и видео Minecraft.
// Медиа занимает весь экран. Контролы (стрелки, стрип, топ-бар) — поверх медиа,
// появляются при движении мыши, исчезают через 2 секунды бездействия.
// Боковая панель с комментариями выезжает справа с анимацией.
//
// Props:
//   images       — массив медиа-объектов { id, imageUrl/fileUrl, fileType, isVideo, title, createdAt, author }
//   initialIndex — начальный индекс
//   onClose      — callback закрытия
//   commentType  — тип комментариев: 'image' | 'post'
//   commentId    — ID объекта для комментариев
//   cssVars      — CSS-переменные профиля
//   albumRanges  — [{startIndex, items[]}] для динамического стрипа

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { showConfirm } from '../Dialog/dialogManager';
import { Link } from 'react-router-dom';
import { timeAgo } from '../../utils/timeFormatter';
import CommentSection from '../CommentSection/CommentSection';
import './ImageModal.scss';

function ImageModal({ images, initialIndex = 0, onClose, commentType, commentId, cssVars, albumRanges, onDeleteItem, showAlbumTag = true, showSidebar = true }) {
  const [currentIndex,    setCurrentIndex]    = useState(initialIndex);
  const [sidebarVisible,  setSidebarVisible]  = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [imgLoaded,       setImgLoaded]       = useState(false);

  const stripRef             = useRef(null);
  const hideTimer            = useRef(null);
  const stageRef             = useRef(null);
  const videoRef             = useRef(null);
  const updateStripBottomRef = useRef(null);

  const [stripBottom, setStripBottom] = useState(0);

  // Динамически определяем альбом по текущему индексу
  const currentRange = albumRanges?.find(
    r => currentIndex >= r.startIndex && currentIndex < r.startIndex + r.items.length
  );
  const relatedImages = currentRange?.items.length > 1 ? currentRange.items : null;
  const relatedOffset = currentRange?.startIndex ?? 0;

  const current  = images[currentIndex];
  const hasPrev  = currentIndex > 0;
  const hasNext  = currentIndex < images.length - 1;
  const mediaUrl = current?.imageUrl || current?.fileUrl;
  const isVideo  = current?.isVideo  || current?.fileType?.startsWith('video/');

  // Динамический bottom для стрипа при видео:
  // видео центрируется в stage → его нижний край поднимается при сужении экрана
  // → нужно держать стрип выше нижнего края видео, а не экрана
  useEffect(() => {
    if (!isVideo) {
      setStripBottom(0);
      return;
    }

    const update = () => {
      if (window.innerWidth <= 768) {
        setStripBottom(0);
        return;
      }
      const videoEl = videoRef.current;
      const stageEl = stageRef.current;
      if (!videoEl || !stageEl || !videoEl.clientHeight) return;
      const spaceBelow = Math.max(0, (stageEl.clientHeight - videoEl.clientHeight) / 2);
      setStripBottom(spaceBelow + 52);
    };

    updateStripBottomRef.current = update;
    update();

    const ro = new ResizeObserver(update);
    if (videoRef.current) ro.observe(videoRef.current);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [isVideo, mediaUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Показать контролы и сбросить таймер скрытия
  const showControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2000);
  }, []);

  const goPrev = useCallback(() => {
    if (hasPrev) { setImgLoaded(false); setCurrentIndex(i => i - 1); }
  }, [hasPrev]);

  const goNext = useCallback(() => {
    if (hasNext) { setImgLoaded(false); setCurrentIndex(i => i + 1); }
  }, [hasNext]);

  const handleDeleteItem = useCallback(async () => {
    if (!onDeleteItem || !current) return;
    if (!(await showConfirm('Удалить это медиа?'))) return;
    const idToDelete = current.id;
    if (images.length === 1) {
      onClose();
    } else {
      setImgLoaded(false);
      setCurrentIndex(prev => Math.min(prev, images.length - 2));
    }
    onDeleteItem(idToDelete);
  }, [onDeleteItem, current, images.length, onClose]);

  // Показываем контролы при монтировании
  useEffect(() => {
    showControls();
    return () => clearTimeout(hideTimer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Клавиатурная навигация
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')   goPrev();
      if (e.key === 'ArrowRight')  goNext();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  // Блокировка скролла (как в MediaModal)
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.left     = '0';
    document.body.style.right    = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top      = '';
      document.body.style.left     = '';
      document.body.style.right    = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Автопрокрутка стрипа к активной миниатюре
  useEffect(() => {
    if (!stripRef.current) return;
    const active = stripRef.current.querySelector('.image-modal__strip-item--active');
    if (active) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [currentIndex]);

  if (!current) return null;

  const avatarUrl = current.author?.minecraftUuid
    ? `https://crafatar.icehost.xyz/avatars/${current.author.minecraftUuid}?size=32&overlay`
    : null;

  const resolvedCommentType = commentType || 'image';
  const resolvedCommentId   = commentId   || current.id;

  return createPortal(
    <div
      className={`image-modal${controlsVisible ? ' image-modal--controls' : ''}${sidebarVisible ? ' image-modal--sidebar-open' : ''}${isVideo ? ' image-modal--video' : ''}`}
      style={cssVars}
    >
      {/* ─── Сцена: медиа + наложенные контролы ─────────────────────────── */}
      <div
        className="image-modal__stage"
        ref={stageRef}
        onMouseMove={showControls}
        onClick={onClose}
      >

        {/* Медиа */}
        <div className="image-modal__media-wrap" onClick={(e) => e.stopPropagation()}>
          {isVideo ? (
            <video
              ref={videoRef}
              key={mediaUrl}
              src={mediaUrl}
              controls
              autoPlay
              playsInline
              className="image-modal__video"
              style={{ colorScheme: 'dark' }}
              onLoadedMetadata={() => updateStripBottomRef.current?.()}
            />
          ) : (
            <img
              key={mediaUrl}
              src={mediaUrl}
              alt={current.title || ''}
              className={`image-modal__image${imgLoaded ? ' image-modal__image--loaded' : ''}`}
              onLoad={() => setImgLoaded(true)}
              draggable={false}
            />
          )}
        </div>

        {/* Контролы — поверх медиа, фейдятся */}
        <div className="image-modal__overlay">

          {/* Верхняя полоса: автор + действия */}
          <div className="image-modal__top-bar" onClick={(e) => e.stopPropagation()}>
            <div className="image-modal__author">
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  className="image-modal__author-avatar"
                  alt=""
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              {current.author?.username && (
                <div className="image-modal__author-text">
                  <Link
                    to={`/player/${current.author.username}`}
                    className="image-modal__author-name"
                    onClick={onClose}
                  >
                    {current.author.username}
                  </Link>
                  <span className="image-modal__author-date">
                    {timeAgo(current.createdAt * 1000)}
                  </span>
                </div>
              )}
              {current.title && (
                <span className="image-modal__title">{current.title}</span>
              )}
              {showAlbumTag && current.albumName && (
                <Link
                  to={`/player/${current.albumOwnerUsername}`}
                  className="image-modal__album-tag"
                  onClick={onClose}
                  title={`Альбом: ${current.albumName}`}
                >
                  📁 {current.albumName}
                </Link>
              )}
            </div>

            <div className="image-modal__actions">
              {current?.id && (
                <button
                  className="image-modal__btn image-modal__btn--share"
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/gallery?image=${current.id}`;
                    navigator.clipboard?.writeText(url);
                  }}
                  title="Скопировать ссылку на фото"
                >🔗</button>
              )}
              {onDeleteItem && (
                <button
                  className="image-modal__btn image-modal__btn--delete"
                  onClick={(e) => { e.stopPropagation(); handleDeleteItem(); }}
                  title="Удалить медиа"
                >🗑</button>
              )}
              {showSidebar && (
                <button
                  className={`image-modal__btn${sidebarVisible ? ' image-modal__btn--active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setSidebarVisible(v => !v); }}
                  title={sidebarVisible ? 'Скрыть комментарии' : 'Показать комментарии'}
                >
                  {sidebarVisible ? '▶' : '◀'}
                </button>
              )}
              <button
                className="image-modal__btn image-modal__btn--close"
                onClick={onClose}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Стрелки */}
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
              className="image-modal__arrow image-modal__arrow--next"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              aria-label="Следующее"
            >
              ›
            </button>
          )}

          {/* Нижняя полоса: счётчик + стрип */}
          <div className="image-modal__bottom" style={{ bottom: `${stripBottom}px` }} onClick={(e) => e.stopPropagation()}>
            {images.length > 1 && (
              <div className="image-modal__counter">
                {currentIndex + 1} <span>/</span> {images.length}
              </div>
            )}

            <div
              className={`image-modal__strip${!relatedImages ? ' image-modal__strip--empty' : ''}`}
              ref={stripRef}
            >
              {relatedImages && relatedImages.map((item, i) => {
                const globalIdx = relatedOffset + i;
                const isActive  = globalIdx === currentIndex;
                const url       = item.imageUrl || item.fileUrl;
                const isVid     = item.isVideo || item.fileType?.startsWith('video/');
                return (
                  <button
                    key={item.id}
                    className={`image-modal__strip-item${isActive ? ' image-modal__strip-item--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setImgLoaded(false); setCurrentIndex(globalIdx); showControls(); }}
                    title={item.title || ''}
                  >
                    {isVid ? (
                      <video src={url} muted preload="metadata" className="image-modal__strip-thumb" />
                    ) : (
                      <img src={url} alt="" className="image-modal__strip-thumb" draggable={false} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

        </div>{/* /overlay */}
      </div>{/* /stage */}

      {/* ─── Боковая панель с комментариями ─────────────────────────────── */}
      {showSidebar && <div className="image-modal__sidebar">
        <div className="image-modal__sidebar-inner">

          <div className="image-modal__sidebar-author">
            {avatarUrl && (
              <img
                src={avatarUrl}
                className="image-modal__sidebar-avatar"
                alt={current.author?.username}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div className="image-modal__sidebar-author-text">
              {current.author?.username && (
                <Link
                  to={`/player/${current.author.username}`}
                  className="image-modal__sidebar-name"
                  onClick={onClose}
                >
                  {current.author.username}
                </Link>
              )}
              <span className="image-modal__sidebar-date">
                {timeAgo(current.createdAt * 1000)}
              </span>
            </div>
          </div>

          {current.title && (
            <p className="image-modal__sidebar-title">{current.title}</p>
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
      </div>}

    </div>,
    document.body
  );
}

export default ImageModal;
