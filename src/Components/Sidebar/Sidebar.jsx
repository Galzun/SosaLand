// Components/Sidebar/Sidebar.jsx
// Боковая панель навигации:
//   — блок пользователя наверху (аватар + имя, или кнопка «Войти»)
//   — навигационные пункты списком ниже
//   — на мобилке (<1024px) скрыта, открывается кнопкой ☰ справа
//   — когда открыта: header скрывается, логотип и инфо-бейджи показываются внутри

import { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import './Sidebar.scss';

const UNREAD_POLL_INTERVAL = 15_000;

function roleLabel(role) {
  switch (role) {
    case 'creator': return 'Создатель';
    case 'admin':   return 'Администратор';
    case 'editor':  return 'Редактор';
    default:        return 'Игрок';
  }
}

function roleLevel(role) {
  return { creator: 4, admin: 3, editor: 2, user: 1 }[role] ?? 1;
}

function Sidebar({ serverIp, borderColor }) {
  const [isOpen,       setIsOpen]       = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [copied,       setCopied]       = useState(false);

  const location = useLocation();
  const navigate  = useNavigate();
  const { user, token, logout } = useAuth();
  const { onlineCount } = usePlayer();
  const dropdownRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Закрываем при смене маршрута (мобилка)
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Блокируем скролл body при открытом меню
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Закрываем дропдаун при клике вне
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Загружаем pending-тикеты (только для admin+)
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

  // Загружаем непрочитанные сообщения
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

  // Сбрасываем счётчик при открытии сообщений
  useEffect(() => {
    if (location.pathname === '/messages') setUnreadCount(0);
  }, [location.pathname]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(serverIp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleLogout = () => {
    setDropdownOpen(false);
    setIsOpen(false);
    logout();
    navigate('/');
  };

  const avatarUrl = user?.minecraftUuid
    ? `https://crafatar.icehost.xyz/avatars/${user.minecraftUuid}?size=64&overlay`
    : null;

  const getAvatarUrl32 = (uuid) =>
    uuid ? `https://crafatar.icehost.xyz/avatars/${uuid}?size=32&overlay` : null;

  const navItems = [
    { to: '/',        icon: '🏠', label: 'Главная', exact: true },
    { to: '/feed',    icon: '📋', label: 'Лента' },
    { to: '/news',    icon: '📰', label: 'Новости' },
    { to: '/gallery', icon: '📸', label: 'Галерея' },
    { to: '/events',  icon: '📅', label: 'События' },
    { to: '/messages',icon: '💬', label: 'Сообщения', requireAuth: true },
  ];

  const isAdmin = user && roleLevel(user.role) >= roleLevel('admin');

  return (
    <>
      {/* Кнопка-гамбургер: только на мобилке/планшете, справа */}
      <button
        className={`sidebar__burger${isOpen ? ' sidebar__burger--open' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
      >
        {isOpen ? '✕' : '☰'}
      </button>

      {/* Затемнение под сайдбаром */}
      {isOpen && (
        <div className="sidebar__overlay" onClick={() => setIsOpen(false)} />
      )}

      <nav className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>

        {/* ── Мобильный логотип (только на мобилке, в самом верху) ── */}
        <div className="sidebar__mobile-logo">
          <Link to="/" className="sidebar__mobile-logo-link" onClick={() => setIsOpen(false)}>
            <div className="sidebar__mobile-logo-icon">
              <span className="sidebar__mobile-logo-block">⬜</span>
              <span className="sidebar__mobile-logo-block">🟫</span>
              <span className="sidebar__mobile-logo-block">🟩</span>
            </div>
            <span className="sidebar__mobile-logo-title">Sosaland</span>
          </Link>
        </div>

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
            .filter(item => !item.requireAuth || user)
            .map(({ to, icon, label, exact }) => {
              const isMessages = to === '/messages';
              const showBadge  = isMessages && unreadCount > 0;

              return (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `sidebar__item${isActive ? ' sidebar__item--active' : ''}${showBadge ? ' sidebar__item--pending' : ''}`
                  }
                >
                  <span className="sidebar__item-icon">{icon}</span>
                  <span className="sidebar__item-label">{label}</span>
                  {showBadge && (
                    <span className="sidebar__item-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                </NavLink>
              );
            })
          }

          {/* Заявки — только admin+ */}
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

          {/* Логи — только admin+ */}
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

        {/* ── Мобильная шапка (бейджи из header) — прижата к низу ── */}
        <div className="sidebar__mobile-info">
          {/* Онлайн */}
          <div className="sidebar__mobile-badge">
            <span className="sidebar__mobile-badge-dot" style={{ backgroundColor: borderColor || '#4aff9e' }}></span>
            <span>Онлайн: {onlineCount}</span>
          </div>

          {/* Wiki */}
          <a
            href="https://sosaland.gitbook.io/sosaland"
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar__mobile-badge sidebar__mobile-badge--link"
          >
            <span>📑</span>
            <span>Wiki</span>
          </a>

          {/* IP сервера */}
          <div
            className={`sidebar__mobile-badge sidebar__mobile-badge--ip${copied ? ' sidebar__mobile-badge--copied' : ''}`}
            onClick={copyToClipboard}
            title="Нажмите, чтобы скопировать IP"
          >
            <span>🌐</span>
            <span>{copied ? 'IP Скопирован!' : serverIp}</span>
          </div>

          {/* Пользователь (авторизован) — ссылки профиль/редактировать/выйти */}
          {user && (
            <div className="sidebar__mobile-user" ref={dropdownRef}>
              <button
                className="sidebar__mobile-user-trigger"
                onClick={() => setDropdownOpen(p => !p)}
              >
                {getAvatarUrl32(user.minecraftUuid) && (
                  <img
                    src={getAvatarUrl32(user.minecraftUuid)}
                    alt={user.username}
                    className="sidebar__mobile-user-avatar"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <span>{user.username}</span>
                <span className={`sidebar__mobile-user-arrow${dropdownOpen ? ' sidebar__mobile-user-arrow--open' : ''}`}>▾</span>
              </button>
              {dropdownOpen && (
                <div className="sidebar__mobile-dropdown">
                  <Link to={`/player/${user.username}`} className="sidebar__mobile-dropdown-item" onClick={() => { setDropdownOpen(false); setIsOpen(false); }}>
                    <span>👤</span> Профиль
                  </Link>
                  <Link to="/dashboard/profile" className="sidebar__mobile-dropdown-item" onClick={() => { setDropdownOpen(false); setIsOpen(false); }}>
                    <span>✏️</span> Редактировать профиль
                  </Link>
                  <button className="sidebar__mobile-dropdown-item sidebar__mobile-dropdown-item--danger" onClick={handleLogout}>
                    <span>↩</span> Выйти
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Кнопка войти (не авторизован) */}
          {!user && (
            <Link to="/auth" className="sidebar__mobile-badge sidebar__mobile-badge--login" onClick={() => setIsOpen(false)}>
              <span>👤</span>
              <span>Войти</span>
            </Link>
          )}
        </div>

        {/* ── Футер с авторами ── */}
        <div className="sidebar__footer">
          <span className="sidebar__footer-by">by</span>
          <a href="#" className="sidebar__footer-author sidebar__footer-author--galzun" onClick={(e) => e.preventDefault()}>Galzun</a>
          <span className="sidebar__footer-sep">,</span>
          <a href="#" className="sidebar__footer-author sidebar__footer-author--deepseek" onClick={(e) => e.preventDefault()}>DeepSeek</a>
          <span className="sidebar__footer-sep">,</span>
          <a href="#" className="sidebar__footer-author sidebar__footer-author--claude" onClick={(e) => e.preventDefault()}>ClaudeCode</a>
        </div>

      </nav>
    </>
  );
}

export default Sidebar;
