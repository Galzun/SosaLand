import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayerByName } from '../../context/PlayerContext'; // 👈 импортируем
import './PlayerCard.scss';

function PlayerCard({ username, status }) {
  const [avatarError, setAvatarError] = useState(false);
  
  // 👇 Получаем данные игрока из контекста (включая avatarUrl)
  const player = usePlayerByName(username);
  
  // Если игрока нет в контексте (редкий случай), используем fallback
  if (!player) {
    return null;
  }
  
  // Выбираем URL в зависимости от ошибки
  const avatarUrl = avatarError ? player.avatarFallbackUrl : player.avatarUrl;
  
  // Класс для карточки в зависимости от статуса
  const cardClass = `player-card player-card--${status}`;
  
  // Класс для разделителя
  const dividerClass = `player-card__divider player-card__divider--${status}`;
  
  return (
    <Link to={`/player/${username}`} className="player-card-link">
      <div className={cardClass}>
        <img 
          src={avatarUrl}
          alt={username}
          className="player-card__avatar"
          onError={() => setAvatarError(true)}
        />
        
        <div className={dividerClass} />
        
        <h3 className="player-card__name">{username}</h3>
        
        {status === 'banned' && (
          <span className="player-card__badge">Забанен</span>
        )}
      </div>
    </Link>
  );
}

export default PlayerCard;