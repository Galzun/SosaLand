import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { usePlayerByName, usePlayer } from '../../context/PlayerContext';
import { showPrompt, showConfirm } from '../Dialog/dialogManager';
import './PlayerCard.scss';

const ROLE_LEVEL = { creator: 4, admin: 3, editor: 2, user: 1 };
const roleLevel = (r) => ROLE_LEVEL[r] ?? 1;

function PlayerCard({ username, status, currentUser, token }) {
  const [avatarError, setAvatarError] = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  // undefined = ещё не загружено, null = нет аккаунта на сайте, object = профиль
  const [profile,     setProfile]     = useState(undefined);
  const [loading,     setLoading]     = useState(false);
  const [errorMsg,    setErrorMsg]    = useState(null);
  const [successMsg,  setSuccessMsg]  = useState(null);
  const wrapperRef = useRef(null);

  const player = usePlayerByName(username);
  const { setBanOverride } = usePlayer();

  // Закрыть меню по клику вне обёртки
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Открыть/закрыть меню и загрузить профиль сайта (только один раз)
  const openMenu = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) { setMenuOpen(false); return; }
    setMenuOpen(true);
    if (profile !== undefined) return;
    try {
      const r = await axios.get(`/api/users/by-minecraft/${username}`);
      setProfile(r.data);
    } catch {
      setProfile(null);
    }
  }, [menuOpen, profile, username]);

  const handleToggleBan = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isBanned = player?.isBanned ?? false;

    let banReason = null;
    if (!isBanned) {
      const input = await showPrompt('Причина бана (необязательно):', { placeholder: 'Необязательно...' });
      if (input === null) return; // пользователь отменил
      banReason = input.trim() || null;
    }

    setMenuOpen(false);
    setLoading(true);

    try {
      const action = isBanned ? 'unban' : 'ban';
      await axios.post(
        `/api/players/${action}-by-name/${encodeURIComponent(username)}`,
        banReason ? { reason: banReason } : {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBanOverride(player?.rawUuid, username, !isBanned, isBanned ? null : banReason);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Ошибка');
      setTimeout(() => setErrorMsg(null), 2500);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!profile) return;

    const ok = await showConfirm(
      `Сбросить пароль игрока «${username}»?\nПри следующем входе он сможет задать любой новый пароль.`
    );
    if (!ok) return;

    setMenuOpen(false);
    setLoading(true);
    try {
      await axios.post(
        `/api/users/${profile.id}/reset-password`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccessMsg('Пароль сброшен');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Ошибка');
      setTimeout(() => setErrorMsg(null), 2500);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeUsername = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!profile) return;

    const newUsername = await showPrompt(
      `Новый логин для «${username}»:`,
      { placeholder: 'Минимум 3 символа...' }
    );
    if (newUsername === null) return; // отменили

    const trimmed = newUsername.trim();
    if (trimmed.length < 3) {
      setErrorMsg('Логин должен быть не менее 3 символов');
      setTimeout(() => setErrorMsg(null), 2500);
      return;
    }

    setMenuOpen(false);
    setLoading(true);
    try {
      await axios.put(
        `/api/users/${profile.id}/username`,
        { username: trimmed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfile(prev => ({ ...prev, username: trimmed }));
      setSuccessMsg(`Логин → «${trimmed}»`);
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Ошибка');
      setTimeout(() => setErrorMsg(null), 2500);
    } finally {
      setLoading(false);
    }
  };

  if (!player) return null;

  const avatarUrl       = avatarError ? player.avatarFallbackUrl : player.avatarUrl;
  const isBannedCurrent = player.isBanned ?? false;
  const banReason       = player.banReason || null;

  const perms        = currentUser?.customPermissions ?? [];
  const callerLevel  = currentUser ? roleLevel(currentUser.role) : 0;
  const targetLevel  = profile ? roleLevel(profile.role) : 0;
  const canBan       = currentUser && (callerLevel >= roleLevel('admin') || perms.includes('ban_users'));
  const canAccounts  = currentUser && (callerLevel >= roleLevel('admin') || perms.includes('manage_user_accounts'));
  const canManage    = canBan || canAccounts;
  // manage_user_accounts может управлять только теми, кто ниже admin
  const canActOnRole = canAccounts && profile && profile.id !== currentUser?.id &&
    (callerLevel > targetLevel || (perms.includes('manage_user_accounts') && targetLevel < roleLevel('admin')));
  // ban_users может банить всех ниже admin; системные admin — всех ниже своего уровня
  const banDisabled  = loading || !canBan || profile?.id === currentUser?.id ||
    (callerLevel < roleLevel('admin') && targetLevel >= roleLevel('admin'));

  return (
    <div className="player-card-wrapper" ref={wrapperRef}>
      <Link to={`/player/${username}`} className="player-card-link">
        <div className={`player-card player-card--${isBannedCurrent ? 'banned' : status}`}>

          {/* Кнопка ⋮ / ✕ — внутри карточки, двигается вместе с hover-трансформом */}
          {canManage && (
            <button
              className={`player-card__menu-btn${menuOpen ? ' player-card__menu-btn--open' : ''}`}
              onClick={openMenu}
              aria-label={menuOpen ? 'Закрыть' : 'Действия'}
            >
              {menuOpen ? '✕' : '⋮'}
            </button>
          )}

          {menuOpen ? (
            /* Меню заменяет содержимое карточки */
            <div
              className="player-card__menu-content"
              onClick={e => { e.preventDefault(); e.stopPropagation(); }}
            >
              {profile === undefined ? (
                <div className="player-card__menu-loading">Загрузка...</div>
              ) : (
                <>
                  <button
                    className={`player-card__menu-item player-card__menu-item--${isBannedCurrent ? 'unban' : 'ban'}`}
                    onClick={handleToggleBan}
                    disabled={banDisabled}
                  >
                    {isBannedCurrent ? '✅ Разбанить' : '🚫 Забанить'}
                  </button>

                  {canActOnRole && (
                    <>
                      <div className="player-card__menu-divider" />
                      <button
                        className="player-card__menu-item"
                        onClick={handleResetPassword}
                        disabled={loading}
                      >
                        🔑 Сбросить пароль
                      </button>
                      <button
                        className="player-card__menu-item"
                        onClick={handleChangeUsername}
                        disabled={loading}
                      >
                        📝 Изменить логин
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Обычное содержимое карточки */
            <>
              <img
                src={avatarUrl}
                alt={username}
                className="player-card__avatar"
                onError={() => setAvatarError(true)}
              />
              <div
                className={`player-card__divider player-card__divider--${isBannedCurrent ? 'banned' : status}`}
              />
              <h3 className="player-card__name">{username}</h3>

              {/* Tooltip причины бана — появляется при наведении на карточку */}
              {isBannedCurrent && banReason && (
                <div className="player-card__ban-tooltip">
                  🚫 {banReason}
                </div>
              )}
            </>
          )}

          {/* Ошибка — показывается поверх карточки по центру */}
          {errorMsg && (
            <div className="player-card__error-overlay">
              {errorMsg}
            </div>
          )}

          {/* Успех — зелёный оверлей */}
          {successMsg && (
            <div className="player-card__success-overlay">
              {successMsg}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}

export default PlayerCard;
