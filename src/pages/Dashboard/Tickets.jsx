// pages/Dashboard/Tickets.jsx
// Панель администратора: список заявок на регистрацию (тикетов).
//
// Доступна только для пользователей с ролью 'admin'.
// Показывает pending-тикеты с кнопками "Подтвердить" и "Отклонить".

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './Tickets.scss';

function Tickets() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate         = useNavigate();

  const [tickets, setTickets]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');

  // Словарь состояний загрузки для каждой кнопки: { ticketId: 'approve'|'reject'|null }
  // Нужно чтобы блокировать кнопки конкретного тикета пока идёт запрос.
  const [actionLoading, setActionLoading] = useState({});

  // Перенаправляем не-администраторов на главную страницу.
  // useEffect с зависимостью от user срабатывает при изменении состояния авторизации.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth');
      return;
    }
    const level = { creator: 4, admin: 3, editor: 2, user: 1 };
    if ((level[user.role] ?? 1) < 3) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Загружаем список тикетов с бэкенда.
  // useCallback мемоизирует функцию — без этого она создавалась бы заново при каждом рендере,
  // что приводило бы к бесконечному циклу в useEffect([..., fetchTickets]).
  const fetchTickets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      // Передаём JWT-токен в заголовке Authorization — бэкенд проверит роль.
      const response = await axios.get('/api/tickets/admin', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTickets(response.data);
    } catch (err) {
      const message = err.response?.data?.error || 'Не удалось загрузить тикеты';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Загружаем тикеты при первом рендере и при изменении токена.
  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Одобрить тикет: создаёт пользователя и обновляет список.
  const handleApprove = async (ticketId) => {
    setActionLoading(prev => ({ ...prev, [ticketId]: 'approve' }));
    try {
      await axios.post(
        `/api/tickets/admin/${ticketId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Убираем одобренный тикет из списка (он больше не pending).
      setTickets(prev => prev.filter(t => t.id !== ticketId));
    } catch (err) {
      const message = err.response?.data?.error || 'Ошибка при одобрении';
      alert(message); // простой алерт — для MVP достаточно
    } finally {
      setActionLoading(prev => ({ ...prev, [ticketId]: null }));
    }
  };

  // Отклонить тикет сразу, без модального окна
  const handleReject = async (ticketId) => {
    setActionLoading(prev => ({ ...prev, [ticketId]: 'reject' }));
    try {
      await axios.post(
        `/api/tickets/admin/${ticketId}/reject`,
        {}, // отправляем пустой объект, без причины
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Убираем отклонённый тикет из списка
      setTickets(prev => prev.filter(t => t.id !== ticketId));
    } catch (err) {
      const message = err.response?.data?.error || 'Ошибка при отклонении';
      alert(message);
    } finally {
      setActionLoading(prev => ({ ...prev, [ticketId]: null }));
    }
  };

  // Форматируем unix timestamp в читаемую дату.
  const formatDate = (timestamp) => {
    // timestamp из SQLite — секунды, Date ожидает миллисекунды → умножаем на 1000.
    return new Date(timestamp * 1000).toLocaleString('ru-RU', {
      day:    '2-digit',
      month:  '2-digit',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  };

  // Не рендерим страницу пока не убедились в правах (избегаем мигания контента).
  const level = { creator: 4, admin: 3, editor: 2, user: 1 };
  if (authLoading || !user || (level[user.role] ?? 1) < 3) return null;

  return (
    <div className="tickets">
      <div className="tickets__container">
        <h1 className="tickets__title">Заявки на регистрацию</h1>

        {loading && (
          <div className="tickets__status">Загрузка тикетов...</div>
        )}

        {error && (
          <div className="tickets__error">{error}</div>
        )}

        {!loading && !error && tickets.length === 0 && (
          <div className="tickets__empty">
            Нет ожидающих заявок
          </div>
        )}

        {!loading && tickets.length > 0 && (
          <div className="tickets__list">
            {tickets.map(ticket => {
              // Определяем, идёт ли сейчас какое-то действие с этим тикетом.
              const isActing = !!actionLoading[ticket.id];

              return (
                <div className="tickets__card" key={ticket.id}>
                  {/* Аватарка игрока через Crafatar */}
                  <div className="tickets__card-avatar">
                    <img
                      src={`https://crafatar.icehost.xyz/avatars/${ticket.minecraftUuid}?overlay`}
                      alt={ticket.minecraftName}
                      // Если аватарка не загрузилась — скрываем элемент
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>

                  {/* Информация о тикете */}
                  <div className="tickets__card-info">
                    <div className="tickets__card-minecraft">
                      <span className="tickets__label">Minecraft:</span>
                      <strong>{ticket.minecraftName}</strong>
                    </div>
                    <div className="tickets__card-username">
                      <span className="tickets__label">Логин:</span>
                      <span>{ticket.username}</span>
                    </div>
                    <div className="tickets__card-date">
                      <span className="tickets__label">Дата:</span>
                      <span>{formatDate(ticket.createdAt)}</span>
                    </div>
                    {ticket.contact && (
                      <div className="tickets__card-contact">
                        <span className="tickets__label">Связь:</span>
                        <span className="tickets__contact-value">{ticket.contact}</span>
                      </div>
                    )}
                  </div>

                  {/* Кнопки действий */}
                  <div className="tickets__card-actions">
                    <button
                      className="tickets__btn tickets__btn--approve"
                      onClick={() => handleApprove(ticket.id)}
                      disabled={isActing}
                    >
                      {actionLoading[ticket.id] === 'approve' ? 'Одобряю...' : 'Подтвердить'}
                    </button>
                    <button
                      className="tickets__btn tickets__btn--reject"
                      onClick={() => handleReject(ticket.id)}
                      disabled={isActing}
                    >
                      {actionLoading[ticket.id] === 'reject' ? 'Отклоняю...' : 'Отклонить'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Tickets;