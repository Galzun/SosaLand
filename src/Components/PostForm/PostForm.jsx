// Components/PostForm/PostForm.jsx
// Форма создания и редактирования поста. Поддерживает несколько вложений (изображения, видео, аудио, документы).
// Использует contenteditable для поддержки гиперссылок.
//
// Props:
//   onSubmit(content, attachments)  — callback при создании/сохранении поста
//     content     — HTML строка (может содержать <a>, <br>, <div>)
//     attachments — массив [{ fileUrl, fileType, fileName }] итоговых вложений
//   onPollLinked(postId, pollId)    — опционально, вызывается после создания опроса
//   initialPost                     — объект поста для режима редактирования
//   onCancel()                      — callback кнопки «Отмена» в режиме редактирования

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import FileIcon from '../FileIcon/FileIcon';
import EmojiPicker from '../EmojiPicker/EmojiPicker';
import PollBuilder from '../PollBuilder/PollBuilder';
import { showPrompt } from '../Dialog/dialogManager';
import './PostForm.scss';

const MAX_CONTENT = 5000;

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

function previewType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'doc';
}

function previewTypeByMime(mime) {
  if (!mime) return 'doc';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'doc';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

// Считает длину текста без HTML-тегов
function htmlTextLength(html) {
  if (!html) return 0;
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').length;
}

let _uid = 0;
function nextUid() { return ++_uid; }

// ---------------------------------------------------------------------------
// PendingFilePreview — превью нового файла, ещё не загруженного
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
// ExistingAttachmentPreview — превью уже загруженного вложения (в режиме редактирования)
// ---------------------------------------------------------------------------
function ExistingAttachmentPreview({ att, onRemove, disabled }) {
  const type = previewTypeByMime(att.fileType);
  const name = att.fileName || att.fileUrl.split('/').pop() || 'файл';

  return (
    <div className="post-form__pending-item post-form__pending-item--existing">
      <div className="post-form__pending-thumb">
        {type === 'image' && (
          <img src={att.fileUrl} alt={name} />
        )}
        {type === 'video' && (
          <video src={att.fileUrl} preload="metadata" muted playsInline />
        )}
        {(type === 'audio' || type === 'doc') && (
          <div className="post-form__pending-icon">
            <FileIcon fileType={att.fileType || ''} size={28} />
          </div>
        )}
        {type === 'video' && (
          <div className="post-form__pending-play">▶</div>
        )}
      </div>

      <div className="post-form__pending-meta">
        <span className="post-form__pending-name" title={name}>
          {name.replace(/^\d+_/, '')}
        </span>
        <span className="post-form__pending-size post-form__pending-size--existing">
          сохранено
        </span>
      </div>

      <button
        type="button"
        className="post-form__pending-remove"
        onClick={() => onRemove(att.fileUrl)}
        disabled={disabled}
        title="Убрать из поста"
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostForm — основной компонент формы
// ---------------------------------------------------------------------------
function PostForm({ onSubmit, onPollLinked, initialPost, onCancel }) {
  const isEditing = Boolean(initialPost);

  // Существующие вложения (в режиме редактирования — те, что уже есть у поста)
  const [existingAtts,   setExistingAtts]   = useState(
    isEditing ? (initialPost.attachments || []) : []
  );
  const [pendingFiles,   setPendingFiles]   = useState([]);
  const [uploading,      setUploading]      = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState('');
  const [uploadProg,     setUploadProg]     = useState('');
  const [showEmoji,      setShowEmoji]      = useState(false);
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pendingPoll,    setPendingPoll]    = useState(null);
  // Длина текста (без тегов) — для счётчика символов и canSubmit
  const [textLen,        setTextLen]        = useState(
    isEditing ? htmlTextLength(initialPost?.content || '') : 0
  );

  const editorRef     = useRef(null);
  const fileInputRef  = useRef(null);
  const emojiWrapRef  = useRef(null);
  const { token, user } = useAuth();

  // Устанавливаем начальное содержимое в режиме редактирования
  useEffect(() => {
    if (isEditing && editorRef.current && initialPost?.content) {
      editorRef.current.innerHTML = initialPost.content;
      // Гарантируем target="_blank" на всех ссылках
      editorRef.current.querySelectorAll('a').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    return () => {
      pendingFiles.forEach(pf => {
        if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Обработчики редактора
  // ---------------------------------------------------------------------------

  const handleEditorInput = () => {
    const el = editorRef.current;
    if (!el) return;
    setTextLen((el.textContent || '').length);
  };

  // Вставка только plain text (без форматирования из буфера)
  const handlePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  };

  // Кнопка ссылки: сохраняем выделение → диалог → createLink
  const handleLinkClick = async () => {
    const sel = window.getSelection();
    let savedRange = null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }

    const input = await showPrompt('Введите URL ссылки:', { placeholder: 'https://...' });
    if (input === null || !input.trim()) return;

    let url = input.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    editorRef.current?.focus();

    if (savedRange) {
      const newSel = window.getSelection();
      newSel?.removeAllRanges();
      newSel?.addRange(savedRange);
    }

    document.execCommand('createLink', false, url);

    // target="_blank" + rel на все ссылки
    editorRef.current?.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    handleEditorInput();
  };

  // ---------------------------------------------------------------------------
  // Файлы
  // ---------------------------------------------------------------------------

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

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

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (uid) => {
    setPendingFiles(prev => {
      const item = prev.find(p => p.uid === uid);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(p => p.uid !== uid);
    });
  };

  const handleRemoveExisting = (fileUrl) => {
    setExistingAtts(prev => prev.filter(a => a.fileUrl !== fileUrl));
  };

  // ---------------------------------------------------------------------------
  // Отправка
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();

    const el = editorRef.current;
    const htmlContent = el?.innerHTML || '';
    const textContent = el?.textContent || '';
    const trimmedText = textContent.trim();

    if (!trimmedText && !pendingPoll && !isEditing) {
      setError('Напишите что-нибудь или добавьте опрос');
      return;
    }
    if (trimmedText.length > MAX_CONTENT) {
      setError(`Текст не может превышать ${MAX_CONTENT} символов`);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const newlyUploaded = [];

      if (pendingFiles.length > 0) {
        setUploading(true);

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

          newlyUploaded.push({
            fileUrl:  resp.data.url || resp.data.fileUrl,
            fileType: resp.data.fileType || pendingFiles[i].file.type,
            fileName: resp.data.fileName || pendingFiles[i].file.name,
          });
        }

        setUploading(false);
        setUploadProg('');
      }

      // Итоговые вложения: сохранённые существующие + новые
      const finalAttachments = [...existingAtts, ...newlyUploaded];

      const newPost = await onSubmit(htmlContent, finalAttachments);

      // Создаём опрос, если есть (только при создании поста, не при редактировании)
      if (!isEditing && pendingPoll && newPost?.id) {
        try {
          const pollResp = await axios.post('/api/polls', {
            ...pendingPoll,
            post_id: newPost.id,
          }, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (onPollLinked) onPollLinked(newPost.id, pollResp.data.id);
        } catch (pollErr) {
          console.error('Ошибка создания опроса:', pollErr);
        }
      }

      if (!isEditing) {
        if (el) el.innerHTML = '';
        setTextLen(0);
        pendingFiles.forEach(pf => { if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl); });
        setPendingFiles([]);
        setPendingPoll(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || (isEditing ? 'Ошибка при сохранении поста' : 'Ошибка при публикации поста'));
    } finally {
      setSubmitting(false);
      setUploading(false);
      setUploadProg('');
    }
  };

  const handleEmojiSelect = (emoji) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, emoji);
    setShowEmoji(false);
  };

  if (!user) return null;

  const charsLeft = MAX_CONTENT - textLen;
  const isBusy    = submitting || uploading;
  const canSubmit = isEditing
    ? (textLen > 0 || existingAtts.length > 0 || pendingFiles.length > 0) && charsLeft >= 0 && !isBusy
    : (textLen > 0 || pendingPoll) && charsLeft >= 0 && !isBusy;

  return (
    <form className={`post-form${isEditing ? ' post-form--editing' : ''}`} onSubmit={handleSubmit}>
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
          accept="*/*"
        />

        <div className="post-form__textarea-wrap">
          {/* Редактор с поддержкой ссылок */}
          <div
            ref={editorRef}
            className="post-form__editor"
            contentEditable={isBusy ? 'false' : 'true'}
            onInput={handleEditorInput}
            onPaste={handlePaste}
            data-placeholder={isEditing ? 'Текст поста...' : 'Что нового на сервере?'}
            suppressContentEditableWarning
          />

          {/* Существующие вложения (режим редактирования) */}
          {isEditing && existingAtts.length > 0 && (
            <div className="post-form__pending-list">
              {existingAtts.map(att => (
                <ExistingAttachmentPreview
                  key={att.fileUrl}
                  att={att}
                  onRemove={handleRemoveExisting}
                  disabled={isBusy}
                />
              ))}
            </div>
          )}

          {/* Новые файлы из очереди */}
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

          {/* Превью прикреплённого опроса (только при создании) */}
          {!isEditing && pendingPoll && (
            <div className="post-form__pending-poll">
              <span className="post-form__pending-poll-icon">📊</span>
              <span className="post-form__pending-poll-question">{pendingPoll.question}</span>
              <span className="post-form__pending-poll-count">{pendingPoll.options.length} вар.</span>
              <button
                type="button"
                className="post-form__pending-poll-remove"
                onClick={() => setPendingPoll(null)}
                disabled={isBusy}
                title="Удалить опрос"
              >✕</button>
            </div>
          )}

          {error && <p className="post-form__error">{error}</p>}

          <div className="post-form__actions">
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

              {/* Кнопка ссылки */}
              <button
                type="button"
                className="post-form__attach-icon"
                onClick={handleLinkClick}
                disabled={isBusy}
                title="Добавить ссылку (выделите текст)"
              >
                🔗
              </button>

              {/* Кнопка опроса — только при создании (не при редактировании) */}
              {!isEditing && (
                <button
                  type="button"
                  className={`post-form__attach-icon ${pendingPoll ? 'post-form__attach-icon--has-files' : ''}`}
                  onClick={() => setShowPollBuilder(v => !v)}
                  disabled={isBusy}
                  title="Добавить опрос"
                >
                  📊
                </button>
              )}
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

              {isEditing && onCancel && (
                <button
                  type="button"
                  className="post-form__cancel"
                  onClick={onCancel}
                  disabled={isBusy}
                >
                  Отмена
                </button>
              )}

              <button
                type="submit"
                className="post-form__submit"
                disabled={!canSubmit}
              >
                {uploading
                  ? `Загрузка ${uploadProg}...`
                  : submitting
                    ? (isEditing ? 'Сохранение...' : 'Публикуем...')
                    : (isEditing ? 'Сохранить' : 'Опубликовать')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Конструктор опроса (только при создании) */}
      {!isEditing && showPollBuilder && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div style={{ width: '100%', maxWidth: '540px' }}>
            <PollBuilder
              onConfirm={(pollData) => {
                setPendingPoll(pollData);
                setShowPollBuilder(false);
              }}
              onCancel={() => setShowPollBuilder(false)}
            />
          </div>
        </div>,
        document.body
      )}
    </form>
  );
}

export default PostForm;
