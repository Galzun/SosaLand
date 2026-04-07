// pages/PlayerPage/PlayerPage.jsx
// Страница профиля игрока: /player/:username

import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePlayerByName } from '../../context/PlayerContext';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/timeFormatter';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import PostForm from '../../Components/PostForm/PostForm';
import PostCard from '../../Components/PostCard/PostCard';
import GalleryAlbum from '../../Components/GalleryAlbum/GalleryAlbum';
import ImageModal from '../../Components/ImageModal/ImageModal';
import CommentSection from '../../Components/CommentSection/CommentSection';
import usePosts from '../../hooks/usePosts';
import './PlayerPage.scss';

const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const MAX_FILE_SIZE  = 50  * 1024 * 1024;

const PHOTOS_LIMIT = 30;

function PlayerPage() {
  const { username } = useParams();

  const player = usePlayerByName(username);
  const { user, token } = useAuth();

  const [profile,        setProfile]        = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [avatarError,    setAvatarError]    = useState(false);
  const [copiedUuid,     setCopiedUuid]     = useState(false);

  // Активная вкладка: 'posts' | 'photos' | 'comments'
  const [activeTab, setActiveTab] = useState('posts');

  // --- Состояние вкладки «Фото» ---
  const [photos,             setPhotos]             = useState([]); // массив альбомов
  const [photosLoading,      setPhotosLoading]      = useState(false);
  const [photosHasMore,      setPhotosHasMore]      = useState(true);
  const [photosLoaded,       setPhotosLoaded]       = useState(false);
  const [selectedPhotoFiles, setSelectedPhotoFiles] = useState([]); // [{file, previewUrl, isVideo}]
  const [titleInput,         setTitleInput]         = useState('');
  const [submitting,         setSubmitting]         = useState(false);
  const [photoError,         setPhotoError]         = useState(null);
  const [uploadStatus,       setUploadStatus]       = useState('');
  // Индекс в плоском списке всех фото для ImageModal
  const [photosModalIndex, setPhotosModalIndex] = useState(null);
  const photoFileInputRef = useRef(null);

  // Сбрасываем позицию скролла при переходе на другой профиль
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [username]);

  useEffect(() => {
    if (!username) return;
    setProfileLoading(true);
    axios.get(`/api/users/by-minecraft/${username}`)
      .then(({ data }) => setProfile(data))
      .catch((err) => {
        if (err.response?.status !== 404) {
          console.error('Ошибка загрузки профиля:', err.message);
        }
        setProfile(null);
      })
      .finally(() => setProfileLoading(false));
  }, [username]);

  const {
    posts,
    loading: postsLoading,
    hasMore,
    loadMore,
    createPost,
    toggleLike,
    deletePost,
  } = usePosts({
    userId: profile?.id ?? null,
    // Не загружаем пока профиль грузится, и не грузим глобальную ленту если аккаунта нет
    disabled: profileLoading || !profile,
  });

  const navigate = useNavigate();
  const isOwner = user && profile && user.id === profile.id;

  // ---------------------------------------------------------------------------
  // Вспомогательные функции для вычисления rgba и edgeMask (те же что были)
  // ---------------------------------------------------------------------------
  const hexAlphaToRgba = (hex, alpha) => {
    const h = (hex || '#1a1a1a').replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${isNaN(r) ? 26 : r}, ${isNaN(g) ? 26 : g}, ${isNaN(b) ? 26 : b}, ${(alpha ?? 95) / 100})`;
  };

  const hexBlur = (blur) => (blur ? `blur(${blur}px)` : 'none');

  // CSS-переменные для всех UI-элементов профиля
  const cssVars = !profileLoading && profile ? (() => {
    const headerAccent = profile.contentWrapperAccentColor || '#4aff9e';
    const cardsAccent  = profile.postCardAccentColor       || '#4aff9e';
    return {
    // Шапка профиля (content_wrapper_*)
    '--card-bg-computed':            hexAlphaToRgba(profile.cardBgColor, profile.cardBgAlpha),
    '--card-bg-blur':                hexBlur(profile.cardBgBlur),
    '--content-wrapper-bg-computed': hexAlphaToRgba(profile.contentWrapperBgColor, profile.contentWrapperBgAlpha),
    '--content-wrapper-blur':        hexBlur(profile.contentWrapperBlur),
    '--header-border-color':         profile.contentWrapperBorderColor  || 'transparent',
    '--header-border-width':         `${profile.contentWrapperBorderWidth  ?? 0}px`,
    '--header-border-radius':        `${profile.contentWrapperBorderRadius ?? 12}px`,
    '--header-text-color':           profile.contentWrapperTextColor  || 'inherit',
    '--header-accent-color':         headerAccent,
    '--header-accent-10':            hexAlphaToRgba(headerAccent, 10),
    '--header-accent-12':            hexAlphaToRgba(headerAccent, 12),
    '--header-accent-35':            hexAlphaToRgba(headerAccent, 35),
    // Шапка — оттенки текста (вычисляются только если задан цвет текста)
    ...(profile.contentWrapperTextColor ? {
      '--header-text-muted': hexAlphaToRgba(profile.contentWrapperTextColor, 65),
      '--header-text-dim':   hexAlphaToRgba(profile.contentWrapperTextColor, 50),
    } : {}),
    // Область контента (content_*)
    '--content-bg-computed': hexAlphaToRgba(profile.contentBgColor, profile.contentBgAlpha),
    '--content-blur':        hexBlur(profile.contentBlur),
    '--content-border-color':  profile.contentBorderColor  || 'transparent',
    '--content-border-width':  `${profile.contentBorderWidth  ?? 0}px`,
    '--content-border-radius': `${profile.contentBorderRadius ?? 10}px`,
    // Карточки и вкладки — объединённая группа (post_card_*)
    '--cards-bg-computed': hexAlphaToRgba(profile.postCardBgColor, profile.postCardBgAlpha),
    '--cards-blur':        hexBlur(profile.postCardBlur),
    '--cards-border-color':  profile.postCardBorderColor  || '#2a2a3a',
    '--cards-border-width':  `${profile.postCardBorderWidth  ?? 1}px`,
    '--cards-border-radius': `${profile.postCardBorderRadius ?? 12}px`,
    '--cards-text-color':    profile.postCardTextColor    || 'inherit',
    '--cards-accent-color':  cardsAccent,
    '--cards-accent-04':     hexAlphaToRgba(cardsAccent, 4),
    '--cards-accent-08':     hexAlphaToRgba(cardsAccent, 8),
    '--cards-accent-25':     hexAlphaToRgba(cardsAccent, 25),
    // Карточки — оттенки текста (вычисляются только если задан цвет текста)
    ...(profile.postCardTextColor ? {
      '--cards-text-muted': hexAlphaToRgba(profile.postCardTextColor, 65),
      '--cards-text-dim':   hexAlphaToRgba(profile.postCardTextColor, 50),
    } : {}),
    };
  })() : {
    '--card-bg-computed':            'rgba(26, 26, 26, 0.95)',
    '--content-wrapper-bg-computed': 'rgba(26, 26, 26, 0.95)',
    '--header-border-color':         'transparent',
    '--header-border-width':         '0px',
    '--header-border-radius':        '12px',
    '--header-text-color':           'inherit',
    '--header-accent-color':         '#4aff9e',
    '--content-bg-computed':         'rgba(10, 10, 26, 0)',
    '--content-border-color':        'transparent',
    '--content-border-width':        '0px',
    '--content-border-radius':       '10px',
    '--cards-bg-computed':    'rgba(26, 26, 26, 0.95)',
    '--cards-border-color':   '#2a2a3a',
    '--cards-border-width':   '1px',
    '--cards-border-radius':  '12px',
    '--cards-text-color':     'inherit',
    '--cards-accent-color':   '#4aff9e',
  };

  // ---------------------------------------------------------------------------
  // Фото
  // ---------------------------------------------------------------------------
  const loadPhotos = useCallback(async (offset = 0, profileId) => {
    if (!profileId) return;
    setPhotosLoading(true);
    setPhotoError(null);
    try {
      const { data } = await axios.get(`/api/users/${profileId}/images`, {
        params: { limit: PHOTOS_LIMIT, offset },
      });
      if (offset === 0) setPhotos(data);
      else setPhotos(prev => [...prev, ...data]);
      setPhotosHasMore(data.length === PHOTOS_LIMIT);
      setPhotosLoaded(true);
    } catch (err) {
      setPhotoError('Не удалось загрузить фото');
      console.error(err);
    } finally {
      setPhotosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'photos' && profile?.id && !photosLoaded) {
      loadPhotos(0, profile.id);
    }
  }, [activeTab, profile?.id, photosLoaded, loadPhotos]);

  const handlePhotoFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPhotoError(null);

    const newEntries = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) continue;
      const isVideo    = file.type.startsWith('video/');
      const previewUrl = (file.type.startsWith('image/') || isVideo)
        ? URL.createObjectURL(file) : null;
      newEntries.push({ file, previewUrl, isVideo });
    }

    const combined  = [...selectedPhotoFiles, ...newEntries];
    const totalSize = combined.reduce((s, f) => s + f.file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      let acc = selectedPhotoFiles.reduce((s, f) => s + f.file.size, 0);
      const fitting = [];
      for (const entry of newEntries) {
        if (acc + entry.file.size <= MAX_TOTAL_SIZE) { fitting.push(entry); acc += entry.file.size; }
        else if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      }
      setSelectedPhotoFiles(prev => [...prev, ...fitting]);
      setPhotoError('Лимит 100 МБ: часть файлов не добавлена');
    } else {
      setSelectedPhotoFiles(combined);
    }
    if (photoFileInputRef.current) photoFileInputRef.current.value = '';
  };

  const removePhotoFile = (index) => {
    setSelectedPhotoFiles(prev => {
      const entry = prev[index];
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handlePhotoSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPhotoFiles.length) { setPhotoError('Выберите хотя бы один файл'); return; }
    setSubmitting(true);
    setPhotoError(null);
    try {
      const formData = new FormData();
      selectedPhotoFiles.forEach(({ file }) => formData.append('files[]', file));
      setUploadStatus('Загрузка...');

      const { data: uploadResult } = await axios.post('/api/upload', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const uploadedFiles = uploadResult.files || [uploadResult];
      setUploadStatus('Сохранение...');

      const { data: newAlbum } = await axios.post(
        '/api/images',
        { files: uploadedFiles, title: titleInput.trim() || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPhotos(prev => [newAlbum, ...prev]);
      selectedPhotoFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      setSelectedPhotoFiles([]);
      setTitleInput('');
    } catch (err) {
      setPhotoError(err.response?.data?.error || 'Ошибка при публикации');
    } finally {
      setSubmitting(false);
      setUploadStatus('');
    }
  };

  // Плоский список всех файлов профиля для навигации в ImageModal
  const allPhotoItems = useMemo(() =>
    photos.flatMap(album =>
      album.items.map(item => ({ ...item, author: album.author }))
    ),
    [photos]
  );

  const photoAlbumStartIndex = useMemo(() => {
    const map = {};
    let idx = 0;
    for (const album of photos) {
      map[album.albumId] = idx;
      idx += album.items.length;
    }
    return map;
  }, [photos]);

  const openPhotoModal = (album, itemIdx) => {
    const start = photoAlbumStartIndex[album.albumId] ?? 0;
    setPhotosModalIndex(start + itemIdx);
  };

  const handleAlbumDelete = async (album) => {
    const msg = album.count > 1
      ? `Удалить альбом (${album.count} файлов)?`
      : 'Удалить фото?';
    if (!window.confirm(msg)) return;
    try {
      await axios.delete(`/api/images/album/${album.albumId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPhotos(prev => prev.filter(a => a.albumId !== album.albumId));
      setPhotosModalIndex(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Ошибка при удалении');
    }
  };

  const handlePostSubmit = async (content, attachments) => {
    await createPost(content, attachments);
  };

  // ---------------------------------------------------------------------------
  // Render: игрок не найден
  // ---------------------------------------------------------------------------
  if (!player) {
    return (
      <main className="player-page" style={cssVars}>
        <div className="player-page__header">
          <div className="player-page__cover" />
          <div className="player-page__content-wrapper">
            <div className="player-page__info-row">
              <div className="player-page__avatar">
                <div style={{ width: '100%', height: '100%', background: '#333' }} />
              </div>
              <div className="player-page__info">
                <h1>Игрок {username} не найден</h1>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const avatarUrl = avatarError ? player.avatarFallbackUrl : player.avatarUrl;

  const copyUuid = async () => {
    try {
      await navigator.clipboard.writeText(player.uuid);
      setCopiedUuid(true);
      setTimeout(() => setCopiedUuid(false), 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  };

  const formatUuid = (uuid) => {
    if (!uuid) return 'Нет UUID';
    if (uuid.length === 32) {
      return `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
    }
    return uuid;
  };

  const lastSeenText = player.isOnline ? 'В игре' : timeAgo(player.lastSeen);

  const edgeMask = (edge) => {
    if (!edge) return {};
    const p = Math.round(edge * 0.4);
    const h = `linear-gradient(to right, transparent 0%, black ${p}%, black ${100 - p}%, transparent 100%)`;
    const v = `linear-gradient(to bottom, transparent 0%, black ${p}%, black ${100 - p}%, transparent 100%)`;
    return {
      WebkitMaskImage:     `${h}, ${v}`,
      maskImage:           `${h}, ${v}`,
      WebkitMaskComposite: 'destination-in',
      maskComposite:       'intersect',
    };
  };

  const coverInnerStyle = profile?.coverUrl ? {
    position:           'absolute',
    inset:              0,
    backgroundImage:    `url(${profile.coverUrl})`,
    backgroundPosition: `${profile.coverPosX ?? 50}% ${profile.coverPosY ?? 50}%`,
    backgroundSize:     `${profile.coverScale ?? 100}%`,
    backgroundRepeat:   'no-repeat',
    transform:          (profile.coverRotation ?? 0) !== 0 ? `rotate(${profile.coverRotation}deg)` : undefined,
    filter:             (profile.coverBlur ?? 0) > 0 ? `blur(${profile.coverBlur}px)` : undefined,
    ...edgeMask(profile.coverEdge ?? 0),
  } : null;

  const bgInnerStyle = profile?.backgroundUrl ? {
    position:           'absolute',
    inset:              0,
    backgroundImage:    `url(${profile.backgroundUrl})`,
    backgroundPosition: `${profile.bgPosX ?? 50}% ${profile.bgPosY ?? 50}%`,
    backgroundSize:     `${profile.bgScale ?? 100}%`,
    backgroundRepeat:   'no-repeat',
    transform:          (profile.bgRotation ?? 0) !== 0 ? `rotate(${profile.bgRotation}deg)` : undefined,
    filter:             (profile.bgBlur ?? 0) > 0 ? `blur(${profile.bgBlur}px)` : undefined,
    ...edgeMask(profile.bgEdge ?? 0),
  } : null;

  return (
    <main className="player-page" style={cssVars}>

      {/* Фон всей страницы */}
      {!profileLoading && (profile?.backgroundUrl || profile?.bgFillColor) && (
        <div
          className={`player-page__bg-layer${profile?.backgroundUrl ? ' player-page__bg-layer--image' : ''}`}
          style={profile.bgFillColor ? { backgroundColor: profile.bgFillColor } : undefined}
        >
          {bgInnerStyle && <div style={bgInnerStyle} />}
        </div>
      )}

      <div className="player-page__header">
        <div
          className="player-page__cover"
          style={profile?.coverFillColor ? { background: profile.coverFillColor } : undefined}
        >
          {coverInnerStyle && <div style={coverInnerStyle} />}
        </div>

        <div className="player-page__content-wrapper">
          {/* Кнопка редактирования — только владелец */}
          {isOwner && (
            <Link to="/dashboard/profile" className="player-page__edit-btn">
              Редактировать профиль
            </Link>
          )}

          {/* Кнопка «Написать» — авторизованный пользователь на чужом профиле с аккаунтом */}
          {!isOwner && user && profile && (
            <button
              className="player-page__msg-btn"
              onClick={() => navigate(`/messages?user=${username}`)}
              type="button"
            >
              Написать
            </button>
          )}
          <div className="player-page__info-row">
            <div className="player-page__avatar">
              <img
                src={avatarUrl}
                alt={player.name}
                onError={() => setAvatarError(true)}
              />
            </div>

            <div className="player-page__info">
              <div className="player-page__name-row">
                <h1>{player.name}</h1>
              </div>

              {!profileLoading && profile?.bio && (
                <p className="player-page__bio">{profile.bio}</p>
              )}

              <div className="player-page__meta">
                <div className={`player-page__status ${player.isOnline ? 'player-page__status--online' : 'player-page__status--ofline'}`}>
                  <span className={`player-page__status-dot ${player.isOnline ? 'player-page__status-dot--online' : 'player-page__status-dot--offline'}`} />
                  <span>{lastSeenText}</span>
                </div>
                <div className="player-page__meta-item">
                  <span className="player-page__meta-item-icon">📅</span>
                  <span className="player-page__meta-item-value">
                    {new Date(player.lastSeen).toLocaleDateString()}
                  </span>
                </div>
                <div className="player-page__meta-item">
                  <span className="player-page__meta-item-icon">🕐</span>
                  <span className="player-page__meta-item-value">
                    {new Date(player.lastSeen).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              <div
                className="player-page__uuid"
                onClick={copyUuid}
                title="Нажмите, чтобы скопировать UUID"
              >
                {copiedUuid ? 'UUID скопирован!' : formatUuid(player.uuid)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Контент вкладки (полная ширина) */}
      <div className="player-page__content">

        {/* Вкладки — внутри контента, центрированы */}
        <div className="player-page__tabs">
          <button
            className={`player-page__tab ${activeTab === 'posts' ? 'player-page__tab--active' : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            Посты
          </button>
          <button
            className={`player-page__tab ${activeTab === 'photos' ? 'player-page__tab--active' : ''}`}
            onClick={() => setActiveTab('photos')}
          >
            Фото
          </button>
          {!profileLoading && profile && (
            <button
              className={`player-page__tab ${activeTab === 'comments' ? 'player-page__tab--active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              Комментарии
            </button>
          )}
        </div>

        {/* Вкладка «Посты» — центрированный контент */}
        {activeTab === 'posts' && (
          <div className="player-page__content-inner">
            <div className="player-page__posts">
              {isOwner && <PostForm onSubmit={handlePostSubmit} />}

              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLike={toggleLike}
                  onDelete={deletePost}
                  cssVars={cssVars}
                />
              ))}

              {postsLoading && (
                <div className="player-page__posts-loading">
                  <span className="player-page__posts-spinner" />
                  Загрузка...
                </div>
              )}

              {!postsLoading && hasMore && posts.length > 0 && (
                <button className="player-page__posts-more" onClick={loadMore}>
                  Показать ещё
                </button>
              )}

              {!postsLoading && !profileLoading && !profile && (
                <div className="player-page__posts-empty">
                  У этого игрока нет привязанного аккаунта.
                </div>
              )}

              {!postsLoading && !profileLoading && profile && posts.length === 0 && (
                <div className="player-page__posts-empty">
                  {isOwner
                    ? 'У вас пока нет публикаций. Напишите что-нибудь!'
                    : 'У этого игрока пока нет публикаций.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Вкладка «Фото» */}
        {activeTab === 'photos' && (
          <div className="player-page__photos">
            {isOwner && (
              <form className="player-page__photo-form" onSubmit={handlePhotoSubmit}>
                <input
                  ref={photoFileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handlePhotoFilesChange}
                  className="player-page__photo-file-input"
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="player-page__photo-pick"
                  onClick={() => photoFileInputRef.current?.click()}
                  disabled={submitting}
                >
                  + Добавить медиа
                </button>

                {selectedPhotoFiles.length > 0 && (
                  <div className="player-page__photo-previews">
                    {selectedPhotoFiles.map((entry, i) => (
                      <div key={i} className="player-page__photo-preview-item">
                        {entry.isVideo ? (
                          <div className="player-page__photo-preview-video">
                            <video src={entry.previewUrl} muted playsInline preload="metadata" />
                            <span className="player-page__photo-preview-play">▶</span>
                          </div>
                        ) : entry.previewUrl ? (
                          <img src={entry.previewUrl} alt={entry.file.name} />
                        ) : (
                          <div className="player-page__photo-preview-file">📄</div>
                        )}
                        <button
                          type="button"
                          className="player-page__photo-preview-remove"
                          onClick={() => removePhotoFile(i)}
                          disabled={submitting}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedPhotoFiles.length > 0 && (
                  <>
                    <input
                      type="text"
                      className="player-page__photo-title"
                      placeholder="Название (необязательно)"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      maxLength={200}
                      disabled={submitting}
                    />
                    <button
                      type="submit"
                      className="player-page__photo-submit"
                      disabled={submitting}
                    >
                      {submitting ? (uploadStatus || 'Загрузка...') : 'Опубликовать'}
                    </button>
                  </>
                )}
                {photoError && <p className="player-page__photo-error">{photoError}</p>}
              </form>
            )}

            {photos.length > 0 && (
              <div className="player-page__photo-grid">
                {photos.map((album) => (
                  <GalleryAlbum
                    key={album.albumId}
                    album={album}
                    onClick={(idx) => openPhotoModal(album, idx)}
                    canDelete={isOwner || user?.role === 'admin'}
                    onDelete={() => handleAlbumDelete(album)}
                  />
                ))}
              </div>
            )}

            {photosLoading && (
              <div className="player-page__posts-loading">
                <span className="player-page__posts-spinner" />
                Загрузка...
              </div>
            )}

            {!photosLoading && photosHasMore && photos.length > 0 && (
              <button
                className="player-page__posts-more"
                onClick={() => loadPhotos(photos.length, profile.id)}
              >
                Показать ещё
              </button>
            )}

            {!photosLoading && photosLoaded && photos.length === 0 && (
              <div className="player-page__posts-empty">
                {isOwner
                  ? 'У вас пока нет фотографий. Добавьте первое фото!'
                  : 'У этого игрока пока нет фотографий.'}
              </div>
            )}
          </div>
        )}

        {/* Вкладка «Комментарии» — центрированный контент */}
        {activeTab === 'comments' && profile && (
          <div className="player-page__content-inner">
            <div className="player-page__comments-card">
              <CommentSection
                type="profile"
                id={profile.id}
                autoLoad={true}
              />
            </div>
          </div>
        )}

      </div>

      {/* ImageModal: навигация по всем фото профиля + комментарии */}
      {photosModalIndex !== null && (
        <ImageModal
          images={allPhotoItems}
          initialIndex={photosModalIndex}
          onClose={() => setPhotosModalIndex(null)}
          cssVars={cssVars}
        />
      )}
    </main>
  );
}

export default PlayerPage;
