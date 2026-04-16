// hooks/useMessages.js
// Хук для управления состоянием системы личных сообщений.
//
// Возвращает:
//   conversations        — список диалогов
//   messages             — сообщения активного диалога
//   unreadCount          — число непрочитанных (для Sidebar)
//   loadingConversations — загружаются ли диалоги
//   loadingMessages      — загружаются ли сообщения
//   hasMoreMessages      — есть ли ещё старые сообщения (скролл вверх)
//   fetchConversations   — загрузить/обновить список диалогов
//   fetchMessages        — загрузить историю с конкретным пользователем
//   sendMessage          — отправить сообщение (content, files=[])
//   deleteMessage        — удалить (отозвать) своё сообщение
//   deleteConversation   — удалить весь диалог (оба участника, файлы с диска)
//   fetchUnreadCount     — обновить счётчик непрочитанных

import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';


const MESSAGES_LIMIT = 50;

function useMessages() {
  const { token, user } = useAuth();

  const [conversations,        setConversations]        = useState([]);
  const [messages,             setMessages]             = useState([]);
  const [unreadCount,          setUnreadCount]          = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages,      setLoadingMessages]      = useState(false);
  const [hasMoreMessages,      setHasMoreMessages]      = useState(false);

  // Хранит ID активного диалога (собеседника), чтобы не перезагружать лишний раз
  const activePartnerIdRef = useRef(null);
  // Offset для пагинации старых сообщений
  const messagesOffsetRef  = useRef(0);

  const authHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${token}` },
  }), [token]);

  // -------------------------------------------------------------------------
  // fetchConversations — загружает список всех диалогов текущего пользователя
  // -------------------------------------------------------------------------
  const fetchConversations = useCallback(async () => {
    if (!token) return;
    setLoadingConversations(true);
    try {
      const { data } = await axios.get('/api/conversations', authHeaders());
      setConversations(data);
    } catch (err) {
      console.error('Ошибка загрузки диалогов:', err.message);
    } finally {
      setLoadingConversations(false);
    }
  }, [token, authHeaders]);

  // -------------------------------------------------------------------------
  // fetchMessages — загружает историю сообщений с конкретным пользователем.
  //
  // partnerId — ID пользователя-собеседника
  // reset     — true: загрузить с нуля (при смене чата)
  //           — false: подгрузить старые (при скролле вверх)
  // -------------------------------------------------------------------------
  const fetchMessages = useCallback(async (partnerId, reset = true) => {
    if (!token || !partnerId) return;

    setLoadingMessages(true);

    // При смене чата или первой загрузке — сбрасываем offset и список
    if (reset) {
      activePartnerIdRef.current = partnerId;
      messagesOffsetRef.current  = 0;
      setMessages([]);
      setHasMoreMessages(false);
    }

    // Если уже переключились на другой чат — игнорируем устаревший ответ
    const currentPartner = activePartnerIdRef.current;

    try {
      const offset = reset ? 0 : messagesOffsetRef.current;
      const { data } = await axios.get(
        `/api/conversations/${partnerId}/messages`,
        {
          params: { limit: MESSAGES_LIMIT, offset },
          ...authHeaders(),
        }
      );

      if (activePartnerIdRef.current !== currentPartner && !reset) return;

      const fetched = data.messages || [];

      if (reset) {
        setMessages(fetched);
      } else {
        // Подгружаем старые сообщения — вставляем в НАЧАЛО массива
        setMessages(prev => [...fetched, ...prev]);
      }

      messagesOffsetRef.current = offset + fetched.length;
      setHasMoreMessages(fetched.length === MESSAGES_LIMIT);

      // После загрузки обновляем список диалогов (сбрасываем unreadCount у этого)
      setConversations(prev =>
        prev.map(c =>
          c.partner.id === partnerId ? { ...c, unreadCount: 0 } : c
        )
      );
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err.message);
    } finally {
      setLoadingMessages(false);
    }
  }, [token, authHeaders]);

  // -------------------------------------------------------------------------
  // loadOlderMessages — подгружает более старые сообщения (скролл вверх)
  // -------------------------------------------------------------------------
  const loadOlderMessages = useCallback(async (partnerId) => {
    if (!hasMoreMessages || loadingMessages) return;
    await fetchMessages(partnerId, false);
  }, [hasMoreMessages, loadingMessages, fetchMessages]);

  // -------------------------------------------------------------------------
  // sendMessage — отправляет сообщение пользователю.
  //
  // files — массив [{fileUrl, fileType, fileName}] уже загруженных файлов.
  //         Первый файл идёт в file_url/file_type/file_name (legacy),
  //         остальные — в files (хранятся в files_json).
  //
  // Реализует оптимистичное обновление:
  //   1. Сразу добавляет сообщение в список
  //   2. Если сервер вернул ошибку — убирает его
  // -------------------------------------------------------------------------
  const sendMessage = useCallback(async (partnerId, content, files = []) => {
    if (!token) throw new Error('Требуется авторизация');

    const firstFile  = files[0] || null;
    const extraFiles = files.length > 1 ? files.slice(1) : null;

    const body = {
      content:   content || '',
      file_url:  firstFile?.fileUrl  || null,
      file_type: firstFile?.fileType || null,
      file_name: firstFile?.fileName || null,
      files:     extraFiles,
    };

    // Временный ID для оптимистичного обновления
    const tempId = `temp_${Date.now()}`;
    const tempMsg = {
      id:        tempId,
      senderId:  user?.id,  // сразу ставим свой ID — иначе рендерится как чужое
      content:   content || '',
      fileUrl:   firstFile?.fileUrl  || null,
      fileType:  firstFile?.fileType || null,
      fileName:  firstFile?.fileName || null,
      files:     extraFiles,
      isRead:    false,
      createdAt: Math.floor(Date.now() / 1000),
      _pending:  true, // флаг для UI: сообщение ещё не подтверждено
    };

    // Оптимистично добавляем в конец
    setMessages(prev => [...prev, tempMsg]);

    try {
      const { data } = await axios.post(
        `/api/conversations/${partnerId}/messages`,
        body,
        authHeaders()
      );

      // Заменяем временное сообщение реальным
      setMessages(prev =>
        prev.map(m => m.id === tempId ? data : m)
      );

      // Обновляем last_message в списке диалогов
      setConversations(prev => {
        const exists = prev.some(c => c.partner.id === partnerId);
        if (exists) {
          return prev.map(c => {
            if (c.partner.id !== partnerId) return c;
            return {
              ...c,
              lastMessage:     data.content || data.fileName || (data.files?.length ? 'Файлы' : 'Файл'),
              lastMessageTime: data.createdAt,
            };
          });
        }
        // Диалог новый — перезагрузим список
        return prev;
      });

      return data;
    } catch (err) {
      // Убираем оптимистичное сообщение при ошибке
      setMessages(prev => prev.filter(m => m.id !== tempId));
      throw err;
    }
  }, [token, authHeaders]);

  // -------------------------------------------------------------------------
  // deleteMessage — удаляет своё сообщение (отозвать)
  // -------------------------------------------------------------------------
  const deleteMessage = useCallback(async (messageId, partnerId) => {
    if (!token) throw new Error('Требуется авторизация');

    // Оптимистично убираем из UI
    setMessages(prev => prev.filter(m => m.id !== messageId));

    try {
      await axios.delete(`/api/messages/${messageId}`, authHeaders());

      // Обновляем last_message в списке диалогов (получаем актуальные данные)
      fetchConversations();
    } catch (err) {
      console.error('Ошибка удаления сообщения:', err.message);
      // При ошибке можно перезагрузить сообщения, но это усложнит UX
      throw err;
    }
  }, [token, authHeaders, fetchConversations]);

  // -------------------------------------------------------------------------
  // deleteConversation — удаляет весь диалог (сообщения + файлы с диска)
  // -------------------------------------------------------------------------
  const deleteConversation = useCallback(async (conversationId) => {
    if (!token) throw new Error('Требуется авторизация');

    // Оптимистично убираем из списка
    setConversations(prev => prev.filter(c => c.id !== conversationId));

    try {
      await axios.delete(`/api/conversations/${conversationId}`, authHeaders());
    } catch (err) {
      console.error('Ошибка удаления диалога:', err.message);
      // Восстанавливаем список при ошибке
      fetchConversations();
      throw err;
    }
  }, [token, authHeaders, fetchConversations]);


  // -------------------------------------------------------------------------
  // fetchUnreadCount — обновляет счётчик непрочитанных (для Sidebar)
  // -------------------------------------------------------------------------
  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await axios.get('/api/conversations/unread-count', authHeaders());
      setUnreadCount(data.count ?? 0);
    } catch (err) {
      // Тихо игнорируем — не критично
    }
  }, [token, authHeaders]);

  return {
    conversations,
    messages,
    unreadCount,
    loadingConversations,
    loadingMessages,
    hasMoreMessages,
    fetchConversations,
    fetchMessages,
    loadOlderMessages,
    sendMessage,
    deleteMessage,
    deleteConversation,
    fetchUnreadCount,
    setMessages,
  };
}

export default useMessages;
