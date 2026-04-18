// pages/Dashboard/Tickets.jsx
// Панель администратора: список заявок на регистрацию (тикетов).
//
// Доступна только для пользователей с ролью 'admin'.
// Вкладка «Ожидающие» — pending-тикеты с кнопками "Подтвердить" и "Отклонить".
// Вкладка «История»    — обработанные тикеты с именем модератора.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './Tickets.scss';

const ROLE_LEVEL = { user: 1, editor: 2, admin: 3, creator: 4 };

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Tickets() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('pending');

  // Ожидающие тикеты
  const [tickets,       setTickets]       = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError,  setTicketsError]  = useState('');
  const [actionLoading, setActionLoading] = useState({});

  // История тикетов
  const [history,       setHistory]       = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError,  setHistoryError]  = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Перенаправляем не-администраторов
  const canManageTickets = user && (
    (ROLE_LEVEL[user.role] ?? 1) >= 3 ||
    (user.customPermissions ?? []).includes('manage_tickets')
  );
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    if (!canManageTickets) navigate('/');
  }, [user, authLoading, canManageTickets, navigate]);

  // Загрузка ожидающих тикетов
  const fetchTickets = useCallback(async () => {
    if (!token) return;
    setTicketsLoading(true);
    setTicketsError('');
    try {
      const response = await axios.get('/api/tickets/admin', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTickets(response.data);
    } catch (err) {
      setTicketsError(err.response?.data?.error || 'Не удалось загрузить тикеты');
    } finally {
      setTicketsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Загрузка истории (только при первом переходе на вкладку)
  const fetchHistory = useCallback(async () => {
    if (!token) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await axios.get('/api/tickets/admin/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHistory(response.data);
      setHistoryLoaded(true);
    } catch (err) {
      setHistoryError(err.response?.data?.error || 'Не удалось загрузить историю');
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  // Загружаем историю при переходе на вкладку (один раз)
  useEffect(() => {
    if (activeTab === 'history' && !historyLoaded) {
      fetchHistory();
    }
  }, [activeTab, historyLoaded, fetchHistory]);

  // Одобрить тикет
  const handleApprove = async (ticketId) => {
    setActionLoading(prev => ({ ...prev, [ticketId]: 'approve' }));
    try {
      await axios.post(
        `/api/tickets/admin/${ticketId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTickets(prev => prev.filter(t => t.id !== ticketId));
      // Сбрасываем кеш истории чтобы при переходе загрузилась заново
      setHistoryLoaded(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Ошибка при одобрении');
    } finally {
      setActionLoading(prev => ({ ...prev, [ticketId]: null }));
    }
  };

  // Отклонить тикет
  const handleReject = async (ticketId) => {
    setActionLoading(prev => ({ ...prev, [ticketId]: 'reject' }));
    try {
      await axios.post(
        `/api/tickets/admin/${ticketId}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTickets(prev => prev.filter(t => t.id !== ticketId));
      setHistoryLoaded(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Ошибка при отклонении');
    } finally {
      setActionLoading(prev => ({ ...prev, [ticketId]: null }));
    }
  };

  if (authLoading || !user || !canManageTickets) return null;

  return (
    <div className="tickets">
      <div className="tickets__container">
        <h1 className="tickets__title">Заявки на регистрацию</h1>

        {/* Вкладки */}
        <div className="tickets__tabs">
          <button
            className={`tickets__tab${activeTab === 'pending' ? ' tickets__tab--active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Ожидающие
            {tickets.length > 0 && (
              <span className="tickets__tab-badge">{tickets.length}</span>
            )}
          </button>
          <button
            className={`tickets__tab${activeTab === 'history' ? ' tickets__tab--active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            История
          </button>
        </div>

        {/* ── Вкладка: Ожидающие ── */}
        {activeTab === 'pending' && (
          <>
            {ticketsLoading && <div className="tickets__status">Загрузка тикетов...</div>}
            {ticketsError   && <div className="tickets__error">{ticketsError}</div>}
            {!ticketsLoading && !ticketsError && tickets.length === 0 && (
              <div className="tickets__empty">Нет ожидающих заявок</div>
            )}
            {!ticketsLoading && tickets.length > 0 && (
              <div className="tickets__list">
                {tickets.map(ticket => {
                  const isActing = !!actionLoading[ticket.id];
                  return (
                    <div className="tickets__card" key={ticket.id}>
                      <div className="tickets__card-avatar">
                        <img
                          src={`https://crafatar.icehost.xyz/avatars/${ticket.minecraftUuid}?overlay`}
                          alt={ticket.minecraftName}
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      </div>
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
          </>
        )}

        {/* ── Вкладка: История ── */}
        {activeTab === 'history' && (
          <>
            {historyLoading && <div className="tickets__status">Загрузка истории...</div>}
            {historyError   && <div className="tickets__error">{historyError}</div>}
            {!historyLoading && !historyError && history.length === 0 && (
              <div className="tickets__empty">История пуста</div>
            )}
            {!historyLoading && history.length > 0 && (
              <div className="tickets__list">
                {history.map(ticket => (
                  <div
                    className={`tickets__card tickets__card--history tickets__card--${ticket.status}`}
                    key={ticket.id}
                  >
                    <div className="tickets__card-avatar">
                      <img
                        src={`https://crafatar.icehost.xyz/avatars/${ticket.minecraftUuid}?overlay`}
                        alt={ticket.minecraftName}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    </div>
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
                        <span className="tickets__label">Подана:</span>
                        <span>{formatDate(ticket.createdAt)}</span>
                      </div>
                      {ticket.contact && (
                        <div className="tickets__card-contact">
                          <span className="tickets__label">Связь:</span>
                          <span className="tickets__contact-value">{ticket.contact}</span>
                        </div>
                      )}
                    </div>
                    {/* Блок — кто и когда обработал */}
                    <div className="tickets__card-verdict">
                      <span className={`tickets__verdict-badge tickets__verdict-badge--${ticket.status}`}>
                        {ticket.status === 'approved' ? '✓ Одобрено' : '✕ Отклонено'}
                      </span>
                      {ticket.approvedByUsername && (
                        <span className="tickets__verdict-by">
                          {ticket.status === 'approved' ? 'Принял' : 'Отклонил'}:&nbsp;
                          <strong>{ticket.approvedByUsername}</strong>
                        </span>
                      )}
                      {ticket.approvedAt && (
                        <span className="tickets__verdict-date">{formatDate(ticket.approvedAt)}</span>
                      )}
                      {ticket.rejectionReason && (
                        <span className="tickets__verdict-reason" title={ticket.rejectionReason}>
                          Причина: {ticket.rejectionReason}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Tickets;
