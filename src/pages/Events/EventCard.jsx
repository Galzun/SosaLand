// pages/Events/EventCard.jsx
// Карточка события: превью, заголовок, дата начала, таймер обратного отсчёта.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo } from '../../utils/timeFormatter';
import './EventCard.scss';

// ---------------------------------------------------------------------------
// Вычисляет оставшееся время до start_time (unix-секунды).
// Возвращает:
//   { label: 'Через 2 д 4 ч 31 мин', started: false }  — до начала
//   { label: 'В процессе', started: true }              — идёт
//   { label: 'Завершено', started: true }               — после end_time
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
    // Обновляем каждую минуту
    const id = setInterval(() => {
      setTimer(getTimerLabel(startTime, endTime));
    }, 60_000);
    return () => clearInterval(id);
  }, [startTime, endTime]);

  return (
    <span className={`event-timer${timer.started ? ' event-timer--started' : ''}`}>
      {timer.label}
    </span>
  );
}

function formatEventDate(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('ru-RU', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  });
}

function EventCard({ event }) {
  const {
    slug,
    title,
    previewImageUrl,
    previewImageResultsUrl,
    publishedAt,
    startTime,
    endTime,
    commentsCount,
  } = event;

  // Показываем шапку итогов, если событие завершено и шапка итогов задана
  const now = Math.floor(Date.now() / 1000);
  const isFinished = endTime && now > endTime;
  const displayImage = isFinished && previewImageResultsUrl ? previewImageResultsUrl : previewImageUrl;

  return (
    <Link to={`/events/${slug}`} className="event-card">
      <div className="event-card__image-wrap">
        {displayImage
          ? <img className="event-card__image" src={displayImage} alt={title} loading="lazy" />
          : <div className="event-card__image-placeholder">📅</div>
        }
        <EventTimer startTime={startTime} endTime={endTime} />
      </div>
      <div className="event-card__content">
        <h3 className="event-card__title">{title}</h3>
        <div className="event-card__meta">
          <span className="event-card__date">📅 {formatEventDate(startTime)} · {timeAgo(startTime * 1000)}</span>
          {commentsCount > 0 && (
            <span className="event-card__comments">💬 {commentsCount}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default EventCard;
