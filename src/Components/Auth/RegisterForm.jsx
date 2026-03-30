import { useState } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import './Auth.scss';

function RegisterForm({ onSwitchToLogin }) {
  const { allPlayers } = usePlayer();
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [avatarErrors, setAvatarErrors] = useState({});

  // Поиск игроков по нику
  const filteredPlayers = allPlayers.filter(player =>
    player.name.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <div className="auth-form">
      <h2>Регистрация</h2>
      
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
          
          {search && filteredPlayers.length > 0 && (
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
              onClick={() => setSelectedPlayer(null)}
              className="auth-form__change"
            >
              Изменить
            </button>
          </div>
        </div>
      )}
      
      {selectedPlayer && (
        <>
          <div className="auth-form__field">
            <label>Логин</label>
            <input type="text" placeholder="Ваш логин" />
          </div>
          
          <div className="auth-form__field">
            <label>Пароль</label>
            <input type="password" placeholder="Ваш пароль" />
          </div>
          
          <div className="auth-form__field">
            <label>Подтвердите пароль</label>
            <input type="password" placeholder="Повторите пароль" />
          </div>
        </>
      )}
      
      <button className="auth-form__submit">
        Зарегистрироваться
      </button>
      
      <button
        type="button"
        onClick={onSwitchToLogin}
        className="auth-form__switch"
      >
        Уже есть аккаунт? Войти
      </button>
    </div>
  );
}

export default RegisterForm;