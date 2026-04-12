// pages/Messages/MessagesPage.jsx
// Страница личных сообщений: /messages
//
// Двухколоночный макет:
//   Левая  — список диалогов (ConversationList)
//   Правая — чат с выбранным собеседником (ChatWindow)
//
// Поддерживает открытие чата через URL-параметр:
//   /messages?user=<username>  — открыть или начать диалог с пользователем

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import useMessages from '../../hooks/useMessages';
import { showConfirm, showAlert } from '../../Components/Dialog/dialogManager';
import ConversationList from '../../Components/ConversationList/ConversationList';
import ChatWindow from '../../Components/ChatWindow/ChatWindow';
import './MessagesPage.scss';

const POLL_INTERVAL = 5000; // 5 секунд — частота polling'а при открытом чате

function MessagesPage() {
  const { user, token } = useAuth();
  const navigate         = useNavigate();
  const [searchParams]   = useSearchParams();

  const [activePartner, setActivePartner] = useState(null); // { id, username, minecraftUuid }

  const {
    conversations,
    messages,
    loadingConversations,
    loadingMessages,
    hasMoreMessages,
    fetchConversations,
    fetchMessages,
    loadOlderMessages,
    sendMessage,
    deleteMessage,
    fetchUnreadCount,
    setMessages,
  } = useMessages();

  // Ref для polling-интервала
  const pollRef = useRef(null);

  // Перенаправляем неавторизованных
  useEffect(() => {
    if (!token) navigate('/auth');
  }, [token, navigate]);

  // Загружаем список диалогов при монтировании
  useEffect(() => {
    if (token) fetchConversations();
  }, [token, fetchConversations]);

  // Открываем чат через URL-параметр ?user=username
  useEffect(() => {
    const username = searchParams.get('user');
    if (!username || !token) return;

    // Ищем пользователя по username через API профиля
    axios.get(`/api/users/by-minecraft/${username}`)
      .then(({ data }) => {
        if (data?.id) {
          setActivePartner({
            id:           data.id,
            username:     data.minecraftName || username,
            minecraftUuid: data.minecraftUuid,
          });
        }
      })
      .catch(() => {
        // Пробуем найти как имя аккаунта (не minecraft-nick)
        // Если не нашли — просто игнорируем
      });
  }, [searchParams, token]);

  // При смене активного партнёра — загружаем историю
  useEffect(() => {
    if (!activePartner) return;
    fetchMessages(activePartner.id, true);
  }, [activePartner, fetchMessages]);

  // Polling: периодически обновляем сообщения в активном чате
  useEffect(() => {
    // Запускаем polling только при открытом чате
    if (!activePartner || !token) {
      clearInterval(pollRef.current);
      return;
    }

    const poll = async () => {
      try {
        const { data } = await axios.get(
          `/api/conversations/${activePartner.id}/messages`,
          {
            params: { limit: 50, offset: 0 },
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const fetched = data.messages || [];

        // Обновляем только новые сообщения (те, которых нет в списке)
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = fetched.filter(m => !existingIds.has(m.id));
          if (newMsgs.length === 0) return prev;

          // Обновляем статус is_read у своих сообщений
          const updatedPrev = prev.map(m => {
            const fresh = fetched.find(f => f.id === m.id);
            return fresh ? { ...m, isRead: fresh.isRead } : m;
          });

          return [...updatedPrev, ...newMsgs];
        });

        // Обновляем счётчик непрочитанных
        fetchUnreadCount();
        // Обновляем список диалогов (last_message, unread_count)
        fetchConversations();
      } catch {
        // Тихо игнорируем ошибки polling'а
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [activePartner, token, fetchUnreadCount, fetchConversations, setMessages]);

  // Выбор диалога из списка
  const handleSelectConversation = useCallback((partner) => {
    setActivePartner(partner);
    // Убираем URL-параметр, чтобы refresh не сбрасывал чат
    navigate('/messages', { replace: true });
  }, [navigate]);

  // Отправка сообщения
  const handleSend = useCallback(async (content, fileData) => {
    if (!activePartner) return;
    try {
      await sendMessage(activePartner.id, content, fileData);
      // После отправки обновляем список диалогов
      fetchConversations();
    } catch (err) {
      console.error('Ошибка отправки:', err.message);
    }
  }, [activePartner, sendMessage, fetchConversations]);

  // Удаление сообщения
  const handleDelete = useCallback(async (messageId) => {
    if (!activePartner) return;
    if (!(await showConfirm('Удалить сообщение?'))) return;
    try {
      await deleteMessage(messageId, activePartner.id);
    } catch {
      await showAlert('Не удалось удалить сообщение');
    }
  }, [activePartner, deleteMessage]);

  // Подгрузка старых сообщений
  const handleLoadOlder = useCallback(() => {
    if (activePartner) loadOlderMessages(activePartner.id);
  }, [activePartner, loadOlderMessages]);

  if (!user) return null;

  return (
    <div className="messages-page">
      {/* Левая колонка: список диалогов */}
      <ConversationList
        conversations={conversations}
        activePartnerId={activePartner?.id}
        onSelect={handleSelectConversation}
        loading={loadingConversations}
      />

      {/* Правая колонка: чат или заглушка */}
      <div className="messages-page__chat">
        {activePartner ? (
          <ChatWindow
            partner={activePartner}
            messages={messages}
            loading={loadingMessages}
            hasMore={hasMoreMessages}
            onSend={handleSend}
            onDelete={handleDelete}
            onLoadOlder={handleLoadOlder}
          />
        ) : (
          <div className="messages-page__no-chat">
            <div className="messages-page__no-chat-icon">💬</div>
            <h3>Выберите диалог</h3>
            <p>Или напишите кому-нибудь с его страницы профиля</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default MessagesPage;
