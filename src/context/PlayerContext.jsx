import { createContext, useContext, useMemo } from 'react';

// Создаём контекст
const PlayerContext = createContext();

// Провайдер, который будет давать данные всем дочерним компонентам
export function PlayerProvider({ children, allPlayers, onlinePlayers }) {
  
  // useMemo запоминает вычисления, чтобы не делать их при каждом рендере
  const value = useMemo(() => {
    
    // Создаём Map для быстрого поиска игрока по имени
    const playersByName = new Map();
    
    // 👇 Функция для получения URL аватарки
    const getAvatarUrl = (username, uuid, useFallback = false) => {
      if (useFallback) {
        return `https://api.dicebear.com/9.x/initials/svg?backgroundColor=transparent&seed=${username}`;
      }
      return `https://crafatar.icehost.xyz/avatars/${uuid}?overlay`;
    };
    
    allPlayers.forEach(player => {
      // 👇 Добавляем URL аватарки прямо в объект игрока
      const enhancedPlayer = {
        ...player,
        avatarUrl: getAvatarUrl(player.name, player.uuid),
        avatarFallbackUrl: getAvatarUrl(player.name, player.uuid, true),
        profileUrl: `/player/${player.name}`,
        lastSeenFormatted: new Date(player.lastSeen).toLocaleString(),
        statusText: player.isOnline ? '🟢 В игре' : '⚫ Был(а) недавно'
      };
      
      playersByName.set(player.name, enhancedPlayer);
    });
    
    // Создаём Map для быстрого поиска по UUID
    const playersByUUID = new Map();
    allPlayers.forEach(player => {
      if (player.uuid) {
        // Используем тот же обогащённый объект
        const enhancedPlayer = playersByName.get(player.name);
        playersByUUID.set(player.uuid, enhancedPlayer);
      }
    });
    
    // Функция для получения игрока по имени (уже с avatarUrl)
    const getPlayerByName = (name) => playersByName.get(name);
    
    // Функция для получения игрока по UUID (уже с avatarUrl)
    const getPlayerByUUID = (uuid) => playersByUUID.get(uuid);
    
    // Функция для проверки, онлайн ли игрок
    const isPlayerOnline = (name) => {
      return onlinePlayers.some(p => p.name === name);
    };
    
    // Возвращаем всё, что может понадобиться
    return {
      allPlayers: Array.from(playersByName.values()), // все игроки
      onlinePlayers,        // только онлайн
      playersByName,        // Map для быстрого доступа
      playersByUUID,        // Map для быстрого доступа
      getPlayerByName,
      getPlayerByUUID,
      isPlayerOnline,
      getAvatarUrl,         // 👇 функция на всякий случай
      totalPlayers: allPlayers.length,
      onlineCount: onlinePlayers.length
    };
    
  }, [allPlayers, onlinePlayers]); // Пересчитываем только когда меняются списки

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

// ... остальные хуки без изменений
export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}

export function usePlayerByName(username) {
  const { getPlayerByName } = usePlayer();
  return getPlayerByName(username);
}

export function usePlayerByUUID(uuid) {
  const { getPlayerByUUID } = usePlayer();
  return getPlayerByUUID(uuid);
}