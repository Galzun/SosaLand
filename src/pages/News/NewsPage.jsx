// pages/News/NewsPage.jsx
// Список всех новостей, сетка галерейного типа.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import NewsCard from '../../Components/NewsCard/NewsCard';
import './NewsPage.scss';

const LIMIT = 24;

function NewsPage() {
  const { user } = useAuth();
  const [news,    setNews]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef  = useRef(0);
  const loadingRef = useRef(false);

  const fetchNews = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const offset = reset ? 0 : offsetRef.current;

    try {
      const { data } = await axios.get('/api/news', {
        params: { limit: LIMIT, offset },
      });

      if (reset) {
        setNews(data);
        offsetRef.current = data.length;
      } else {
        setNews(prev => [...prev, ...data]);
        offsetRef.current = offset + data.length;
      }
      setHasMore(data.length === LIMIT);
    } catch (err) {
      console.error('Ошибка загрузки новостей:', err.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(true);
  }, [fetchNews]);

  return (
    <main className="news-page">
      <div className="news-page__header">
        <h1 className="news-page__title">Новости</h1>
        {user && (['editor','admin','creator'].includes(user.role) || (user.customPermissions ?? []).includes('manage_news')) && (
          <Link to="/dashboard/news/create" className="news-page__create-btn">
            + Написать новость
          </Link>
        )}
      </div>

      {news.length === 0 && !loading && (
        <p className="news-page__empty">Новостей пока нет.</p>
      )}

      {news.length > 0 && (
        <div className="news-page__grid">
          {news.map(n => (
            <NewsCard key={n.id} news={n} />
          ))}
        </div>
      )}

      {loading && <p className="news-page__loading">Загрузка...</p>}

      {!loading && hasMore && news.length > 0 && (
        <button className="news-page__load-more" onClick={() => fetchNews(false)}>
          Загрузить ещё
        </button>
      )}
    </main>
  );
}

export default NewsPage;
