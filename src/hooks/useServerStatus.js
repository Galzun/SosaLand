import { useState, useEffect } from 'react';
import axios from 'axios';

function useServerStatus(serverIp) {
  const [players, setPlayers] = useState([]);         // только онлайн (для счётчика)
  const [allPlayers, setAllPlayers] = useState([]);   // ВСЕ игроки (для отображения)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = () => {
      axios.get(`https://api.mcsrvstat.us/3/${serverIp}`)
        .then(response => {
          console.log('Данные с сервера:', response.data);
          
          if (response.data.online) {
            const playersList = response.data.players?.list || [];
            
            // Получаем UUID для текущих игроков
            fetchRealUUIDs(playersList);
            
            setError(null);
          } else {
            setError('Сервер не онлайн');
          }
        })
        .catch(error => {
          console.error('Ошибка запроса:', error);
          setError(error.message);
        })
        .finally(() => {
          setLoading(false);
        });
    };

    const fetchRealUUIDs = async (playersList) => {
      console.log('🔄 Получаем UUID для игроков...');
      
      try {
        // Получаем данные для текущих игроков
        const currentPlayers = await Promise.all(
          playersList.map(async (player) => {
            const nickname = typeof player === 'string' ? player : player.name;
            try {
              const response = await axios.get(`https://playerdb.co/api/player/minecraft/${nickname}`);
              
              if (response.data?.data?.player?.id) {
                return {
                  name: nickname,
                  uuid: response.data.data.player.id,
                  id: response.data.data.player.id,
                  lastSeen: Date.now(),
                  isOnline: true
                };
              }
            } catch (e) {
              console.log(`❌ Ошибка для ${nickname}:`, e.message);
            }
            
            return { 
              name: nickname,
              uuid: null,
              id: player.uuid,
              lastSeen: Date.now(),
              isOnline: true
            };
          })
        );

        // Обновляем онлайн игроков (для счётчика)
        setPlayers(currentPlayers);
        
        // 🆕 ДОБАВЛЯЕМ в историю всех игроков
        setAllPlayers(prevAll => {
          // Создаём карту существующих игроков
          const allMap = new Map(prevAll.map(p => [p.id, p]));
          
          // Добавляем или обновляем текущих игроков
          currentPlayers.forEach(current => {
            allMap.set(current.id, {
              ...(allMap.get(current.id) || {}),
              ...current,
              lastSeen: Date.now(),
              isOnline: true
            });
          });
          
          // 🆕 Помечаем всех остальных как офлайн
          const updatedAll = Array.from(allMap.values()).map(player => ({
            ...player,
            // Если игрока нет в currentPlayers, значит он офлайн
            isOnline: currentPlayers.some(p => p.id === player.id)
          }));
          
          // Сортируем: сначала онлайн, потом по lastSeen
          updatedAll.sort((a, b) => {
            if (a.isOnline && !b.isOnline) return -1;
            if (!a.isOnline && b.isOnline) return 1;
            return b.lastSeen - a.lastSeen;
          });
          
          console.log('📚 Всего игроков в истории:', updatedAll.length);
          console.log(updatedAll)
          return updatedAll;
        });
        
      } catch (error) {
        console.error('Ошибка:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [serverIp]);

  return {
    players,        // только онлайн (для счётчика)
    allPlayers,     // ВСЕ игроки (для отображения)
    loading,
    error,
  };
}

export default useServerStatus;