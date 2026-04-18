// pages/Gallery/Gallery.jsx
// Галерея (/gallery): альбомы фото и видео.
// Файлы, загруженные за один раз, объединяются в альбом (group_id).
// Клик на элемент альбома → ImageModal с навигацией по ВСЕЙ галерее + комментарии.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import GalleryAlbum from '../../Components/GalleryAlbum/GalleryAlbum';
import ImageModal from '../../Components/ImageModal/ImageModal';
import { timeAgo } from '../../utils/timeFormatter';
import { showConfirm, showAlert } from '../../Components/Dialog/dialogManager';
import './Gallery.scss';

const LIMIT = 30;

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}


function Gallery() {
  const { user, token } = useAuth();
  const fileInputRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Альбомы из API
  const [albums,  setAlbums]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error,   setError]   = useState(null);

  // Индекс в плоском списке всех фото для ImageModal
  const [modalIndex, setModalIndex] = useState(null);

  // Прямая ссылка: /gallery?image=<id>
  // После загрузки альбомов ищем фото и открываем модал
  const deepLinkImageId = searchParams.get('image');

  // Форма загрузки
  const [showUpload,    setShowUpload]    = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]); // [{file, previewUrl, isVideo}]
  const [titleInput,    setTitleInput]    = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [uploadError,   setUploadError]   = useState(null);
  const [uploadStatus,  setUploadStatus]  = useState('');

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.file.size, 0);

  // Плоский список всех файлов из всех альбомов — для навигации в ImageModal
  const allItems = useMemo(() =>
    albums.flatMap(album =>
      album.items.map(item => ({ ...item, author: album.author }))
    ),
    [albums]
  );

  // Стартовый индекс каждого альбома в плоском списке
  const albumStartIndex = useMemo(() => {
    const map = {};
    let idx = 0;
    for (const album of albums) {
      map[album.albumId] = idx;
      idx += album.items.length;
    }
    return map;
  }, [albums]);

  // Диапазоны альбомов для динамического определения текущего альбома в ImageModal
  const albumRanges = useMemo(() => {
    let idx = 0;
    return albums.map(album => {
      const range = { startIndex: idx, items: album.items };
      idx += album.items.length;
      return range;
    });
  }, [albums]);

  const openModal = (album, itemIdx) => {
    const start = albumStartIndex[album.albumId] ?? 0;
    setModalIndex(start + itemIdx);
  };

  // Открываем фото по deep link (?image=id) как только загрузились альбомы
  useEffect(() => {
    if (!deepLinkImageId || allItems.length === 0) return;
    const idx = allItems.findIndex(item => item.id === deepLinkImageId);
    if (idx !== -1) {
      setModalIndex(idx);
      // Убираем параметр из URL, чтобы при закрытии модала URL был чистым
      setSearchParams({}, { replace: true });
    }
  }, [deepLinkImageId, allItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Загрузка
  // ---------------------------------------------------------------------------
  const loadAlbums = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get('/api/images', {
        params: { limit: LIMIT, offset },
      });
      setAlbums(prev => offset === 0 ? data : [...prev, ...data]);
      setHasMore(data.length === LIMIT);
    } catch (err) {
      setError('Не удалось загрузить галерею');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlbums(0); }, [loadAlbums]);

  // ---------------------------------------------------------------------------
  // Выбор файлов
  // ---------------------------------------------------------------------------
  const handleFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadError(null);

    const newEntries = [];

    for (const file of files) {
      const isVideo    = file.type.startsWith('video/');
      const previewUrl = (file.type.startsWith('image/') || isVideo)
        ? URL.createObjectURL(file) : null;
      newEntries.push({ file, previewUrl, isVideo });
    }

    setSelectedFiles(prev => [...prev, ...newEntries]);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => {
      const entry = prev[index];
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const resetForm = () => {
    selectedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setSelectedFiles([]);
    setTitleInput('');
    setUploadError(null);
    setUploadStatus('');
    setShowUpload(false);
  };

  // ---------------------------------------------------------------------------
  // Публикация
  // ---------------------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFiles.length) { setUploadError('Выберите хотя бы один файл'); return; }
    setSubmitting(true);
    setUploadError(null);

    try {
      setUploadStatus('Загрузка файлов...');
      const formData = new FormData();
      selectedFiles.forEach(({ file }) => formData.append('files[]', file));

      const { data: uploadResult } = await axios.post('/api/upload', formData, {
        headers: { Authorization: `Bearer ${token}` },
        onUploadProgress: (ev) => {
          if (ev.total) {
            setUploadStatus(`Загрузка ${Math.round((ev.loaded / ev.total) * 100)}%...`);
          }
        },
      });

      setUploadStatus('Сохранение...');
      const uploadedFiles = uploadResult.files || [uploadResult];

      const { data: newAlbum } = await axios.post(
        '/api/images',
        { files: uploadedFiles, title: titleInput.trim() || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );

        setAlbums(prev => [newAlbum, ...prev]);
      resetForm();
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Ошибка при публикации');
    } finally {
      setSubmitting(false);
      setUploadStatus('');
    }
  };

  // ---------------------------------------------------------------------------
  // Удаление альбома
  // ---------------------------------------------------------------------------
  const handleDelete = async (album) => {
    const msg = album.count > 1
      ? `Удалить альбом (${album.count} файлов)?`
      : 'Удалить фото?';
    if (!(await showConfirm(msg))) return;

    try {
      await axios.delete(`/api/images/album/${album.albumId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlbums(prev => prev.filter(a => a.albumId !== album.albumId));
      setModalIndex(null);
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка при удалении');
    }
  };

  const canDelete = (album) =>
    user && (user.id === album.author?.id || user.role === 'admin' || user.role === 'creator' || (user.customPermissions ?? []).includes('moderate_content'));

  return (
    <main className="gallery">
      <div className="gallery__header">
        <h1 className="gallery__title">Галерея</h1>

        {user && (
          <button
            className="gallery__add-btn"
            onClick={() => { if (showUpload) resetForm(); else setShowUpload(true); }}
          >
            {showUpload ? 'Отмена' : '+ Добавить медиа'}
          </button>
        )}
      </div>

      {/* Форма загрузки */}
      {showUpload && (
        <form className="gallery__upload-form" onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFilesChange}
            className="gallery__upload-input"
            disabled={submitting}
          />
          <button
            type="button"
            className="gallery__upload-pick"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
          >
            📎 Выбрать файлы
          </button>

          {selectedFiles.length > 0 && (
            <div className="gallery__upload-size">
              {selectedFiles.length} файл(ов) · {formatBytes(totalSize)}
            </div>
          )}

          {selectedFiles.length > 0 && (
            <div className="gallery__upload-previews">
              {selectedFiles.map((entry, i) => (
                <div key={i} className="gallery__upload-preview-item">
                  {entry.isVideo ? (
                    <div className="gallery__upload-preview-video">
                      <video src={entry.previewUrl} muted playsInline preload="metadata" />
                      <span className="gallery__upload-preview-video-icon">▶</span>
                    </div>
                  ) : entry.previewUrl ? (
                    <img src={entry.previewUrl} alt={entry.file.name} />
                  ) : (
                    <div className="gallery__upload-preview-file">📄</div>
                  )}
                  <span className="gallery__upload-preview-name">{entry.file.name}</span>
                  <span className="gallery__upload-preview-size">{formatBytes(entry.file.size)}</span>
                  <button
                    type="button"
                    className="gallery__upload-preview-remove"
                    onClick={() => removeFile(i)}
                    disabled={submitting}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          <input
            type="text"
            className="gallery__upload-title"
            placeholder="Название (необязательно)"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            maxLength={200}
            disabled={submitting}
          />

          {uploadError  && <p className="gallery__upload-error">{uploadError}</p>}
          {uploadStatus && <p className="gallery__upload-status">{uploadStatus}</p>}

          <button
            type="submit"
            className="gallery__upload-submit"
            disabled={submitting || selectedFiles.length === 0}
          >
            {submitting ? (uploadStatus || 'Загрузка...') : 'Опубликовать'}
          </button>
        </form>
      )}

      {/* Сетка альбомов */}
      {albums.length > 0 && (
        <div className="gallery__grid">
          {albums.map((album) => (
            <div key={album.albumId} className="gallery__item">
              {/* Оверлей автора поверх альбома */}
              <div className="gallery__item-meta">
                <div className="gallery__item-author">
                  {album.author?.avatarUrl && (
                    <img
                      src={album.author.avatarUrl}
                      alt={album.author.username}
                      className="gallery__item-avatar"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <Link
                    to={`/player/${album.author?.username}`}
                    className="gallery__item-username"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {album.author?.username}
                  </Link>
                </div>
                <span className="gallery__item-date">{timeAgo(album.createdAt * 1000)}</span>
                {album.items[0]?.title && (
                  <p className="gallery__item-title">{album.items[0].title}</p>
                )}
              </div>

              <GalleryAlbum
                album={album}
                onClick={(idx) => openModal(album, idx)}
                canDelete={canDelete(album)}
                onDelete={() => handleDelete(album)}
              />
            </div>
          ))}
        </div>
      )}

      {loading && albums.length === 0 && (
        <div className="gallery__state">
          <span className="gallery__spinner" /> Загрузка...
        </div>
      )}

      {!loading && albums.length === 0 && !error && (
        <div className="gallery__state gallery__state--empty">
          <p>Пока нет медиа.</p>
          {user
            ? <p>Нажмите «+ Добавить медиа», чтобы поделиться первым!</p>
            : <p>Войдите, чтобы добавлять фото и видео.</p>
          }
        </div>
      )}

      {error && <div className="gallery__state gallery__state--error">{error}</div>}

      {!loading && hasMore && albums.length > 0 && (
        <button className="gallery__load-more" onClick={() => loadAlbums(albums.length)}>
          Загрузить ещё
        </button>
      )}

      {loading && albums.length > 0 && (
        <div className="gallery__state gallery__state--inline">
          <span className="gallery__spinner" /> Загрузка...
        </div>
      )}

      {/* ImageModal: навигация по всей галерее + комментарии */}
      {modalIndex !== null && (
        <ImageModal
          images={allItems}
          initialIndex={modalIndex}
          albumRanges={albumRanges}
          onClose={() => setModalIndex(null)}
          onDeleteItem={user ? async (imageId) => {
            try {
              await axios.delete(`/api/images/${imageId}`, { headers: { Authorization: `Bearer ${token}` } });
              setAlbums(prev => prev
                .map(a => ({ ...a, items: a.items.filter(i => i.id !== imageId) }))
                .filter(a => a.items.length > 0)
              );
            } catch (err) { alert(err.response?.data?.error || 'Ошибка при удалении'); }
          } : undefined}
        />
      )}
    </main>
  );
}

export default Gallery;
