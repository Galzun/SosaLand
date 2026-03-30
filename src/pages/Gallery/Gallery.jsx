import './Gallery.scss';

function Gallery() {
  return (
    <main className="gallery">
      <h1 className="gallery__title">Галерея сервера</h1>
      <div className="gallery__grid">
        {/* Здесь будут фото */}
        <p className="gallery__placeholder">Скоро появятся фотографии игроков!</p>
      </div>
    </main>
  );
}

export default Gallery;