// Components/Sidebar/Sidebar.jsx
// Боковая панель навигации в стиле VK:
//   — блок пользователя наверху (аватар + имя, или кнопка «Войти»)
//   — навигационные пункты списком ниже
//   — на мобилке (<1024px) скрыта, открывается кнопкой ☰

import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.scss';

const UNREAD_POLL_INTERVAL = 15_000; // проверяем непрочитанные каждые 15 секунд

// Метка роли для отображения в сайдбаре
function roleLabel(role) {
  switch (role) {
    case 'creator': return 'Создатель';
    case 'admin':   return 'Администратор';
    case 'editor':  return 'Редактор';
    default:        return 'Игрок';
  }
}

// Уровень роли (чем выше — тем больше прав)
function roleLevel(role) {
  return { creator: 4, admin: 3, editor: 2, user: 1 }[role] ?? 1;
}

function Sidebar() {
  const [isOpen,       setIsOpen]       = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount,  setUnreadCount]  = useState(0); // непрочитанные сообщения
  const location = useLocation();
  const { user, token } = useAuth();

  // Закрываем при смене маршрута (мобилка)
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Блокируем скролл body когда меню открыто на мобилке
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Загружаем количество pending-тикетов для бейджа (только для админов и выше).
  useEffect(() => {
    if (!user || roleLevel(user.role) < roleLevel('admin') || !token) { setPendingCount(0); return; }
    const fetch = async () => {
      try {
        const r = await axios.get('/api/tickets/admin', { headers: { Authorization: `Bearer ${token}` } });
        setPendingCount(r.data.length);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, [user, token]);

  // Загружаем количество непрочитанных сообщений (для авторизованных)
  useEffect(() => {
    if (!user || !token) { setUnreadCount(0); return; }

    const fetchUnread = async () => {
      try {
        const r = await axios.get('/api/conversations/unread-count', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUnreadCount(r.data.count ?? 0);
      } catch {}
    };

    fetchUnread();
    const id = setInterval(fetchUnread, UNREAD_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [user, token]);

  // Сбрасываем счётчик при открытии страницы сообщений
  useEffect(() => {
    if (location.pathname === '/messages') {
      setUnreadCount(0);
    }
  }, [location.pathname]);

  const avatarUrl = user?.minecraftUuid
    ? `https://crafatar.icehost.xyz/avatars/${user.minecraftUuid}?size=64&overlay`
    : null;

  const navItems = [
    { to: '/feed',     icon: '🏠', label: 'Лента' },
    { to: '/news',     icon: '📰', label: 'Новости' },
    { to: '/gallery',  icon: '📸', label: 'Галерея' },
    { to: '/events',   icon: '📅', label: 'События' },
    { to: '/messages', icon: '💬', label: 'Сообщения', requireAuth: true },
  ];

  const isAdmin = user && roleLevel(user.role) >= roleLevel('admin');

  return (
    <>
      {/* Кнопка-гамбургер: только на мобилке/планшете */}
      <button
        className="sidebar__burger"
        onClick={() => setIsOpen(true)}
        aria-label="Открыть меню"
      >
        ☰
      </button>

      {/* Затемнение под сайдбаром */}
      {isOpen && (
        <div className="sidebar__overlay" onClick={() => setIsOpen(false)} />
      )}

      <nav className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>

        {/* Кнопка закрытия (только мобилка) */}
        <button
          className="sidebar__close"
          onClick={() => setIsOpen(false)}
          aria-label="Закрыть"
        >
          ✕
        </button>

        {/* ── Блок пользователя ── */}
        <div className="sidebar__profile">
          {user ? (
            <Link
              to={`/player/${user.username}`}
              className="sidebar__profile-link"
            >
              <div className="sidebar__profile-avatar">
                {avatarUrl
                  ? <img src={avatarUrl} alt={user.username} onError={(e) => { e.target.style.display = 'none'; }} />
                  : <span className="sidebar__profile-avatar-placeholder">👤</span>
                }
              </div>
              <div className="sidebar__profile-info">
                <span className="sidebar__profile-name">{user.username}</span>
                <span className={`sidebar__profile-role sidebar__profile-role--${user.role}`}>
                  {roleLabel(user.role)}
                </span>
              </div>
            </Link>
          ) : (
            <Link to="/auth" className="sidebar__login">
              <span className="sidebar__login-icon">👤</span>
              <span>Войти</span>
            </Link>
          )}
        </div>

        {/* ── Навигация ── */}
        <div className="sidebar__nav">
          {navItems
            // Если пункт требует авторизации — показываем только авторизованным
            .filter(item => !item.requireAuth || user)
            .map(({ to, icon, label }) => {
              // Показываем бейдж с числом непрочитанных на пункте «Сообщения»
              const isMessages = to === '/messages';
              const showBadge  = isMessages && unreadCount > 0;

              return (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `sidebar__item${isActive ? ' sidebar__item--active' : ''}${showBadge ? ' sidebar__item--pending' : ''}`
                  }
                >
                  <span className="sidebar__item-icon">{icon}</span>
                  <span className="sidebar__item-label">{label}</span>
                </NavLink>
              );
            })
          }

          {/* Заявки — только администраторам и выше */}
          {isAdmin && (
            <NavLink
              to="/dashboard/tickets"
              className={({ isActive }) =>
                `sidebar__item${isActive ? ' sidebar__item--active' : ''}${pendingCount > 0 ? ' sidebar__item--pending' : ''}`
              }
            >
              <span className="sidebar__item-icon">🎫</span>
              <span className="sidebar__item-label">Заявки</span>
            </NavLink>
          )}

          {/* Логи — только администраторам и выше */}
          {isAdmin && (
            <NavLink
              to="/dashboard/logs"
              className={({ isActive }) =>
                `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
              }
            >
              <span className="sidebar__item-icon">📋</span>
              <span className="sidebar__item-label">Логи</span>
            </NavLink>
          )}
        </div>

        {/* ── Футер с авторами ── */}
        <div className="sidebar__footer">
          <span className="sidebar__footer-by">by</span>
          <a
            href="#"
            className="sidebar__footer-author sidebar__footer-author--galzun"
            onClick={(e) => e.preventDefault()}
          >Galzun</a>
          <span className="sidebar__footer-sep">,</span>
          <a
            href="#"
            className="sidebar__footer-author sidebar__footer-author--deepseek"
            onClick={(e) => e.preventDefault()}
          >DeepSeek</a>
          <span className="sidebar__footer-sep">,</span>
          <a
            href="#"
            className="sidebar__footer-author sidebar__footer-author--claude"
            onClick={(e) => e.preventDefault()}
          >ClaudeCode</a>
        </div>

      </nav>
    </>
  );
}

export default Sidebar;
