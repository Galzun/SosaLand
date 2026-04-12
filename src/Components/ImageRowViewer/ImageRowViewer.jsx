// Components/ImageRowViewer/ImageRowViewer.jsx
// Ряд изображений/видео в одну строку — вставляется в тело новости
// через маркер div.rte-image-row[data-images].
//
// Props:
//   images  — [{ url, fileType }]
//   cssVars — CSS-переменные --cards-* (опционально)

import './ImageRowViewer.scss';

function ImageRowViewer({ images = [], cssVars = {}, onImageClick }) {
  if (!images.length) return null;

  return (
    <div className="image-row-viewer" style={cssVars}>
      {images.map((img, i) => {
        const isVideo = (img.fileType || '').startsWith('video/') ||
          /\.(mp4|webm|ogg)(\?|$)/i.test(img.url);

        return isVideo ? (
          <video
            key={i}
            src={img.url}
            controls
            className="image-row-viewer__item"
            style={{ colorScheme: 'dark' }}
          />
        ) : (
          <img
            key={i}
            src={img.url}
            alt=""
            className={`image-row-viewer__item${onImageClick ? ' image-row-viewer__item--clickable' : ''}`}
            draggable={false}
            onClick={onImageClick ? () => onImageClick(i) : undefined}
          />
        );
      })}
    </div>
  );
}

export default ImageRowViewer;
