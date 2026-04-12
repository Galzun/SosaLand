// Components/SliderViewer/SliderViewer.jsx
// Карусель со стрипом миниатюр — рендерится внутри новостей.
// Клик по изображению → открывает ImageModal.
// Для видео — кнопка «⛶» справа сверху (video перехватывает клики).
//
// Props:
//   images  — [{ url, fileType }]
//   cssVars — объект CSS-переменных (--cards-*)

import { useState, useCallback, useRef } from 'react';
import ImageModal from '../ImageModal/ImageModal';
import './SliderViewer.scss';

function SliderViewer({ images = [], cssVars = {} }) {
  const [current,    setCurrent]    = useState(0);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [modalIndex, setModalIndex] = useState(0);
  const stripRef = useRef(null);

  // Массив элементов в формате ImageModal
  const modalImages = images.map((img, i) => {
    const isVid = (img.fileType || '').startsWith('video/') ||
      /\.(mp4|webm|ogg)(\?|$)/i.test(img.url);
    return {
      id:       `slider-${i}`,
      fileUrl:  img.url,
      fileType: img.fileType || (isVid ? 'video/mp4' : 'image/jpeg'),
      isVideo:  isVid,
    };
  });

  // Один диапазон — все слайды (показывает полный стрип в ImageModal)
  const albumRanges = [{ startIndex: 0, items: modalImages }];

  const openModal = useCallback((idx) => {
    setModalIndex(idx);
    setModalOpen(true);
  }, []);

  const goTo = useCallback((idx) => {
    setCurrent(idx);
    setTimeout(() => {
      const strip = stripRef.current;
      if (!strip) return;
      const thumb = strip.children[idx];
      if (thumb) thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 0);
  }, []);

  const prev = useCallback((e) => {
    e.stopPropagation();
    goTo((current - 1 + images.length) % images.length);
  }, [current, images.length, goTo]);

  const next = useCallback((e) => {
    e.stopPropagation();
    goTo((current + 1) % images.length);
  }, [current, images.length, goTo]);

  if (!images.length) return null;

  const item = images[current];
  const isVideo = (item.fileType || '').startsWith('video/') ||
    /\.(mp4|webm|ogg)(\?|$)/i.test(item.url);

  return (
    <>
      <div className={`slider-viewer${isVideo ? ' slider-viewer--video' : ''}`} style={cssVars}>

        {/* Основной медиа-блок */}
        <div className="slider-viewer__main">
          {isVideo ? (
            <video
              key={item.url}
              className="slider-viewer__video"
              src={item.url}
              controls
              playsInline
              style={{ colorScheme: 'dark' }}
            />
          ) : (
            <img
              key={item.url}
              className="slider-viewer__img"
              src={item.url}
              alt={`Слайд ${current + 1}`}
              onClick={() => openModal(current)}
            />
          )}

          {/* Стрелки навигации */}
          {images.length > 1 && (
            <>
              <button
                className="slider-viewer__arrow slider-viewer__arrow--prev"
                onClick={prev}
                aria-label="Предыдущий слайд"
              >
                ‹
              </button>
              <button
                className="slider-viewer__arrow slider-viewer__arrow--next"
                onClick={next}
                aria-label="Следующий слайд"
              >
                ›
              </button>
            </>
          )}

          {/* Счётчик */}
          {images.length > 1 && (
            <div className="slider-viewer__counter">
              {current + 1} / {images.length}
            </div>
          )}
        </div>

        {/* Стрип миниатюр */}
        {images.length > 1 && (
          <div className="slider-viewer__strip" ref={stripRef}>
            {images.map((img, i) => {
              const isVid = (img.fileType || '').startsWith('video/') ||
                /\.(mp4|webm|ogg)(\?|$)/i.test(img.url);
              return (
                <button
                  key={i}
                  className={`slider-viewer__thumb${i === current ? ' slider-viewer__thumb--active' : ''}`}
                  onClick={() => goTo(i)}
                  title={`Слайд ${i + 1}`}
                >
                  {isVid ? (
                    <video src={img.url + '#t=0.1'} preload="metadata" muted className="slider-viewer__strip-thumb" />
                  ) : (
                    <img src={img.url} alt="" className="slider-viewer__strip-thumb" draggable={false} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ImageModal при клике по медиа */}
      {modalOpen && (
        <ImageModal
          images={modalImages}
          initialIndex={modalIndex}
          onClose={() => setModalOpen(false)}
          cssVars={cssVars}
          albumRanges={albumRanges}
          showAlbumTag={false}
        />
      )}
    </>
  );
}

export default SliderViewer;
