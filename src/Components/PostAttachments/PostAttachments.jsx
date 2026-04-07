// Components/PostAttachments/PostAttachments.jsx
// Отображает вложения поста: медиа-галерея (фото/видео), аудио-плееры, документы.
//
// Props:
//   attachments        — массив [ { fileUrl, fileType, fileName, orderIndex } ]
//   cssVars            — CSS-переменные профиля для передачи в MediaModal
//   compact            — если true, ограничиваем медиа-сетку до 4 ячеек с оверлеем "+N"
//   disableScrollLock  — если true, MediaModal не будет блокировать скролл страницы

import { useState, useRef, useCallback } from 'react';
import FileIcon from '../FileIcon/FileIcon';
import MediaModal from '../MediaModal/MediaModal';
import './PostAttachments.scss';

const PAGE_SIZE = 4; // количество элементов на «страницу» в режиме пагинации

// ---------------------------------------------------------------------------
// Хелперы определения типа файла по MIME
// ---------------------------------------------------------------------------
export function isImage(att) {
  return (att.fileType || '').startsWith('image/');
}
export function isVideo(att) {
  return (att.fileType || '').startsWith('video/');
}
export function isAudio(att) {
  return (att.fileType || '').startsWith('audio/');
}
export function isMedia(att) {
  return isImage(att) || isVideo(att);
}

// Очищает имя файла от timestamp-префикса вида "1714000000_12345.ext"
function displayName(att) {
  if (att.fileName) return att.fileName.replace(/^\d+_/, '');
  return (att.fileUrl || '').split('/').pop()?.replace(/^\d+_/, '') || 'файл';
}

// Форматирует размер файла в человекочитаемый вид
function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

