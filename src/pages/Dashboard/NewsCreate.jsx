// pages/Dashboard/NewsCreate.jsx
// Страница создания (/dashboard/news/create)
// и редактирования (/dashboard/news/:slug/edit) новости.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../Components/ImageUpload/ImageUpload';
import RichTextEditor from '../../Components/RichTextEditor/RichTextEditor';
import './NewsCreate.scss';

const TITLE_MAX = 200;

function NewsCreate() {
  const { slug }        = useParams();   // undefined → режим создания
  const navigate        = useNavigate();
  const { user, token } = useAuth();
  const isEdit          = Boolean(slug);

  const [title,      setTitle]      = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [content,    setContent]    = useState('');
  const [preview,    setPreview]    = useState(false);
  const [loading,    setLoading]    = useState(isEdit);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);

  // Ref для надёжного чтения HTML из редактора при сохранении
  // (state может не обновиться если пользователь сразу жмёт «Опубликовать»)
  const editorContentRef = useRef('');

  const handleContentChange = useCallback((html) => {
    editorContentRef.current = html;
    setContent(html);
  }, []);

  // Перенаправляем не-администраторов
  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/');
  }, [user, navigate]);

  // Загружаем данные для редактирования
  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);

    axios.get(`/api/news/${slug}`)
      .then(({ data }) => {
        setTitle(data.title);
        setPreviewUrl(data.previewImageUrl || '');
        const html = data.content || '';
        setContent(html);
        editorContentRef.current = html;
      })
      .catch(() => setError('Новость не найдена'))
      .finally(() => setLoading(false));
  }, [isEdit, slug]);

  // Загрузка изображения для вставки в редактор
  const handleUploadImage = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('image', file);

    const { data } = await axios.post('/api/news/upload-image', formData, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });
    return { url: data.url };
  }, [token]);

  // Загрузка превью через ImageUpload — колбэк получает уже готовый URL
  const handlePreviewUpload = useCallback((url) => {
    setPreviewUrl(url);
  }, []);

  const handleSave = async () => {
    if (!title.trim()) { setError('Введите заголовок'); return; }

    // Читаем из ref — гарантированно актуальное значение
    const finalContent = editorContentRef.current || content;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        title:             title.trim(),
        preview_image_url: previewUrl || null,
        content:           finalContent,
      };

      if (isEdit) {
        const { data } = await axios.put(`/api/news/${slug}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        navigate(`/news/${data.slug}`);
      } else {
        const { data } = await axios.post('/api/news', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        navigate(`/news/${data.slug}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при сохранении');
      setSaving(false);
    }
  };

  if (loading) return <main className="news-create"><p className="news-create__loading">Загрузка...</p></main>;

  return (
    <main className="news-create">
      <div className="news-create__header">
        <h1 className="news-create__title">
          {isEdit ? 'Редактировать новость' : 'Новая новость'}
        </h1>
        <div className="news-create__header-actions">
          <button
            type="button"
            className={`news-create__preview-toggle${preview ? ' news-create__preview-toggle--active' : ''}`}
            onClick={() => setPreview(p => !p)}
          >
            {preview ? '✏️ Редактор' : '👁 Предпросмотр'}
          </button>
          {isEdit && (
            <Link to={`/news/${slug}`} className="news-create__cancel">
              Отмена
            </Link>
          )}
        </div>
      </div>

      {error && <p className="news-create__error">{error}</p>}

      {preview ? (
        /* ── ПРЕДПРОСМОТР ── */
        <div className="news-create__preview-area">
          {previewUrl && (
            <img src={previewUrl} alt="превью" className="news-create__preview-img" />
          )}
          <h1 className="news-create__preview-title">{title || 'Заголовок'}</h1>
          <div
            className="news-content news-create__preview-content"
            dangerouslySetInnerHTML={{ __html: editorContentRef.current || '<p style="color:#555">Нет содержимого</p>' }}
          />
        </div>
      ) : (
        /* ── РЕДАКТОР ── */
        <div className="news-create__form">

          {/* Превью-изображение — первым */}
          <div className="news-create__field">
            <label className="news-create__label">Превью-изображение</label>
            <div className="news-create__preview-upload">
              {previewUrl && (
                <div className="news-create__preview-thumb">
                  <img src={previewUrl} alt="превью" />
                  <button
                    type="button"
                    className="news-create__preview-remove"
                    onClick={() => setPreviewUrl('')}
                    title="Удалить превью"
                  >✕</button>
                </div>
              )}
              <div className="news-create__preview-inputs">
                <input
                  type="text"
                  className="news-create__input news-create__input--url"
                  placeholder="Вставьте URL изображения..."
                  value={previewUrl}
                  onChange={e => setPreviewUrl(e.target.value)}
                />
                <ImageUpload onUpload={handlePreviewUpload} label="Загрузить" />
              </div>
            </div>
          </div>

          {/* Заголовок — вторым */}
          <div className="news-create__field">
            <label className="news-create__label">
              Заголовок
              <span className="news-create__char-count">
                {title.length}/{TITLE_MAX}
              </span>
            </label>
            <input
              type="text"
              className="news-create__input"
              placeholder="Введите заголовок новости..."
              value={title}
              maxLength={TITLE_MAX}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Редактор контента */}
          <div className="news-create__field">
            <label className="news-create__label">Содержимое</label>
            <RichTextEditor
              value={content}
              onChange={handleContentChange}
              onUploadImage={handleUploadImage}
              placeholder="Напишите текст новости..."
            />
          </div>
        </div>
      )}

      {/* Кнопка сохранения */}
      <div className="news-create__actions">
        <button
          type="button"
          className="news-create__save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Сохранение...' : isEdit ? 'Сохранить изменения' : 'Опубликовать'}
        </button>
      </div>
    </main>
  );
}

export default NewsCreate;
