// pages/Dashboard/RolesPage.jsx
// Управление ролями: создание, редактирование, удаление, назначение пользователям.
// Доступ: admin+ или пользователь с правом manage_custom_roles

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS, PERMISSIONS_BY_GROUP } from '../../utils/permissions';
import { showConfirm, showAlert } from '../../Components/Dialog/dialogManager';
import { getAvatarUrl } from '../../utils/avatarUrl';
import './RolesPage.scss';

const ROLE_LEVEL = { user: 1, editor: 2, admin: 3, creator: 4 };

const PRESET_COLORS = [
  '#4aff9e', '#7eb8f7', '#ffd700', '#ff4a4a', '#ff9f43',
  '#a29bfe', '#fd79a8', '#00cec9', '#6c5ce7', '#e17055',
  '#55efc4', '#fdcb6e', '#d63031', '#0984e3', '#b2bec3',
];

function hexToRgba(hex, alpha = 1) {
  const h = (hex || '#4aff9e').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Модалка редактора роли (создание / редактирование)
// ---------------------------------------------------------------------------
function RoleEditorModal({ role, onSave, onClose }) {
  const [name,        setName]        = useState(role?.name        ?? '');
  const [color,       setColor]       = useState(role?.color       ?? '#4aff9e');
  const [permissions, setPermissions] = useState(new Set(role?.permissions ?? []));
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);

  const isEdit = !!role;

  const togglePerm = (id) => {
    setPermissions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Введите название роли'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), color, permissions: [...permissions] });
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="roles-modal__overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="roles-modal__box">
        <div className="roles-modal__header">
          <span className="roles-modal__title">{isEdit ? 'Редактировать роль' : 'Создать роль'}</span>
          <button className="roles-modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="roles-modal__body">
          {/* Название */}
          <div className="roles-modal__field">
            <label className="roles-modal__label">Название</label>
            <input
              className="roles-modal__input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="например: Строитель"
              maxLength={50}
            />
          </div>

          {/* Цвет */}
          <div className="roles-modal__field">
            <label className="roles-modal__label">Цвет</label>
            <div className="roles-modal__color-row">
              <div className="roles-modal__presets">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className={`roles-modal__preset-color${color === c ? ' roles-modal__preset-color--active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    title={c}
                  />
                ))}
              </div>
              <div className="roles-modal__custom-color">
                <input
                  type="color"
                  className="roles-modal__color-input"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                />
                <span className="roles-modal__color-value">{color}</span>
              </div>
            </div>
            {/* Превью бейджа */}
            <div className="roles-modal__preview">
              <span
                className="roles-page__badge"
                style={{
                  color:       color,
                  background:  hexToRgba(color, 0.12),
                  borderColor: hexToRgba(color, 0.35),
                }}
              >
                {name || 'Превью'}
              </span>
            </div>
          </div>

          {/* Права */}
          <div className="roles-modal__field">
            <label className="roles-modal__label">Права и возможности</label>
            <div className="roles-modal__perms">
              {Object.entries(PERMISSIONS_BY_GROUP).map(([group, perms]) => (
                <div key={group} className="roles-modal__perm-group">
                  <div className="roles-modal__perm-group-title">{group}</div>
                  {perms.map(p => (
                    <label key={p.id} className="roles-modal__perm-item">
                      <input
                        type="checkbox"
                        className="roles-modal__perm-checkbox"
                        checked={permissions.has(p.id)}
                        onChange={() => togglePerm(p.id)}
                      />
                      <span className="roles-modal__perm-label">{p.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {error && <div className="roles-modal__error">{error}</div>}
        </div>

        <div className="roles-modal__footer">
          <button className="roles-modal__btn roles-modal__btn--cancel" onClick={onClose}>
            Отмена
          </button>
          <button className="roles-modal__btn roles-modal__btn--save" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Панель пользователей роли
// ---------------------------------------------------------------------------
function RoleUsersPanel({ role, token, onRevoke }) {
  const [users,   setUsers]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!role) return;
    setLoading(true);
    axios.get(`/api/roles/${role.id}/users`)
      .then(r => setUsers(r.data))
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [role]);

  const handleRevoke = async (user) => {
    const ok = await showConfirm(`Забрать роль «${role.name}» у ${user.username}?`, { danger: true, confirmText: 'Забрать' });
    if (!ok) return;
    try {
      await axios.delete(`/api/roles/${role.id}/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(prev => prev.filter(u => u.id !== user.id));
      onRevoke?.(user.id);
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка');
    }
  };

  if (loading) return <div className="roles-users__loading">Загрузка...</div>;
  if (error)   return <div className="roles-users__error">{error}</div>;
  if (!users)  return null;

  return (
    <div className="roles-users">
      {users.length === 0 ? (
        <div className="roles-users__empty">Никому не назначена</div>
      ) : (
        <div className="roles-users__list">
          {users.map(u => (
            <div key={u.id} className="roles-users__item">
              <div className="roles-users__avatar">
                <img
                  src={getAvatarUrl(u.username, u.minecraftUuid)}
                  alt={u.username}
                  onError={e => { e.target.src = getAvatarUrl(u.username, null); }}
                />
              </div>
              <span className="roles-users__name">{u.username}</span>
              <span className="roles-users__sys-role">{u.role}</span>
              <button
                className="roles-users__revoke"
                onClick={() => handleRevoke(u)}
                title="Забрать роль"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Карточка одной роли
// ---------------------------------------------------------------------------
function RoleCard({ role, token, canManage, onEdit, onDelete, onMove, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false);

  const permLabels = role.permissions.map(id => {
    const p = PERMISSIONS.find(x => x.id === id);
    return p ? p.label : id;
  });

  return (
    <div
      className="roles-page__card"
      style={{ borderColor: hexToRgba(role.color, 0.4) }}
    >
      {/* Шапка карточки */}
      <div className="roles-page__card-header">
        <span
          className="roles-page__badge"
          style={{
            color:       role.color,
            background:  hexToRgba(role.color, 0.12),
            borderColor: hexToRgba(role.color, 0.35),
          }}
        >
          {role.name}
        </span>

        <div className="roles-page__card-actions">
          {canManage && (
            <div className="roles-page__card-move">
              <button
                className="roles-page__card-btn roles-page__card-btn--move"
                onClick={() => onMove(role.id, 'up')}
                disabled={isFirst}
                title="Повысить приоритет"
              >
                ▲
              </button>
              <button
                className="roles-page__card-btn roles-page__card-btn--move"
                onClick={() => onMove(role.id, 'down')}
                disabled={isLast}
                title="Понизить приоритет"
              >
                ▼
              </button>
            </div>
          )}
          <button
            className="roles-page__card-btn"
            onClick={() => setExpanded(p => !p)}
            title={expanded ? 'Свернуть' : 'Развернуть'}
          >
            {expanded ? '−' : '+'}
          </button>
          {canManage && (
            <>
              <button className="roles-page__card-btn" onClick={() => onEdit(role)} title="Редактировать">
                ✏️
              </button>
              <button className="roles-page__card-btn roles-page__card-btn--danger" onClick={() => onDelete(role)} title="Удалить">
                🗑
              </button>
            </>
          )}
        </div>
      </div>

      {/* Раскрытое содержимое */}
      {expanded && (
        <div className="roles-page__card-body">
          {/* Права */}
          <div className="roles-page__perms-section">
            <div className="roles-page__section-title">Права ({role.permissions.length})</div>
            {permLabels.length === 0 ? (
              <span className="roles-page__no-perms">Нет прав</span>
            ) : (
              <div className="roles-page__perm-tags">
                {permLabels.map((label, i) => (
                  <span key={i} className="roles-page__perm-tag">{label}</span>
                ))}
              </div>
            )}
          </div>

          {/* Пользователи */}
          <div className="roles-page__users-section">
            <div className="roles-page__section-title">Пользователи с этой ролью</div>
            <RoleUsersPanel role={role} token={token} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Основная страница
// ---------------------------------------------------------------------------
function RolesPage() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [roles,   setRoles]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Редактор роли
  const [editorRole, setEditorRole] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const perms = user?.customPermissions ?? [];
  // Доступ к странице: admin+ ИЛИ manage_custom_roles ИЛИ assign_custom_roles
  const isAdminPlus = user && (
    ROLE_LEVEL[user.role] >= ROLE_LEVEL.admin ||
    perms.includes('manage_custom_roles') ||
    perms.includes('assign_custom_roles')
  );
  // CRUD-операции над ролями: только admin+ ИЛИ manage_custom_roles
  const canManageRoles = user && (
    ROLE_LEVEL[user.role] >= ROLE_LEVEL.admin ||
    perms.includes('manage_custom_roles')
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    if (!isAdminPlus) { navigate('/'); }
  }, [user, authLoading, isAdminPlus, navigate]);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get('/api/roles');
      setRoles(data);
    } catch {
      setError('Не удалось загрузить роли');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user && isAdminPlus) loadRoles();
  }, [authLoading, user, isAdminPlus, loadRoles]);

  if (authLoading || !user || !isAdminPlus) return null;

  // --- Обработчики ---

  const handleCreate = () => {
    setEditorRole(null);
    setEditorOpen(true);
  };

  const handleEdit = (role) => {
    setEditorRole(role);
    setEditorOpen(true);
  };

  const handleDelete = async (role) => {
    const ok = await showConfirm(
      `Удалить роль «${role.name}»? Она будет снята у всех пользователей.`,
      { danger: true, confirmText: 'Удалить' }
    );
    if (!ok) return;
    try {
      await axios.delete(`/api/roles/${role.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRoles(prev => prev.filter(r => r.id !== role.id));
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Ошибка удаления');
    }
  };

  const handleMove = async (id, direction) => {
    try {
      await axios.put(`/api/roles/${id}/move`, { direction }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadRoles();
    } catch {
      await showAlert('Не удалось изменить порядок ролей');
    }
  };

  const handleEditorSave = async (data) => {
    if (editorRole) {
      const { data: updated } = await axios.put(`/api/roles/${editorRole.id}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRoles(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
    } else {
      const { data: created } = await axios.post('/api/roles', data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRoles(prev => [...prev, created]);
    }
    setEditorOpen(false);
  };

  return (
    <div className="roles-page">
      <div className="roles-page__top">
        <h1 className="roles-page__title">Управление ролями</h1>
        {canManageRoles && (
          <button className="roles-page__create-btn" onClick={handleCreate}>
            + Создать роль
          </button>
        )}
      </div>

      <p className="roles-page__hint">
        Роли отображаются на профилях и в навигации. Роль с наименьшим приоритетом отображается первой.
      </p>

      {loading && <div className="roles-page__loading">Загрузка...</div>}
      {error   && <div className="roles-page__error">{error}</div>}

      {!loading && !error && (
        roles.length === 0 ? (
          <div className="roles-page__empty">
            Ролей ещё нет. Нажмите «+ Создать роль», чтобы добавить первую.
          </div>
        ) : (
          <div className="roles-page__list">
            {roles.map((role, idx) => (
              <RoleCard
                key={role.id}
                role={role}
                token={token}
                canManage={canManageRoles}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onMove={handleMove}
                isFirst={idx === 0}
                isLast={idx === roles.length - 1}
              />
            ))}
          </div>
        )
      )}

      {editorOpen && (
        <RoleEditorModal
          role={editorRole}
          onSave={handleEditorSave}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

export default RolesPage;
