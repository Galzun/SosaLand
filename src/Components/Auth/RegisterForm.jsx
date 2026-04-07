// Components/Auth/RegisterForm.jsx
// Форма регистрации. Двухшаговая:
//   Шаг 1 — выбор Minecraft-аккаунта из списка игроков сервера.
//   Шаг 2 — ввод логина и пароля.
//
// После отправки НЕ создаёт пользователя сразу — вместо этого создаёт тикет,
// который администратор должен одобрить. Показывает сообщение об ожидании.

import { useState } from 'react';
import axios from 'axios';
import { usePlayer } from '../../context/PlayerContext';
import './Auth.scss';

function RegisterForm({ onSwitchToLogin }) {
  // Получаем список всех игроков из глобального контекста.
  const { allPlayers } = usePlayer();

  const [search, setSearch]           = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [avatarErrors, setAvatarErrors]     = useState({});

  const [login, setLogin]                   = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [contact, setContact]               = useState('');
  const [errors, setErrors]                 = useState({});
  const [isLoading, setIsLoading]           = useState(false);

  // Флаг успешной отправки: если true — показываем сообщение вместо формы.
  const [submitted, setSubmitted]           = useState(false);

  // Фильтруем список игроков по поисковому запросу.
  const filteredPlayers = search
    ? allPlayers.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const handleSelectPlayer = (player) => {
    setSelectedPlayer(player);
    setSearch('');
  };

  const handleAvatarError = (playerName) => {
    setAvatarErrors(prev => ({ ...prev, [playerName]: true }));
  };

  const getAvatarUrl = (player) => {
    if (avatarErrors[player.name] || !player.uuid) {
      return player.avatarFallbackUrl;
    }
    return player.avatarUrl;
  };

  const validate = () => {
    const newErrors = {};
    if (!login.trim()) {
      newErrors.login = 'Введите логин';
    } else if (login.trim().length < 3) {
      newErrors.login = 'Логин должен быть не короче 3 символов';
    } else if (!/^[a-zA-Z0-9_]+$/.test(login.trim())) {
      newErrors.login = 'Только латинские буквы, цифры и _';
    }
    if (!password) {
      newErrors.password = 'Введите пароль';
    } else if (password.length < 6) {
      newErrors.password = 'Пароль должен быть не короче 6 символов';
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Подтвердите пароль';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Пароли не совпадают';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      // Отправляем заявку на бэкенд — она попадёт в таблицу tickets со статусом 'pending'.
      // Бэкенд сам хеширует пароль, поэтому передаём plain text.
      await axios.post('/api/tickets', {
        minecraftUuid: selectedPlayer.uuid,
        minecraftName: selectedPlayer.name,
        username:      login.trim(),
        password,
        contact:       contact.trim() || undefined,
      });

      // Показываем сообщение об ожидании вместо формы.
      setSubmitted(true);

    } catch (err) {
      const message = err.response?.data?.error || 'Не удалось подключиться к серверу';
      setErrors({ submit: message });
    } finally {
      setIsLoading(false);
    }
  };

  // Экран успешной отправки — показывается вместо формы.
  if (submitted) {
    return (
      <div className="auth-form auth-form--success">
        <div className="auth-form__success-icon">✓</div>
        <h2>Заявка отправлена</h2>
        <p className="auth-form__success-text">
          Администратор рассмотрит её в ближайшее время.
          После одобрения вы сможете войти с указанными логином и паролем.
        </p>
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="auth-form__submit"
        >
          Перейти ко входу
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2>Регистрация</h2>

      {/* Шаг 1: поиск и выбор Minecraft-аккаунта */}
      {!selectedPlayer ? (
        <>
          <div className="auth-form__field">
            <label>Ваш ник в Minecraft</label>
            <input
              type="text"
              placeholder="Введите ник..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {filteredPlayers.length > 0 && (
            <div className="auth-form__players-list">
              {filteredPlayers.map(player => (
                <div
                  key={player.uuid || player.name}
                  className="auth-form__player-item"
                  onClick={() => handleSelectPlayer(player)}
                >
                  <img
                    src={getAvatarUrl(player)}
                    alt={player.name}
                    className="auth-form__player-avatar"
                    onError={() => handleAvatarError(player.name)}
                  />
                  <div>
                    <div className="auth-form__player-name">{player.name}</div>
                    <div className="auth-form__player-status">
                      {player.online ? '🟢 В сети' : 'Офлайн'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {search && filteredPlayers.length === 0 && (
            <div className="auth-form__not-found">
              Игрок не найден. Убедитесь, что вы играли на сервере.
            </div>
          )}
        </>
      ) : (
        /* Шаг 2: игрок выбран — показываем карточку и поля ввода */
        <>
          <div className="auth-form__selected-player">
            <img
              src={getAvatarUrl(selectedPlayer)}
              alt={selectedPlayer.name}
              className="auth-form__selected-avatar"
              onError={() => handleAvatarError(selectedPlayer.name)}
            />
            <div>
              <div className="auth-form__selected-name">{selectedPlayer.name}</div>
              <button
                type="button"
                onClick={() => { setSelectedPlayer(null); setErrors({}); }}
                className="auth-form__change"
                disabled={isLoading}
              >
                Изменить
              </button>
            </div>
          </div>

          <div className="auth-form__field">
            <label>Логин</label>
            <input
              type="text"
              placeholder="Ваш логин на сайте"
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                setErrors(prev => ({ ...prev, login: undefined }));
              }}
              autoFocus
              disabled={isLoading}
            />
            {errors.login && <span className="auth-form__error">{errors.login}</span>}
          </div>

          <div className="auth-form__field">
            <label>Пароль</label>
            <input
              type="password"
              placeholder="Ваш пароль"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors(prev => ({ ...prev, password: undefined }));
              }}
              disabled={isLoading}
            />
            {errors.password && <span className="auth-form__error">{errors.password}</span>}
          </div>

          <div className="auth-form__field">
            <label>Подтвердите пароль</label>
            <input
              type="password"
              placeholder="Повторите пароль"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrors(prev => ({ ...prev, confirmPassword: undefined }));
              }}
              disabled={isLoading}
            />
            {errors.confirmPassword && (
              <span className="auth-form__error">{errors.confirmPassword}</span>
            )}
          </div>

          <div className="auth-form__field">
            <label>Способ связи с вами<span className="auth-form__optional"></span></label>
            <input
              type="text"
              placeholder="Discord или Telegram"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {errors.submit && (
            <div className="auth-form__error auth-form__error--block">{errors.submit}</div>
          )}
        </>
      )}

      {selectedPlayer && (
        <button type="submit" className="auth-form__submit" disabled={isLoading}>
          {isLoading ? 'Отправляю заявку...' : 'Отправить заявку'}
        </button>
      )}

      <button
        type="button"
        onClick={onSwitchToLogin}
        className="auth-form__switch"
        disabled={isLoading}
      >
        Уже есть аккаунт? Войти
      </button>
    </form>
  );
}

export default RegisterForm;
