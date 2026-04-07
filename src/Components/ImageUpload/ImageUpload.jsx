// Components/ImageUpload/ImageUpload.jsx
// Компонент загрузки изображений.
//
// Позволяет пользователю выбрать изображение, отправить его на /api/upload
// и получить URL загруженного файла через callback onUpload.
//
// Props:
//   onUpload(url)   — вызывается после успешной загрузки с URL изображения
//   label           — подпись кнопки (по умолчанию "Выбрать изображение")
//   currentUrl      — текущий URL изображения для предпросмотра
//   disabled        — отключить компонент (например, пока идёт общее сохранение)

import { useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './ImageUpload.scss';

function ImageUpload({ onUpload, label = 'Выбрать изображение', currentUrl = null, disabled = false }) {
  // preview — URL для предпросмотра. Обновляется после выбора файла.
  const [preview, setPreview]   = useState(currentUrl);
  // uploading — идёт ли загрузка на сервер прямо сейчас.
  const [uploading, setUploading] = useState(false);
  // error — сообщение об ошибке (или null).
  const [error, setError]       = useState(null);

  // Ref на скрытый <input type="file"> — нужен чтобы вызвать выбор файла программно.
  const inputRef = useRef(null);

  const { token } = useAuth();

  /**
   * handleFileChange — вызывается когда пользователь выбрал файл.
   * Сразу загружает файл на сервер и вызывает onUpload с полученным URL.
   */
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Сбрасываем предыдущую ошибку.
    setError(null);

    // Проверяем тип файла на клиенте (дополнительная защита, основная — на сервере).
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Разрешены только изображения: jpg, png, gif, webp');
      return;
    }

    // Проверяем размер файла (50 МБ).
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Файл слишком большой. Максимум 50 МБ');
      return;
    }

    // Создаём локальный URL для мгновенного предпросмотра (до ответа сервера).
    // URL.createObjectURL создаёт временный blob-URL в памяти браузера.
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    // Отправляем файл на сервер.
    setUploading(true);
    try {
      // FormData — стандартный способ отправки файлов через HTTP.
      // Поле называется "image" — как ожидает бэкенд.
      const formData = new FormData();
      formData.append('image', file);

      const response = await axios.post('/api/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          // Content-Type не указываем — axios сам выставит multipart/form-data с boundary.
        },
      });

      const { url } = response.data;

      // Обновляем предпросмотр на реальный URL с сервера.
      setPreview(url);

      // Уведомляем родительский компонент об успешной загрузке.
      onUpload(url);

    } catch (err) {
      // Показываем сообщение об ошибке из бэкенда или дефолтное.
      const message = err.response?.data?.error || 'Ошибка при загрузке файла';
      setError(message);

      // Откатываем предпросмотр к предыдущему изображению.
      setPreview(currentUrl);
    } finally {
      setUploading(false);
      // Сбрасываем value у input, чтобы можно было загрузить тот же файл повторно.
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <div className="image-upload">
      {/* Предпросмотр изображения */}
      {preview && (
        <div className="image-upload__preview">
          <img src={preview} alt="Предпросмотр" />
        </div>
      )}

      {/* Скрытый нативный input для выбора файла */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        className="image-upload__input"
        disabled={disabled || uploading}
      />

      {/* Кнопка, которая открывает диалог выбора файла */}
      <button
        type="button"
        className="image-upload__btn"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
      >
        {uploading ? 'Загрузка...' : label}
      </button>

      {/* Сообщение об ошибке */}
      {error && (
        <p className="image-upload__error">{error}</p>
      )}
    </div>
  );
}

export default ImageUpload;
