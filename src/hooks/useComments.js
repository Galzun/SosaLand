// hooks/useComments.js
// Хук для работы с комментариями: загрузка, добавление, удаление.
//
// Параметры:
//   type — тип объекта: 'post' | 'image' | 'profile' | 'news'
//   id   — ID объекта (поста, фото, пользователя или новости)
//
// Возвращает:
//   comments      — массив комментариев
//   loading       — идёт ли загрузка
//   hasMore       — есть ли ещё комментарии (для пагинации)
//   loaded        — загружались ли комментарии хотя бы раз
//   fetchComments — загрузить (reset=true — с начала)
//   loadMore      — загрузить следующую страницу
//   addComment    — добавить комментарий (content: string)
//   deleteComment — удалить комментарий по ID

import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const LIMIT = 20;

function useComments({ type, id }) {
  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [hasMore,  setHasMore]  = useState(true);
  const [loaded,   setLoaded]   = useState(false);

  // Ref для offset — не вызывает пересоздание callback'ов при подгрузке
  const offsetRef  = useRef(0);
  const loadingRef = useRef(false); // защита от параллельных запросов

  const { token } = useAuth();

  // Формирует URL для API в зависимости от типа комментария
  const getUrl = useCallback(() => {
    if (type === 'post')    return `/api/posts/${id}/comments`;
    if (type === 'image')   return `/api/images/${id}/comments`;
    if (type === 'profile') return `/api/users/${id}/profile-comments`;
    if (type === 'news')    return `/api/news/${id}/comments`;
    return null;
  }, [type, id]);

  // Загружает комментарии.
  // reset=true — начинает с нуля (при первом открытии или смене объекта).
  const fetchComments = useCallback(async (reset = false) => {
    if (!id || loadingRef.current) return;
    const url = getUrl();
    if (!url) return;

    loadingRef.current = true;
    setLoading(true);

    const offset = reset ? 0 : offsetRef.current;

    try {
      const { data } = await axios.get(url, {
        params: { limit: LIMIT, offset },
      });

      if (reset) {
        setComments(data);
        offsetRef.current = data.length;
      } else {
        setComments(prev => [...prev, ...data]);
        offsetRef.current = offset + data.length;
      }

      setHasMore(data.length === LIMIT);
      setLoaded(true);
    } catch (err) {
      console.error('Ошибка загрузки комментариев:', err.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [id, getUrl]);

  // Загружает следующую страницу
  const loadMore = useCallback(() => {
    if (!loadingRef.current && hasMore) {
      fetchComments(false);
    }
  }, [hasMore, fetchComments]);

  // Добавляет новый комментарий и помещает его в начало списка
  const addComment = useCallback(async (content, imageUrl = null) => {
    if (!token) throw new Error('Требуется авторизация');
    const url = getUrl();
    if (!url) throw new Error('Неверный тип комментария');

    const { data } = await axios.post(
      url,
      { content, imageUrl },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setComments(prev => [data, ...prev]);
    return data;
  }, [token, getUrl]);

  // Удаляет комментарий по ID
  const deleteComment = useCallback(async (commentId) => {
    if (!token) throw new Error('Требуется авторизация');

    await axios.delete(`/api/comments/${commentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    setComments(prev => prev.filter(c => c.id !== commentId));
  }, [token]);

  return {
    comments,
    loading,
    hasMore,
    loaded,
    fetchComments,
    loadMore,
    addComment,
    deleteComment,
  };
}

export default useComments;
