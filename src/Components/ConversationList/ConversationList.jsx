// Components/ConversationList/ConversationList.jsx
// Список диалогов пользователя.
// Каждый элемент: аватарка, имя, последнее сообщение, время, счётчик непрочитанных.

import './ConversationList.scss';

// Форматирует время последнего сообщения в короткий вид
function formatLastTime(ts) {
  if (!ts) return '';
  const d   = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  // Вчера и раньше — только дата
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function ConversationList({ conversations, activePartnerId, onSelect, onDelete, loading }) {
  if (loading && conversations.length === 0) {
    return (
      <div className="conv-list conv-list--loading">
        <span className="conv-list__spinner" />
        Загрузка...
      </div>
    );
  }

  if (!loading && conversations.length === 0) {
    return (
      <div className="conv-list conv-list--empty">
        Нет диалогов.<br />
        Напишите первым с профиля игрока!
      </div>
    );
  }

  return (
    <div className="conv-list">
      {conversations.map(conv => {
        const { partner, lastMessage, lastMessageTime, unreadCount } = conv;
        const isActive = partner.id === activePartnerId;

        return (
          <div
            key={conv.id}
            className={`conv-list__item${isActive ? ' conv-list__item--active' : ''}`}
          >
            <button
              className="conv-list__item-btn"
              onClick={() => onSelect(partner)}
              type="button"
            >
              {/* Аватарка */}
              <div className="conv-list__avatar">
                <img src={partner.avatarUrl} alt={partner.username} />
              </div>

              {/* Информация */}
              <div className="conv-list__info">
                <div className="conv-list__top">
                  <span className="conv-list__name">{partner.username}</span>
                  <span className="conv-list__time">{formatLastTime(lastMessageTime)}</span>
                </div>
                <div className="conv-list__bottom">
                  <span className="conv-list__preview">
                    {lastMessage || 'Начните переписку'}
                  </span>
                  {unreadCount > 0 && (
                    <span className="conv-list__badge">{unreadCount}</span>
                  )}
                </div>
              </div>
            </button>

            {/* Кнопка удаления диалога (показывается при наведении) */}
            {onDelete && (
              <button
                className="conv-list__delete-btn"
                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                title="Удалить переписку"
                type="button"
              >
                🗑
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ConversationList;
