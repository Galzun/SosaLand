import { useParams } from 'react-router-dom';
import { usePlayerByName } from '../../context/PlayerContext';
import { timeAgo } from '../../utils/timeFormatter';
import { useState } from 'react';
import './PlayerPage.scss';

function PlayerPage() {
  const { username } = useParams();
  const [avatarError, setAvatarError] = useState(false);
  const [copiedUuid, setCopiedUuid] = useState(false);
  
  const player = usePlayerByName(username);

  if (!player) {
    return (
      <main className="player-page">
        <div className="player-page__header">
          <div className="player-page__cover"></div>
          <div className="player-page__content-wrapper">
            <div className="player-page__info-row">
              <div className="player-page__avatar">
                <div style={{ width: '100%', height: '100%', background: '#333' }}></div>
              </div>
              <div className="player-page__info">
                <h1>Игрок {username} не найден</h1>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }
  
  const avatarUrl = avatarError ? player.avatarFallbackUrl : player.avatarUrl;
  
  const copyUuid = async () => {
    try {
      await navigator.clipboard.writeText(player.uuid);
      setCopiedUuid(true);
      setTimeout(() => setCopiedUuid(false), 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  };
  
  const formatUuid = (uuid) => {
    if (!uuid) return 'Нет UUID';
    if (uuid.length === 32) {
      return `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
    }
    return uuid;
  };

  const lastSeenText = player.isOnline ? 'В игре' : timeAgo(player.lastSeen);
  
  return (
    <main className="player-page">
      <div className="player-page__header">
        {/* Обложка */}
        <div className="player-page__cover"></div>
        
        {/* Контейнер с содержимым */}
        <div className="player-page__content-wrapper">
          {/* Ряд с аватаркой и информацией */}
          <div className="player-page__info-row">
            {/* Аватарка - наползает на обложку */}
            <div className="player-page__avatar">
              <img 
                src={avatarUrl}
                alt={player.name}
                onError={() => setAvatarError(true)}
              />
            </div>
            
            {/* Информация - справа от аватарки */}
            <div className="player-page__info">
              <div className="player-page__name-row">
                <h1>{player.name}</h1>
              </div>
              
              
              <div className="player-page__meta">
                <div className={`player-page__status ${player.isOnline ? "player-page__status--online" : "player-page__status--ofline"}`}>
                  <span className={`player-page__status-dot ${player.isOnline ? 'player-page__status-dot--online' : 'player-page__status-dot--offline'}`} />
                  <span>{lastSeenText}</span> {/* 👈 используем новое время */}
                </div>
                <div className="player-page__meta-item">
                  <span className="player-page__meta-item-icon">📅</span>
                  <span className="player-page__meta-item-value">
                    {new Date(player.lastSeen).toLocaleDateString()}
                  </span>
                </div>
                
                <div className="player-page__meta-item">
                  <span className="player-page__meta-item-icon">🕐</span>
                  <span className="player-page__meta-item-value">
                    {new Date(player.lastSeen).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              
              {/* UUID с возможностью копирования */}
              <div 
                className="player-page__uuid" 
                onClick={copyUuid}
                title="Нажмите, чтобы скопировать UUID"
              >
                {copiedUuid ? 'UUID скопирован!' : formatUuid(player.uuid)}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Остальной контент страницы */}
      <div className="player-page__content">
        {/* Здесь будет статистика, галерея и т.д. */}
      </div>
    </main>
  );
}

export default PlayerPage;