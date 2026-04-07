// Components/Header/Header.jsx
// Шапка сайта. Показывает логотип, статус сервера, IP и блок авторизации.
// Навигационные ссылки перенесены в Sidebar.
// Если пользователь авторизован — аватарка с дропдауном (Профиль / Редактировать / Выйти).
// Если нет — кнопка "Войти".

import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePlayer } from '../../context/PlayerContext';
import { useAuth } from '../../context/AuthContext';
import './Header.scss';

function Header({ serverIp, borderColor }) {
  const [copied, setCopied]             = useState(false);
  // Флаг открытия дропдауна пользователя.
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Ref на блок дропдауна — нужен чтобы закрывать его при клике вне.
  const dropdownRef = useRef(null);

  const { onlineCount } = usePlayer();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Закрываем дропдаун при клике за его пределами.
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Закрываем дропдаун при смене страницы.
  useEffect(() => {
    setDropdownOpen(false);
  }, [navigate]);


  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(serverIp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  };

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/');
  };

  const getAvatarUrl = (uuid) => {
    if (!uuid) return null;
    return `https://crafatar.icehost.xyz/avatars/${uuid}?size=32&overlay`;
  };

  return (
    <header className="header" style={{ borderBottomColor: borderColor }}>
      <div className="header__container">
        {/* Логотип — ссылка на ленту */}
        <Link to="/" className="header__logo">
          <div className="header__logo-icon">
            <span className="header__logo-block">⬜</span>
            <span className="header__logo-block">🟫</span>
            <span className="header__logo-block">🟩</span>
          </div>
          <span className="header__title">Sosaland</span>
        </Link>

        <div className="header__info">
          {/* Онлайн-счётчик */}
          <div className="header__badge">
            <span className="header__badge-dot" style={{ backgroundColor: borderColor }}></span>
            <span className="header__badge-text">Онлайн: {onlineCount}</span>
          </div>

          {/* Ссылка на Wiki */}
          <a
            href='https://sosaland.gitbook.io/sosaland'
            target='_blank'
            rel="noopener noreferrer"
            className="header__badge header__badge--version"
          >
            <span className="header__badge-icon">📑</span>
            <span className="header__badge-text">Wiki</span>
          </a>

          {/* IP сервера — кликабельный, копирует в буфер */}
          <div
            className={copied ? "header__badge header__badge--ip_copy" : "header__badge header__badge--ip"}
            onClick={copyToClipboard}
            title="Нажмите, чтобы скопировать IP"
          >
            <span className="header__badge-icon">🌐</span>
            <span className="header__badge-text">
              {copied ? "IP Скопирован!" : serverIp}
            </span>
          </div>

          {/* Блок авторизации */}
          {user ? (
            // Дропдаун: клик на аватарку/имя открывает меню
            <div className="header__user" ref={dropdownRef}>
              <button
                className="header__user-trigger"
                onClick={() => setDropdownOpen(prev => !prev)}
                aria-expanded={dropdownOpen}
              >
                {getAvatarUrl(user.minecraftUuid) && (
                  <img
                    src={getAvatarUrl(user.minecraftUuid)}
                    alt={user.username}
                    className="header__user-avatar"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <span className="header__user-name">{user.username}</span>
                <span className={`header__user-arrow ${dropdownOpen ? 'header__user-arrow--open' : ''}`}>
                  ▾
                </span>
              </button>

              {dropdownOpen && (
                <div className="header__dropdown">
                  <Link
                    to={`/player/${user.username}`}
                    className="header__dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <span className="header__dropdown-icon">👤</span>
                    Профиль
                  </Link>
                  <Link
                    to="/dashboard/profile"
                    className="header__dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <span className="header__dropdown-icon">✏️</span>
                    Редактировать профиль
                  </Link>
                  <button
                    className="header__dropdown-item header__dropdown-item--danger"
                    onClick={handleLogout}
                  >
                    <span className="header__dropdown-icon">↩</span>
                    Выйти
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/auth" className="header__badge header__badge--login">
              <span className="header__badge-icon">👤</span>
              <span className="header__badge-text">Войти</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
