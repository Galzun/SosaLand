// pages/Dashboard/LogsPage.jsx
// Страница логов активности — только для admin и creator.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { showConfirm } from '../../Components/Dialog/dialogManager';
import './LogsPage.scss';

const ROLE_LEVEL = { user: 1, editor: 2, admin: 3, creator: 4 };
const PAGE_SIZE  = 50;
const TOP_STEP   = 5;   // сколько строк топа показывать / раскрывать за раз

const ACTION_TABS = [
  { value: '',                                   label: 'Все' },
  { value: 'file_upload',                        label: 'Загрузки файлов' },
  { value: 'file_delete',                        label: 'Удаления файлов' },
  { value: 'post_create',                        label: 'Посты' },
  { value: 'post_delete',                        label: 'Удаления постов' },
  { value: 'news_create,news_update',            label: 'Новости' },
  { value: 'news_delete',                        label: 'Удаления новостей' },
  { value: 'event_create,event_update',          label: 'События' },
  { value: 'event_delete',                       label: 'Удаления событий' },
  { value: 'ticket_create',                      label: 'Заявки' },
];

function actionColor(action) {
  switch (action) {
    case 'file_upload':    return 'var(--accent)';
    case 'file_delete':    return '#ff4a4a';
    case 'post_create':    return '#7eb8f7';
    case 'post_delete':    return '#ff6b6b';
    case 'image_add':      return '#b8a9ff';
    case 'comment_create': return '#ffd700';
    case 'news_create':    return '#4fc3f7';
    case 'news_update':    return '#81d4fa';
    case 'news_delete':    return '#f48fb1';
    case 'event_create':   return '#81c784';
    case 'event_update':   return '#a5d6a7';
    case 'event_delete':   return '#ffb74d';
    case 'ticket_create':  return '#ffa94d';
    default:               return '#555';
  }
}

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
  const { user, token } = useAuth();
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

  // Топ — сколько строк показывать
  const [topVisible, setTopVisible] = useState(TOP_STEP);

  // Автодополнение
  const [suggestions,    setSuggestions]    = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggLoading,    setSuggLoading]    = useState(false);
  const searchRef = useRef(null);
  const suggDebounce = useRef(null);
  const searchWrapRef = useRef(null);

  // Проверка прав
  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    if ((ROLE_LEVEL[user.role] ?? 1) < 3) navigate('/');
  }, [user, navigate]);

  // Загрузка статистики
  const fetchStats = useCallback(() => {
    if (!token) return;
    axios.get('/api/logs/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setStats(r.data))
      .catch(() => {});
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Закрытие дропдауна при клике вне
  useEffect(() => {
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Загрузка логов
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
      setLogs(r.data.logs);
      setTotal(r.data.total);
    } catch (e) {
      setError(e.response?.data?.error || 'Ошибка загрузки логов');
    } finally {
      setLoading(false);
    }
  }, [token, activeTab, appliedUser, offset]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Автодополнение: запрос при вводе
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
  }

  // Клик на ник в таблице → фильтровать по нему
  function filterByUser(username) {
    setSearchQuery(username);
    setAppliedUser(username);
    setActiveTab('');
    setOffset(0);
    setSuggestions([]);
    setShowSuggestions(false);
    pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Удаление файла из лога
  async function handleDeleteFile(log) {
    const ok = await showConfirm(
      `Удалить файл «${log.fileName || log.targetId}» с диска?\n\nЗапись в логах останется, но файл будет удалён безвозвратно.`,
      { confirmText: 'Удалить', cancelText: 'Отмена' }
    );
    if (!ok) return;
    try {
      await axios.delete(`/api/logs/${log.id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Обновляем запись в локальном состоянии: убираем targetId и fileSize
      setLogs(prev => prev.map(l =>
        l.id === log.id ? { ...l, targetId: null, fileSize: null } : l
      ));
      // Перезагружаем статистику чтобы цифры обновились
      fetchStats();
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка при удалении файла');
    }
  }

  // Свернуть топ и проскроллить наверх страницы
  function collapseTop() {
    setTopVisible(TOP_STEP);
    pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
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

              {/* Кнопки раскрытия */}
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
        <div className="logs-page__tabs">
          {ACTION_TABS.map(tab => (
            <button
              key={tab.value}
              className={`logs-page__tab${activeTab === tab.value ? ' logs-page__tab--active' : ''}`}
              onClick={() => handleTabChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Поиск с автодополнением */}
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
            <div className="logs-page__pagination">
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
                {logs.map(log => (
                  <tr key={log.id} className="logs-page__row">
                    <td className="logs-page__cell-user">
                      <div className="logs-page__user">
                        {log.action === 'ticket_create' ? (
                          // Для заявок показываем IP вместо ника
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
                            {log.avatarUrl && (
                              <img
                                className="logs-page__avatar"
                                src={log.avatarUrl}
                                alt={log.username}
                                onError={e => { e.target.style.display = 'none'; }}
                              />
                            )}
                            <button
                              className="logs-page__username"
                              onClick={() => filterByUser(log.username)}
                              title="Фильтровать по этому игроку"
                            >
                              {log.username}
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
                      {log.action === 'ticket_create' ? (
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
                            <Link
                              to={`/post/${log.targetId}`}
                              className="logs-page__post-link"
                              title="Открыть пост"
                            >
                              &nbsp;↗
                            </Link>
                          )}
                          {['news_create', 'news_update', 'news_delete'].includes(log.action) && log.targetId && (
                            <Link
                              to={`/news/${log.targetId}`}
                              className="logs-page__post-link"
                              title="Открыть новость"
                            >
                              &nbsp;↗
                            </Link>
                          )}
                          {['event_create', 'event_update', 'event_delete'].includes(log.action) && log.targetId && (
                            <Link
                              to={`/events/${log.targetId}`}
                              className="logs-page__post-link"
                              title="Открыть событие"
                            >
                              &nbsp;↗
                            </Link>
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

                    <td className="logs-page__cell-date">{fmtDate(log.createdAt)}</td>
                    <td className="logs-page__cell-actions">
                      {log.action === 'file_upload' && log.targetId && (
                        <button
                          className="logs-page__delete-btn"
                          onClick={() => handleDeleteFile(log)}
                          title="Удалить файл с диска"
                        >
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="logs-page__pagination">
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
  );
}
