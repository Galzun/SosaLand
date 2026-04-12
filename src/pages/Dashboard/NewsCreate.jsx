// pages/Dashboard/NewsCreate.jsx
// Страница создания (/dashboard/news/create)
// и редактирования (/dashboard/news/:slug/edit) новости.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import ImageUpload from '../../Components/ImageUpload/ImageUpload';
import RichTextEditor from '../../Components/RichTextEditor/RichTextEditor';
import PollViewer from '../../Components/PollViewer/PollViewer';
import SliderViewer from '../../Components/SliderViewer/SliderViewer';
import PlayerListViewer from '../../Components/PlayerListViewer/PlayerListViewer';
import ImageRowViewer from '../../Components/ImageRowViewer/ImageRowViewer';
import './NewsCreate.scss';

const TITLE_MAX = 200;

function NewsCreate() {
  const { slug }        = useParams();   // undefined → режим создания
  const navigate        = useNavigate();
  const { user, token } = useAuth();
  const { allPlayers }  = usePlayer();
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

  // Перенаправляем тех, у кого нет прав редактора и выше
  useEffect(() => {
    const level = { creator: 4, admin: 3, editor: 2, user: 1 };
    if (user && (level[user.role] ?? 1) < 2) navigate('/');
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

  // Создание опроса из RichTextEditor (news_id добавляется после публикации новости,
  // поэтому создаём опрос без привязки — новость ещё не существует).
  // Опросы созданные в редакторе до сохранения новости хранятся без news_id.
  // После сохранения новости патчим каждый опрос через PUT /api/polls/:id.
  const pendingPollIdsRef = useRef([]); // uuid созданных опросов без news_id

  const handleCreatePoll = useCallback(async (pollData) => {
    // Создаём опрос без news_id (admin может создавать «свободные» опросы)
    const { data } = await axios.post('/api/polls', pollData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Запоминаем id — при сохранении новости проставим news_id
    if (!isEdit) {
      pendingPollIdsRef.current.push(data.id);
    }
    return { id: data.id };
  }, [token, isEdit]);


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
    return { url: data.url, fileType: data.fileType };
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

      let savedNews;
      if (isEdit) {
        const { data } = await axios.put(`/api/news/${slug}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        savedNews = data;
      } else {
        const { data } = await axios.post('/api/news', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        savedNews = data;
      }

      // Привязываем «свободные» опросы к только что сохранённой новости
      if (pendingPollIdsRef.current.length > 0) {
        await Promise.all(
          pendingPollIdsRef.current.map(pollId =>
            axios.put(`/api/polls/${pollId}`, { news_id: savedNews.id }, {
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {}) // не блокируем навигацию при ошибке одного опроса
          )
        );
        pendingPollIdsRef.current = [];
      }

      navigate(`/news/${savedNews.slug}`);
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
          <NewsPreviewContent html={editorContentRef.current} />
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
                <ImageUpload onUpload={handlePreviewUpload} label="Загрузить" showPreview={false} />
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
              onCreatePoll={handleCreatePoll}
              allPlayers={allPlayers}
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

// Предпросмотр контента: рендерит HTML + опросы/слайдеры/игроков
// Переиспользует ту же логику парсинга, что NewsDetailPage.

const DIV_POLL_RE        = /<div[^>]*class="rte-poll-marker"[^>]*data-poll-id="([0-9a-f-]{36})"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_SLIDER_RE      = /<div[^>]*class="rte-slider"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_PLAYERLIST_RE  = /<div[^>]*class="rte-player-list"[^>]*data-players="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_IMAGEROW_RE    = /<div[^>]*class="rte-image-row"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const SEP = '\x00';

function normalizePreviewContent(html) {
  return html
    .replace(DIV_POLL_RE,       (_, id)  => `${SEP}[POLL:${id}]${SEP}`)
    .replace(DIV_SLIDER_RE,     (_, enc) => `${SEP}[SLIDER:${enc}]${SEP}`)
    .replace(DIV_PLAYERLIST_RE, (_, enc) => `${SEP}[PLAYERLIST:${enc}]${SEP}`)
    .replace(DIV_IMAGEROW_RE,   (_, enc) => `${SEP}[IMAGEROW:${enc}]${SEP}`);
}

const TOKEN_RE = /\[POLL:([0-9a-f-]{36})\]|\[SLIDER:([^\]]*)\]|\[PLAYERLIST:([^\]]*)\]|\[IMAGEROW:([^\]]*)\]/g;

function parsePreviewParts(html) {
  const normalized = normalizePreviewContent(html);
  const parts = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(TOKEN_RE.source, 'g');
  while ((match = re.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      const chunk = normalized.slice(lastIndex, match.index).replace(new RegExp(SEP, 'g'), '');
      if (chunk.trim()) parts.push({ type: 'html', value: chunk });
    }
    if (match[1]) {
      parts.push({ type: 'poll', id: match[1] });
    } else if (match[2]) {
      try { parts.push({ type: 'slider', images: JSON.parse(decodeURIComponent(match[2])) }); } catch { /* ignore */ }
    } else if (match[3]) {
      try { parts.push({ type: 'playerlist', players: JSON.parse(decodeURIComponent(match[3])) }); } catch { /* ignore */ }
    } else if (match[4]) {
      try { parts.push({ type: 'imagerow', images: JSON.parse(decodeURIComponent(match[4])) }); } catch { /* ignore */ }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < normalized.length) {
    const tail = normalized.slice(lastIndex).replace(new RegExp(SEP, 'g'), '');
    if (tail.trim()) parts.push({ type: 'html', value: tail });
  }
  return parts;
}

function NewsPreviewContent({ html }) {
  if (!html) {
    return <p style={{ color: '#555' }}>Нет содержимого</p>;
  }

  const parts = parsePreviewParts(html);
  const hasSpecial = parts.some(p => p.type !== 'html');

  if (!hasSpecial) {
    const clean = normalizePreviewContent(html).replace(new RegExp(SEP, 'g'), '');
    return (
      <div
        className="news-content news-create__preview-content"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  return (
    <div className="news-content news-create__preview-content">
      {parts.map((part, i) => {
        if (part.type === 'poll')       return <PollViewer       key={`poll-${part.id}`} pollId={part.id} />;
        if (part.type === 'slider')     return <SliderViewer     key={`slider-${i}`}    images={part.images} />;
        if (part.type === 'playerlist') return <PlayerListViewer key={`players-${i}`}   players={part.players} />;
        if (part.type === 'imagerow')   return <ImageRowViewer   key={`imagerow-${i}`}  images={part.images} />;
        return <div key={i} dangerouslySetInnerHTML={{ __html: part.value }} />;
      })}
    </div>
  );
}

export default NewsCreate;
