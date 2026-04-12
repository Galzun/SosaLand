import { createContext, useContext, useMemo, useState, useCallback } from 'react';

const PlayerContext = createContext();

export function PlayerProvider({ children, allPlayers, onlinePlayers }) {
  // banOverrides — словарь { [uuid | 'name:username'] → { isBanned, banReason } }
  // Живёт в контексте (не в компоненте), поэтому сохраняется при навигации.
  const [banOverrides, setBanOverridesState] = useState({});

  // setBanOverride(uuid, name, isBanned, banReason?)
  const setBanOverride = useCallback((uuid, name, isBanned, banReason = null) => {
    setBanOverridesState(prev => {
      const next = { ...prev };
      const val = { isBanned, banReason };
      if (uuid) next[uuid]                              = val;
      if (name) next[`name:${name.toLowerCase()}`]      = val;
      return next;
    });
  }, []);

  const value = useMemo(() => {
    const playersByName = new Map();

    const getAvatarUrl = (username, uuid, useFallback = false) => {
      if (useFallback || !uuid || uuid.startsWith('offline:')) {
        return `https://api.dicebear.com/9.x/initials/svg?scale=80&backgroundColor[]&fontWeight=600&seed=${username}`;
      }
      return `https://crafatar.icehost.xyz/avatars/${uuid}?overlay`;
    };

    allPlayers.forEach(player => {
      // Проверяем override (немедленная реакция на бан/разбан без ожидания рефреша)
      const overrideUUID = player.uuid ? banOverrides[player.uuid] : undefined;
      const overrideName = banOverrides[`name:${player.name?.toLowerCase()}`];
      const override = overrideUUID ?? overrideName;

      const isBanned  = override !== undefined ? override.isBanned  : (player.isBanned  ?? false);
      const banReason = override !== undefined ? override.banReason  : (player.banReason || null);

      // Для пиратских (offline:) записей UUID не показываем в аватарке
      const displayUuid = player.uuid?.startsWith('offline:') ? null : player.uuid;

      const enhancedPlayer = {
        ...player,
        uuid:              displayUuid,       // null для offline-записей
        rawUuid:           player.uuid,       // полный UUID включая 'offline:...' — для ban endpoint
        avatarUrl:         getAvatarUrl(player.name, displayUuid),
        avatarFallbackUrl: getAvatarUrl(player.name, displayUuid, true),
        profileUrl:        `/player/${player.name}`,
        lastSeenFormatted: new Date(player.lastSeen).toLocaleString(),
        statusText:        player.isOnline ? '🟢 В игре' : '⚫ Был(а) недавно',
        isBanned,
        banReason,
      };

      playersByName.set(player.name, enhancedPlayer);
    });

    const playersByUUID = new Map();
    allPlayers.forEach(player => {
      if (player.uuid && !player.uuid.startsWith('offline:')) {
        const enhanced = playersByName.get(player.name);
        if (enhanced) playersByUUID.set(player.uuid, enhanced);
      }
    });

    const getPlayerByName = (name) => playersByName.get(name);
    const getPlayerByUUID = (uuid) => playersByUUID.get(uuid);
    const isPlayerOnline  = (name) => onlinePlayers.some(p => p.name === name);

    return {
      allPlayers:     Array.from(playersByName.values()),
      onlinePlayers,
      playersByName,
      playersByUUID,
      getPlayerByName,
      getPlayerByUUID,
      isPlayerOnline,
      getAvatarUrl,
      totalPlayers:   allPlayers.length,
      onlineCount:    onlinePlayers.length,
      setBanOverride,
    };
  }, [allPlayers, onlinePlayers, banOverrides, setBanOverride]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within a PlayerProvider');
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
