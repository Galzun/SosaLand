// pages/News/NewsDetailPage.jsx
// Страница отдельной новости: /news/:slug

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import CommentSection from '../../Components/CommentSection/CommentSection';
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
        <h1 className="news-detail__title">{news.title}</h1>

        <div className="news-detail__meta">
          {news.author && (
            <Link
              to={`/player/${news.author.username}`}
              className="news-detail__author"
            >
              {news.author.minecraftUuid && (
                <img
                  src={`https://crafatar.icehost.xyz/avatars/${news.author.minecraftUuid}?size=32&overlay`}
                  alt={news.author.username}
                  className="news-detail__author-avatar"
                />
              )}
              {news.author.username}
            </Link>
          )}
          <span>{formatDate(news.publishedAt)}</span>
          {news.editedCount > 0 && news.updatedAt && (
            <span className="news-detail__edited-badge">
              ✏️ изменено {news.editedCount} {pluralEdit(news.editedCount)} · {formatDate(news.updatedAt)}
            </span>
          )}
          {news.views > 0 && (
            <span>👁 {news.views}</span>
          )}
        </div>

        {user?.role === 'admin' && (
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
      <div
        className="news-detail__content news-content"
        dangerouslySetInnerHTML={{ __html: news.content }}
      />

      {/* Комментарии */}
      <section className="news-detail__comments">
        <h2 className="news-detail__comments-title">Комментарии</h2>
        <CommentSection type="news" id={news.id} autoLoad={true} />
      </section>
    </main>
  );
}

function pluralEdit(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'раз';
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'раза';
  return 'раз';
}

export default NewsDetailPage;
