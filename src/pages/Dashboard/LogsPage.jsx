// pages/Dashboard/LogsPage.jsx
// Страница логов активности — только для admin и creator.

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { showConfirm } from '../../Components/Dialog/dialogManager';
import { getAvatarUrl } from '../../utils/avatarUrl';
import './LogsPage.scss';

const ROLE_LEVEL = { user: 1, editor: 2, admin: 3, creator: 4 };
const PAGE_SIZE  = 50;
const TOP_STEP   = 5;
const GROUP_WINDOW_SEC = 300; // 5 минут — порог объединения дублей

// ── Группы фильтров (выпадающее меню) ───────────────────────────────────────
const ACTION_GROUPS = [
  { label: null, items: [
    { value: '',           label: 'Все действия' },
  ]},
  { label: 'Файлы', items: [
    { value: 'file_upload',  label: 'Загрузки файлов' },
    { value: 'file_delete',  label: 'Удаления файлов' },
  ]},
  { label: 'Посты', items: [
    { value: 'post_create',  label: 'Создание постов' },
    { value: 'post_delete',  label: 'Удаление постов' },
  ]},
  { label: 'Новости', items: [
    { value: 'news_create,news_update', label: 'Создание / Изменение' },
    { value: 'news_delete',             label: 'Удаление новостей' },
  ]},
  { label: 'События', items: [
    { value: 'event_create,event_update', label: 'Создание / Изменение' },
    { value: 'event_delete',              label: 'Удаление событий' },
  ]},
  { label: 'Роли', items: [
    { value: 'role_create,role_update,role_delete,role_assign,role_revoke', label: 'Все действия с ролями' },
    { value: 'role_assign,role_revoke',                                     label: 'Назначения ролей' },
  ]},
  { label: 'Суд', items: [
    { value: 'court_ticket_create,court_ticket_review,court_ticket_reject,court_ticket_close,court_case_create,court_case_update,court_case_delete', label: 'Все действия суда' },
    { value: 'court_ticket_create,court_ticket_review,court_ticket_reject,court_ticket_close', label: 'Тикеты' },
    { value: 'court_case_create,court_case_update,court_case_delete',                          label: 'Заседания' },
  ]},
  { label: 'Прочее', items: [
    { value: 'ticket_create', label: 'Заявки на регистрацию' },
  ]},
];

// Плоский список для поиска метки по значению
const ALL_FILTER_ITEMS = ACTION_GROUPS.flatMap(g => g.items);

function filterLabel(value) {
  return ALL_FILTER_ITEMS.find(i => i.value === value)?.label ?? 'Все действия';
}

// Цвет фильтра — по первому action из значения (через запятую)
function filterItemColor(value) {
  if (!value) return null;
  return actionColor(value.split(',')[0].trim());
}

// ── Цвета бейджей ────────────────────────────────────────────────────────────
function actionColor(action) {
  switch (action) {
    case 'file_upload':          return 'var(--accent)';
    case 'file_delete':          return '#ff4a4a';
    case 'post_create':          return '#7eb8f7';
    case 'post_delete':          return '#ff6b6b';
    case 'image_add':            return '#b8a9ff';
    case 'comment_create':       return '#ffd700';
    case 'news_create':          return '#4fc3f7';
    case 'news_update':          return '#81d4fa';
    case 'news_delete':          return '#f48fb1';
    case 'event_create':         return '#81c784';
    case 'event_update':         return '#a5d6a7';
    case 'event_delete':         return '#ffb74d';
    case 'ticket_create':        return '#ffa94d';
    case 'role_create':          return '#a78bfa';
    case 'role_update':          return '#c4b5fd';
    case 'role_delete':          return '#f472b6';
    case 'role_assign':          return '#34d399';
    case 'role_revoke':          return '#fb923c';
    case 'court_ticket_create':  return '#60a5fa';
    case 'court_ticket_review':  return '#fbbf24';
    case 'court_ticket_reject':  return '#ef4444';
    case 'court_ticket_close':   return '#9ca3af';
    case 'court_case_create':    return '#818cf8';
    case 'court_case_update':    return '#a5b4fc';
    case 'court_case_delete':    return '#f87171';
    default:                     return '#555';
  }
}

