// Components/MessageInput/MessageInput.jsx
// Форма ввода сообщения с поддержкой файловых вложений.
//
// Enter       — отправить сообщение
// Shift+Enter — новая строка
// Кнопка 📎   — выбрать файл для прикрепления

import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import FileIcon from '../FileIcon/FileIcon';
import EmojiPicker from '../EmojiPicker/EmojiPicker';
import './MessageInput.scss';

function MessageInput({ onSend, disabled }) {
  const { token } = useAuth();
  const [text,         setText]         = useState('');
  const [fileData,     setFileData]     = useState(null);  // { fileUrl, fileType, fileName }
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState(null);
  const [showEmoji,    setShowEmoji]    = useState(false);

  const fileInputRef  = useRef(null);
  const textareaRef   = useRef(null);
  const emojiWrapRef  = useRef(null);

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

  // Обработка вставки файла через кнопку
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Загружаем файл через /api/upload (который теперь принимает любые файлы)
      const { data } = await axios.post('/api/upload', formData, {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      setFileData({
        fileUrl:  data.fileUrl,
        fileType: data.fileType,
        fileName: data.fileName,
      });
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Ошибка загрузки файла');
    } finally {
      setUploading(false);
      // Сбрасываем input, чтобы можно было повторно выбрать тот же файл
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Убрать прикреплённый файл
  const removeFile = () => {
    setFileData(null);
    setUploadError(null);
  };

  // Отправка сообщения
  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && !fileData) return;
    if (uploading) return;

    onSend(trimmed, fileData);
    setText('');
    setFileData(null);

    // Возвращаем фокус на textarea
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [text, fileData, uploading, onSend]);

  // Enter — отправить, Shift+Enter — новая строка
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Автовысота textarea
  const handleChange = (e) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  };

  const handleEmojiSelect = (emoji) => {
    setText(prev => prev + emoji);
    setShowEmoji(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const canSend   = (text.trim() || fileData) && !uploading && !disabled;
  const charsLeft = 5000 - text.length;

  return (
    <div className="msg-input">
      {/* Прикреплённый файл */}
      {fileData && (
        <div className="msg-input__attachment">
          {fileData.fileType?.startsWith('image/') ? (
            <img
              className="msg-input__attachment-preview"
              src={fileData.fileUrl}
              alt={fileData.fileName}
            />
          ) : (
            <div className="msg-input__attachment-file">
              <FileIcon fileType={fileData.fileType} size={24} />
              <span className="msg-input__attachment-name">{fileData.fileName}</span>
            </div>
          )}
          <button
            className="msg-input__attachment-remove"
            onClick={removeFile}
            title="Убрать файл"
            type="button"
          >
            ✕
          </button>
        </div>
      )}

      {/* Ошибка загрузки */}
      {uploadError && (
        <p className="msg-input__error">{uploadError}</p>
      )}

      {/* Индикатор загрузки */}
      {uploading && (
        <div className="msg-input__uploading">
          <span className="msg-input__spinner" />
          Загрузка файла...
        </div>
      )}

      {/* Скрытый input для выбора файла */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Textarea + нижняя панель внутри единого визуального блока */}
      <div className="msg-input__box">
        <textarea
          ref={textareaRef}
          className="msg-input__textarea"
          placeholder="Написать сообщение... (Enter — отправить)"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          maxLength={5000}
        />

        {/* Нижняя панель: иконки слева + счётчик/отправить справа */}
        <div className="msg-input__bar">
          <div className="msg-input__bar-left">
            <button
              className="msg-input__icon-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || disabled}
              title="Прикрепить файл"
              type="button"
            >
              📎
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

export default MessageInput;
