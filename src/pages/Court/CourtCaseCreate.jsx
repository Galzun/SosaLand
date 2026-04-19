// pages/Court/CourtCaseCreate.jsx
// Страница создания (/court/cases/create) и редактирования (/court/cases/:id/edit) заседания.
// Дизайн полностью как у EventCreate — RichTextEditor, вкладки, превью.

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
import '../Dashboard/EventCreate.scss';

const ROLE_LEVEL = { user: 1, editor: 2, admin: 3, creator: 4 };

function tsToDatetimeLocal(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToTs(str) {
  if (!str) return null;
  return Math.floor(new Date(str).getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Предпросмотр HTML-контента (та же логика что в EventCreate)
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
  const re = new RegExp(TOKEN_RE.source, 'g');
  let match;
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

function CasePreviewContent({ html }) {
  if (!html) return <p style={{ color: '#555' }}>Нет содержимого</p>;
  const parts = parsePreviewParts(html);
  if (!parts.some(p => p.type !== 'html')) {
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

// ---------------------------------------------------------------------------
// CourtCaseCreate
// ---------------------------------------------------------------------------
function CourtCaseCreate() {
  const { id }                         = useParams();
  const navigate                       = useNavigate();
  const { user, token, loading: authLoading } = useAuth();
  const { allPlayers }                 = usePlayer();
  const isEdit = Boolean(id);

  const [title,                 setTitle]                 = useState('');
  const [previewImageUrl,       setPreviewImageUrl]       = useState('');
  const [previewVerdictImageUrl, setPreviewVerdictImageUrl] = useState('');
  const [hearingAt,      setHearingAt]      = useState('');
  const [status,         setStatus]         = useState('scheduled');
  const [ticketId,       setTicketId]       = useState('');
  const [tickets,        setTickets]        = useState([]);

  const [contentDesc,    setContentDesc]    = useState('');
  const [contentVerdict, setContentVerdict] = useState('');

  const [preview,    setPreview]    = useState(false);
  const [activeTab,  setActiveTab]  = useState('desc'); // 'desc' | 'verdict'

  const [loading, setLoading] = useState(isEdit);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  const descRef    = useRef('');
  const verdictRef = useRef('');

  const handleDescChange = useCallback((html) => {
    descRef.current = html;
    setContentDesc(html);
  }, []);

  const handleVerdictChange = useCallback((html) => {
    verdictRef.current = html;
    setContentVerdict(html);
  }, []);

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    const perms       = user?.customPermissions ?? [];
    const callerLevel = ROLE_LEVEL[user.role] ?? 0;
    if (callerLevel < ROLE_LEVEL.admin && !perms.includes('manage_court')) {
      navigate('/court');
    }
  }, [user, authLoading, navigate]);

  // Load tickets for linking
  useEffect(() => {
    if (!token) return;
    axios.get('/api/court/tickets?status=reviewing', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setTickets(r.data))
      .catch(() => {});
  }, [token]);

  // Load existing case for editing
  useEffect(() => {
    if (!isEdit || !token) return;
    axios.get(`/api/court/cases/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        setTitle(data.title || '');
        setPreviewImageUrl(data.previewImageUrl || '');
        setPreviewVerdictImageUrl(data.previewVerdictImageUrl || '');
        setHearingAt(tsToDatetimeLocal(data.hearingAt));
        setStatus(data.status || 'scheduled');
        setTicketId(data.ticketId || '');
        const desc    = data.description || '';
        const verdict = data.verdict     || '';
        setContentDesc(desc);
        setContentVerdict(verdict);
        descRef.current    = desc;
        verdictRef.current = verdict;
      })
      .catch(() => setError('Заседание не найдено'))
      .finally(() => setLoading(false));
  }, [isEdit, id, token]);

  // Auto-switch to "in_progress" when hearing date has already passed
  useEffect(() => {
    if (!hearingAt || status !== 'scheduled') return;
    const ts = datetimeLocalToTs(hearingAt);
    if (ts && ts <= Math.floor(Date.now() / 1000)) setStatus('in_progress');
  }, [hearingAt, status]);

  const handleUploadImage = useCallback(async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    const { data } = await axios.post('/api/upload', fd, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
    });
    return { url: data.url || data.fileUrl, fileType: data.fileType };
  }, [token]);

  const handleCreatePoll = useCallback(async (pollData) => {
    const { data } = await axios.post('/api/polls', pollData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { id: data.id };
  }, [token]);

  const handleSave = async () => {
    if (!title.trim()) { setError('Введите название'); return; }
    const finalDesc    = descRef.current    || contentDesc;
    const finalVerdict = verdictRef.current || contentVerdict;
    setSaving(true);
    setError(null);
    const payload = {
      title:                 title.trim(),
      previewImageUrl:       previewImageUrl.trim()       || null,
      previewVerdictImageUrl: previewVerdictImageUrl.trim() || null,
      hearingAt:      datetimeLocalToTs(hearingAt),
      status,
      description:    finalDesc    || null,
      verdict:        finalVerdict || null,
      ticketId:       ticketId     || null,
    };
    try {
      if (isEdit) {
        await axios.put(`/api/court/cases/${id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        navigate(`/court/cases/${id}`);
      } else {
        const { data } = await axios.post('/api/court/cases', payload, { headers: { Authorization: `Bearer ${token}` } });
        navigate(`/court/cases/${data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при сохранении');
      setSaving(false);
    }
  };

  if (authLoading || loading) return <main className="event-create"><p className="event-create__loading">Загрузка...</p></main>;

  const tabBar = (
    <div className="event-create__tabs">
      <button
        className={`event-create__tab${activeTab === 'desc' ? ' event-create__tab--active' : ''}`}
        onClick={() => setActiveTab('desc')}
      >
        Описание
      </button>
      <button
        className={`event-create__tab${activeTab === 'verdict' ? ' event-create__tab--active' : ''}`}
        onClick={() => setActiveTab('verdict')}
      >
        Итог / Приговор
      </button>
    </div>
  );

  return (
    <main className="event-create">
      <div className="event-create__header">
        <h1 className="event-create__title">
          {isEdit ? 'Редактировать заседание' : 'Новое заседание'}
        </h1>
        <div className="event-create__header-actions">
          <button
            type="button"
            className={`event-create__preview-toggle${preview ? ' event-create__preview-toggle--active' : ''}`}
            onClick={() => setPreview(p => !p)}
          >
            {preview ? '✏️ Редактор' : '👁 Предпросмотр'}
          </button>
          <Link
            to={isEdit ? `/court/cases/${id}` : '/court'}
            className="event-create__cancel"
          >
            Отмена
          </Link>
        </div>
      </div>

      {error && <p className="event-create__error">{error}</p>}

      {preview ? (
        /* ── ПРЕДПРОСМОТР ── */
        <div className="event-create__preview-area">
          {(() => {
            const img = activeTab === 'verdict' ? previewVerdictImageUrl : previewImageUrl;
            return img ? (
              <img
                src={img}
                alt={title}
                style={{ width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 12, marginBottom: 16, display: 'block' }}
              />
            ) : null;
          })()}
          <h1 className="event-create__preview-title">{title || 'Название'}</h1>
          {tabBar}
          {activeTab === 'desc'    && <CasePreviewContent html={descRef.current} />}
          {activeTab === 'verdict' && <CasePreviewContent html={verdictRef.current} />}
        </div>
      ) : (
        /* ── РЕДАКТОР ── */
        <div className="event-create__form">

          {/* Название */}
          <div className="event-create__field">
            <label className="event-create__label">
              Название
              <span className="event-create__char-count">{title.length}/200</span>
            </label>
            <input
              type="text"
              className="event-create__input"
              placeholder="Название судебного заседания..."
              value={title}
              maxLength={200}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Дата + статус */}
          <div className="event-create__dates">
            <div className="event-create__field">
              <label className="event-create__label">Дата заседания</label>
              <input
                type="datetime-local"
                className="event-create__input event-create__input--datetime"
                value={hearingAt}
                onChange={e => setHearingAt(e.target.value)}
              />
            </div>
            <div className="event-create__field">
              <label className="event-create__label">Статус</label>
              <select
                className="event-create__input"
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                <option value="scheduled">Запланировано</option>
                <option value="in_progress">В процессе</option>
                <option value="completed">Завершено</option>
              </select>
            </div>
          </div>

          {/* Привязка к тикету */}
          {tickets.length > 0 && (
            <div className="event-create__field">
              <label className="event-create__label">Привязать жалобу (необязательно)</label>
              <select
                className="event-create__input"
                value={ticketId}
                onChange={e => setTicketId(e.target.value)}
              >
                <option value="">— без жалобы —</option>
                {tickets.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.accusedName})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Вкладки редактора */}
          {tabBar}

          {activeTab === 'desc' && (
            <>
              <div className="event-create__field">
                <label className="event-create__label">Шапка</label>
                <div className="event-create__preview-upload">
                  {previewImageUrl && (
                    <div className="event-create__preview-thumb">
                      <img src={previewImageUrl} alt="превью" />
                      <button
                        type="button"
                        className="event-create__preview-remove"
                        onClick={() => setPreviewImageUrl('')}
                        title="Удалить"
                      >✕</button>
                    </div>
                  )}
                  <div className="event-create__preview-inputs">
                    <input
                      type="text"
                      className="event-create__input event-create__input--url"
                      placeholder="Вставьте URL изображения..."
                      value={previewImageUrl}
                      onChange={e => setPreviewImageUrl(e.target.value)}
                    />
                    <ImageUpload onUpload={setPreviewImageUrl} label="Загрузить" showPreview={false} />
                  </div>
                </div>
              </div>
              <div className="event-create__field event-create__field--editor">
                <RichTextEditor
                  key="editor-desc"
                  value={contentDesc}
                  onChange={handleDescChange}
                  onUploadImage={handleUploadImage}
                  onCreatePoll={handleCreatePoll}
                  allPlayers={allPlayers}
                  placeholder="Опишите заседание..."
                />
              </div>
            </>
          )}

          {activeTab === 'verdict' && (
            <>
              <div className="event-create__field">
                <label className="event-create__label">Шапка (итог)</label>
                <div className="event-create__preview-upload">
                  {previewVerdictImageUrl && (
                    <div className="event-create__preview-thumb">
                      <img src={previewVerdictImageUrl} alt="превью итог" />
                      <button
                        type="button"
                        className="event-create__preview-remove"
                        onClick={() => setPreviewVerdictImageUrl('')}
                        title="Удалить"
                      >✕</button>
                    </div>
                  )}
                  <div className="event-create__preview-inputs">
                    <input
                      type="text"
                      className="event-create__input event-create__input--url"
                      placeholder="Вставьте URL изображения..."
                      value={previewVerdictImageUrl}
                      onChange={e => setPreviewVerdictImageUrl(e.target.value)}
                    />
                    <ImageUpload onUpload={setPreviewVerdictImageUrl} label="Загрузить" showPreview={false} />
                  </div>
                </div>
              </div>
              <div className="event-create__field event-create__field--editor">
                <p className="event-create__results-hint">
                  Заполните после завершения заседания.
                </p>
                <RichTextEditor
                  key="editor-verdict"
                  value={contentVerdict}
                  onChange={handleVerdictChange}
                  onUploadImage={handleUploadImage}
                  onCreatePoll={handleCreatePoll}
                  allPlayers={allPlayers}
                  placeholder="Итог и приговор..."
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="event-create__actions">
        <button
          type="button"
          className="event-create__save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Сохранение...' : isEdit ? 'Сохранить изменения' : 'Создать заседание'}
        </button>
      </div>
    </main>
  );
}

export default CourtCaseCreate;