// ── Описание в строке лога ───────────────────────────────────────────────────
function logDescription(log) {
  const d = log.details;
  switch (log.action) {
    case 'role_create':
    case 'role_update':
    case 'role_delete':
      return d?.roleName ? `Роль: «${d.roleName}»` : null;
    case 'role_assign':
    case 'role_revoke':
      return d ? `${d.roleName ?? '?'} → ${d.targetUsername ?? '?'}` : null;
    case 'court_ticket_create':
      return d ? `Жалоба на ${d.accusedName ?? '?'}: «${(d.title ?? '').slice(0, 50)}${(d.title?.length ?? 0) > 50 ? '…' : ''}»` : null;
    case 'court_ticket_review':  return 'Взят в работу';
    case 'court_ticket_reject':  return d?.reason ? `Причина: ${d.reason.slice(0, 60)}` : 'Отклонён';
    case 'court_ticket_close':   return 'Тикет закрыт';
    case 'court_case_create':
    case 'court_case_update':
    case 'court_case_delete':
      return d?.title ? `«${d.title.slice(0, 60)}»` : null;
    default: return null;
  }
}

// ── Группировка дублей ───────────────────────────────────────────────────────
// Группируем только настоящие дубли: одинаковые action + userId + fileName + fileSize
// в окне GROUP_WINDOW_SEC. Если fileName или fileSize отсутствуют — строка не группируется.
function groupLogs(logs) {
  const result = [];
  let i = 0;
  while (i < logs.length) {
    const cur = logs[i];
    const groupIds  = [cur.id];
    const groupRows = [cur];
    let j = i + 1;

    // Группируем только если есть имя файла И размер — иначе нельзя точно сравнить
    const canGroup = cur.fileName != null && cur.fileSize != null;

    while (canGroup && j < logs.length) {
      const next = logs[j];
      const same =
        next.action    === cur.action &&
        next.userId    === cur.userId &&
        next.fileName  === cur.fileName &&
        next.fileSize  === cur.fileSize &&
        Math.abs(cur.createdAt - next.createdAt) < GROUP_WINDOW_SEC;
      if (same) { groupIds.push(next.id); groupRows.push(next); j++; } else break;
    }

    result.push({ ...cur, _count: groupIds.length, _groupIds: groupIds, _groupRows: groupRows });
    i = j;
  }
  return result;
}

// ── Утилиты ──────────────────────────────────────────────────────────────────
function fileTypeIcon(fileType) {
  if (!fileType) return '📄';
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎬';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType === 'application/pdf') return '📕';
  if (fileType.includes('zip') || fileType.includes('rar')) return '🗜️';
  return '📄';
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024)               return `${bytes} Б`;
  if (bytes < 1024 * 1024)        return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

function sizeColor(bytes) {
  if (!bytes) return null;
  if (bytes > 500 * 1024 * 1024) return '#ff4a4a';
  if (bytes > 100 * 1024 * 1024) return '#ffa94d';
  if (bytes > 10  * 1024 * 1024) return '#ffd43b';
  return null;
}


