// Components/MessageInput/MessageInput.jsx
// Форма ввода сообщения с поддержкой множественных файловых вложений.
//
// Enter       — отправить сообщение
// Shift+Enter — новая строка
// Кнопка 📎   — выбрать файлы (multiple) для прикрепления

import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import { getMentionAtCursor } from '../../utils/mentionUtils';
import FileIcon from '../FileIcon/FileIcon';
import EmojiPicker from '../EmojiPicker/EmojiPicker';
import MentionDropdown from '../MentionDropdown/MentionDropdown';
import './MessageInput.scss';

function MessageInput({ onSend, disabled }) {
  const { token } = useAuth();
  const { allPlayers } = usePlayer();
  const [text,        setText]        = useState('');
  const [pendingFiles, setPendingFiles] = useState([]); // { file, previewUrl } — до загрузки
  const [uploadError, setUploadError]  = useState(null);
  const [uploading,   setUploading]    = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100
  const [showEmoji,   setShowEmoji]    = useState(false);
  const [mentionState,  setMentionState]  = useState(null); // {query, startIndex} | null
  const [mentionIndex,  setMentionIndex]  = useState(0);

  const fileInputRef  = useRef(null);
  const textareaRef   = useRef(null);
  const emojiWrapRef  = useRef(null);
  const mentionDropRef = useRef(null);

  const mentionSuggestions = mentionState
    ? allPlayers.filter(p => p.name.toLowerCase().startsWith(mentionState.query)).slice(0, 7)
    : [];

  // Закрываем дропдаун при клике вне
  useEffect(() => {
    if (!mentionState) return;
    const handler = (e) => {
      if (
        mentionDropRef.current && !mentionDropRef.current.contains(e.target) &&
        textareaRef.current && !textareaRef.current.contains(e.target)
      ) {
        setMentionState(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mentionState]);

  const insertMentionUser = (username) => {
    const before = text.slice(0, mentionState.startIndex);
    const after  = text.slice(mentionState.startIndex + 1 + mentionState.query.length);
    const newText = before + '@' + username + ' ' + after;
    setText(newText);
    setMentionState(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const ta = textareaRef.current;
        const pos = before.length + username.length + 2;
        ta.selectionStart = pos;
        ta.selectionEnd   = pos;
        ta.focus();
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
      }
    }, 0);
  };

  // Освобождаем blob-URL при размонтировании
  useEffect(() => {
    return () => {
      pendingFiles.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Обработка выбора файлов
  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    const newItems = selected.map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') || file.type.startsWith('video/')
        ? URL.createObjectURL(file)
        : null,
    }));

    setPendingFiles(prev => [...prev, ...newItems]);
    setUploadError(null);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Удалить файл из очереди
  const removeFile = (index) => {
    setPendingFiles(prev => {
      if (prev[index]?.previewUrl) URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Отправка сообщения
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && pendingFiles.length === 0) return;
    if (uploading) return;

    let uploadedFiles = [];

    if (pendingFiles.length > 0) {
      setUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      try {
        if (pendingFiles.length === 1) {
          // Одиночный файл через поле file
          const formData = new FormData();
          formData.append('file', pendingFiles[0].file);
          const { data } = await axios.post('/api/upload', formData, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
              if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
            },
          });
          uploadedFiles = [{ fileUrl: data.fileUrl, fileType: data.fileType, fileName: data.fileName }];
        } else {
          // Несколько файлов через поле files[]
          const formData = new FormData();
          pendingFiles.forEach(f => formData.append('files[]', f.file));
          const { data } = await axios.post('/api/upload', formData, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
              if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
            },
          });
          uploadedFiles = (data.files || []).map(f => ({
            fileUrl: f.fileUrl, fileType: f.fileType, fileName: f.fileName,
          }));
        }
      } catch (err) {
        setUploadError(err.response?.data?.error || 'Ошибка загрузки файлов');
        setUploading(false);
        setUploadProgress(0);
        return;
      }
    }

    // Очищаем blob-URL
    pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });

    onSend(trimmed, uploadedFiles);
    setText('');
    setPendingFiles([]);
    setUploading(false);
    setUploadProgress(0);

    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [text, pendingFiles, uploading, onSend, token]);

  // Enter — отправить (или выбрать упоминание), Shift+Enter — новая строка
  const handleKeyDown = (e) => {
    if (mentionState && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); insertMentionUser(mentionSuggestions[mentionIndex].name); return; }
      if (e.key === 'Escape')    { setMentionState(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Автовысота textarea + обнаружение @упоминания
  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    const mention = getMentionAtCursor(value, ta.selectionStart);
    setMentionState(mention);
    setMentionIndex(0);
  };

  const handleEmojiSelect = (emoji) => {
    setText(prev => prev + emoji);
    setShowEmoji(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const canSend   = (text.trim() || pendingFiles.length > 0) && !uploading && !disabled;
  const charsLeft = 5000 - text.length;

  return (
    <div className="msg-input">
      {/* Превью прикреплённых файлов */}
      {pendingFiles.length > 0 && (
        <div className="msg-input__previews">
          {pendingFiles.map((item, i) => (
            <div key={i} className="msg-input__preview-item">
              {item.previewUrl && item.file.type.startsWith('image/') ? (
                <img className="msg-input__preview-thumb" src={item.previewUrl} alt={item.file.name} />
              ) : item.previewUrl && item.file.type.startsWith('video/') ? (
                <video className="msg-input__preview-thumb" src={item.previewUrl} muted />
              ) : (
                <div className="msg-input__preview-file">
                  <FileIcon fileType={item.file.type} size={22} />
                  <div className="msg-input__preview-meta">
                    <span className="msg-input__preview-name">{item.file.name}</span>
                    <span className="msg-input__preview-size">{formatBytes(item.file.size)}</span>
                  </div>
                </div>
              )}
              <button
                className="msg-input__preview-remove"
                onClick={() => removeFile(i)}
                title="Убрать файл"
                type="button"
                disabled={uploading}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Ошибка загрузки */}
      {uploadError && (
        <p className="msg-input__error">{uploadError}</p>
      )}

      {/* Индикатор загрузки */}
      {uploading && (
        <div className="msg-input__uploading">
          <div className="msg-input__progress-bar">
            <div className="msg-input__progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span>Загрузка {uploadProgress}%...</span>
        </div>
      )}

      {/* Скрытый input для выбора файлов */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        disabled={disabled}
      />

      {/* Textarea + нижняя панель внутри единого визуального блока */}
      <div className="msg-input__box">
        <div className="msg-input__textarea-wrap">
          <textarea
            ref={textareaRef}
            className="msg-input__textarea"
            placeholder="Написать сообщение... (Enter — отправить)"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onClick={(e) => {
              const mention = getMentionAtCursor(e.target.value, e.target.selectionStart);
              setMentionState(mention);
              setMentionIndex(0);
            }}
            disabled={disabled}
            rows={1}
            maxLength={5000}
          />
          <MentionDropdown
            players={mentionSuggestions}
            activeIndex={mentionIndex}
            onSelect={insertMentionUser}
            onHover={setMentionIndex}
            dropRef={mentionDropRef}
          />
        </div>

        {/* Нижняя панель: иконки слева + счётчик/отправить справа */}
        <div className="msg-input__bar">
          <div className="msg-input__bar-left">
            <button
              className={`msg-input__icon-btn${pendingFiles.length > 0 ? ' msg-input__icon-btn--has-files' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || disabled}
              title="Прикрепить файлы"
              type="button"
            >
              📎
              {pendingFiles.length > 0 && (
                <span className="msg-input__file-badge">{pendingFiles.length}</span>
              )}
            </button>
            <div ref={emojiWrapRef} className="msg-input__emoji-wrap">
              <button
                type="button"
                className="msg-input__icon-btn"
                onClick={() => setShowEmoji(v => !v)}
                disabled={disabled}
                title="Смайлики"
              >
                😊
              </button>
              {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} />}
            </div>
          </div>

          <div className="msg-input__bar-right">
            {charsLeft < 500 && (
              <span className={`msg-input__counter${charsLeft < 100 ? ' msg-input__counter--warn' : ''}`}>
                {charsLeft}
              </span>
            )}
            <button
              className={`msg-input__send-btn${canSend ? ' msg-input__send-btn--active' : ''}`}
              onClick={handleSend}
              disabled={!canSend}
              title="Отправить (Enter)"
              type="button"
            >
              ➤
            </button>
          </div>
        </div>
      </div>  {/* msg-input__box */}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default MessageInput;
