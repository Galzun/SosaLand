// pages/Events/EventsPage.jsx
// Список всех событий, сетка галерейного типа.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import EventCard from './EventCard';
import './EventsPage.scss';

const LIMIT = 24;

function EventsPage() {
  const { user } = useAuth();
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef  = useRef(0);
  const loadingRef = useRef(false);

  const fetchEvents = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const offset = reset ? 0 : offsetRef.current;

    try {
      const { data } = await axios.get('/api/events', {
        params: { limit: LIMIT, offset },
      });

      if (reset) {
        setEvents(data);
        offsetRef.current = data.length;
      } else {
        setEvents(prev => [...prev, ...data]);
        offsetRef.current = offset + data.length;
      }
      setHasMore(data.length === LIMIT);
    } catch (err) {
      console.error('Ошибка загрузки событий:', err.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(true);
  }, [fetchEvents]);

  return (
    <main className="events-page">
      <div className="events-page__header">
        <h1 className="events-page__title">События</h1>
        {user && (
          <Link to="/dashboard/events/create" className="events-page__create-btn">
            + Создать событие
          </Link>
        )}
      </div>

      {events.length === 0 && !loading && (
        <p className="events-page__empty">Событий пока нет.</p>
      )}

      {events.length > 0 && (
        <div className="events-page__grid">
          {events.map(e => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}

      {loading && <p className="events-page__loading">Загрузка...</p>}

      {!loading && hasMore && events.length > 0 && (
        <button className="events-page__load-more" onClick={() => fetchEvents(false)}>
          Загрузить ещё
        </button>
      )}
    </main>
  );
}

export default EventsPage;
