// Components/ChatWindow/ChatWindow.jsx

import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { renderWithMentions } from '../CommentSection/CommentSection';
import MessageInput from '../MessageInput/MessageInput';
import FileIcon from '../FileIcon/FileIcon';
import ImageModal from '../ImageModal/ImageModal';
import { getAvatarUrl } from '../../utils/avatarUrl';
import './ChatWindow.scss';

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

// Собирает все файлы сообщения в единый массив
function getMessageFiles(msg) {
  const files = [];
  if (msg.fileUrl) files.push({ fileUrl: msg.fileUrl, fileType: msg.fileType || '', fileName: msg.fileName || '' });
  if (msg.files?.length) files.push(...msg.files);
  return files;
}

function isMediaAtt(att) {
  return att.fileType?.startsWith('image/') || att.fileType?.startsWith('video/');
}

// Конвертирует файл-вложение в формат, понятный ImageModal
function toImageModalItem(att, idx) {
  return {
    id: att.fileUrl || `chat-media-${idx}`, // нужен как React key в стрипе
    fileUrl:  att.fileUrl,
    fileType: att.fileType,
    fileName: att.fileName,
  };
}

function ChatWindow({
  partner,
  messages,
  loading,
  hasMore,
  onSend,
  onDelete,
  onLoadOlder,
  onBack,
}) {
  const { user } = useAuth();
  const messagesEndRef   = useRef(null);
  const messagesAreaRef  = useRef(null);
  // { items: ImageModal-совместимые объекты, index }
  const [lightbox, setLightbox] = useState(null);

  const partnerAvatar = partner?.avatarUrl ?? null;

  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area) return;
    const count = messages.length;
    if (count === 0) return;
    const wasAtBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
    if (wasAtBottom || prevMsgCountRef.current === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCountRef.current = count;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const area = messagesAreaRef.current;
    if (!area || !hasMore || loading) return;
    if (area.scrollTop < 80) onLoadOlder();
  }, [hasMore, loading, onLoadOlder]);

  const openLightbox = (mediaFiles, index) => {
    setLightbox({
      items: mediaFiles.map(toImageModalItem),
      index,
    });
  };

  // Рендер не-медиа вложения (аудио / документ)
  const renderNonMediaAtt = (att, key) => {
    if (att.fileType?.startsWith('audio/')) {
      return (
        <audio
          key={key}
          className="chat__msg-audio"
          src={att.fileUrl}
          controls
          style={{ colorScheme: 'dark' }}
        />
      );
    }
    return (
      <a
        key={key}
        className="chat__msg-file"
        href={att.fileUrl}
        download={att.fileName}
        target="_blank"
        rel="noopener noreferrer"
      >
        <FileIcon fileType={att.fileType} size={28} />
        <span className="chat__msg-file-name">{att.fileName || 'Файл'}</span>
        <span className="chat__msg-file-download">⬇</span>
      </a>
    );
  };

  // Рендер одиночного медиа (прежнее поведение — клик открывает лайтбокс)
  const renderSingleMedia = (att, mediaFiles) => {
    if (att.fileType?.startsWith('image/')) {
      return (
        <img
          className="chat__msg-image"
          src={att.fileUrl}
          alt={att.fileName || ''}
          onClick={() => openLightbox(mediaFiles, 0)}
          loading="lazy"
        />
      );
    }
    // одиночное видео — нативный плеер (можно кликнуть)
    return (
      <video
        className="chat__msg-video"
        src={att.fileUrl}
        controls
        playsInline
        style={{ colorScheme: 'dark' }}
      />
    );
  };

  // Рендер медиа-сетки (пак из 2+ файлов)
  const renderMediaGrid = (mediaFiles) => {
    const total = mediaFiles.length;
    const visibleCount = Math.min(total, 4);
    const extra = total - visibleCount;

    return (
      <div className={`chat__media-grid chat__media-grid--${visibleCount}`}>
        {mediaFiles.slice(0, visibleCount).map((item, i) => {
          const isLastVisible = i === visibleCount - 1 && extra > 0;
          const isVideo = item.fileType?.startsWith('video/');
          return (
            <div
              key={i}
              className="chat__media-grid-item"
              onClick={() => openLightbox(mediaFiles, i)}
            >
              {isVideo ? (
                <video src={`${item.fileUrl}#t=0.1`} preload="metadata" muted />
              ) : (
                <img src={item.fileUrl} alt={item.fileName || ''} loading="lazy" />
              )}
              {isVideo && !isLastVisible && (
                <span className="chat__media-grid-play">▶</span>
              )}
              {isLastVisible && (
                <div className="chat__media-grid-overlay">+{extra}</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderMessage = (msg, prevMsg) => {
    const isOwn    = msg.senderId === user?.id || msg.sender?.id === user?.id;
    const showDate = !prevMsg || getDateLabel(msg.createdAt) !== getDateLabel(prevMsg.createdAt);
    const senderAvatar = !isOwn ? (msg.sender?.avatarUrl ?? null) : null;

    const allFiles   = getMessageFiles(msg);
    const mediaFiles = allFiles.filter(isMediaAtt);
    const otherFiles = allFiles.filter(f => !isMediaAtt(f));
    const mediaOnly  = mediaFiles.length >= 2 && otherFiles.length === 0 && !msg.content;

    return (
      <div key={msg.id} className={`chat__msg-wrapper${isOwn ? ' chat__msg-wrapper--own' : ''}`}>
        {showDate && (
          <div className="chat__date-divider">
            <span>{getDateLabel(msg.createdAt)}</span>
          </div>
        )}

        <div className={`chat__msg${isOwn ? ' chat__msg--own' : ' chat__msg--other'}${msg._pending ? ' chat__msg--pending' : ''}`}>
          {!isOwn && (
            <div className="chat__msg-avatar">
              <img
                src={senderAvatar || getAvatarUrl(msg.sender?.minecraftName || msg.sender?.username, null)}
                alt={msg.sender?.minecraftName || msg.sender?.username}
                onError={(e) => { e.target.onerror = null; e.target.src = getAvatarUrl(msg.sender?.minecraftName || msg.sender?.username, null); }}
              />
            </div>
          )}

          <div className="chat__msg-body">
            <div className={`chat__msg-bubble${mediaOnly ? ' chat__msg-bubble--media-only' : ''}`}>
              {/* Медиа: сетка для 2+, одиночное для 1 */}
              {mediaFiles.length >= 2
                ? renderMediaGrid(mediaFiles)
                : mediaFiles.length === 1
                  ? renderSingleMedia(mediaFiles[0], mediaFiles)
                  : null
              }
              {/* Не-медиа файлы */}
              {otherFiles.map((att, i) => renderNonMediaAtt(att, `nm${i}`))}
              {/* Текст */}
              {msg.content && (
                <p className="chat__msg-text">{renderWithMentions(msg.content)}</p>
              )}
            </div>

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
      {/* Шапка */}
      <div className="chat-window__header">
        {onBack && (
          <button className="chat-window__back-btn" onClick={onBack} aria-label="Назад">
            ←
          </button>
        )}
        <div className="chat-window__header-avatar">
          {partnerAvatar ? (
            <img src={partnerAvatar} alt={partner.minecraftName || partner.username} />
          ) : (
            <span>👤</span>
          )}
        </div>
        <div className="chat-window__header-info">
          <Link to={`/player/${partner.minecraftName || partner.username}`} className="chat-window__header-name">
            {partner.minecraftName || partner.username}
          </Link>
        </div>
      </div>

      {/* Область сообщений */}
      <div
        className="chat-window__messages"
        ref={messagesAreaRef}
        onScroll={handleScroll}
      >
        {loading && messages.length > 0 && (
          <div className="chat-window__loading-top">
            <span className="chat-window__spinner" /> Загрузка...
          </div>
        )}

        {hasMore && !loading && (
          <button
            className="chat-window__load-more"
            onClick={onLoadOlder}
            type="button"
          >
            Загрузить более ранние сообщения
          </button>
        )}

        {loading && messages.length === 0 && (
          <div className="chat-window__loading-center">
            <span className="chat-window__spinner" />
            <span>Загрузка сообщений...</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="chat-window__empty">
            Нет сообщений. Напишите первым!
          </div>
        )}

        {messages.map((msg, i) => renderMessage(msg, messages[i - 1] || null))}

        <div ref={messagesEndRef} />
      </div>

      {/* Форма ввода */}
      <div className="chat-window__input-area">
        <MessageInput onSend={onSend} disabled={false} />
      </div>

      {/* Лайтбокс — используем ImageModal как в галерее */}
      {lightbox && (
        <ImageModal
          images={lightbox.items}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          showSidebar={false}
          showShare={false}
          albumRanges={[{ startIndex: 0, items: lightbox.items }]}
        />
      )}
    </div>
  );
}

export default ChatWindow;