export default function LogsPage() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const pageTopRef = useRef(null);

  const [activeTab,    setActiveTab]    = useState('');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [appliedUser,  setAppliedUser]  = useState('');
  const [offset,       setOffset]       = useState(0);

  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [topVisible,      setTopVisible]      = useState(TOP_STEP);
  const [expandedGroups,  setExpandedGroups]  = useState(new Set());

  // Автодополнение
  const [suggestions,     setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggLoading,     setSuggLoading]     = useState(false);
  const searchRef     = useRef(null);
  const suggDebounce  = useRef(null);
  const searchWrapRef = useRef(null);

  // Дропдаун фильтра
  const [showFilterMenu,  setShowFilterMenu]  = useState(false);
  const filterDropdownRef = useRef(null);

  const canViewLogs = user && (
    (ROLE_LEVEL[user.role] ?? 1) >= 3 ||
    (user.customPermissions ?? []).includes('view_logs')
  );
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    if (!canViewLogs) navigate('/');
  }, [user, authLoading, canViewLogs, navigate]);

  // Закрытие дропдауна поиска при клике вне
  useEffect(() => {
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Закрытие дропдауна фильтра при клике вне
  useEffect(() => {
    const handler = (e) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchStats = useCallback(() => {
    if (!token) return;
    axios.get('/api/logs/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setStats(r.data))
      .catch(() => {});
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const fetchLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = { limit: PAGE_SIZE, offset };
      if (activeTab)   params.action   = activeTab;
      if (appliedUser) params.username = appliedUser;

      const r = await axios.get('/api/logs', {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      setLogs(groupLogs(r.data.logs));
      setTotal(r.data.total);
      setExpandedGroups(new Set());
    } catch (e) {
      setError(e.response?.data?.error || 'Ошибка загрузки логов');
    } finally {
      setLoading(false);
    }
  }, [token, activeTab, appliedUser, offset]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function handleSearchInput(e) {
    const val = e.target.value;
    setSearchQuery(val);
    clearTimeout(suggDebounce.current);
    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSuggLoading(true);
    suggDebounce.current = setTimeout(async () => {
      try {
        const r = await axios.get('/api/logs/users', {
          params: { q: val.trim(), limit: 8 },
          headers: { Authorization: `Bearer ${token}` },
        });
        setSuggestions(r.data || []);
        setShowSuggestions((r.data || []).length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggLoading(false);
      }
    }, 220);
  }

  function handleSuggestionClick(name) {
    setSearchQuery(name);
    setAppliedUser(name);
    setOffset(0);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  function handleSearch(e) {
    e.preventDefault();
    setAppliedUser(searchQuery.trim());
    setOffset(0);
    setShowSuggestions(false);
  }

  function clearSearch() {
    setSearchQuery('');
    setAppliedUser('');
    setOffset(0);
    setSuggestions([]);
    setShowSuggestions(false);
    searchRef.current?.focus();
  }

  function handleTabChange(value) {
    setActiveTab(value);
    setOffset(0);
    setShowFilterMenu(false);
  }

  function filterByUser(username) {
    setSearchQuery(username);
    setAppliedUser(username);
    setActiveTab('');
    setOffset(0);
    setSuggestions([]);
    setShowSuggestions(false);
    pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleDeleteFile(log) {
    const groupIds = log._groupIds?.length > 0 ? log._groupIds : [log.id];
    const count    = groupIds.length;
    const msg = count > 1
      ? `Удалить ${count} файлов?\n\nВсе файлы будут удалены с диска и из галереи/постов. Восстановить невозможно.`
      : `Удалить медиа «${log.fileName || log.targetId}»?\n\nФайл будет удалён с диска, а запись удалена из галереи и постов. Восстановить невозможно.`;

    const ok = await showConfirm(msg, { confirmText: 'Удалить', cancelText: 'Отмена' });
    if (!ok) return;
    try {
      // Удаляем все файлы группы параллельно
      await Promise.all(groupIds.map(id =>
        axios.delete(`/api/logs/${id}/file`, { headers: { Authorization: `Bearer ${token}` } })
      ));
      // Скрываем кнопку удаления у сгруппированной строки
      setLogs(prev => prev.map(l =>
        l.id === log.id ? { ...l, targetId: null, fileSize: null } : l
      ));
      fetchStats();
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка при удалении файла');
    }
  }

  function toggleGroup(logId) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId); else next.add(logId);
      return next;
    });
  }

  async function handleDeleteSingleFile(subLog, parentLog) {
    const ok = await showConfirm(
      `Удалить медиа «${subLog.fileName || subLog.targetId}»?\n\nФайл будет удалён с диска и из галереи/постов. Восстановить невозможно.`,
      { confirmText: 'Удалить', cancelText: 'Отмена' }
    );
    if (!ok) return;
    try {
      await axios.delete(`/api/logs/${subLog.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
      setLogs(prev => prev.map(l => {
        if (l.id !== parentLog.id) return l;
        const newGroupRows = l._groupRows.filter(r => r.id !== subLog.id);
        const newGroupIds  = l._groupIds.filter(id => id !== subLog.id);
        if (newGroupRows.length <= 1) {
          setExpandedGroups(eg => { const s = new Set(eg); s.delete(l.id); return s; });
        }
        return { ...l, _count: newGroupRows.length, _groupRows: newGroupRows, _groupIds: newGroupIds };
      }));
      fetchStats();
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка при удалении файла');
    }
  }

  const [filePreview, setFilePreview] = useState(null);

  function showFilePreview(e, log) {
    if (!log.targetId || !log.fileType) return;
    if (!log.fileType.startsWith('image/') && !log.fileType.startsWith('video/')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setFilePreview({ url: log.targetId, fileType: log.fileType, rect });
  }

  function hideFilePreview() {
    setFilePreview(null);
  }

  function collapseTop() {
    setTopVisible(TOP_STEP);
    pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (authLoading || !user || !canViewLogs) return null;

  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <>
    <div className="logs-page" ref={pageTopRef}>
      <h1 className="logs-page__title">Логи активности</h1>

      {/* ── Статистика ── */}
      {stats && (
        <div className="logs-page__stats">
          <div className="logs-page__stats-global">
            <div className="logs-page__stat-card">
              <span className="logs-page__stat-value">{stats.totals.totalFiles.toLocaleString('ru')}</span>
              <span className="logs-page__stat-label">файлов загружено</span>
            </div>
            <div className="logs-page__stat-card">
              <span className="logs-page__stat-value">{stats.totals.totalSizeFmt}</span>
              <span className="logs-page__stat-label">занято на диске</span>
            </div>
            <div className="logs-page__stat-card">
              <span className="logs-page__stat-value">{stats.totals.totalActions.toLocaleString('ru')}</span>
              <span className="logs-page__stat-label">действий всего</span>
            </div>
          </div>

          {stats.topUploaders.length > 0 && (
            <div className="logs-page__top-uploaders">
              <h3 className="logs-page__top-title">Топ по объёму загрузок</h3>
              <div className="logs-page__top-list">
                {stats.topUploaders.slice(0, topVisible).map((u, i) => (
                  <div
                    key={u.userId || u.username}
                    className="logs-page__top-row"
                    onClick={() => filterByUser(u.username)}
                    title="Фильтровать по этому игроку"
                  >
                    <span className="logs-page__top-rank">#{i + 1}</span>
                    <span className="logs-page__top-name">{u.username}</span>
                    <span className="logs-page__top-files">{u.totalFiles.toLocaleString('ru')} файл.</span>
                    <span
                      className="logs-page__top-size"
                      style={{ color: sizeColor(u.totalSize) || 'var(--accent)' }}
                    >
                      {u.totalSizeFmt}
                    </span>
                  </div>
                ))}
              </div>
              <div className="logs-page__top-controls">
                {topVisible < stats.topUploaders.length && (
                  <button
                    className="logs-page__top-btn"
                    onClick={() => setTopVisible(v => v + TOP_STEP)}
                  >
                    Показать ещё +{Math.min(TOP_STEP, stats.topUploaders.length - topVisible)}
                  </button>
                )}
                {topVisible > TOP_STEP && (
                  <button className="logs-page__top-btn logs-page__top-btn--collapse" onClick={collapseTop}>
                    Свернуть ↑
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Фильтры ── */}
      <div className="logs-page__filters">
        <div className="logs-page__filter-row">

          {/* Выпадающее меню типа действия */}
          <div className="logs-page__filter-dropdown" ref={filterDropdownRef}>
            <button
              className={`logs-page__filter-btn${activeTab ? ' logs-page__filter-btn--active' : ''}`}
              onClick={() => setShowFilterMenu(v => !v)}
              style={activeTab ? { borderColor: filterItemColor(activeTab), color: filterItemColor(activeTab) } : undefined}
            >
              {activeTab && (
                <span
                  className="logs-page__filter-dot"
                  style={{ background: filterItemColor(activeTab) }}
                />
              )}
              <span className="logs-page__filter-label">{filterLabel(activeTab)}</span>
              <span className="logs-page__filter-arrow">{showFilterMenu ? '▲' : '▼'}</span>
            </button>

            {showFilterMenu && (
              <div className="logs-page__filter-menu">
                {ACTION_GROUPS.map((group, gi) => (
                  <div key={gi} className="logs-page__filter-group">
                    {group.label && (
                      <div className="logs-page__filter-group-label">{group.label}</div>
                    )}
                    {group.items.map(item => (
                      <button
                        key={item.value}
                        className={`logs-page__filter-item${activeTab === item.value ? ' logs-page__filter-item--active' : ''}`}
                        onClick={() => handleTabChange(item.value)}
                        style={activeTab === item.value && item.value
                          ? { color: filterItemColor(item.value), background: `${filterItemColor(item.value)}12` }
                          : undefined}
                      >
                        {item.value && (
                          <span
                            className="logs-page__filter-dot"
                            style={{ background: filterItemColor(item.value) }}
                          />
                        )}
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Поиск по нику */}
          <form className="logs-page__search" onSubmit={handleSearch} ref={searchWrapRef}>
            <div className="logs-page__search-wrap">
              <input
                ref={searchRef}
                type="text"
                className="logs-page__search-input"
                placeholder="Поиск по нику..."
                value={searchQuery}
                onChange={handleSearchInput}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                autoComplete="off"
              />
              {suggLoading && <span className="logs-page__search-spin">⏳</span>}

              {showSuggestions && suggestions.length > 0 && (
                <div className="logs-page__suggestions">
                  {suggestions.map(name => (
                    <button
                      key={name}
                      type="button"
                      className={`logs-page__suggestion${name === appliedUser ? ' logs-page__suggestion--active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(name); }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" className="logs-page__search-btn">Найти</button>
            {appliedUser && (
              <button type="button" className="logs-page__search-clear" onClick={clearSearch}>
                ✕ {appliedUser}
              </button>
            )}
          </form>
        </div>
      </div>

      {/* ── Таблица ── */}
      {error && <p className="logs-page__error">{error}</p>}

      {loading ? (
        <div className="logs-page__loading">Загрузка...</div>
      ) : logs.length === 0 ? (
        <div className="logs-page__empty">Нет записей</div>
      ) : (
        <>
          <div className="logs-page__count">
            Найдено: {total.toLocaleString('ru')}
            {appliedUser ? ` · игрок «${appliedUser}»` : ''}
          </div>

          {totalPages > 1 && (
            <div className="logs-page__pagination logs-page__pagination--top">
              <button
                className="logs-page__page-btn"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                ← Назад
              </button>
              <span className="logs-page__page-info">
                {currentPage} / {totalPages}
              </span>
              <button
                className="logs-page__page-btn"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Вперёд →
              </button>
            </div>
          )}

          <div className="logs-page__table-wrap">
            <table className="logs-page__table">
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th>Действие</th>
                  <th>Файл / Описание</th>
                  <th>Размер</th>
                  <th>Тип</th>
                  <th>Дата</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const isExpanded = expandedGroups.has(log.id);
                  const desc = logDescription(log);
                  return (
                    <Fragment key={log.id}>
                      <tr className="logs-page__row">
                        <td className="logs-page__cell-user">
                          <div className="logs-page__user">
                            {log.action === 'ticket_create' ? (
                              <>
                                <span className="logs-page__username logs-page__username--ip" title="IP-адрес заявителя">
                                  🌐 {log.ip || '—'}
                                </span>
                                <span className="logs-page__username" style={{ color: '#888', fontSize: '11px' }}>
                                  ({log.username})
                                </span>
                              </>
                            ) : (
                              <>
                                {log.username && (
                                  <img
                                    className="logs-page__avatar"
                                    src={log.avatarUrl || getAvatarUrl(log.username, null)}
                                    alt={log.username}
                                    onError={e => { e.target.onerror = null; e.target.src = getAvatarUrl(log.username, null); }}
                                  />
                                )}
                                <button
                                  className="logs-page__username"
                                  onClick={() => filterByUser(log.username)}
                                  title={`Логин: ${log.username}`}
                                >
                                  {log.minecraftName || log.username}
                                </button>
                                <Link
                                  to={`/player/${log.username}`}
                                  className="logs-page__profile-link"
                                  title="Открыть профиль"
                                >
                                  ↗
                                </Link>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="logs-page__cell-action">
                          <span
                            className="logs-page__badge"
                            style={{ borderColor: actionColor(log.action), color: actionColor(log.action) }}
                          >
                            {log.actionLabel}
                          </span>
                          {log.targetType && (
                            <span className="logs-page__target-type">{log.targetType}</span>
                          )}
                        </td>

                        <td className="logs-page__cell-file">
                          {desc ? (
                            <span className="logs-page__preview">{desc}</span>
                          ) : log.action === 'ticket_create' ? (
                            <span className="logs-page__preview">
                              Логин: <strong>{log.details?.requestedUsername || '—'}</strong>
                              {log.details?.contact ? ` · ${log.details.contact}` : ''}
                            </span>
                          ) : log.fileName ? (
                            log.targetId ? (
                              <a
                                className="logs-page__filename logs-page__filename--link"
                                href={log.targetId}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Открыть файл: ${log.fileName}`}
                                onMouseEnter={e => showFilePreview(e, log)}
                                onMouseLeave={hideFilePreview}
                              >
                                {fileTypeIcon(log.fileType)}&nbsp;{log.fileName}
                              </a>
                            ) : (
                              <span className="logs-page__filename" title={log.fileName}>
                                {fileTypeIcon(log.fileType)}&nbsp;{log.fileName}
                              </span>
                            )
                          ) : log.details?.preview ? (
                            <>
                              <span className="logs-page__preview" title={log.details.preview}>
                                «{log.details.preview.slice(0, 60)}{log.details.preview.length > 60 ? '…' : ''}»
                              </span>
                              {(log.action === 'post_create' || log.action === 'post_delete') && log.targetId && (
                                <Link to={`/post/${log.targetId}`} className="logs-page__post-link" title="Открыть пост">&nbsp;↗</Link>
                              )}
                              {['news_create', 'news_update', 'news_delete'].includes(log.action) && log.targetId && (
                                <Link to={`/news/${log.targetId}`} className="logs-page__post-link" title="Открыть новость">&nbsp;↗</Link>
                              )}
                              {['event_create', 'event_update', 'event_delete'].includes(log.action) && log.targetId && (
                                <Link to={`/events/${log.targetId}`} className="logs-page__post-link" title="Открыть событие">&nbsp;↗</Link>
                              )}
                            </>
                          ) : '—'}
                        </td>

                        <td
                          className="logs-page__cell-size"
                          style={{ color: sizeColor(log.fileSize) || undefined }}
                        >
                          {log.fileSize ? (
                            <>
                              {fmtBytes(log.fileSize)}
                              {log.fileSize > 100 * 1024 * 1024 && (
                                <span className="logs-page__size-warn" title="Крупный файл"> ⚠️</span>
                              )}
                            </>
                          ) : '—'}
                        </td>

                        <td className="logs-page__cell-type" title={log.fileType || ''}>
                          {log.fileType
                            ? log.fileType
                                .replace('application/', '')
                                .replace('image/', '')
                                .replace('video/', 'vid/')
                                .replace('audio/', 'aud/')
                            : '—'}
                        </td>

                        <td className="logs-page__cell-date">
                          {fmtDate(log.createdAt)}
                          {log._count > 1 && (
                            <button
                              className="logs-page__group-badge"
                              title={isExpanded ? 'Свернуть' : `${log._count} одинаковых записей — нажмите чтобы раскрыть`}
                              onClick={() => toggleGroup(log.id)}
                            >
                              ×{log._count} {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                        </td>

                        <td className="logs-page__cell-actions">
                          {log.action === 'file_upload' && log.targetId && (
                            <button
                              className="logs-page__delete-btn"
                              onClick={() => handleDeleteFile(log)}
                              title="Удалить все файлы группы с диска + из галереи/постов"
                            >
                              🗑
                            </button>
                          )}
                        </td>
                      </tr>

                      {isExpanded && log._groupRows.slice(1).map(subLog => (
                        <tr key={subLog.id} className="logs-page__row logs-page__row--sub">
                          <td className="logs-page__cell-user">
                            <div className="logs-page__user">
                              {subLog.username && (
                                <img
                                  className="logs-page__avatar"
                                  src={subLog.avatarUrl || getAvatarUrl(subLog.username, null)}
                                  alt={subLog.username}
                                  onError={e => { e.target.onerror = null; e.target.src = getAvatarUrl(subLog.username, null); }}
                                />
                              )}
                              <span className="logs-page__username" style={{ cursor: 'default' }} title={`Логин: ${subLog.username}`}>
                                {subLog.minecraftName || subLog.username}
                              </span>
                            </div>
                          </td>

                          <td className="logs-page__cell-action">
                            <span
                              className="logs-page__badge"
                              style={{ borderColor: actionColor(subLog.action), color: actionColor(subLog.action) }}
                            >
                              {subLog.actionLabel}
                            </span>
                          </td>

                          <td className="logs-page__cell-file">
                            {subLog.fileName ? (
                              subLog.targetId ? (
                                <a
                                  className="logs-page__filename logs-page__filename--link"
                                  href={subLog.targetId}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Открыть файл: ${subLog.fileName}`}
                                  onMouseEnter={e => showFilePreview(e, subLog)}
                                  onMouseLeave={hideFilePreview}
                                >
                                  {fileTypeIcon(subLog.fileType)}&nbsp;{subLog.fileName}
                                </a>
                              ) : (
                                <span className="logs-page__filename">{fileTypeIcon(subLog.fileType)}&nbsp;{subLog.fileName}</span>
                              )
                            ) : '—'}
                          </td>

                          <td className="logs-page__cell-size" style={{ color: sizeColor(subLog.fileSize) || undefined }}>
                            {subLog.fileSize ? fmtBytes(subLog.fileSize) : '—'}
                          </td>

                          <td className="logs-page__cell-type" title={subLog.fileType || ''}>
                            {subLog.fileType
                              ? subLog.fileType
                                  .replace('application/', '')
                                  .replace('image/', '')
                                  .replace('video/', 'vid/')
                                  .replace('audio/', 'aud/')
                              : '—'}
                          </td>

                          <td className="logs-page__cell-date">{fmtDate(subLog.createdAt)}</td>

                          <td className="logs-page__cell-actions">
                            {subLog.action === 'file_upload' && subLog.targetId && (
                              <button
                                className="logs-page__delete-btn"
                                onClick={() => handleDeleteSingleFile(subLog, log)}
                                title="Удалить только этот файл"
                              >
                                🗑
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="logs-page__pagination logs-page__pagination--bottom">
              <button
                className="logs-page__page-btn"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                ← Назад
              </button>
              <span className="logs-page__page-info">
                {currentPage} / {totalPages}
              </span>
              <button
                className="logs-page__page-btn"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Вперёд →
              </button>
            </div>
          )}
        </>
      )}
    </div>

    {/* Превью файла при наведении */}
    {filePreview && createPortal(
      (() => {
        const PREVIEW_W = 280;
        const PREVIEW_H = 200;
        const spaceRight = window.innerWidth - filePreview.rect.right - 12;
        const left = spaceRight >= PREVIEW_W
          ? filePreview.rect.right + 12
          : filePreview.rect.left - PREVIEW_W - 12;
        const top = Math.min(
          Math.max(8, filePreview.rect.top - 20),
          window.innerHeight - PREVIEW_H - 8
        );
        return (
          <div className="logs-page__file-preview" style={{ left, top }}>
            {filePreview.fileType.startsWith('video/')
              ? <video src={`${filePreview.url}#t=0.1`} preload="metadata" muted playsInline />
              : <img src={filePreview.url} alt="preview" />
            }
          </div>
        );
      })(),
      document.body
    )}
    </>
  );
}
