// pages/Court/CourtCaseDetailPage.jsx
// Страница отдельного судебного заседания /court/cases/:id
// Структура — как у EventDetailPage.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { showConfirm } from '../../Components/Dialog/dialogManager';
import PollViewer from '../../Components/PollViewer/PollViewer';
import SliderViewer from '../../Components/SliderViewer/SliderViewer';
import PlayerListViewer from '../../Components/PlayerListViewer/PlayerListViewer';
import ImageRowViewer from '../../Components/ImageRowViewer/ImageRowViewer';
import ImageModal from '../../Components/ImageModal/ImageModal';
import '../../pages/Events/EventDetailPage.scss';

const ROLE_LEVEL = { user: 1, editor: 2, admin: 3, creator: 4 };

function formatDatetime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateOnly(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDisplayStatus(status, hearingAt, approximate) {
  if (status === 'completed')   return { label: 'Завершено', cls: 'event-detail__timer--completed' };
  if (status === 'in_progress') return { label: 'Идёт',      cls: 'event-detail__timer--in-progress' };

  if (hearingAt) {
    if (approximate) return { label: `Примерно ${formatDateOnly(hearingAt)}`, cls: 'event-detail__timer--approximate' };

    const delta = hearingAt - Math.floor(Date.now() / 1000);
    if (delta > 0) {
      const d = Math.floor(delta / 86400);
      const h = Math.floor((delta % 86400) / 3600);
      const m = Math.floor((delta % 3600) / 60);
      const parts = [];
      if (d > 0) parts.push(`${d} д`);
      if (h > 0) parts.push(`${h} ч`);
      if (m > 0 || parts.length === 0) parts.push(`${m} мин`);
      return { label: `Через ${parts.join(' ')}`, cls: '' };
    }
    return { label: 'Идёт', cls: 'event-detail__timer--in-progress' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Content parsing — same pattern as EventDetailPage / NewsDetailPage
// ---------------------------------------------------------------------------
const DIV_POLL_RE       = /<div[^>]*class="rte-poll-marker"[^>]*data-poll-id="([0-9a-f-]{36})"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_SLIDER_RE     = /<div[^>]*class="rte-slider"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_PLAYERLIST_RE = /<div[^>]*class="rte-player-list"[^>]*data-players="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_IMAGEROW_RE   = /<div[^>]*class="rte-image-row"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;

const SEP = '\x00';

function normalizeContent(html) {
  return html
    .replace(DIV_POLL_RE,       (_, id)  => `${SEP}[POLL:${id}]${SEP}`)
    .replace(DIV_SLIDER_RE,     (_, enc) => `${SEP}[SLIDER:${enc}]${SEP}`)
    .replace(DIV_PLAYERLIST_RE, (_, enc) => `${SEP}[PLAYERLIST:${enc}]${SEP}`)
    .replace(DIV_IMAGEROW_RE,   (_, enc) => `${SEP}[IMAGEROW:${enc}]${SEP}`);
}

const TOKEN_RE = /\[POLL:([0-9a-f-]{36})\]|\[SLIDER:([^\]]*)\]|\[PLAYERLIST:([^\]]*)\]|\[IMAGEROW:([^\]]*)\]/g;

function parseContentParts(html) {
  const normalized = normalizeContent(html);
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

const SKIP_SELECTORS = '.slider-viewer, .player-list-viewer, .image-row-viewer';

function CaseContent({ content, onOpenLightbox }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll('a').forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  });

  const handleClick = useCallback((e) => {
    if (!onOpenLightbox) return;
    const img = e.target.closest('img');
    if (!img || img.closest(SKIP_SELECTORS)) return;
    const allImgs = Array.from(
      containerRef.current.querySelectorAll('img')
    ).filter(el => !el.closest(SKIP_SELECTORS));
    const index = allImgs.indexOf(img);
    if (index === -1) return;
    const images = allImgs.map(el => ({ imageUrl: el.src, fileType: 'image/jpeg' }));
    onOpenLightbox(images, index);
  }, [onOpenLightbox]);

  const parts = parseContentParts(content);
  const hasSpecial = parts.some(p => p.type !== 'html');

  if (!hasSpecial) {
    const normalized = normalizeContent(content).replace(new RegExp(SEP, 'g'), '');
    return (
      <div
        ref={containerRef}
        className="event-detail__content news-content"
        dangerouslySetInnerHTML={{ __html: normalized }}
        onClick={handleClick}
      />
    );
  }

  return (
    <div ref={containerRef} className="event-detail__content news-content" onClick={handleClick}>
      {parts.map((part, i) => {
        if (part.type === 'poll') return <PollViewer key={`poll-${part.id}`} pollId={part.id} />;
        if (part.type === 'slider') return <SliderViewer key={`slider-${i}`} images={part.images} />;
        if (part.type === 'playerlist') return <PlayerListViewer key={`players-${i}`} players={part.players} />;
        if (part.type === 'imagerow') {
          const rowImages = part.images.map(img => {
            const isVid = (img.fileType || '').startsWith('video/') || /\.(mp4|webm|ogg)(\?|$)/i.test(img.url);
            return { imageUrl: img.url, fileType: img.fileType || (isVid ? 'video/mp4' : 'image/jpeg'), isVideo: isVid };
          });
          return (
            <ImageRowViewer
              key={`imagerow-${i}`}
              images={part.images}
              onImageClick={(clickedIdx) => onOpenLightbox?.(rowImages, clickedIdx)}
            />
          );
        }
        return <div key={i} dangerouslySetInnerHTML={{ __html: part.value }} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CourtCaseDetailPage
// ---------------------------------------------------------------------------
function CourtCaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token, loading: authLoading } = useAuth();
  const [courtCase, setCourtCase] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [badge,     setBadge]     = useState(null);
  const [tab,       setTab]       = useState('description');
  const [lightbox,  setLightbox]  = useState(null);
  const [deleting,  setDeleting]  = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    axios.get(`/api/court/cases/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        setCourtCase(r.data);
        setBadge(getDisplayStatus(r.data.status, r.data.hearingAt, r.data.hearingAtApproximate));
        const hasVerdict = r.data.verdict && r.data.verdict.trim().length > 0;
        if (r.data.status === 'completed' && hasVerdict) setTab('verdict');
      })
      .catch(() => setError('Заседание не найдено'))
      .finally(() => setLoading(false));
  }, [id, user, authLoading, token, navigate]);

  useEffect(() => {
    if (!courtCase || !courtCase.hearingAt || courtCase.status === 'completed' || courtCase.hearingAtApproximate) return;
    const iid = setInterval(() => setBadge(getDisplayStatus(courtCase.status, courtCase.hearingAt, courtCase.hearingAtApproximate)), 60_000);
    return () => clearInterval(iid);
  }, [courtCase]);

  const openLightbox = useCallback((images, index) => setLightbox({ images, index }), []);

  if (authLoading || (!courtCase && loading)) return null;
  if (error) return (
    <main className="event-detail">
      <p style={{ color: '#ff6b6b', padding: '24px 20px' }}>{error}</p>
      <div style={{ padding: '0 20px' }}>
        <Link to="/court" style={{ color: '#888', fontSize: '0.9rem' }}>← Назад</Link>
      </div>
    </main>
  );

  const perms       = user?.customPermissions ?? [];
  const callerLevel = ROLE_LEVEL[user?.role] ?? 0;
  const canManage   = callerLevel >= ROLE_LEVEL.admin || perms.includes('manage_court');
  const hasVerdict  = courtCase.verdict && courtCase.verdict.trim().length > 0;

  const handleDelete = async () => {
    if (!await showConfirm('Удалить заседание? Это действие необратимо.')) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/court/cases/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      navigate('/court');
    } catch {
      setDeleting(false);
    }
  };

  return (
    <main className="event-detail">
      <div className="event-detail__back">
        <Link to="/court">← Суд</Link>
      </div>

      {(() => {
        const img = tab === 'verdict' && courtCase.previewVerdictImageUrl
          ? courtCase.previewVerdictImageUrl
          : courtCase.previewImageUrl;
        return img ? (
          <img className="event-detail__preview" src={img} alt={courtCase.title} />
        ) : null;
      })()}

      <header className="event-detail__header">
        <div className="event-detail__title-row">
          <h1 className="event-detail__title">{courtCase.title}</h1>
          {badge && (
            <span className={`event-detail__timer${badge.cls ? ` ${badge.cls}` : ''}`}>
              {badge.label}
            </span>
          )}
        </div>

        <div className="event-detail__start-info">
          {courtCase.hearingAt && (
            <>
              <span className="event-detail__start-label">Дата заседания:</span>
              <span className="event-detail__start-date">
                {courtCase.hearingAtApproximate
                  ? `Примерно ${formatDateOnly(courtCase.hearingAt)}`
                  : formatDatetime(courtCase.hearingAt)
                }
              </span>
            </>
          )}
          {courtCase.ticketTitle && (
            <>
              <span className="event-detail__start-label">Жалоба:</span>
              <span className="event-detail__start-date">
                {courtCase.ticketTitle}
                {courtCase.ticketAccused && ` — ${courtCase.ticketAccused}`}
              </span>
            </>
          )}
        </div>

        {canManage && (
          <div className="event-detail__admin-actions">
            <Link
              to={`/court/cases/${id}/edit`}
              className="event-detail__edit-btn"
            >
              ✏️ Редактировать
            </Link>
            <button
              className="event-detail__delete-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Удаление...' : '🗑 Удалить'}
            </button>
          </div>
        )}
      </header>

      {hasVerdict && (
        <div className="event-detail__tabs">
          <button
            className={`event-detail__tab${tab === 'description' ? ' event-detail__tab--active' : ''}`}
            onClick={() => setTab('description')}
          >
            Описание
          </button>
          <button
            className={`event-detail__tab${tab === 'verdict' ? ' event-detail__tab--active' : ''}`}
            onClick={() => setTab('verdict')}
          >
            Итог / Приговор
          </button>
        </div>
      )}

      {(tab === 'description' || !hasVerdict) && (
        courtCase.description
          ? <CaseContent content={courtCase.description} onOpenLightbox={openLightbox} />
          : <p className="event-detail__no-results">Описание не добавлено.</p>
      )}

      {tab === 'verdict' && hasVerdict && (
        <CaseContent content={courtCase.verdict} onOpenLightbox={openLightbox} />
      )}

      {lightbox && (
        <ImageModal
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          showSidebar={false}
          albumRanges={[{ startIndex: 0, items: lightbox.images }]}
        />
      )}
    </main>
  );
}

export default CourtCaseDetailPage;