// ---------------------------------------------------------------------------
// MediaGrid — сетка изображений и видео с поддержкой открытия MediaModal
// ---------------------------------------------------------------------------
function MediaGrid({ items, onOpen, compact }) {
  // В компактном режиме показываем не более 4 ячеек (последняя — с "+N")
  const MAX_COMPACT = 4;
  const showAll      = !compact || items.length <= MAX_COMPACT;
  const visibleItems = showAll ? items : items.slice(0, MAX_COMPACT);
  const hiddenCount  = showAll ? 0 : items.length - MAX_COMPACT;

  // CSS-класс сетки зависит от количества элементов
  const gridClass = `post-attachments__media-grid post-attachments__media-grid--${
    Math.min(visibleItems.length, 4)
  }`;

  return (
    <div className={gridClass}>
      {visibleItems.map((item, idx) => {
        const isLast    = !showAll && idx === visibleItems.length - 1;
        const cellClass = `post-attachments__media-cell${isLast && hiddenCount ? ' post-attachments__media-cell--more' : ''}`;

        return (
          <div
            key={item.fileUrl}
            className={cellClass}
            onClick={() => onOpen(idx)}
            title={displayName(item)}
          >
            {isVideo(item) ? (
              <>
                <video
                  src={item.fileUrl}
                  className="post-attachments__media-thumb"
                  preload="metadata"
                  muted
                  playsInline
                />
                <div className="post-attachments__play-icon">▶</div>
              </>
            ) : (
              <img
                src={item.fileUrl}
                alt={displayName(item)}
                className="post-attachments__media-thumb"
                loading="lazy"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}

            {/* Оверлей "+N ещё" на последней ячейке (только compact) */}
            {isLast && hiddenCount > 0 && (
              <div className="post-attachments__more-overlay">
                +{hiddenCount}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Кнопки пагинации — «Показать ещё» и «Свернуть»
// ---------------------------------------------------------------------------
function PaginationBar({ shown, total, onMore, onCollapse, topRef }) {
  if (total <= PAGE_SIZE) return null;

  return (
    <div className="post-attachments__pagination">
      {shown < total && (
        <button
          className="post-attachments__pagination-btn"
          onClick={() => onMore(Math.min(shown + PAGE_SIZE, total))}
        >
          Показать ещё →
        </button>
      )}
      {shown > PAGE_SIZE && (
        <button
          className="post-attachments__pagination-btn"
          onClick={() => {
            onCollapse(PAGE_SIZE);
            topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          Свернуть ↑
        </button>
      )}
    </div>
  );
}

// Останавливает все медиа-элементы на странице, кроме текущего
function stopOtherMedia(currentEl) {
  document.querySelectorAll('audio, video').forEach(el => {
    if (el !== currentEl) el.pause();
  });
}

// ---------------------------------------------------------------------------
// AudioList — список аудио-файлов с встроенными плеерами
// ---------------------------------------------------------------------------
function AudioList({ items }) {
  return (
    <div className="post-attachments__audio-list">
      {items.map(item => (
        <div key={item.fileUrl} className="post-attachments__audio-item">
          <div className="post-attachments__audio-meta">
            <span className="post-attachments__audio-icon">🎵</span>
            <span className="post-attachments__audio-name" title={displayName(item)}>
              {displayName(item)}
            </span>
            {item.fileSize && (
              <span className="post-attachments__audio-size">
                {formatSize(item.fileSize)}
              </span>
            )}
          </div>
          <audio
            controls
            src={item.fileUrl}
            className="post-attachments__audio-player"
            style={{ colorScheme: 'dark' }}
            preload="metadata"
            onPlay={(e) => stopOtherMedia(e.currentTarget)}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocList — список документов и прочих файлов для скачивания
// ---------------------------------------------------------------------------
function DocList({ items }) {
  return (
    <div className="post-attachments__doc-list">
      {items.map(item => (
        <a
          key={item.fileUrl}
          href={item.fileUrl}
          download={displayName(item)}
          target="_blank"
          rel="noopener noreferrer"
          className="post-attachments__doc-item"
          onClick={e => e.stopPropagation()}
        >
          <FileIcon fileType={item.fileType || 'application/octet-stream'} size={22} />
          <span className="post-attachments__doc-name" title={displayName(item)}>
            {displayName(item)}
          </span>
          {item.fileSize && (
            <span className="post-attachments__doc-size">
              {formatSize(item.fileSize)}
            </span>
          )}
          <span className="post-attachments__doc-dl">↓</span>
        </a>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostAttachments — главный компонент
// ---------------------------------------------------------------------------
function PostAttachments({ attachments, cssVars, compact = false, disableScrollLock = false }) {
  const [modalIndex,   setModalIndex]   = useState(null);
  const [mediaShown,   setMediaShown]   = useState(PAGE_SIZE);
  const [audioShown,   setAudioShown]   = useState(PAGE_SIZE);
  const [docShown,     setDocShown]     = useState(PAGE_SIZE);

  const mediaTopRef = useRef(null);
  const audioTopRef = useRef(null);
  const docTopRef   = useRef(null);

  if (!attachments || attachments.length === 0) return null;

  // Разбиваем вложения по типам
  const mediaItems = attachments.filter(isMedia);
  const audioItems = attachments.filter(isAudio);
  const docItems   = attachments.filter(a => !isMedia(a) && !isAudio(a));

  // В не-компактном режиме — пагинация (первые PAGE_SIZE элементов + кнопки)
  const paginate = !compact;

  return (
    <div className="post-attachments">
      {/* Медиа-галерея */}
      {mediaItems.length > 0 && (
        <>
          <div ref={mediaTopRef}>
            <MediaGrid
              items={paginate ? mediaItems.slice(0, mediaShown) : mediaItems}
              compact={compact}
              onOpen={(idx) => setModalIndex(idx)}
            />
          </div>
          {paginate && (
            <PaginationBar
              shown={mediaShown}
              total={mediaItems.length}
              onMore={setMediaShown}
              onCollapse={setMediaShown}
              topRef={mediaTopRef}
            />
          )}
        </>
      )}

      {/* Аудио */}
      {audioItems.length > 0 && (
        <>
          <div ref={audioTopRef}>
            <AudioList items={paginate ? audioItems.slice(0, audioShown) : audioItems} />
          </div>
          {paginate && (
            <PaginationBar
              shown={audioShown}
              total={audioItems.length}
              onMore={setAudioShown}
              onCollapse={setAudioShown}
              topRef={audioTopRef}
            />
          )}
        </>
      )}

      {/* Документы */}
      {docItems.length > 0 && (
        <>
          <div ref={docTopRef}>
            <DocList items={paginate ? docItems.slice(0, docShown) : docItems} />
          </div>
          {paginate && (
            <PaginationBar
              shown={docShown}
              total={docItems.length}
              onMore={setDocShown}
              onCollapse={setDocShown}
              topRef={docTopRef}
            />
          )}
        </>
      )}

      {/* Модальная галерея для изображений и видео */}
      {modalIndex !== null && (
        <MediaModal
          items={mediaItems}
          initialIndex={modalIndex}
          onClose={() => setModalIndex(null)}
          cssVars={cssVars}
          disableScrollLock={disableScrollLock}
        />
      )}
    </div>
  );
}

export default PostAttachments;
