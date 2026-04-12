// hooks/usePosts.js
// Хук для работы с постами: загрузка ленты/профиля, создание, лайк, удаление.
//
// Параметры:
//   userId — если передан, загружает посты только этого пользователя (для профиля).
//            Если не передан — глобальная лента.
//   disabled — true: не загружаем (пока профиль грузится)
//
// Возвращает:
//   posts       — массив постов (каждый содержит поле attachments[])
//   loading     — идёт ли загрузка
//   hasMore     — есть ли ещё посты (для пагинации)
//   loadPosts   — функция загрузки (reset=true — сброс к первой странице)
//   loadMore    — загрузить следующую страницу
//   createPost  — создать пост
//   toggleLike  — поставить/убрать лайк
//   deletePost  — удалить пост

import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const LIMIT = 20;

function usePosts({ userId = null, disabled = false } = {}) {
  const [posts,   setPosts]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore,  setHasMore]  = useState(true);

  // Ref для offset предотвращает stale closure при бесконечной подгрузке
  const offsetRef  = useRef(0);
  const loadingRef = useRef(false);

  const { token } = useAuth();

  // Загружает посты. reset=true — начинает с первой страницы.
  const loadPosts = useCallback(async (reset = false) => {
    if (disabled || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const currentOffset = reset ? 0 : offsetRef.current;

    try {
      const url = userId
        ? `/api/users/${userId}/posts`
        : '/api/posts';

      const response = await axios.get(url, {
        params: { limit: LIMIT, offset: currentOffset },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const newPosts = response.data;

      if (reset) {
        setPosts(newPosts);
        offsetRef.current = newPosts.length;
      } else {
        setPosts(prev => [...prev, ...newPosts]);
        offsetRef.current = currentOffset + newPosts.length;
      }

      setHasMore(newPosts.length === LIMIT);
    } catch (err) {
      console.error('Ошибка загрузки постов:', err.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [userId, token, disabled]);

  const loadMore = useCallback(() => {
    if (!loadingRef.current && hasMore) {
      loadPosts(false);
    }
  }, [hasMore, loadPosts]);

  useEffect(() => {
    if (disabled) {
      setPosts([]);
      setHasMore(true);
      offsetRef.current = 0;
      return;
    }
    offsetRef.current = 0;
    loadPosts(true);
  }, [userId, token, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // createPost — создаёт новый пост с вложениями.
  //
  // content     — текст поста
  // attachments — массив вложений [{ fileUrl, fileType, fileName }]
  //               уже загруженных через /api/upload
  //
  // Обратная совместимость: если передана строка вместо массива — принимаем
  // как imageUrl (legacy) и конвертируем.
  // ---------------------------------------------------------------------------
  const createPost = useCallback(async (content, attachments = []) => {
    if (!token) throw new Error('Требуется авторизация');

    // Обратная совместимость: старый код может передавать imageUrl строкой
    let cleanAttachments = attachments;
    if (typeof attachments === 'string' && attachments) {
      cleanAttachments = [{ fileUrl: attachments, fileType: '', fileName: '' }];
    }

    const response = await axios.post(
      '/api/posts',
      { content, attachments: cleanAttachments || [] },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setPosts(prev => [response.data, ...prev]);
    return response.data;
  }, [token]);

  // toggleLike — toggle лайка поста
  const toggleLike = useCallback(async (postId) => {
    if (!token) throw new Error('Требуется авторизация');

    const response = await axios.post(
      `/api/posts/${postId}/like`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const { liked, likesCount } = response.data;

    setPosts(prev =>
      prev.map(post =>
        post.id === postId ? { ...post, liked, likesCount } : post
      )
    );
  }, [token]);

  // deletePost — удаляет пост (бэкенд также удаляет файлы с диска)
  const deletePost = useCallback(async (postId) => {
    if (!token) throw new Error('Требуется авторизация');

    await axios.delete(`/api/posts/${postId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    setPosts(prev => prev.filter(post => post.id !== postId));
    offsetRef.current = Math.max(0, offsetRef.current - 1);
  }, [token]);

  // editPost — редактирует пост: обновляет текст и вложения через PUT /api/posts/:id.
  //
  // postId      — ID поста
  // content     — новый текст поста
  // attachments — итоговый список вложений [{ fileUrl, fileType, fileName }]
  //               (уже загруженных + сохранённых из старых)
  //
  // Возвращает обновлённый объект поста.
  const editPost = useCallback(async (postId, content, attachments = []) => {
    if (!token) throw new Error('Требуется авторизация');

    const response = await axios.put(
      `/api/posts/${postId}`,
      { content, attachments },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...response.data } : p));
    return response.data;
  }, [token]);

  // patchPost — обновляет поля поста в локальном состоянии (без запроса к API)
  const patchPost = useCallback((postId, patch) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...patch } : p));
  }, []);

  return {
    posts,
    loading,
    hasMore,
    loadPosts,
    loadMore,
    createPost,
    editPost,
    toggleLike,
    deletePost,
    patchPost,
  };
}

export default usePosts;
