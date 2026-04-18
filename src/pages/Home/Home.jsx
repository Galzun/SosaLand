import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import PlayerCard from '../../Components/PlayerCard/PlayerCard.jsx';
import { usePlayer } from '../../context/PlayerContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import './Home.scss';

const STATUS_FILTERS = [
  { id: 'all',     label: 'Все' },
  { id: 'online',  label: 'Онлайн' },
  { id: 'offline', label: 'Офлайн' },
  { id: 'banned',  label: 'Забанены' },
];

function hexToRgba(hex, alpha = 1) {
  const h = (hex || '#4aff9e').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function Home({ loading, error }) {
  const { allPlayers } = usePlayer();
  const { user, token } = useAuth();

  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter,   setRoleFilter]   = useState(null);   // null = все роли
  const [customRoles,  setCustomRoles]  = useState([]);

  const [statusOpen, setStatusOpen] = useState(false);
  const [roleOpen,   setRoleOpen]   = useState(false);

  const statusRef = useRef(null);
  const roleRef   = useRef(null);

  // Загружаем кастомные роли для фильтра
  useEffect(() => {
    axios.get('/api/roles').then(r => setCustomRoles(r.data)).catch(() => {});
  }, []);

  // Закрываем дропдауны по клику вне
  useEffect(() => {
    const handler = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false);
      if (roleRef.current   && !roleRef.current.contains(e.target))   setRoleOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyFilters = (players) => {
    let result = players;

    switch (statusFilter) {
      case 'online':  result = result.filter(p => p.isOnline && !p.isBanned); break;
      case 'offline': result = result.filter(p => !p.isOnline && !p.isBanned); break;
      case 'banned':  result = result.filter(p => p.isBanned); break;
      default: break;
    }

    if (roleFilter) {
      result = result.filter(p =>
        Array.isArray(p.customRoles) && p.customRoles.some(r => r.id === roleFilter)
      );
    }

    return result;
  };

  const statusLabel = STATUS_FILTERS.find(f => f.id === statusFilter)?.label ?? 'Все';
  const activeRole  = customRoles.find(r => r.id === roleFilter);

  const renderContent = () => {
    if (loading) return <div className="home__loading">Загрузка игроков...</div>;
    if (error)   return <div className="home__error">Ошибка: {error}</div>;

    const sorted = [...allPlayers].sort((a, b) => {
      if (a.isBanned && !b.isBanned) return 1;
      if (!a.isBanned && b.isBanned) return -1;
      return 0;
    });

    const filtered = applyFilters(sorted);

    return (
      <>
        {/* Фильтры */}
        <div className="home__filter-bar">
          {/* Статус */}
          <div className="home__filter-wrap" ref={statusRef}>
            <button
              className={`home__filter-toggle${statusFilter !== 'all' ? ' home__filter-toggle--active' : ''}`}
              onClick={() => { setStatusOpen(p => !p); setRoleOpen(false); }}
            >
              <span>{statusLabel}</span>
              <span className={`home__filter-arrow${statusOpen ? ' home__filter-arrow--open' : ''}`}>▾</span>
            </button>
            {statusOpen && (
              <div className="home__filter-dropdown">
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f.id}
                    className={`home__filter-option${statusFilter === f.id ? ' home__filter-option--active' : ''}`}
                    onClick={() => { setStatusFilter(f.id); setStatusOpen(false); }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Роли */}
          {customRoles.length > 0 && (
            <div className="home__filter-wrap" ref={roleRef}>
              <button
                className={`home__filter-toggle${roleFilter ? ' home__filter-toggle--active' : ''}`}
                style={activeRole ? {
                  color:       activeRole.color,
                  borderColor: hexToRgba(activeRole.color, 0.4),
                  background:  hexToRgba(activeRole.color, 0.1),
                } : {}}
                onClick={() => { setRoleOpen(p => !p); setStatusOpen(false); }}
              >
                <span>{activeRole ? activeRole.name : 'Роль'}</span>
                <span className={`home__filter-arrow${roleOpen ? ' home__filter-arrow--open' : ''}`}>▾</span>
              </button>
              {roleOpen && (
                <div className="home__filter-dropdown">
                  <button
                    className={`home__filter-option${!roleFilter ? ' home__filter-option--active' : ''}`}
                    onClick={() => { setRoleFilter(null); setRoleOpen(false); }}
                  >
                    Все роли
                  </button>
                  {customRoles.map(role => (
                    <button
                      key={role.id}
                      className={`home__filter-option home__filter-option--role${roleFilter === role.id ? ' home__filter-option--active' : ''}`}
                      style={{
                        '--role-color': role.color,
                        '--role-color-bg': hexToRgba(role.color, 0.08),
                        '--role-color-active': hexToRgba(role.color, 0.15),
                      }}
                      onClick={() => { setRoleFilter(role.id); setRoleOpen(false); }}
                    >
                      <span className="home__filter-role-dot" style={{ background: role.color }} />
                      {role.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="home__empty">Нет игроков</div>
        ) : (
          <div className="home__grid">
            {filtered.map(player => (
              <PlayerCard
                key={player.uuid || player.id || player.name}
                username={player.name}
                uuid={player.uuid}
                status={player.isOnline ? 'online' : 'offline'}
                currentUser={user}
                token={token}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <main className="home">
      {renderContent()}
    </main>
  );
}

export default Home;
