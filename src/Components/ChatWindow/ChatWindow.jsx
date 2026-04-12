// Components/ChatWindow/ChatWindow.jsx
// Окно чата с конкретным собеседником.
//
// Показывает историю сообщений, поддерживает:
//   — автоскролл вниз при новых сообщениях
//   — подгрузку старых сообщений при скролле вверх
//   — отправку текста и файлов
//   — удаление своих сообщений
//   — просмотр изображений через клик

import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import MessageInput from '../MessageInput/MessageInput';
import FileIcon from '../FileIcon/FileIcon';
import './ChatWindow.scss';

// Форматирует unix timestamp в читаемое время
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return `${date}, ${time}`;
}

// Группирует сообщения по дате для разделителей
function getDateLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday     = d.toDateString() === now.toDateString();
  const yesterday   = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday)     return 'Сегодня';
  if (isYesterday) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ChatWindow({
  partner,          // { id, username, minecraftUuid }
  messages,
  loading,
  hasMore,
  onSend,
  onDelete,
  onLoadOlder,
}) {
  const { user } = useAuth();
  const messagesEndRef   = useRef(null);  // для автоскролла вниз
  const messagesAreaRef  = useRef(null);  // контейнер сообщений
  const [lightboxUrl, setLightboxUrl] = useState(null); // просмотр изображения

  // Аватарка собеседника через Crafatar
  const partnerAvatar = partner?.minecraftUuid
    ? `https://crafatar.icehost.xyz/avatars/${partner.minecraftUuid}?size=64&overlay`
    : null;

  // Автоскролл вниз при появлении новых сообщений
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area) return;

    const count = messages.length;
    if (count === 0) return;

    // Если сообщений стало больше снизу (новое) — скроллим вниз
    // Если стало больше сверху (загрузка старых) — не скроллим
    const wasAtBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;

    if (wasAtBottom || prevMsgCountRef.current === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    prevMsgCountRef.current = count;
  }, [messages]);

  // Обработка скролла: при достижении верха загружаем старые сообщения
  const handleScroll = useCallback(() => {
    const area = messagesAreaRef.current;
    if (!area || !hasMore || loading) return;
    if (area.scrollTop < 80) {
      onLoadOlder();
    }
  }, [hasMore, loading, onLoadOlder]);

  // Рендер одного сообщения
  const renderMessage = (msg, prevMsg) => {
    const isOwn    = msg.senderId === user?.id || msg.sender?.id === user?.id;
    const showDate = !prevMsg || getDateLabel(msg.createdAt) !== getDateLabel(prevMsg.createdAt);

    // Аватарка отправителя (только для чужих)
    const senderAvatar = !isOwn && msg.sender?.minecraftUuid
      ? `https://crafatar.icehost.xyz/avatars/${msg.sender.minecraftUuid}?size=32&overlay`
      : null;

    return (
      // Обёртка нужна для ключа React. Также задаём ей flex-выравнивание,
      // чтобы align-self на .chat__msg работал корректно внутри flex-колонки.
      <div key={msg.id} className={`chat__msg-wrapper${isOwn ? ' chat__msg-wrapper--own' : ''}`}>
        {/* Разделитель по дате */}
        {showDate && (
          <div className="chat__date-divider">
            <span>{getDateLabel(msg.createdAt)}</span>
          </div>
        )}

        <div className={`chat__msg${isOwn ? ' chat__msg--own' : ' chat__msg--other'}${msg._pending ? ' chat__msg--pending' : ''}`}>
          {/* Аватарка собеседника */}
          {!isOwn && (
            <div className="chat__msg-avatar">
              {senderAvatar ? (
                <img src={senderAvatar} alt={msg.sender?.username} />
              ) : (
                <span className="chat__msg-avatar-placeholder">👤</span>
              )}
            </div>
          )}

          <div className="chat__msg-body">
            {/* Контент сообщения: изображение, файл или текст */}
            <div className="chat__msg-bubble">
              {/* Изображение */}
              {msg.fileUrl && msg.fileType?.startsWith('image/') && (
                <img
                  className="chat__msg-image"
                  src={msg.fileUrl}
                  alt={msg.fileName || 'Изображение'}
                  onClick={() => setLightboxUrl(msg.fileUrl)}
                  loading="lazy"
                />
              )}

              {/* Не-изображение файл */}
              {msg.fileUrl && !msg.fileType?.startsWith('image/') && (
                <a
                  className="chat__msg-file"
                  href={msg.fileUrl}
                  download={msg.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileIcon fileType={msg.fileType} size={28} />
                  <span className="chat__msg-file-name">{msg.fileName || 'Файл'}</span>
                  <span className="chat__msg-file-download">⬇</span>
                </a>
              )}

              {/* Текст сообщения */}
              {msg.content && (
                <p className="chat__msg-text">{msg.content}</p>
              )}
            </div>

            {/* Метаданные: время + статус прочтения */}
            <div className="chat__msg-meta">
              <span className="chat__msg-time">{formatTime(msg.createdAt)}</span>
              {isOwn && (
                <span
                  className={`chat__msg-read${msg.isRead ? ' chat__msg-read--done' : ''}`}
                  title={msg.isRead ? 'Прочитано' : 'Доставлено'}
                >
                  {msg.isRead ? '✓✓' : '✓'}
                </span>
              )}
              {/* Кнопка удаления своего сообщения */}
              {isOwn && !msg._pending && (
                <button
                  className="chat__msg-delete"
                  onClick={() => onDelete(msg.id)}
                  title="Удалить сообщение"
                  type="button"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="chat-window">
      {/* Шапка: аватарка + имя собеседника */}
      <div className="chat-window__header">
        <div className="chat-window__header-avatar">
          {partnerAvatar ? (
            <img src={partnerAvatar} alt={partner.username} />
          ) : (
            <span>👤</span>
          )}
        </div>
        <div className="chat-window__header-info">
          <Link
            to={`/player/${partner.username}`}
            className="chat-window__header-name"
          >
            {partner.username}
          </Link>
        </div>
      </div>

      {/* Область сообщений */}
      <div
        className="chat-window__messages"
        ref={messagesAreaRef}
        onScroll={handleScroll}
      >
        {/* Загрузка старых сообщений */}
        {loading && messages.length > 0 && (
          <div className="chat-window__loading-top">
            <span className="chat-window__spinner" /> Загрузка...
          </div>
        )}

        {/* Кнопка «Загрузить ещё» если есть история */}
        {hasMore && !loading && (
          <button
            className="chat-window__load-more"
            onClick={onLoadOlder}
            type="button"
          >
            Загрузить более ранние сообщения
          </button>
        )}

        {/* Начальная загрузка */}
        {loading && messages.length === 0 && (
          <div className="chat-window__loading-center">
            <span className="chat-window__spinner" />
            <span>Загрузка сообщений...</span>
          </div>
        )}

        {/* Пустой чат */}
        {!loading && messages.length === 0 && (
          <div className="chat-window__empty">
            Нет сообщений. Напишите первым!
          </div>
        )}

        {/* Список сообщений */}
        {messages.map((msg, i) => renderMessage(msg, messages[i - 1] || null))}

        {/* Якорь для автоскролла */}
        <div ref={messagesEndRef} />
      </div>

      {/* Форма ввода */}
      <div className="chat-window__input-area">
        <MessageInput onSend={onSend} disabled={false} />
      </div>

      {/* Лайтбокс для просмотра изображений */}
      {lightboxUrl && (
        <div
          className="chat-window__lightbox"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="chat-window__lightbox-inner" onClick={e => e.stopPropagation()}>
            <img src={lightboxUrl} alt="Просмотр" />
            <button
              className="chat-window__lightbox-close"
              onClick={() => setLightboxUrl(null)}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
