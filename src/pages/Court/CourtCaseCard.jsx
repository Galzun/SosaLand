// pages/Court/CourtCaseCard.jsx
// Карточка судебного заседания — дизайн как у EventCard.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../../pages/Events/EventCard.scss';
import './CourtPage.scss';

function getDisplayStatus(status, hearingAt) {
  if (status === 'completed')   return { label: 'Завершено', cls: 'event-timer--completed' };
  if (status === 'in_progress') return { label: 'Идёт',      cls: 'event-timer--in-progress' };

  if (hearingAt) {
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
    // дата прошла — показываем как «Идёт»
    return { label: 'Идёт', cls: 'event-timer--in-progress' };
  }

  return null;
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CourtCaseCard({ courtCase }) {
  const { id, title, hearingAt, status, ticketAccused, previewImageUrl, previewVerdictImageUrl } = courtCase;
  const [badge, setBadge] = useState(() => getDisplayStatus(status, hearingAt));

  useEffect(() => {
    setBadge(getDisplayStatus(status, hearingAt));
    if (!hearingAt || status === 'completed') return;
    const iid = setInterval(() => setBadge(getDisplayStatus(status, hearingAt)), 60_000);
    return () => clearInterval(iid);
  }, [hearingAt, status]);

  return (
    <Link to={`/court/cases/${id}`} className="event-card">
      <div className="event-card__image-wrap">
        {(() => {
          const img = status === 'completed' && previewVerdictImageUrl ? previewVerdictImageUrl : previewImageUrl;
          return img
            ? <img className="event-card__image" src={img} alt={title} loading="lazy" />
            : <div className="event-card__image-placeholder">⚖️</div>;
        })()}
        {badge && (
          <span className={`event-timer${badge.cls ? ` ${badge.cls}` : ''}`}>
            {badge.label}
          </span>
        )}
      </div>
      <div className="event-card__content">
        <h3 className="event-card__title">{title}</h3>
        <div className="event-card__meta">
          {hearingAt && <span className="event-card__date">📅 {formatDate(hearingAt)}</span>}
          {ticketAccused && <span className="event-card__date">⚖️ {ticketAccused}</span>}
        </div>
      </div>
    </Link>
  );
}

export default CourtCaseCard;
