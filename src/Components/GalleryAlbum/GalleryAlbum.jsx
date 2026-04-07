// Components/GalleryAlbum/GalleryAlbum.jsx
// Превью альбома в сетке галереи.
//
// Props:
//   album     — { albumId, items[], count, author, createdAt, ... }
//   onClick   — callback(initialIndex) при клике, открывает полную галерею
//   canDelete — показывать ли кнопку удаления
//   onDelete  — callback() при клике на удаление альбома
//
// Макет превью:
//   1 файл  — полная ячейка
//   2 файла — 2 равных столбца
//   3 файла — 1 крупный слева + 2 стопкой справа
//   4+ файла — 2×2 сетка; 4-я ячейка с оверлеем "+N" если файлов > 4

import './GalleryAlbum.scss';

function Thumb({ item, overlay, onClick }) {
  const isVideo = item.isVideo || item.fileType?.startsWith('video/');
  const src     = item.imageUrl || item.fileUrl;

  return (
    <div className="gallery-album__thumb" onClick={onClick}>
      {isVideo ? (
        <>
          <video src={src} muted playsInline preload="metadata" />
          <span className="gallery-album__thumb-play">▶</span>
        </>
      ) : (
        <img src={src} alt={item.title || ''} loading="lazy" />
      )}

      {overlay != null && (
        <div className="gallery-album__thumb-overlay">
          <span>+{overlay}</span>
        </div>
      )}
    </div>
  );
}

function GalleryAlbum({ album, onClick, canDelete, onDelete }) {
  const { items = [], count = 0 } = album;
  if (items.length === 0) return null;

  const n = count; // реальное количество файлов (может быть > items.length)

  // Определяем, сколько показывать превью и что рисовать
  const show = items.slice(0, 4);

  // Оверлей "+N" на последней ячейке (если файлов > 4)
  const extra = n > 4 ? n - 3 : null; // "+N" = количество скрытых файлов

  let layoutClass = 'gallery-album--one';
  if (show.length === 2) layoutClass = 'gallery-album--two';
  else if (show.length === 3) layoutClass = 'gallery-album--three';
  else if (show.length >= 4) layoutClass = 'gallery-album--four';

  return (
    <div className={`gallery-album ${layoutClass}`}>
      {show.map((item, i) => {
        const isLastAndHasExtra = i === 3 && extra !== null;
        return (
          <Thumb
            key={item.id}
            item={item}
            overlay={isLastAndHasExtra ? extra : undefined}
            onClick={() => onClick?.(i)}
          />
        );
      })}

      {canDelete && (
        <button
          className="gallery-album__delete"
          onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          title={n > 1 ? `Удалить альбом (${n} файлов)` : 'Удалить'}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default GalleryAlbum;
