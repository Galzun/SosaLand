// pages/PlayerPage/PlayerPage.jsx
// Страница профиля игрока: /player/:username

import { useParams, Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { usePlayerByName, usePlayerByUUID } from '../../context/PlayerContext';
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
import { showConfirm, showAlert } from '../../Components/Dialog/dialogManager';
import './PlayerPage.scss';

function hexToRgba(hex, alpha = 1) {
  const h = (hex || '#4aff9e').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


// Парсим дату/время из имени файла формата "2026-02-10_20.20.19.png"
function parseDateFromFilename(title) {
  if (!title) return null;
  const m = title.match(/(\d{4}-\d{2}-\d{2})_(\d{2})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}`).getTime();
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

const PHOTOS_LIMIT = 30;

function PlayerPage() {
  const { username } = useParams();

  const playerByName = usePlayerByName(username);
  const { user, token } = useAuth();

  const [profile,        setProfile]        = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [avatarError,    setAvatarError]    = useState(false);
  const [copiedUuid,     setCopiedUuid]     = useState(false);

  // --- Кастомные роли ---
  const [customRoles,        setCustomRoles]        = useState([]);  // роли этого профиля
  const [allRoles,           setAllRoles]           = useState(null); // все роли (загружаются по требованию)
  const [showRoleDropdown,   setShowRoleDropdown]   = useState(false);
  const [roleAssigning,      setRoleAssigning]      = useState(false);
  const roleDropdownRef = useRef(null);

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
  const [showPhotoForm,      setShowPhotoForm]      = useState(false);
  const [alsoSaveToGallery,  setAlsoSaveToGallery]  = useState(false);
  // Индекс в плоском списке всех фото для ImageModal
  const [photosModalIndex, setPhotosModalIndex] = useState(null);
  const photoFileInputRef = useRef(null);

  // --- Состояние вкладки «Альбомы» ---
  const [userAlbums,         setUserAlbums]         = useState([]);
  const [albumsLoading,      setAlbumsLoading]      = useState(false);
  const [albumsLoaded,       setAlbumsLoaded]       = useState(false);
  const [currentAlbum,       setCurrentAlbum]       = useState(null);   // { id, name, count, coverUrl }
  const [albumImages,        setAlbumImages]        = useState([]);
  const [albumImagesLoading, setAlbumImagesLoading] = useState(false);
  const [albumSort,          setAlbumSort]          = useState('filename-desc');
  const [albumModalIndex,    setAlbumModalIndex]    = useState(null);
  const [showCreateAlbum,    setShowCreateAlbum]    = useState(false);
  const [newAlbumName,       setNewAlbumName]       = useState('');
  const [albumCreating,      setAlbumCreating]      = useState(false);
  const [albumCreateError,   setAlbumCreateError]   = useState(null);
  const [editingAlbumName,   setEditingAlbumName]   = useState(false);
  const [albumNameEdit,      setAlbumNameEdit]      = useState('');

  // --- Меню удаления аккаунта ---
  const [showDeleteMenu,     setShowDeleteMenu]     = useState(false);
  const [deleteCountdown,    setDeleteCountdown]    = useState(5);
  const [deleteReady,        setDeleteReady]        = useState(false);
  const [menuPos,            setMenuPos]            = useState({ top: 0, right: 0 });
  const [showClearOptions,   setShowClearOptions]   = useState(false);
  const [clearSections,      setClearSections]      = useState({ posts: true, images: true, profile: true, chats: true });
  const deleteMenuRef   = useRef(null);
  const deleteButtonRef = useRef(null);

  // Форма загрузки внутри альбома
  const [showAlbumUpload,    setShowAlbumUpload]    = useState(false);
  const [albumUploadFiles,   setAlbumUploadFiles]   = useState([]);
  const [albumUploadTitle,   setAlbumUploadTitle]   = useState('');
  const [albumUploadError,   setAlbumUploadError]   = useState(null);
  const [albumUploadStatus,  setAlbumUploadStatus]  = useState('');
  const [albumSubmitting,    setAlbumSubmitting]    = useState(false);
  const [albumAlsoGallery,   setAlbumAlsoGallery]   = useState(true);
  const [albumShowInProfile, setAlbumShowInProfile] = useState(true);
  const albumFileInputRef = useRef(null);

  // Сбрасываем позицию скролла и состояние вкладок при переходе на другой профиль
  useEffect(() => {
    window.scrollTo(0, 0);
    setCustomRoles([]);
    setAllRoles(null);
    setShowRoleDropdown(false);
    setPhotosLoaded(false);
    setPhotos([]);
    setAlbumsLoaded(false);
    setUserAlbums([]);
    setCurrentAlbum(null);
    setAlbumImages([]);
    setShowDeleteMenu(false);
    setShowClearOptions(false);
  }, [username]);

  // Обратный отсчёт при открытии меню удаления
  useEffect(() => {
    if (!showDeleteMenu) {
      setDeleteCountdown(5);
      setDeleteReady(false);
      return;
    }
    // Вычисляем позицию для портала (fixed)
    if (deleteButtonRef.current) {
      const rect = deleteButtonRef.current.getBoundingClientRect();
      setMenuPos({
        top:   rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setDeleteCountdown(5);
    setDeleteReady(false);
    const interval = setInterval(() => {
      setDeleteCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setDeleteReady(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showDeleteMenu]);

  // Закрытие меню при клике вне (исключаем кнопку и само меню)
  useEffect(() => {
    if (!showDeleteMenu) return;
    const handleClickOutside = (e) => {
      const inMenu   = deleteMenuRef.current?.contains(e.target);
      const inButton = deleteButtonRef.current?.contains(e.target);
      if (!inMenu && !inButton) { setShowDeleteMenu(false); setShowClearOptions(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDeleteMenu]);

  useEffect(() => {
    if (!username) return;
    setProfileLoading(true);
    setCustomRoles([]);
    axios.get(`/api/users/by-minecraft/${username}`)
      .then(({ data }) => {
        setProfile(data);
        setCustomRoles(data.customRoles || []);
      })
      .catch((err) => {
        if (err.response?.status !== 404) {
          console.error('Ошибка загрузки профиля:', err.message);
        }
        setProfile(null);
      })
      .finally(() => setProfileLoading(false));
  }, [username]);

  // Закрытие дропдауна ролей при клике вне
  useEffect(() => {
    if (!showRoleDropdown) return;
    const handle = (e) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target)) {
        setShowRoleDropdown(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showRoleDropdown]);

  // Загрузка всех ролей при открытии дропдауна
  const loadAllRoles = useCallback(async () => {
    if (allRoles !== null) return;
    try {
      const { data } = await axios.get('/api/roles');
      setAllRoles(data);
    } catch { setAllRoles([]); }
  }, [allRoles]);

  const handleAssignRole = async (role) => {
    if (!profile || roleAssigning) return;
    setRoleAssigning(true);
    try {
      await axios.post(`/api/roles/${role.id}/users`, { userId: profile.id }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomRoles(prev => [...prev, { id: role.id, name: role.name, color: role.color }]);
      setShowRoleDropdown(false);
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка назначения роли');
    } finally {
      setRoleAssigning(false);
    }
  };

  const handleRevokeRole = async (role) => {
    if (!profile) return;
    const ok = await showConfirm(`Забрать роль «${role.name}» у ${profile.username}?`, { danger: true, confirmText: 'Забрать' });
    if (!ok) return;
    try {
      await axios.delete(`/api/roles/${role.id}/users/${profile.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomRoles(prev => prev.filter(r => r.id !== role.id));
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка');
    }
  };

  const {
    posts,
    loading: postsLoading,
    hasMore,
    loadMore,
    createPost,
    editPost,
    toggleLike,
    deletePost,
    patchPost,
  } = usePosts({
    userId: profile?.id ?? null,
    // Не загружаем пока профиль грузится, и не грузим глобальную ленту если аккаунта нет
    disabled: profileLoading || !profile,
  });

  // Поиск по UUID — работает когда logин аккаунта ≠ нику Minecraft
  const playerByUUID = usePlayerByUUID(profile?.minecraftUuid);

  // Синтетический фоллбэк: если игрок не в контексте, но аккаунт есть
  const syntheticPlayer = useMemo(() => {
    if (!profile) return null;
    const uuid = profile.minecraftUuid;
    const displayUuid = uuid?.startsWith('offline:') ? null : uuid;
    return {
      name:              username,
      uuid:              displayUuid,
      rawUuid:           uuid,
      avatarUrl:         displayUuid
        ? `https://crafatar.icehost.xyz/avatars/${displayUuid}?overlay`
        : `https://api.dicebear.com/9.x/initials/svg?scale=80&backgroundColor[]&fontWeight=600&seed=${username}`,
      avatarFallbackUrl: `https://api.dicebear.com/9.x/initials/svg?scale=80&backgroundColor[]&fontWeight=600&seed=${username}`,
      isOnline:          false,
      lastSeen:          null,
      isBanned:          profile.isBanned,
      banReason:         profile.banReason,
      profileUrl:        `/player/${username}`,
      statusText:        '⚫ Был(а) недавно',
    };
  }, [profile, username]);

  const player = playerByName ?? playerByUUID ?? syntheticPlayer;

  const navigate = useNavigate();
  const isOwner = user && profile && user.id === profile.id;

  const callerLevel = user ? ({ user: 1, editor: 2, admin: 3, creator: 4 }[user.role] ?? 0) : 0;
  const profileLevel = profile ? ({ user: 1, editor: 2, admin: 3, creator: 4 }[profile.role] ?? 0) : 0;
  const perms = user?.customPermissions ?? [];
  const canManageAccounts = callerLevel >= 3 || perms.includes('manage_user_accounts');
  // manage_user_accounts может управлять только теми, чья роль ниже admin
  const canDeleteProfile = user && profile && !isOwner && canManageAccounts &&
    (callerLevel > profileLevel || (perms.includes('manage_user_accounts') && profileLevel < 3));
  const canDeleteMedia   = isOwner || callerLevel >= 3 || perms.includes('moderate_content');
  const canAssignRoles   = callerLevel >= 3 || perms.includes('assign_custom_roles') || perms.includes('manage_custom_roles');

  const handleClearData = async () => {
    const selected = Object.entries(clearSections).filter(([, v]) => v).map(([k]) => k);
    if (selected.length === 0) {
      await showAlert('Выберите хотя бы один раздел для очистки.');
      return;
    }
    const labels = { posts: 'посты', images: 'фото/альбомы', profile: 'настройки профиля', chats: 'переписку' };
    const listStr = selected.map(s => labels[s]).join(', ');
    const ok = await showConfirm(
      `Очистить у "${profile.username}": ${listStr}? Сам аккаунт останется.`,
      { confirmText: 'Очистить', danger: true }
    );
    if (!ok) return;
    try {
      await axios.post(`/api/users/${profile.id}/clear-data`, { sections: selected }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowDeleteMenu(false);
      setShowClearOptions(false);
      await showAlert('Данные аккаунта успешно очищены.');
      if (clearSections.profile) {
        setProfile(prev => prev ? { ...prev, coverUrl: null, backgroundUrl: null, bio: null } : null);
      }
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка при очистке данных.');
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await showConfirm(
      `Полностью удалить аккаунт "${profile.username}"? Это действие необратимо — аккаунт и все его данные исчезнут навсегда.`,
      { confirmText: 'Удалить', danger: true }
    );
    if (!ok) return;
    try {
      await axios.delete(`/api/users/${profile.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowDeleteMenu(false);
      await showAlert('Аккаунт успешно удалён.');
      navigate('/');
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка при удалении аккаунта.');
    }
  };

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
    '--header-font-weight':          profile.contentWrapperFontWeight ?? 400,
    '--header-accent-color':         headerAccent,
    '--cover-container-width':       `${profile.coverContainerWidth ?? 100}%`,
    '--cover-aspect-w':              profile.coverAspectW ?? 4,
    '--cover-aspect-h':              profile.coverAspectH ?? 1,
    '--bio-color':                   profile.bioColor || 'var(--header-text-muted, #ccc)',
    '--bio-font-size':               `${profile.bioFontSize ?? 14}px`,
    '--bio-font-weight':             profile.bioFontWeight ?? 400,
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
    '--cards-font-weight':   profile.postCardFontWeight  ?? 400,
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

  const totalPhotoSize = selectedPhotoFiles.reduce((s, f) => s + f.file.size, 0);

  const resetPhotoForm = () => {
    selectedPhotoFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setSelectedPhotoFiles([]);
    setTitleInput('');
    setPhotoError(null);
    setUploadStatus('');
    setShowPhotoForm(false);
    setAlsoSaveToGallery(false);
  };

  const handlePhotoFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPhotoError(null);

    const newEntries = [];
    for (const file of files) {
      const isVideo    = file.type.startsWith('video/');
      const previewUrl = (file.type.startsWith('image/') || isVideo)
        ? URL.createObjectURL(file) : null;
      newEntries.push({ file, previewUrl, isVideo });
    }
    setSelectedPhotoFiles(prev => [...prev, ...newEntries]);
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
        onUploadProgress: (ev) => {
          if (ev.total) {
            setUploadStatus(`Загрузка ${Math.round((ev.loaded / ev.total) * 100)}%...`);
          }
        },
      });

      const uploadedFiles = uploadResult.files || [uploadResult];
      setUploadStatus('Сохранение...');

      const { data: newAlbum } = await axios.post(
        '/api/images',
        {
          files:     uploadedFiles,
          title:     titleInput.trim() || undefined,
          isGallery: alsoSaveToGallery,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPhotos(prev => [newAlbum, ...prev]);
      resetPhotoForm();
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

  const photoAlbumRanges = useMemo(() => {
    let idx = 0;
    return photos.map(album => {
      const range = { startIndex: idx, items: album.items };
      idx += album.items.length;
      return range;
    });
  }, [photos]);

  const openPhotoModal = (album, itemIdx) => {
    const start = photoAlbumStartIndex[album.albumId] ?? 0;
    setPhotosModalIndex(start + itemIdx);
  };

  const handleAlbumDelete = async (album) => {
    const msg = album.count > 1
      ? `Убрать ${album.count} файлов из профиля?`
      : 'Убрать фото из профиля?';
    if (!(await showConfirm(msg))) return;
    try {
      await axios.delete(`/api/images/group/${album.albumId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPhotos(prev => prev.filter(a => a.albumId !== album.albumId));
      setPhotosModalIndex(null);
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка при удалении');
    }
  };

  const handlePostSubmit = async (content, attachments) => {
    return await createPost(content, attachments);
  };

  // ---------------------------------------------------------------------------
  // Альбомы
  // ---------------------------------------------------------------------------
  const loadAlbums = useCallback(async (profileId) => {
    if (!profileId) return;
    setAlbumsLoading(true);
    try {
      const { data } = await axios.get('/api/albums', { params: { userId: profileId } });
      setUserAlbums(data);
      setAlbumsLoaded(true);
    } catch (err) {
      console.error('Ошибка загрузки альбомов:', err.message);
    } finally {
      setAlbumsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'albums' && profile?.id && !albumsLoaded) {
      loadAlbums(profile.id);
    }
  }, [activeTab, profile?.id, albumsLoaded, loadAlbums]);

  const loadAlbumImages = useCallback(async (albumId) => {
    setAlbumImagesLoading(true);
    try {
      const { data } = await axios.get(`/api/albums/${albumId}/images`);
      setAlbumImages(data);
    } catch (err) {
      console.error('Ошибка загрузки фото альбома:', err.message);
    } finally {
      setAlbumImagesLoading(false);
    }
  }, []);

  const openAlbum = (album) => {
    setCurrentAlbum(album);
    setAlbumImages([]);
    setAlbumModalIndex(null);
    resetAlbumUploadForm();
    loadAlbumImages(album.id);
  };

  const handleCreateAlbum = async (e) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;
    setAlbumCreating(true);
    setAlbumCreateError(null);
    try {
      const { data } = await axios.post('/api/albums', { name: newAlbumName.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserAlbums(prev => [data, ...prev]);
      setNewAlbumName('');
      setShowCreateAlbum(false);
    } catch (err) {
      setAlbumCreateError(err.response?.data?.error || 'Ошибка при создании');
    } finally {
      setAlbumCreating(false);
    }
  };

  const handleDeleteAlbum = async (album) => {
    if (!(await showConfirm(`Удалить альбом «${album.name}»? Все фотографии в нём будут удалены с диска.`))) return;
    try {
      await axios.delete(`/api/albums/${album.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserAlbums(prev => prev.filter(a => a.id !== album.id));
      // Убираем фото альбома из вкладки «Фото» и альбомного ImageModal
      if (albumImages.length > 0) {
        const deletedIds = new Set(albumImages.map(img => img.id));
        setPhotos(prev => prev
          .map(a => ({ ...a, items: a.items.filter(item => !deletedIds.has(item.id)) }))
          .filter(a => a.items.length > 0)
        );
      }
      setCurrentAlbum(null);
      setAlbumImages([]);
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка при удалении альбома');
    }
  };

  const handleSaveAlbumName = async () => {
    const trimmed = albumNameEdit.trim();
    if (!trimmed || trimmed === currentAlbum.name) { setEditingAlbumName(false); return; }
    try {
      await axios.put(`/api/albums/${currentAlbum.id}`, { name: trimmed }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCurrentAlbum(prev => ({ ...prev, name: trimmed }));
      setUserAlbums(prev => prev.map(a => a.id === currentAlbum.id ? { ...a, name: trimmed } : a));
    } catch (err) {
      console.error(err);
    } finally {
      setEditingAlbumName(false);
    }
  };

  const deleteFromAlbum = async (imageId) => {
    await axios.delete(`/api/albums/${currentAlbum.id}/images/${imageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setAlbumImages(prev => prev.filter(img => img.id !== imageId));
    setPhotos(prev => prev
      .map(album => ({ ...album, items: album.items.filter(item => item.id !== imageId) }))
      .filter(album => album.items.length > 0)
    );
    const newCount = Math.max(0, currentAlbum.count - 1);
    setCurrentAlbum(prev => ({ ...prev, count: newCount }));
    setUserAlbums(prev => prev.map(a => a.id === currentAlbum.id ? { ...a, count: newCount } : a));
  };

  const handleRemoveFromAlbum = async (imageId) => {
    if (!(await showConfirm('Удалить это медиа? Оно будет удалено из альбома, вкладки «Фото» и с диска.'))) return;
    try {
      await deleteFromAlbum(imageId);
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка при удалении');
    }
  };

  const totalAlbumUploadSize = albumUploadFiles.reduce((s, f) => s + f.file.size, 0);

  const handleAlbumFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setAlbumUploadError(null);
    const newEntries = [];
    for (const file of files) {
      const isVideo    = file.type.startsWith('video/');
      const previewUrl = (file.type.startsWith('image/') || isVideo) ? URL.createObjectURL(file) : null;
      newEntries.push({ file, previewUrl, isVideo });
    }
    setAlbumUploadFiles(prev => [...prev, ...newEntries]);
    if (albumFileInputRef.current) albumFileInputRef.current.value = '';
  };

  const removeAlbumFile = (index) => {
    setAlbumUploadFiles(prev => {
      const entry = prev[index];
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const resetAlbumUploadForm = () => {
    albumUploadFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setAlbumUploadFiles([]);
    setAlbumUploadTitle('');
    setAlbumUploadError(null);
    setAlbumUploadStatus('');
    setShowAlbumUpload(false);
    setAlbumAlsoGallery(true);
    setAlbumShowInProfile(true);
  };

  const handleAlbumUploadSubmit = async (e) => {
    e.preventDefault();
    if (!albumUploadFiles.length) { setAlbumUploadError('Выберите хотя бы один файл'); return; }
    setAlbumSubmitting(true);
    setAlbumUploadError(null);
    try {
      // 1. Загружаем файлы на сервер
      const formData = new FormData();
      albumUploadFiles.forEach(({ file }) => formData.append('files[]', file));
      setAlbumUploadStatus('Загрузка...');
      const { data: uploadResult } = await axios.post('/api/upload', formData, {
        headers: { Authorization: `Bearer ${token}` },
        onUploadProgress: (ev) => {
          if (ev.total) {
            setAlbumUploadStatus(`Загрузка ${Math.round((ev.loaded / ev.total) * 100)}%...`);
          }
        },
      });
      const uploadedFiles = uploadResult.files || [uploadResult];
      setAlbumUploadStatus('Сохранение...');

      // 2. Сохраняем в images.
      //    showInProfile=false → не попадут во вкладку «Фото», только в альбом.
      const { data: newGroup } = await axios.post(
        '/api/images',
        { files: uploadedFiles, title: albumUploadTitle.trim() || undefined, isGallery: albumAlsoGallery, showInProfile: albumShowInProfile },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (photosLoaded) setPhotos(prev => [newGroup, ...prev]);


      // 3. Привязываем каждый файл к альбому
      const savedImageIds = (newGroup.items || []).map(item => item.id);
      if (savedImageIds.length > 0) {
        await axios.post(
          `/api/albums/${currentAlbum.id}/images`,
          { imageIds: savedImageIds },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      // 4. Обновляем локальный стейт альбома
      await loadAlbumImages(currentAlbum.id);
      const newCount = currentAlbum.count + savedImageIds.length;
      const newCover = currentAlbum.coverUrl || newGroup.items?.[0]?.imageUrl || null;
      setCurrentAlbum(prev => ({ ...prev, count: newCount, coverUrl: newCover }));
      setUserAlbums(prev => prev.map(a =>
        a.id === currentAlbum.id ? { ...a, count: newCount, coverUrl: a.coverUrl || newCover } : a
      ));

      resetAlbumUploadForm();
    } catch (err) {
      setAlbumUploadError(err.response?.data?.error || 'Ошибка при загрузке');
    } finally {
      setAlbumSubmitting(false);
      setAlbumUploadStatus('');
    }
  };

  const sortedAlbumImages = useMemo(() => {
    if (!albumImages.length) return albumImages;
    const arr = [...albumImages];
    const byFilename = (a, b) => {
      const da = parseDateFromFilename(a.title);
      const db = parseDateFromFilename(b.title);
      if (da !== null && db !== null) return da - db;
      if (da !== null) return -1;
      if (db !== null) return 1;
      return a.createdAt - b.createdAt;
    };
    switch (albumSort) {
      case 'filename-asc':  return arr.sort(byFilename);
      case 'filename-desc': return arr.sort((a, b) => -byFilename(a, b));
      case 'added-asc':     return arr.sort((a, b) => a.createdAt - b.createdAt);
      case 'added-desc':    return arr.sort((a, b) => b.createdAt - a.createdAt);
      default:              return arr;
    }
  }, [albumImages, albumSort]);

  const albumModalRanges = [{ startIndex: 0, items: sortedAlbumImages }];

  // ---------------------------------------------------------------------------
  // Render: игрок не найден / ещё загружается
  // ---------------------------------------------------------------------------
  if (!player) {
    // Профиль ещё грузится — могут быть расхождения логин ≠ minecraft-ник
    if (profileLoading) return null;
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

  const lastSeenText = player.isOnline ? 'В игре' : (player.lastSeen ? timeAgo(player.lastSeen) : 'Нет данных');

  const edgeMask = (edgeH, edgeV) => {
    if (!edgeH && !edgeV) return {};
    const pH = edgeH ? Math.round(edgeH * 0.4) : 0;
    const pV = edgeV ? Math.round(edgeV * 0.4) : 0;
    const h = pH > 0 ? `linear-gradient(to right, transparent 0%, black ${pH}%, black ${100 - pH}%, transparent 100%)` : null;
    const v = pV > 0 ? `linear-gradient(to bottom, transparent 0%, black ${pV}%, black ${100 - pV}%, transparent 100%)` : null;
    const maskValue = h && v ? `${h}, ${v}` : (h || v);
    return {
      WebkitMaskImage:     maskValue,
      maskImage:           maskValue,
      ...(h && v ? { WebkitMaskComposite: 'destination-in', maskComposite: 'intersect' } : {}),
    };
  };

  const coverScale = profile?.coverScale ?? 100;
  // position/inset/background-repeat/background-size(cover) — в .player-page__cover-inner (SCSS).
  // Здесь только динамические значения; backgroundSize задаётся только когда scale ≠ 100,
  // иначе SCSS-дефолт 'cover' гарантирует заполнение контейнера без пустых полос.
  const coverInnerStyle = profile?.coverUrl ? {
    backgroundImage:    `url(${profile.coverUrl})`,
    backgroundPosition: `${profile.coverPosX ?? 50}% ${profile.coverPosY ?? 50}%`,
    ...(coverScale !== 100 ? { backgroundSize: `${coverScale}%` } : {}),
    ...(((profile.coverRotation ?? 0) !== 0) ? { transform: `rotate(${profile.coverRotation}deg)` } : {}),
    ...((profile.coverBlur ?? 0) > 0 ? { filter: `blur(${profile.coverBlur}px)` } : {}),
    ...edgeMask(profile.coverEdgeH ?? 0, profile.coverEdgeV ?? 0),
  } : null;

  const bgScale = profile?.bgScale ?? 100;
  // position/inset/background-repeat/background-size(cover) — в .player-page__bg-inner (SCSS).
  const bgInnerStyle = profile?.backgroundUrl ? {
    backgroundImage:    `url(${profile.backgroundUrl})`,
    backgroundPosition: `${profile.bgPosX ?? 50}% ${profile.bgPosY ?? 50}%`,
    ...(bgScale !== 100 ? { backgroundSize: `${bgScale}%` } : {}),
    ...(((profile.bgRotation ?? 0) !== 0) ? { transform: `rotate(${profile.bgRotation}deg)` } : {}),
    ...((profile.bgBlur ?? 0) > 0 ? { filter: `blur(${profile.bgBlur}px)` } : {}),
    ...edgeMask(profile.bgEdgeH ?? 0, profile.bgEdgeV ?? 0),
  } : null;

  return (
    <>
    <main className="player-page" style={cssVars}>

      {/* Фон всей страницы */}
      {!profileLoading && (profile?.backgroundUrl || profile?.bgFillColor) && (
        <div
          className={`player-page__bg-layer${profile?.backgroundUrl ? ' player-page__bg-layer--image' : ''}`}
          style={profile.bgFillColor ? { backgroundColor: profile.bgFillColor } : undefined}
        >
          {bgInnerStyle && <div className="player-page__bg-inner" style={bgInnerStyle} />}
        </div>
      )}

      <div className="player-page__header">
        <div
          className="player-page__cover"
          style={profile?.coverFillColor ? { background: profile.coverFillColor } : undefined}
        >
          {coverInnerStyle && <div className="player-page__cover-inner" style={coverInnerStyle} />}
        </div>

        <div className="player-page__content-wrapper">
          {/* Кнопка редактирования — только владелец */}
          {isOwner && (
            <Link to="/dashboard/profile" className="player-page__edit-btn">
              Редактировать профиль
            </Link>
          )}

          {/* Кнопки в правом верхнем углу */}
          {!isOwner && (user || canDeleteProfile) && (
            <div className="player-page__top-actions">
              {user && profile && (
                <button
                  className="player-page__msg-btn"
                  onClick={() => navigate(`/messages?user=${username}`)}
                  type="button"
                >
                  Написать
                </button>
              )}
              {canDeleteProfile && (
                <button
                  ref={deleteButtonRef}
                  className={`player-page__delete-btn${showDeleteMenu ? ' player-page__delete-btn--active' : ''}`}
                  onClick={() => setShowDeleteMenu(v => !v)}
                  type="button"
                >
                  {showDeleteMenu ? '✕' : 'Удалить'}
                </button>
              )}
            </div>
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

              {/* Кастомные роли */}
              {!profileLoading && profile && (customRoles.length > 0 || canAssignRoles) && (() => {
                return (
                <div className="player-page__roles-row">
                  {/* Роли */}
                  {customRoles.map(role => (
                    <span
                      key={role.id}
                      className="player-page__role-badge"
                      style={{
                        color:       role.color,
                        background:  hexToRgba(role.color, 0.12),
                        borderColor: hexToRgba(role.color, 0.35),
                      }}
                    >
                      {role.name}
                      {canAssignRoles && (
                        <button
                          className="player-page__role-badge-remove"
                          onClick={() => handleRevokeRole(role)}
                          title="Забрать роль"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}

                  {/* Кнопка + для назначения роли */}
                  {canAssignRoles && (
                    <div className="player-page__role-add" ref={roleDropdownRef}>
                      <button
                        className="player-page__role-add-btn"
                        onClick={() => { setShowRoleDropdown(p => !p); loadAllRoles(); }}
                        title="Добавить роль"
                      >
                        +
                      </button>
                      {showRoleDropdown && (
                        <div className="player-page__role-dropdown">
                          {allRoles === null && <div className="player-page__role-dropdown-loading">Загрузка...</div>}
                          {allRoles !== null && allRoles.filter(r => !customRoles.find(c => c.id === r.id)).length === 0 && (
                            <div className="player-page__role-dropdown-empty">Все роли уже назначены</div>
                          )}
                          {allRoles !== null && allRoles
                            .filter(r => !customRoles.find(c => c.id === r.id))
                            .map(role => (
                              <button
                                key={role.id}
                                className="player-page__role-dropdown-item"
                                onClick={() => handleAssignRole(role)}
                                disabled={roleAssigning}
                              >
                                <span
                                  className="player-page__role-dropdown-dot"
                                  style={{ background: role.color, boxShadow: `0 0 6px ${hexToRgba(role.color, 0.5)}` }}
                                />
                                <span style={{ color: role.color }}>{role.name}</span>
                              </button>
                            ))
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}

              {!profileLoading && profile?.bio && (
                <p className="player-page__bio">{profile.bio}</p>
              )}

              <div className="player-page__meta">
                <div className={`player-page__status ${player.isOnline ? 'player-page__status--online' : 'player-page__status--ofline'}`}>
                  <span className={`player-page__status-dot ${player.isOnline ? 'player-page__status-dot--online' : 'player-page__status-dot--offline'}`} />
                  <span>{lastSeenText}</span>
                </div>
                {player.lastSeen && (
                  <>
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
                  </>
                )}
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
              className={`player-page__tab ${activeTab === 'albums' ? 'player-page__tab--active' : ''}`}
              onClick={() => { setActiveTab('albums'); setCurrentAlbum(null); }}
            >
              Альбомы
            </button>
          )}
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
              {isOwner && (
                <PostForm
                  onSubmit={handlePostSubmit}
                  onPollLinked={(postId, pollId) => patchPost(postId, { pollId })}
                />
              )}

              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLike={toggleLike}
                  onDelete={deletePost}
                  onEdit={editPost}
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
              <div className="player-page__photo-toolbar">
                <button
                  className="player-page__photo-add-btn"
                  onClick={() => showPhotoForm ? resetPhotoForm() : setShowPhotoForm(true)}
                >
                  {showPhotoForm ? 'Отмена' : '+ Добавить медиа'}
                </button>
              </div>
            )}

            {isOwner && showPhotoForm && (
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
                <div className="player-page__photo-pick-row">
                  <button
                    type="button"
                    className="player-page__photo-pick"
                    onClick={() => photoFileInputRef.current?.click()}
                    disabled={submitting}
                  >
                    📎 Выбрать файлы
                  </button>
                  <label className="player-page__also-gallery">
                    <input
                      type="checkbox"
                      checked={alsoSaveToGallery}
                      onChange={(e) => setAlsoSaveToGallery(e.target.checked)}
                      disabled={submitting}
                    />
                    Также загрузить в галерею
                  </label>
                </div>

                {selectedPhotoFiles.length > 0 && (
                  <div className="player-page__photo-size">
                    {selectedPhotoFiles.length} файл(ов) · {formatBytes(totalPhotoSize)}
                  </div>
                )}

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
                        <span className="player-page__photo-preview-name">{entry.file.name}</span>
                        <span className="player-page__photo-preview-size">{formatBytes(entry.file.size)}</span>
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

                <input
                  type="text"
                  className="player-page__photo-title"
                  placeholder="Название (необязательно)"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  maxLength={200}
                  disabled={submitting}
                />

                {photoError  && <p className="player-page__photo-error">{photoError}</p>}
                {uploadStatus && <p className="player-page__photo-status">{uploadStatus}</p>}

                <button
                  type="submit"
                  className="player-page__photo-submit"
                  disabled={submitting || selectedPhotoFiles.length === 0}
                >
                  {submitting ? (uploadStatus || 'Загрузка...') : 'Опубликовать'}
                </button>
              </form>
            )}

            {photos.length > 0 && (
              <div className="player-page__photo-grid">
                {photos.map((album) => (
                  <GalleryAlbum
                    key={album.albumId}
                    album={album}
                    onClick={(idx) => openPhotoModal(album, idx)}
                    canDelete={canDeleteMedia}
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

        {/* ── Вкладка «Альбомы» — список альбомов ──────────────────────────── */}
        {activeTab === 'albums' && !currentAlbum && (
          <div className="player-page__albums">
            {isOwner && (
              <div className="player-page__photo-toolbar">
                <button
                  className="player-page__photo-add-btn"
                  onClick={() => {
                    if (showCreateAlbum) { setShowCreateAlbum(false); setNewAlbumName(''); setAlbumCreateError(null); }
                    else setShowCreateAlbum(true);
                  }}
                >
                  {showCreateAlbum ? 'Отмена' : '+ Создать альбом'}
                </button>
              </div>
            )}

            {showCreateAlbum && (
              <form className="player-page__create-album-form" onSubmit={handleCreateAlbum}>
                <input
                  className="player-page__photo-title"
                  placeholder="Название альбома"
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                  maxLength={100}
                  autoFocus
                  disabled={albumCreating}
                />
                {albumCreateError && <p className="player-page__photo-error">{albumCreateError}</p>}
                <button
                  type="submit"
                  className="player-page__photo-submit"
                  disabled={albumCreating || !newAlbumName.trim()}
                >
                  {albumCreating ? 'Создание...' : 'Создать'}
                </button>
              </form>
            )}

            {albumsLoading && (
              <div className="player-page__posts-loading">
                <span className="player-page__posts-spinner" />Загрузка...
              </div>
            )}

            {!albumsLoading && albumsLoaded && userAlbums.length === 0 && (
              <div className="player-page__posts-empty">
                {isOwner ? 'У вас пока нет альбомов. Создайте первый!' : 'У этого игрока пока нет альбомов.'}
              </div>
            )}

            {userAlbums.length > 0 && (
              <div className="player-page__album-grid">
                {userAlbums.map(album => (
                  <div key={album.id} className="player-page__album-card" onClick={() => openAlbum(album)}>
                    <div className="player-page__album-cover">
                      {album.coverUrl
                        ? album.coverFileType?.startsWith('video/')
                          ? <video src={album.coverUrl} muted playsInline preload="metadata" />
                          : <img src={album.coverUrl} alt={album.name} loading="lazy" />
                        : <div className="player-page__album-cover-empty">📁</div>
                      }
                    </div>
                    <div className="player-page__album-info">
                      <span className="player-page__album-name">{album.name}</span>
                      <span className="player-page__album-count">{album.count} медиа</span>
                    </div>
                    {canDeleteMedia && (
                      <button
                        className="player-page__album-card-delete"
                        onClick={(e) => { e.stopPropagation(); handleDeleteAlbum(album); }}
                        title="Удалить альбом"
                      >🗑</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Вкладка «Альбомы» — детальный вид альбома ────────────────────── */}
        {activeTab === 'albums' && currentAlbum && (
          <div className="player-page__album-detail">

            {/* Шапка */}
            <div className="player-page__album-detail-header">
              <button
                className="player-page__album-back"
                onClick={() => { setCurrentAlbum(null); setAlbumImages([]); resetAlbumUploadForm(); }}
              >
                ← Назад
              </button>

              {editingAlbumName ? (
                <form
                  className="player-page__album-rename-form"
                  onSubmit={(e) => { e.preventDefault(); handleSaveAlbumName(); }}
                >
                  <input
                    className="player-page__album-rename-input"
                    value={albumNameEdit}
                    onChange={(e) => setAlbumNameEdit(e.target.value)}
                    onBlur={handleSaveAlbumName}
                    maxLength={100}
                    autoFocus
                  />
                </form>
              ) : (
                <div className="player-page__album-title-row">
                  <h2 className="player-page__album-detail-title">{currentAlbum.name}</h2>
                  {isOwner && (
                    <button
                      className="player-page__album-rename-btn"
                      onClick={() => { setAlbumNameEdit(currentAlbum.name); setEditingAlbumName(true); }}
                      title="Переименовать"
                    >✏️</button>
                  )}
                </div>
              )}

              {isOwner && (
                <button
                  className="player-page__photo-add-btn"
                  onClick={() => showAlbumUpload ? resetAlbumUploadForm() : setShowAlbumUpload(true)}
                >
                  {showAlbumUpload ? 'Отмена' : '+ Добавить медиа'}
                </button>
              )}
            </div>

            {/* Форма загрузки в альбом */}
            {isOwner && showAlbumUpload && (
              <form className="player-page__photo-form" onSubmit={handleAlbumUploadSubmit}>
                <input
                  ref={albumFileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleAlbumFilesChange}
                  className="player-page__photo-file-input"
                  disabled={albumSubmitting}
                />
                <div className="player-page__photo-pick-row">
                  <button
                    type="button"
                    className="player-page__photo-pick"
                    onClick={() => albumFileInputRef.current?.click()}
                    disabled={albumSubmitting}
                  >
                    📎 Выбрать файлы
                  </button>
                  <label className="player-page__also-gallery">
                    <input
                      type="checkbox"
                      checked={albumShowInProfile}
                      onChange={(e) => setAlbumShowInProfile(e.target.checked)}
                      disabled={albumSubmitting}
                    />
                    Также загрузить на страницу
                  </label>
                  <label className="player-page__also-gallery">
                    <input
                      type="checkbox"
                      checked={albumAlsoGallery}
                      onChange={(e) => setAlbumAlsoGallery(e.target.checked)}
                      disabled={albumSubmitting}
                    />
                    Также загрузить в галерею
                  </label>
                </div>

                {albumUploadFiles.length > 0 && (
                  <div className="player-page__photo-size">
                    {albumUploadFiles.length} файл(ов) · {formatBytes(totalAlbumUploadSize)}
                  </div>
                )}

                {albumUploadFiles.length > 0 && (
                  <div className="player-page__photo-previews">
                    {albumUploadFiles.map((entry, i) => (
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
                        <span className="player-page__photo-preview-name">{entry.file.name}</span>
                        <span className="player-page__photo-preview-size">{formatBytes(entry.file.size)}</span>
                        <button
                          type="button"
                          className="player-page__photo-preview-remove"
                          onClick={() => removeAlbumFile(i)}
                          disabled={albumSubmitting}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  className="player-page__photo-title"
                  placeholder="Название (необязательно)"
                  value={albumUploadTitle}
                  onChange={(e) => setAlbumUploadTitle(e.target.value)}
                  maxLength={200}
                  disabled={albumSubmitting}
                />
                {albumUploadError  && <p className="player-page__photo-error">{albumUploadError}</p>}
                {albumUploadStatus && <p className="player-page__photo-status">{albumUploadStatus}</p>}
                <button
                  type="submit"
                  className="player-page__photo-submit"
                  disabled={albumSubmitting || albumUploadFiles.length === 0}
                >
                  {albumSubmitting ? (albumUploadStatus || 'Загрузка...') : 'Добавить в альбом'}
                </button>
              </form>
            )}

            {/* Сортировка */}
            {!albumImagesLoading && albumImages.length > 1 && (
              <div className="player-page__album-sort">
                <span className="player-page__album-sort-label">Сортировка:</span>
                {[
                  { key: 'filename-desc', label: 'По дате ↓' },
                  { key: 'filename-asc',  label: 'По дате ↑' },
                  { key: 'added-desc',    label: 'Добавлено ↓' },
                  { key: 'added-asc',     label: 'Добавлено ↑' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    className={`player-page__album-sort-btn${albumSort === key ? ' player-page__album-sort-btn--active' : ''}`}
                    onClick={() => setAlbumSort(key)}
                  >{label}</button>
                ))}
              </div>
            )}

            {/* Сетка изображений альбома */}
            {albumImagesLoading && (
              <div className="player-page__posts-loading">
                <span className="player-page__posts-spinner" />Загрузка...
              </div>
            )}

            {!albumImagesLoading && albumImages.length === 0 && (
              <div className="player-page__posts-empty">
                {isOwner ? 'Альбом пустой. Добавьте первое медиа!' : 'В этом альбоме пока нет медиа.'}
              </div>
            )}

            {sortedAlbumImages.length > 0 && (
              <div className="player-page__album-images-grid">
                {sortedAlbumImages.map((item, idx) => (
                  <div key={item.id} className="player-page__album-image-item">
                    <div
                      className="player-page__album-image-thumb"
                      onClick={() => setAlbumModalIndex(idx)}
                    >
                      {item.isVideo ? (
                        <>
                          <video src={item.imageUrl} preload="metadata" muted />
                          <span className="player-page__album-image-play">▶</span>
                        </>
                      ) : (
                        <img src={item.imageUrl} alt={item.title || ''} loading="lazy" />
                      )}
                    </div>
                    {canDeleteMedia && (
                      <button
                        className="player-page__album-image-remove"
                        onClick={() => handleRemoveFromAlbum(item.id)}
                        title="Убрать из альбома"
                      >🗑</button>
                    )}
                  </div>
                ))}
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
                paged={true}
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
          albumRanges={photoAlbumRanges}
          onClose={() => setPhotosModalIndex(null)}
          cssVars={cssVars}
          onDeleteItem={canDeleteMedia ? async (imageId) => {
            try {
              await axios.delete(`/api/images/${imageId}`, { headers: { Authorization: `Bearer ${token}` } });
              setPhotos(prev => prev
                .map(a => ({ ...a, items: a.items.filter(i => i.id !== imageId) }))
                .filter(a => a.items.length > 0)
              );
            } catch (err) { alert(err.response?.data?.error || 'Ошибка при удалении'); }
          } : undefined}
        />
      )}

      {/* ImageModal: навигация внутри открытого альбома */}
      {albumModalIndex !== null && (
        <ImageModal
          images={sortedAlbumImages}
          initialIndex={albumModalIndex}
          albumRanges={albumModalRanges}
          showAlbumTag={false}
          onClose={() => setAlbumModalIndex(null)}
          cssVars={cssVars}
          onDeleteItem={canDeleteMedia ? (imageId) => deleteFromAlbum(imageId).catch(err => alert(err.response?.data?.error || 'Ошибка при удалении')) : undefined}
        />
      )}
    </main>

    {/* Меню удаления — portal в body, чтобы не обрезалось overflow:hidden шапки */}
    {showDeleteMenu && createPortal(
      <div
        ref={deleteMenuRef}
        className="player-page__delete-menu"
        style={{ top: menuPos.top, right: menuPos.right }}
      >
        <p className="player-page__delete-menu-title">Управление аккаунтом</p>
        {!deleteReady && (
          <p className="player-page__delete-countdown">
            Кнопки станут активны через {deleteCountdown} сек...
          </p>
        )}
        {!showClearOptions ? (
          <button
            className="player-page__delete-action player-page__delete-action--clear"
            disabled={!deleteReady}
            onClick={() => setShowClearOptions(true)}
            type="button"
          >
            Очистить данные
            <span>Выбрать что удалить. Аккаунт остаётся.</span>
          </button>
        ) : (
          <div className="player-page__clear-panel">
            <p className="player-page__clear-panel-title">Что очистить:</p>
            {[
              { key: 'posts',   label: 'Посты' },
              { key: 'images',  label: 'Фото и альбомы' },
              { key: 'profile', label: 'Настройки профиля' },
              { key: 'chats',   label: 'Переписку (чаты)' },
            ].map(({ key, label }) => (
              <label key={key} className="player-page__clear-check">
                <input
                  type="checkbox"
                  checked={clearSections[key]}
                  onChange={e => setClearSections(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
            <div className="player-page__clear-panel-actions">
              <button
                className="player-page__clear-cancel"
                type="button"
                onClick={() => setShowClearOptions(false)}
              >
                Отмена
              </button>
              <button
                className="player-page__clear-confirm"
                type="button"
                disabled={!deleteReady}
                onClick={handleClearData}
              >
                Применить
              </button>
            </div>
          </div>
        )}
        <button
          className="player-page__delete-action player-page__delete-action--delete"
          disabled={!deleteReady}
          onClick={handleDeleteAccount}
          type="button"
        >
          Удалить аккаунт
          <span>Полное и необратимое удаление аккаунта.</span>
        </button>
      </div>,
      document.body
    )}
    </>
  );
}

export default PlayerPage;
