// hooks/useServerStatus.js
// Хук для получения статуса Minecraft-сервера и списка игроков.
//
// Логика работы с игроками:
//   1. При монтировании — загружаем всю историю игроков из БД (/api/players)
//   2. Каждые 30 сек — опрашиваем API сервера, получаем онлайн-игроков
//   3. Для каждого онлайн-игрока получаем UUID через playerdb.co
//   4. Синхронизируем онлайн-игроков в БД (/api/players/sync)
//   5. Обновляем allPlayers в памяти: добавляем новых, обновляем online-статус

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function useServerStatus(serverIp) {
  const [players, setPlayers]       = useState([]);   // только онлайн (для счётчика)
  const [allPlayers, setAllPlayers] = useState([]);   // ВСЕ игроки (для отображения)
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // useRef хранит актуальный список всех игроков без создания зависимостей в useEffect.
  // Это позволяет обращаться к свежим данным внутри setInterval без риска замыкания.
  const allPlayersRef = useRef([]);

  // Синхронизируем ref каждый раз, когда меняется allPlayers.
  useEffect(() => {
    allPlayersRef.current = allPlayers;
  }, [allPlayers]);

  useEffect(() => {
    let cancelled = false; // флаг для отмены запросов после размонтирования

    // -------------------------------------------------------------------
    // Шаг 1: загружаем историю игроков из БД.
    // Это гарантирует, что при каждой загрузке страницы все известные
    // игроки уже видны, а не только те, кто зашёл после открытия вкладки.
    // -------------------------------------------------------------------
    const loadPlayersFromDb = async () => {
      try {
        const response = await axios.get('/api/players');
        if (cancelled) return;

        // Преобразуем формат БД → формат, который ожидает PlayerContext.
        // isOnline = false для всех: актуальный статус придёт при первом поллинге.
        const dbPlayers = response.data.map(p => ({
          id:          p.uuid,
          uuid:        p.uuid,
          name:        p.name,
          lastSeen:    p.lastSeen * 1000, // секунды → миллисекунды для Date()
          isOnline:    false,
          isBanned:    p.isBanned  ?? false,
          banReason:   p.banReason || null,
          customRoles: p.customRoles || [],
        }));

        setAllPlayers(dbPlayers);
      } catch (err) {
        // Если БД недоступна — не критично, просто начнём с пустого списка.
        console.warn('Не удалось загрузить игроков из БД:', err.message);
      }
    };

    // -------------------------------------------------------------------
    // Шаг 2: поллинг статуса сервера каждые 30 секунд.
    // -------------------------------------------------------------------
    const fetchServerStatus = () => {
      axios.get(`https://api.mcsrvstat.us/3/${serverIp}`)
        .then(response => {
          if (cancelled) return;

          if (response.data.online) {
            const playersList = response.data.players?.list || [];
            fetchUUIDsAndSync(playersList);
            setError(null);
          } else {
            setError('Сервер не онлайн');
          }
        })
        .catch(err => {
          if (!cancelled) {
            console.error('Ошибка запроса к API сервера:', err);
            setError(err.message);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    // -------------------------------------------------------------------
    // Шаг 3: для каждого онлайн-игрока получаем UUID, затем синхронизируем в БД.
    // -------------------------------------------------------------------
    const fetchUUIDsAndSync = async (playersList) => {
      try {
        // Параллельно запрашиваем UUID для всех онлайн-игроков.
        const onlinePlayers = await Promise.all(
          playersList.map(async (player) => {
            const nickname = typeof player === 'string' ? player : player.name;
            try {
              const r = await axios.get(
                `https://playerdb.co/api/player/minecraft/${nickname}`
              );
              if (r.data?.data?.player?.id) {
                return {
                  id:       r.data.data.player.id,
                  uuid:     r.data.data.player.id,
                  name:     nickname,
                  lastSeen: Date.now(),
                  isOnline: true,
                };
              }
            } catch (e) {
              console.log(`UUID не получен для ${nickname}:`, e.message);
            }
            // Если UUID получить не удалось (например, нелицензионный игрок) —
            // НЕ используем фейковый offline-UUID от сервера: crafatar вернёт
            // дефолтный скин вместо ошибки, и fallback-аватарка не сработает.
            return {
              id:       null,
              uuid:     null,
              name:     nickname,
              lastSeen: Date.now(),
              isOnline: true,
            };
          })
        );

        if (cancelled) return;

        // Обновляем список онлайн-игроков (для счётчика в Header).
        setPlayers(onlinePlayers);

        // Синхронизируем только тех, у кого есть UUID (без UUID не можем сделать upsert).
        const playersWithUUID = onlinePlayers.filter(p => p.uuid);

        if (playersWithUUID.length > 0) {
          try {
            await axios.post('/api/players/sync',
              playersWithUUID.map(p => ({ uuid: p.uuid, name: p.name }))
            );
          } catch (e) {
            // Ошибка синхронизации не критична — данные уже в памяти.
            console.warn('Ошибка синхронизации игроков в БД:', e.message);
          }
        }

        // Обновляем allPlayers в памяти:
        // — сливаем с данными из БД (allPlayersRef.current)
        // — добавляем новых игроков, обновляем last_seen и online-статус
        setAllPlayers(() => {
          const allMap = new Map(
            allPlayersRef.current.map(p => [p.id || p.uuid || p.name, p])
          );

          // Обратный lookup: имя_нижний_регистр → ключ карты
          // для offline-записей (синтетический UUID `offline:<name>`).
          // Нужен чтобы пиратские игроки онлайн объединялись с их офлайн-баном.
          const offlineNameToKey = new Map();
          allPlayersRef.current.forEach(p => {
            if (typeof p.uuid === 'string' && p.uuid.startsWith('offline:')) {
              offlineNameToKey.set(p.name.toLowerCase(), p.id || p.uuid);
            }
          });

          // Обновляем или добавляем онлайн-игроков.
          onlinePlayers.forEach(current => {
            let key = current.id || current.uuid;

            // Пиратский игрок (нет UUID): ищем офлайн-бан запись по имени.
            if (!key) {
              key = offlineNameToKey.get(current.name.toLowerCase()) || current.name;
            }

            const existing = allMap.get(key);
            allMap.set(key, {
              ...(existing || {}),
              ...current,
              uuid:     existing?.uuid || current.uuid,   // сохраняем синтетический UUID
              id:       existing?.id   || current.id,
              lastSeen: Date.now(),
              isOnline: true,
              isBanned: existing?.isBanned ?? current.isBanned ?? false,
            });
          });

          // Помечаем всех остальных как офлайн.
          // Проверяем и по UUID, и по имени (для пиратских игроков).
          const onlineUUIDs  = new Set(onlinePlayers.map(p => p.uuid).filter(Boolean));
          const onlineNames  = new Set(onlinePlayers.map(p => p.name.toLowerCase()));
          const updatedAll = Array.from(allMap.values()).map(player => ({
            ...player,
            isOnline: onlineUUIDs.has(player.uuid) ||
                      onlineNames.has(player.name?.toLowerCase()),
          }));

          // Сортируем: сначала онлайн, затем по last_seen (свежие первыми).
          updatedAll.sort((a, b) => {
            if (a.isOnline && !b.isOnline) return -1;
            if (!a.isOnline && b.isOnline) return 1;
            return b.lastSeen - a.lastSeen;
          });

          return updatedAll;
        });

      } catch (err) {
        console.error('Ошибка при обработке игроков:', err);
      }
    };

    // Запускаем: сначала загрузка из БД, затем сразу поллинг сервера.
    loadPlayersFromDb().then(() => {
      if (!cancelled) fetchServerStatus();
    });

    const interval = setInterval(() => {
      if (!cancelled) fetchServerStatus();
    }, 30_000);

    // Cleanup: при размонтировании компонента отменяем запросы и таймер.
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverIp]);

  return {
    players,     // только онлайн (для счётчика)
    allPlayers,  // ВСЕ игроки (история из БД + текущая сессия)
    loading,
    error,
  };
}

export default useServerStatus;
