// pages/News/NewsDetailPage.jsx
// Страница отдельной новости: /news/:slug

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
import './NewsDetailPage.scss';

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

function NewsDetailPage() {
  const { slug } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [news,    setNews]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { images: [], index: 0 }

  useEffect(() => {
    setLoading(true);
    setError(null);

    axios.get(`/api/news/${slug}`)
      .then(({ data }) => setNews(data))
      .catch(err => {
        if (err.response?.status === 404) setError('Новость не найдена');
        else setError('Ошибка при загрузке новости');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleDelete = async () => {
    if (!confirm('Удалить эту новость?')) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/news/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate('/news');
    } catch {
      alert('Ошибка при удалении');
      setDeleting(false);
    }
  };

  if (loading) return <main className="news-detail"><p className="news-detail__loading">Загрузка...</p></main>;
  if (error)   return <main className="news-detail"><p className="news-detail__error">{error}</p></main>;
  if (!news)   return null;

  return (
    <main className="news-detail">
      <div className="news-detail__back">
        <Link to="/news">← Все новости</Link>
      </div>

      {news.previewImageUrl && (
        <img
          className="news-detail__preview"
          src={news.previewImageUrl}
          alt={news.title}
        />
      )}

      <header className="news-detail__header">

        <div className="news-detail__byline">
          {news.author && (
            <Link
              to={`/player/${news.author.username}`}
              className="news-detail__author"
            >
              {news.author.username}
            </Link>
          )}
          <div className="news-detail__byline-right">
            {news.views > 0 && (
              <span className="news-detail__views">👁 {news.views}</span>
            )}
            <span className="news-detail__date">{formatDate(news.publishedAt)}</span>
          </div>
        </div>

        <h1 className="news-detail__title">{news.title}</h1>

        {user && (['editor','admin','creator'].includes(user.role) || (user.customPermissions ?? []).includes('manage_news')) && (
          <div className="news-detail__admin-actions">
            <Link
              to={`/dashboard/news/${slug}/edit`}
              className="news-detail__edit-btn"
            >
              ✏️ Редактировать
            </Link>
            <button
              className="news-detail__delete-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Удаление...' : '🗑 Удалить'}
            </button>
          </div>
        )}
      </header>

      {/* HTML-контент новости */}
      <NewsContent
        content={news.content}
        onOpenLightbox={(images, index) => setLightbox({ images, index })}
      />

      {/* Информация об изменении — после контента, справа */}
      {news.editedCount > 0 && news.updatedAt && (
        <div className="news-detail__edited">
          Изменено {news.editedCount} {pluralEdit(news.editedCount)} · {formatDate(news.updatedAt)}
        </div>
      )}

      {/* Реакции на новость */}
      <div className="news-detail__reactions">
        <ReactionsBar targetType="news" targetId={news.id} />
      </div>

      {/* Комментарии */}
      <section className="news-detail__comments">
        <h2 className="news-detail__comments-title">Комментарии</h2>
        <CommentSection type="news" id={news.id} autoLoad={true} stickyBottom={true} />
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

// ---------------------------------------------------------------------------
// parseContentParts — разбивает HTML на части по маркерам:
//   [POLL:uuid]              — опрос
//   [SLIDER:encoded]         — слайдер
//   [PLAYERLIST:encoded]     — список игроков
//
// Нормализует div-маркеры редактора в текстовые токены, затем разбивает.
// ---------------------------------------------------------------------------

const DIV_POLL_RE        = /<div[^>]*class="rte-poll-marker"[^>]*data-poll-id="([0-9a-f-]{36})"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_SLIDER_RE      = /<div[^>]*class="rte-slider"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_PLAYERLIST_RE  = /<div[^>]*class="rte-player-list"[^>]*data-players="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
const DIV_IMAGEROW_RE    = /<div[^>]*class="rte-image-row"[^>]*data-images="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;

// Уникальный разделитель (не встречается в HTML)
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
        const images = JSON.parse(decodeURIComponent(match[2]));
        parts.push({ type: 'slider', images });
      } catch {
        // Повреждённый маркер — пропускаем
      }
    } else if (match[3]) {
      try {
        const players = JSON.parse(decodeURIComponent(match[3]));
        parts.push({ type: 'playerlist', players });
      } catch {
        // Повреждённый маркер — пропускаем
      }
    } else if (match[4]) {
      try {
        const images = JSON.parse(decodeURIComponent(match[4]));
        parts.push({ type: 'imagerow', images });
      } catch {
        // Повреждённый маркер — пропускаем
      }
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
// NewsContent — рендерит HTML с подстановкой компонентов
// ---------------------------------------------------------------------------

// Классы компонентов, чьи img НЕ должны открываться как лайтбокс
const SKIP_SELECTORS = '.slider-viewer, .player-list-viewer, .image-row-viewer';

function NewsContent({ content, onOpenLightbox }) {
  const containerRef = useRef(null);

  // Все ссылки открываем в новой вкладке после каждого рендера
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

    const images = allImgs.map(el => ({
      imageUrl: el.src,
      fileType: 'image/jpeg',
    }));
    onOpenLightbox(images, index);
  }, [onOpenLightbox]);

  const parts = parseContentParts(content);

  // Нет спецмаркеров — обычный рендер
  const hasSpecial = parts.some(p => p.type !== 'html');
  if (!hasSpecial) {
    const normalized = normalizeContent(content).replace(new RegExp(SEP, 'g'), '');
    return (
      <div
        ref={containerRef}
        className="news-detail__content news-content"
        dangerouslySetInnerHTML={{ __html: normalized }}
        onClick={handleClick}
      />
    );
  }

  return (
    <div ref={containerRef} className="news-detail__content news-content" onClick={handleClick}>
      {parts.map((part, i) => {
        if (part.type === 'poll') {
          return <PollViewer key={`poll-${part.id}`} pollId={part.id} />;
        }
        if (part.type === 'slider') {
          return <SliderViewer key={`slider-${i}`} images={part.images} />;
        }
        if (part.type === 'playerlist') {
          return <PlayerListViewer key={`players-${i}`} players={part.players} />;
        }
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
        return (
          <div key={i} dangerouslySetInnerHTML={{ __html: part.value }} />
        );
      })}
    </div>
  );
}

function pluralEdit(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'раз';
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'раза';
  return 'раз';
}

export default NewsDetailPage;
