// pages/Dashboard/EventCreate.jsx
// Страница создания (/dashboard/events/create)
// и редактирования (/dashboard/events/:slug/edit) события.

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
import './EventCreate.scss';

const TITLE_MAX = 200;

const pad = n => String(n).padStart(2, '0');

// unix timestamp → YYYY-MM-DD
function tsToDateStr(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// unix timestamp → HH:MM (пустая строка если время было приблизительным)
function tsToTimeStr(ts, approximate) {
  if (!ts || approximate) return '';
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// дата + время → unix timestamp; если время пустое — используется полночь
function dateTimeToTs(dateStr, timeStr) {
  if (!dateStr) return null;
  return Math.floor(new Date(`${dateStr}T${timeStr || '00:00'}`).getTime() / 1000);
}

// ---------------------------------------------------------------------------
// EventCreate
// ---------------------------------------------------------------------------
function EventCreate() {
  const { slug }        = useParams();
  const navigate        = useNavigate();
  const { user, token } = useAuth();
  const { allPlayers }  = usePlayer();
  const isEdit          = Boolean(slug);

  const [title,                  setTitle]                  = useState('');
  const [previewUrl,             setPreviewUrl]             = useState('');
  const [previewResultsUrl,      setPreviewResultsUrl]      = useState('');
  const [startDate,   setStartDate]   = useState('');
  const [startTime,   setStartTime]   = useState(''); // HH:MM, опционально
  const [endDate,     setEndDate]     = useState('');
  const [endTime,     setEndTime]     = useState('');  // HH:MM, опционально
  const [eventStatus,            setEventStatus]            = useState('scheduled');
  const [contentMain,            setContentMain]            = useState('');
  const [contentResults,         setContentResults]         = useState('');

  // Режим предпросмотра / редактор
  const [preview,    setPreview]    = useState(false);
  // Активная вкладка — как в редакторе, так и в предпросмотре
  const [activeTab,  setActiveTab]  = useState('main'); // 'main' | 'results'

  const [loading,  setLoading]  = useState(isEdit);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [authorId, setAuthorId] = useState(null);

  const mainContentRef    = useRef('');
  const resultsContentRef = useRef('');

  const handleMainChange = useCallback((html) => {
    mainContentRef.current = html;
    setContentMain(html);
  }, []);

  const handleResultsChange = useCallback((html) => {
    resultsContentRef.current = html;
    setContentResults(html);
  }, []);

  // Для редактирования: только автор или editor+/manage_events
  useEffect(() => {
    if (!isEdit || loading || !user || authorId === null) return;
    const level = { creator: 4, admin: 3, editor: 2, user: 1 };
    const canEditAny = (level[user.role] ?? 1) >= 2 || (user.customPermissions ?? []).includes('manage_events');
    const isAuthor   = authorId === user.id;
    if (!isAuthor && !canEditAny) navigate('/');
  }, [isEdit, loading, user, authorId, navigate]);

  // Загружаем данные для редактирования
  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    axios.get(`/api/events/${slug}`)
      .then(({ data }) => {
        setAuthorId(data.author?.id ?? null);
        setTitle(data.title);
        setPreviewUrl(data.previewImageUrl || '');
        setPreviewResultsUrl(data.previewImageResultsUrl || '');
        setStartDate(tsToDateStr(data.startTime));
        setStartTime(tsToTimeStr(data.startTime, data.startTimeApproximate));
        setEndDate(tsToDateStr(data.endTime));
        setEndTime(tsToTimeStr(data.endTime, false));
        setEventStatus(data.status || 'scheduled');
        const main    = data.contentMain    || '';
        const results = data.contentResults || '';
        setContentMain(main);
        setContentResults(results);
        mainContentRef.current    = main;
        resultsContentRef.current = results;
      })
      .catch(() => setError('Событие не найдено'))
      .finally(() => setLoading(false));
  }, [isEdit, slug]);

  // Создание опроса из RichTextEditor
  const handleCreatePoll = useCallback(async (pollData) => {
    const { data } = await axios.post('/api/polls', pollData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { id: data.id };
  }, [token]);

  // Загрузка изображения для вставки в редактор
  const handleUploadImage = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const { data } = await axios.post('/api/events/upload-image', formData, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
    });
    return { url: data.url, fileType: data.fileType };
  }, [token]);

  const handlePreviewUpload = useCallback((url) => setPreviewUrl(url), []);
  const handlePreviewResultsUpload = useCallback((url) => setPreviewResultsUrl(url), []);

  const handleSave = async () => {
    if (!title.trim()) { setError('Введите заголовок'); return; }
    const startTs = dateTimeToTs(startDate, startTime);
    if (!startTs)  { setError('Укажите дату начала'); return; }

    const finalMain    = mainContentRef.current    || contentMain;
    const finalResults = resultsContentRef.current || contentResults;

    setSaving(true);
    setError(null);
    try {
      const payload = {
        title:                        title.trim(),
        preview_image_url:            previewUrl || null,
        preview_image_results_url:    previewResultsUrl || null,
        content_main:                 finalMain,
        content_results:              finalResults || null,
        start_time:                   startTs,
        start_time_approximate:       !startTime, // нет времени → приблизительно
        end_time:                     dateTimeToTs(endDate, endTime),
        status:                       eventStatus,
      };
      let saved;
      if (isEdit) {
        const { data } = await axios.put(`/api/events/${slug}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        saved = data;
      } else {
        const { data } = await axios.post('/api/events', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        saved = data;
      }
      navigate(`/events/${saved.slug}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при сохранении');
      setSaving(false);
    }
  };

  if (loading) return <main className="event-create"><p className="event-create__loading">Загрузка...</p></main>;

  // Общие вкладки — используются и в редакторе, и в предпросмотре
  const tabBar = (
    <div className="event-create__tabs">
      <button
        className={`event-create__tab${activeTab === 'main' ? ' event-create__tab--active' : ''}`}
        onClick={() => setActiveTab('main')}
      >
        Основная информация
      </button>
      <button
        className={`event-create__tab${activeTab === 'results' ? ' event-create__tab--active' : ''}`}
        onClick={() => setActiveTab('results')}
      >
        Итоги
      </button>
    </div>
  );

  return (
    <main className="event-create">
      <div className="event-create__header">
        <h1 className="event-create__title">
          {isEdit ? 'Редактировать событие' : 'Новое событие'}
        </h1>
        <div className="event-create__header-actions">
          <button
            type="button"
            className={`event-create__preview-toggle${preview ? ' event-create__preview-toggle--active' : ''}`}
            onClick={() => setPreview(p => !p)}
          >
            {preview ? '✏️ Редактор' : '👁 Предпросмотр'}
          </button>
          {isEdit && (
            <Link to={`/events/${slug}`} className="event-create__cancel">
              Отмена
            </Link>
          )}
        </div>
      </div>

      {error && <p className="event-create__error">{error}</p>}

      {preview ? (
        /* ── ПРЕДПРОСМОТР ── */
        <div className="event-create__preview-area">
          <h1 className="event-create__preview-title">{title || 'Заголовок'}</h1>

          {/* Вкладки — над изображением */}
          {tabBar}

          {(() => {
            const imgUrl = activeTab === 'results' && previewResultsUrl ? previewResultsUrl : previewUrl;
            return imgUrl ? <img src={imgUrl} alt="превью" className="event-create__preview-img" /> : null;
          })()}

          {activeTab === 'main' && (
            <EventPreviewContent html={mainContentRef.current} />
          )}
          {activeTab === 'results' && (
            <EventPreviewContent html={resultsContentRef.current} />
          )}
        </div>
      ) : (
        /* ── РЕДАКТОР ── */
        <div className="event-create__form">

          {/* Заголовок */}
          <div className="event-create__field">
            <label className="event-create__label">
              Заголовок
              <span className="event-create__char-count">{title.length}/{TITLE_MAX}</span>
            </label>
            <input
              type="text"
              className="event-create__input"
              placeholder="Введите название события..."
              value={title}
              maxLength={TITLE_MAX}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Даты */}
          <div className="event-create__dates">
            <div className="event-create__field">
              <label className="event-create__label">Дата начала *</label>
              <div className="event-create__date-row">
                <input
                  type="date"
                  className="event-create__input event-create__input--date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <input
                  type="time"
                  className="event-create__input event-create__input--time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  placeholder="--:--"
                />
              </div>
              {!startTime && startDate && (
                <p className="event-create__approximate-hint">Время не указано — будет отображаться «Примерно»</p>
              )}
            </div>
            <div className="event-create__field">
              <label className="event-create__label">Дата окончания (необязательно)</label>
              <div className="event-create__date-row">
                <input
                  type="date"
                  className="event-create__input event-create__input--date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
                <input
                  type="time"
                  className="event-create__input event-create__input--time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  placeholder="--:--"
                />
              </div>
            </div>
          </div>

          {/* Статус события */}
          <div className="event-create__field">
            <label className="event-create__label">Статус события</label>
            <select
              className="event-create__input"
              value={eventStatus}
              onChange={e => setEventStatus(e.target.value)}
            >
              <option value="scheduled">Запланировано</option>
              <option value="in_progress">В процессе</option>
              <option value="completed">Завершено</option>
            </select>
          </div>

          {/* Переключение между редакторами */}
          {tabBar}

          {/* Редактор: Основная информация */}
          {activeTab === 'main' && (
            <>
              <div className="event-create__field">
                <label className="event-create__label">Шапка (основная информация)</label>
                <div className="event-create__preview-upload">
                  {previewUrl && (
                    <div className="event-create__preview-thumb">
                      <img src={previewUrl} alt="превью" />
                      <button
                        type="button"
                        className="event-create__preview-remove"
                        onClick={() => setPreviewUrl('')}
                        title="Удалить превью"
                      >✕</button>
                    </div>
                  )}
                  <div className="event-create__preview-inputs">
                    <input
                      type="text"
                      className="event-create__input event-create__input--url"
                      placeholder="Вставьте URL изображения..."
                      value={previewUrl}
                      onChange={e => setPreviewUrl(e.target.value)}
                    />
                    <ImageUpload onUpload={handlePreviewUpload} label="Загрузить" showPreview={false} />
                  </div>
                </div>
              </div>
              <div className="event-create__field event-create__field--editor">
                <RichTextEditor
                  key="editor-main"
                  value={contentMain}
                  onChange={handleMainChange}
                  onUploadImage={handleUploadImage}
                  onCreatePoll={handleCreatePoll}
                  allPlayers={allPlayers}
                  placeholder="Расскажите об этом событии..."
                />
              </div>
            </>
          )}

          {/* Редактор: Итоги */}
          {activeTab === 'results' && (
            <>
              <div className="event-create__field">
                <label className="event-create__label">Шапка (итоги)</label>
                <div className="event-create__preview-upload">
                  {previewResultsUrl && (
                    <div className="event-create__preview-thumb">
                      <img src={previewResultsUrl} alt="превью итогов" />
                      <button
                        type="button"
                        className="event-create__preview-remove"
                        onClick={() => setPreviewResultsUrl('')}
                        title="Удалить превью"
                      >✕</button>
                    </div>
                  )}
                  <div className="event-create__preview-inputs">
                    <input
                      type="text"
                      className="event-create__input event-create__input--url"
                      placeholder="Вставьте URL изображения..."
                      value={previewResultsUrl}
                      onChange={e => setPreviewResultsUrl(e.target.value)}
                    />
                    <ImageUpload onUpload={handlePreviewResultsUpload} label="Загрузить" showPreview={false} />
                  </div>
                </div>
              </div>
              <div className="event-create__field event-create__field--editor">
                <p className="event-create__results-hint">
                  Вкладка «Итоги» будет видна на странице события только при наличии контента.
                </p>
                <RichTextEditor
                  key="editor-results"
                  value={contentResults}
                  onChange={handleResultsChange}
                  onUploadImage={handleUploadImage}
                  onCreatePoll={handleCreatePoll}
                  allPlayers={allPlayers}
                  placeholder="Заполните после завершения события..."
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Кнопка сохранения */}
      <div className="event-create__actions">
        <button
          type="button"
          className="event-create__save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Сохранение...' : isEdit ? 'Сохранить изменения' : 'Опубликовать'}
        </button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// EventPreviewContent — предпросмотр HTML-контента
// ---------------------------------------------------------------------------
const DIV_POLL_RE        = /<div[^>]*class="rte-poll-marker"[^>]*data-poll-id="([0-9a-f-]{36})"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_SLIDER_RE      = /<div[^>]*class="rte-slider"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_PLAYERLIST_RE  = /<div[^>]*class="rte-player-list"[^>]*data-players="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_IMAGEROW_RE    = /<div[^>]*class="rte-image-row"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const SEP = '\x00';

function normalizePreview(html) {
  return html
    .replace(DIV_POLL_RE,       (_, id)  => `${SEP}[POLL:${id}]${SEP}`)
    .replace(DIV_SLIDER_RE,     (_, enc) => `${SEP}[SLIDER:${enc}]${SEP}`)
    .replace(DIV_PLAYERLIST_RE, (_, enc) => `${SEP}[PLAYERLIST:${enc}]${SEP}`)
    .replace(DIV_IMAGEROW_RE,   (_, enc) => `${SEP}[IMAGEROW:${enc}]${SEP}`);
}

const TOKEN_RE = /\[POLL:([0-9a-f-]{36})\]|\[SLIDER:([^\]]*)\]|\[PLAYERLIST:([^\]]*)\]|\[IMAGEROW:([^\]]*)\]/g;

function parsePreviewParts(html) {
  const normalized = normalizePreview(html);
  const parts = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(TOKEN_RE.source, 'g');
  while ((match = re.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      const chunk = normalized.slice(lastIndex, match.index).replace(new RegExp(SEP, 'g'), '');
      if (chunk.trim()) parts.push({ type: 'html', value: chunk });
    }
    if      (match[1]) parts.push({ type: 'poll',       id:      match[1] });
    else if (match[2]) { try { parts.push({ type: 'slider',     images:  JSON.parse(decodeURIComponent(match[2])) }); } catch { /* ignore */ } }
    else if (match[3]) { try { parts.push({ type: 'playerlist', players: JSON.parse(decodeURIComponent(match[3])) }); } catch { /* ignore */ } }
    else if (match[4]) { try { parts.push({ type: 'imagerow',   images:  JSON.parse(decodeURIComponent(match[4])) }); } catch { /* ignore */ } }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < normalized.length) {
    const tail = normalized.slice(lastIndex).replace(new RegExp(SEP, 'g'), '');
    if (tail.trim()) parts.push({ type: 'html', value: tail });
  }
  return parts;
}

function EventPreviewContent({ html }) {
  if (!html) return <p style={{ color: '#555' }}>Нет содержимого</p>;

  const parts = parsePreviewParts(html);
  const hasSpecial = parts.some(p => p.type !== 'html');

  if (!hasSpecial) {
    const clean = normalizePreview(html).replace(new RegExp(SEP, 'g'), '');
    return <div className="news-content event-create__preview-content" dangerouslySetInnerHTML={{ __html: clean }} />;
  }

  return (
    <div className="news-content event-create__preview-content">
      {parts.map((part, i) => {
        if (part.type === 'poll')       return <PollViewer       key={`poll-${part.id}`} pollId={part.id} />;
        if (part.type === 'slider')     return <SliderViewer     key={`slider-${i}`}     images={part.images} />;
        if (part.type === 'playerlist') return <PlayerListViewer key={`players-${i}`}    players={part.players} />;
        if (part.type === 'imagerow')   return <ImageRowViewer   key={`imagerow-${i}`}   images={part.images} />;
        return <div key={i} dangerouslySetInnerHTML={{ __html: part.value }} />;
      })}
    </div>
  );
}

export default EventCreate;
