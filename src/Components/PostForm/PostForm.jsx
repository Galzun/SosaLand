// Components/PostForm/PostForm.jsx
// Форма создания поста. Поддерживает несколько вложений (изображения, видео, аудио, документы).
//
// Props:
//   onSubmit(content, attachments) — callback при отправке поста
//     content     — текст поста (string)
//     attachments — массив [{ fileUrl, fileType, fileName }] уже загруженных файлов

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import FileIcon from '../FileIcon/FileIcon';
import EmojiPicker from '../EmojiPicker/EmojiPicker';
import './PostForm.scss';

const MAX_CONTENT    = 5000;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100 МБ суммарный размер всех вложений

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

// Определяет тип превью по MIME-типу файла
function previewType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'doc';
}

// Форматирует размер файла
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

// Генерирует простой уникальный ID для pendingFiles
let _uid = 0;
function nextUid() { return ++_uid; }

// ---------------------------------------------------------------------------
// Компонент превью одного файла в очереди
// ---------------------------------------------------------------------------
function PendingFilePreview({ pf, onRemove, disabled }) {
  return (
    <div className="post-form__pending-item">
      <div className="post-form__pending-thumb">
        {pf.type === 'image' && (
          <img src={pf.previewUrl} alt={pf.file.name} />
        )}
        {pf.type === 'video' && (
          <video src={pf.previewUrl} preload="metadata" muted playsInline />
        )}
        {(pf.type === 'audio' || pf.type === 'doc') && (
          <div className="post-form__pending-icon">
            <FileIcon fileType={pf.file.type} size={28} />
          </div>
        )}

        {/* Иконка play для видео */}
        {pf.type === 'video' && (
          <div className="post-form__pending-play">▶</div>
        )}
      </div>

      <div className="post-form__pending-meta">
        <span className="post-form__pending-name" title={pf.file.name}>
          {pf.file.name.replace(/^\d+_/, '')}
        </span>
        <span className="post-form__pending-size">
          {formatSize(pf.file.size)}
        </span>
      </div>

      <button
        type="button"
        className="post-form__pending-remove"
        onClick={() => onRemove(pf.uid)}
        disabled={disabled}
        title="Удалить"
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostForm — основной компонент формы
// ---------------------------------------------------------------------------
function PostForm({ onSubmit }) {
  const [content,      setContent]      = useState('');
  const [pendingFiles, setPendingFiles] = useState([]); // файлы ещё не загружены
  const [uploading,    setUploading]    = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');
  const [uploadProg,   setUploadProg]   = useState(''); // "2 / 5"
  const [showEmoji,    setShowEmoji]    = useState(false);

  const fileInputRef  = useRef(null);
  const emojiWrapRef  = useRef(null);
  const { token, user } = useAuth();

  // Закрываем emoji-пикер при клике вне него
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e) => {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  // Освобождаем object URL при размонтировании компонента
  useEffect(() => {
    return () => {
      pendingFiles.forEach(pf => {
        if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Обработчик выбора файлов — добавляет к существующей очереди
  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    // Проверяем суммарный размер
    const currentSize = pendingFiles.reduce((s, p) => s + p.file.size, 0);
    const newSize     = selected.reduce((s, f) => s + f.size, 0);

    if (currentSize + newSize > MAX_TOTAL_SIZE) {
      const allowedSize = MAX_TOTAL_SIZE - currentSize;
      // Добавляем только те файлы, которые вписываются в лимит
      let accumulated = 0;
      const toAdd = selected.filter(f => {
        if (accumulated + f.size <= allowedSize) {
          accumulated += f.size;
          return true;
        }
        return false;
      });

      if (toAdd.length === 0) {
        setError('Общий размер файлов не может превышать 100 МБ');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setError(`Добавлено ${toAdd.length} из ${selected.length} файлов — превышен лимит 100 МБ`);
      const newItems = toAdd.map(file => ({
        uid:        nextUid(),
        file,
        type:       previewType(file),
        previewUrl: (file.type.startsWith('image/') || file.type.startsWith('video/'))
          ? URL.createObjectURL(file)
          : null,
      }));
      setPendingFiles(prev => [...prev, ...newItems]);
    } else {
      setError('');
      const newItems = selected.map(file => ({
        uid:        nextUid(),
        file,
        type:       previewType(file),
        previewUrl: (file.type.startsWith('image/') || file.type.startsWith('video/'))
          ? URL.createObjectURL(file)
          : null,
      }));
      setPendingFiles(prev => [...prev, ...newItems]);
    }

    // Сбрасываем input, чтобы можно было выбрать те же файлы повторно
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Удаляет файл из очереди
  const handleRemoveFile = (uid) => {
    setPendingFiles(prev => {
      const item = prev.find(p => p.uid === uid);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(p => p.uid !== uid);
    });
  };

  // Отправка поста: сначала загружаем файлы, потом вызываем onSubmit
  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmed = content.trim();
    if (!trimmed) {
      setError('Текст поста не может быть пустым');
      return;
    }
    if (trimmed.length > MAX_CONTENT) {
      setError(`Текст не может превышать ${MAX_CONTENT} символов`);
      return;
    }

    // Финальная проверка суммарного размера
    const totalSize = pendingFiles.reduce((s, p) => s + p.file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      setError('Общий размер файлов не может превышать 100 МБ');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const attachments = [];

      if (pendingFiles.length > 0) {
        setUploading(true);

        // Загружаем файлы последовательно, показываем прогресс
        for (let i = 0; i < pendingFiles.length; i++) {
          setUploadProg(`${i + 1} / ${pendingFiles.length}`);

          const formData = new FormData();
          formData.append('file', pendingFiles[i].file);

          const resp = await axios.post('/api/upload', formData, {
            headers: {
              Authorization:  `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          });

          attachments.push({
            fileUrl:  resp.data.url || resp.data.fileUrl,
            fileType: resp.data.fileType || pendingFiles[i].file.type,
            fileName: resp.data.fileName || pendingFiles[i].file.name,
          });
        }

        setUploading(false);
        setUploadProg('');
      }

      // Вызываем колбэк — он вызовет usePosts.createPost → POST /api/posts
      await onSubmit(trimmed, attachments);

      // Сбрасываем форму
      setContent('');
      pendingFiles.forEach(pf => { if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl); });
      setPendingFiles([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при публикации поста');
    } finally {
      setSubmitting(false);
      setUploading(false);
      setUploadProg('');
    }
  };

  const handleEmojiSelect = (emoji) => {
    setContent(prev => prev + emoji);
    setShowEmoji(false);
  };

  if (!user) return null;

  const charsLeft = MAX_CONTENT - content.length;
  const isBusy    = submitting || uploading;
  const canSubmit = content.trim().length > 0 && charsLeft >= 0 && !isBusy;

  return (
    <form className="post-form" onSubmit={handleSubmit}>
      {/* Аватарка автора слева */}
      <div className="post-form__avatar">
        {user.minecraftUuid ? (
          <img
            src={`https://crafatar.icehost.xyz/avatars/${user.minecraftUuid}?size=48&overlay`}
            alt={user.username}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="post-form__avatar-placeholder">
            {user.username[0].toUpperCase()}
          </div>
        )}
      </div>

      <div className="post-form__body">
        {/* Скрытый input для выбора файлов */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
          accept="*/*"
        />

        {/* Textarea + иконки внутри одного блока */}
        <div className="post-form__textarea-wrap">
          <textarea
            className="post-form__textarea"
            placeholder="Что нового на сервере?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={MAX_CONTENT}
            disabled={isBusy}
          />

          {/* Очередь вложений — превью до отправки */}
          {pendingFiles.length > 0 && (
            <div className="post-form__pending-list">
              {pendingFiles.map(pf => (
                <PendingFilePreview
                  key={pf.uid}
                  pf={pf}
                  onRemove={handleRemoveFile}
                  disabled={isBusy}
                />
              ))}
            </div>
          )}

          {error && <p className="post-form__error">{error}</p>}

          {/* Нижняя панель: иконки слева + счётчик/кнопка справа */}
          <div className="post-form__actions">
            {/* Левая группа: прикрепить + смайлики */}
            <div className="post-form__actions-left">
              <button
                type="button"
                className={`post-form__attach-icon ${pendingFiles.length > 0 ? 'post-form__attach-icon--has-files' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                title="Добавить медиа"
              >
                {isBusy ? '⏳' : '📎'}
                {pendingFiles.length > 0 && !isBusy && (
                  <span className="post-form__attach-badge">{pendingFiles.length}</span>
                )}
              </button>

              <div ref={emojiWrapRef} className="post-form__emoji-wrap">
                <button
                  type="button"
                  className="post-form__attach-icon"
                  onClick={() => setShowEmoji(v => !v)}
                  disabled={isBusy}
                  title="Смайлики"
                >
                  😊
                </button>
                {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} />}
              </div>
            </div>

            <div className="post-form__actions-right">
              {uploading && uploadProg && (
                <span className="post-form__upload-prog">
                  Загрузка {uploadProg}...
                </span>
              )}
              <span className={`post-form__counter ${charsLeft < 0 ? 'post-form__counter--over' : charsLeft < 100 ? 'post-form__counter--warn' : ''}`}>
                {charsLeft}
              </span>
              <button
                type="submit"
                className="post-form__submit"
                disabled={!canSubmit}
              >
                {uploading
                  ? `Загрузка ${uploadProg}...`
                  : submitting
                    ? 'Публикуем...'
                    : 'Опубликовать'}
              </button>
            </div>
          </div>  {/* post-form__actions */}
        </div>  {/* post-form__textarea-wrap */}
      </div>
    </form>
  );
}

export default PostForm;
