// Components/NewsCard/NewsCard.jsx
// Карточка новости в списке: превью-изображение, заголовок, дата, счётчики.
// Галерейный стиль: изображение сверху, контент снизу.

import { Link } from 'react-router-dom';
import { timeAgo } from '../../utils/timeFormatter';
import './NewsCard.scss';

function NewsCard({ news }) {
  const {
    slug,
    title,
    previewImageUrl,
    publishedAt,
    commentsCount,
    views,
  } = news;

  return (
    <Link to={`/news/${slug}`} className="news-card">
      <div className="news-card__image-wrap">
        {previewImageUrl
          ? <img className="news-card__image" src={previewImageUrl} alt={title} loading="lazy" />
          : <div className="news-card__image-placeholder" />
        }
      </div>
      <div className="news-card__content">
        <h3 className="news-card__title">{title}</h3>
        <div className="news-card__meta">
          <span className="news-card__date">{timeAgo(publishedAt * 1000)}</span>
          {views > 0 && (
            <span className="news-card__views">👁 {views}</span>
          )}
          {commentsCount > 0 && (
            <span className="news-card__comments">💬 {commentsCount}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default NewsCard;
