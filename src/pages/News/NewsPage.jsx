// pages/News/NewsPage.jsx
// Список всех новостей, сгруппированных по дням (Сегодня / Вчера / дата).
// Поддерживает бесконечный скролл.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import NewsCard from '../../Components/NewsCard/NewsCard';
import './NewsPage.scss';

const LIMIT = 20;

// Форматирует unix timestamp в читаемую группу дня
function dayLabel(ts) {
  const date  = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();

  if (sameDay(date, today))     return 'Сегодня';
  if (sameDay(date, yesterday)) return 'Вчера';

  return date.toLocaleDateString('ru-RU', {
    day:   'numeric',
    month: 'long',
    year:  date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

// Группирует массив новостей по дням
function groupByDay(newsList) {
  const groups = [];
  const seen   = new Map();

  for (const n of newsList) {
    const label = dayLabel(n.publishedAt);
    if (!seen.has(label)) {
      seen.set(label, groups.length);
      groups.push({ label, items: [] });
    }
    groups[seen.get(label)].items.push(n);
  }
  return groups;
}

function NewsPage() {
  const { user } = useAuth();
  const [news,    setNews]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
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

  const groups = groupByDay(news);

  return (
    <main className="news-page">
      <div className="news-page__header">
        <h1 className="news-page__title">Новости</h1>
        {user?.role === 'admin' && (
          <Link to="/dashboard/news/create" className="news-page__create-btn">
            + Написать новость
          </Link>
        )}
      </div>

      {groups.length === 0 && !loading && (
        <p className="news-page__empty">Новостей пока нет.</p>
      )}

      {groups.map(group => (
        <div key={group.label} className="news-group">
          <div className="news-group__date">{group.label}</div>
          {group.items.map(n => (
            <NewsCard key={n.id} news={n} />
          ))}
        </div>
      ))}

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
