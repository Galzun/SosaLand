// pages/Events/EventDetailPage.jsx
// Страница отдельного события: /events/:slug
// Две вкладки: «Основная информация» и «Итоги»

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import CommentSection from '../../Components/CommentSection/CommentSection';
import PollViewer from '../../Components/PollViewer/PollViewer';
import SliderViewer from '../../Components/SliderViewer/SliderViewer';
import PlayerListViewer from '../../Components/PlayerListViewer/PlayerListViewer';
import ImageRowViewer from '../../Components/ImageRowViewer/ImageRowViewer';
import ImageModal from '../../Components/ImageModal/ImageModal';
import ReactionsBar from '../../Components/ReactionsBar/ReactionsBar';
import './EventDetailPage.scss';

// ---------------------------------------------------------------------------
// Форматирование даты
// ---------------------------------------------------------------------------
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('ru-RU', {
    day:    'numeric',
    month:  'long',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Таймер до начала / статус события
// ---------------------------------------------------------------------------
function getTimerLabel(startTime, endTime) {
  const now   = Math.floor(Date.now() / 1000);
  const delta = startTime - now;

  if (delta > 0) {
    const d = Math.floor(delta / 86400);
    const h = Math.floor((delta % 86400) / 3600);
    const m = Math.floor((delta % 3600) / 60);

    const parts = [];
    if (d > 0) parts.push(`${d} д`);
    if (h > 0) parts.push(`${h} ч`);
    if (m > 0 || parts.length === 0) parts.push(`${m} мин`);

    return { label: `Через ${parts.join(' ')}`, started: false };
  }

  if (endTime && now > endTime) {
    return { label: 'Завершено', started: true };
  }

  return { label: 'В процессе', started: true };
}

function EventTimer({ startTime, endTime }) {
  const [timer, setTimer] = useState(() => getTimerLabel(startTime, endTime));

  useEffect(() => {
    const id = setInterval(() => {
      setTimer(getTimerLabel(startTime, endTime));
    }, 60_000);
    return () => clearInterval(id);
  }, [startTime, endTime]);

  return (
    <span className={`event-detail__timer${timer.started ? ' event-detail__timer--started' : ''}`}>
      {timer.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Парсинг HTML-контента (общая логика с новостями)
// ---------------------------------------------------------------------------
const DIV_POLL_RE        = /<div[^>]*class="rte-poll-marker"[^>]*data-poll-id="([0-9a-f-]{36})"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_SLIDER_RE      = /<div[^>]*class="rte-slider"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_PLAYERLIST_RE  = /<div[^>]*class="rte-player-list"[^>]*data-players="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_IMAGEROW_RE    = /<div[^>]*class="rte-image-row"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;

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
      try {
        parts.push({ type: 'slider', images: JSON.parse(decodeURIComponent(match[2])) });
      } catch { /* ignore */ }
    } else if (match[3]) {
      try {
        parts.push({ type: 'playerlist', players: JSON.parse(decodeURIComponent(match[3])) });
      } catch { /* ignore */ }
    } else if (match[4]) {
      try {
        parts.push({ type: 'imagerow', images: JSON.parse(decodeURIComponent(match[4])) });
      } catch { /* ignore */ }
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    const tail = normalized.slice(lastIndex).replace(new RegExp(SEP, 'g'), '');
    if (tail.trim()) parts.push({ type: 'html', value: tail });
  }

  return parts;
}

// ---------------------------------------------------------------------------
// EventContent — рендерит HTML с подстановкой компонентов
// ---------------------------------------------------------------------------

const SKIP_SELECTORS = '.slider-viewer, .player-list-viewer, .image-row-viewer';

function EventContent({ content, onOpenLightbox }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll('a').forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  });

  // Event delegation: клик по <img> в HTML-контенте открывает лайтбокс
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
        if (part.type === 'poll')       return <PollViewer       key={`poll-${part.id}`}  pollId={part.id} />;
        if (part.type === 'slider')     return <SliderViewer     key={`slider-${i}`}      images={part.images} />;
        if (part.type === 'playerlist') return <PlayerListViewer key={`players-${i}`}     players={part.players} />;
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

function pluralEdit(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'раз';
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'раза';
  return 'раз';
}

// ---------------------------------------------------------------------------
// EventDetailPage
// ---------------------------------------------------------------------------
function EventDetailPage() {
  const { slug } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [event,    setEvent]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [tab,      setTab]      = useState('main'); // 'main' | 'results'
  const [lightbox, setLightbox] = useState(null);  // { images: [], index: 0 }

  useEffect(() => {
    setLoading(true);
    setError(null);

    axios.get(`/api/events/${slug}`)
      .then(({ data }) => {
        setEvent(data);
        // Если событие завершено — показываем итоги по умолчанию (если они есть)
        const now = Math.floor(Date.now() / 1000);
        const isFinished = data.endTime && now > data.endTime;
        const hasResults = data.contentResults && data.contentResults.trim().length > 0;
        setTab(isFinished && hasResults ? 'results' : 'main');
      })
      .catch(err => {
        if (err.response?.status === 404) setError('Событие не найдено');
        else setError('Ошибка при загрузке события');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleDelete = async () => {
    if (!confirm('Удалить это событие?')) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/events/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate('/events');
    } catch {
      alert('Ошибка при удалении');
      setDeleting(false);
    }
  };

  if (loading) return <main className="event-detail"><p className="event-detail__loading">Загрузка...</p></main>;
  if (error)   return <main className="event-detail"><p className="event-detail__error">{error}</p></main>;
  if (!event)  return null;

  const hasResults = event.contentResults && event.contentResults.trim().length > 0;

  // Шапка зависит от активной вкладки
  const activePreviewUrl = tab === 'results' && event.previewImageResultsUrl
    ? event.previewImageResultsUrl
    : event.previewImageUrl;

  return (
    <main className="event-detail">
      <div className="event-detail__back">
        <Link to="/events">← Все события</Link>
      </div>

      {activePreviewUrl && (
        <img
          className="event-detail__preview"
          src={activePreviewUrl}
          alt={event.title}
        />
      )}

      <header className="event-detail__header">
        <div className="event-detail__byline">
          {event.author && (
            <Link
              to={`/player/${event.author.username}`}
              className="event-detail__author"
            >
              {event.author.username}
            </Link>
          )}
          <div className="event-detail__byline-right">
            <span className="event-detail__date">{formatDate(event.publishedAt)}</span>
          </div>
        </div>

        <div className="event-detail__title-row">
          <h1 className="event-detail__title">{event.title}</h1>
          <EventTimer startTime={event.startTime} endTime={event.endTime} />
        </div>

        <div className="event-detail__start-info">
          <span className="event-detail__start-label">Начало:</span>
          <span className="event-detail__start-date">{formatDate(event.startTime)}</span>
          {event.endTime && (
            <>
              <span className="event-detail__start-label">Конец:</span>
              <span className="event-detail__start-date">{formatDate(event.endTime)}</span>
            </>
          )}
        </div>

        {user && ['editor','admin','creator'].includes(user.role) && (
          <div className="event-detail__admin-actions">
            <Link
              to={`/dashboard/events/${slug}/edit`}
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

      {/* Вкладки */}
      <div className="event-detail__tabs">
        <button
          className={`event-detail__tab${tab === 'main' ? ' event-detail__tab--active' : ''}`}
          onClick={() => setTab('main')}
        >
          Основная информация
        </button>
        {hasResults && (
          <button
            className={`event-detail__tab${tab === 'results' ? ' event-detail__tab--active' : ''}`}
            onClick={() => setTab('results')}
          >
            Итоги
          </button>
        )}
      </div>

      {/* Контент вкладки */}
      {tab === 'main' && (
        <EventContent
          content={event.contentMain}
          onOpenLightbox={(images, index) => setLightbox({ images, index })}
        />
      )}

      {tab === 'results' && hasResults && (
        <EventContent
          content={event.contentResults}
          onOpenLightbox={(images, index) => setLightbox({ images, index })}
        />
      )}

      {tab === 'results' && !hasResults && (
        <p className="event-detail__no-results">Итоги ещё не подведены.</p>
      )}

      {/* Информация об изменении */}
      {event.editedCount > 0 && event.updatedAt && (
        <div className="event-detail__edited">
          Изменено {event.editedCount} {pluralEdit(event.editedCount)} · {formatDate(event.updatedAt)}
        </div>
      )}

      {/* Реакции на событие */}
      <div className="event-detail__reactions">
        <ReactionsBar targetType="event" targetId={event.id} />
      </div>

      {/* Комментарии */}
      <section className="event-detail__comments">
        <h2 className="event-detail__comments-title">Комментарии</h2>
        <CommentSection type="event" id={event.id} autoLoad={true} stickyBottom={true} />
      </section>

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

export default EventDetailPage;
