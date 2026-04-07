// Components/NewsCard/NewsCard.jsx
// Карточка новости в списке: превью-изображение, заголовок, дата, метка «изменено».

import { Link } from 'react-router-dom';
import { timeAgo } from '../../utils/timeFormatter';
import './NewsCard.scss';

function NewsCard({ news }) {
  const {
    slug,
    title,
    previewImageUrl,
    publishedAt,
    updatedAt,
    editedCount,
    commentsCount,
    views,
  } = news;

  return (
    <Link to={`/news/${slug}`} className="news-card">
      {previewImageUrl && (
        <img
          className="news-card__image"
          src={previewImageUrl}
          alt={title}
          loading="lazy"
        />
      )}
      <div className="news-card__content">
        <h3 className="news-card__title">{title}</h3>
        <div className="news-card__meta">
          <span className="news-card__date">{timeAgo(publishedAt)}</span>
          {editedCount > 0 && updatedAt && (
            <span className="news-card__edited">
              ✏️ изменено {timeAgo(updatedAt)}
            </span>
          )}
          {commentsCount > 0 && (
            <span className="news-card__comments">💬 {commentsCount}</span>
          )}
          {views > 0 && (
            <span className="news-card__views">👁 {views}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default NewsCard;
