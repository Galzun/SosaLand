// routes/roles.js
// CRUD для кастомных ролей + назначение/отзыв ролей у пользователей.
//
//   GET    /api/roles                       — список всех кастомных ролей (публично)
//   POST   /api/roles                       — создать роль (admin+ или manage_custom_roles)
//   PUT    /api/roles/:id                   — обновить роль (admin+ или manage_custom_roles)
//   DELETE /api/roles/:id                   — удалить роль (admin+ или manage_custom_roles)
//   GET    /api/roles/:id/users             — пользователи с этой ролью (публично)
//   POST   /api/roles/:id/users             — назначить роль пользователю (admin+ или assign_custom_roles)
//   DELETE /api/roles/:id/users/:userId     — отозвать роль у пользователя (admin+ или assign_custom_roles)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, ROLE_LEVEL } = require('../middleware/auth');
const { PERMISSION_IDS } = require('../utils/permissions');
const { logActivity } = require('../utils/logActivity');

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
}

const router = express.Router();

// Проверка: может ли пользователь управлять ролями (создавать/редактировать/удалять)
function canManageRoles(req) {
  const level = ROLE_LEVEL[req.user?.role] ?? 0;
  if (level >= ROLE_LEVEL.admin) return true;
  if (req.user?.customPermissions?.has('manage_custom_roles')) return true;
  return false;
}

// Проверка: может ли пользователь назначать/отзывать роли
function canAssignRoles(req) {
  const level = ROLE_LEVEL[req.user?.role] ?? 0;
  if (level >= ROLE_LEVEL.admin) return true;
  if (req.user?.customPermissions?.has('assign_custom_roles')) return true;
  if (req.user?.customPermissions?.has('manage_custom_roles')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// GET /api/roles/system/:role/users — пользователи с системной ролью
// (должен быть ДО /:id чтобы 'system' не совпало с param)
// ---------------------------------------------------------------------------
router.get('/system/:role/users', async (req, res) => {
  const { role } = req.params;
  if (!['creator', 'admin', 'editor', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Неверная системная роль' });
  }
  try {
    const users = await db.all(
      `SELECT u.id, u.username, u.minecraft_uuid, u.role,
              (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS minecraft_name
       FROM users u WHERE u.role = ? ORDER BY u.username ASC`,
      [role]
    );
    res.json(users.map(u => ({
      id:            u.id,
      username:      u.username,
      minecraftName: u.minecraft_name || null,
      minecraftUuid: u.minecraft_uuid,
      role:          u.role,
    })));
  } catch (err) {
    console.error('GET /api/roles/system/:role/users:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/roles — список всех кастомных ролей (сортировка по приоритету)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const roles = await db.all('SELECT * FROM custom_roles ORDER BY priority ASC, created_at ASC');
    res.json(roles.map(r => ({
      id:          r.id,
      name:        r.name,
      color:       r.color,
      priority:    r.priority ?? 0,
      permissions: JSON.parse(r.permissions || '[]'),
      createdAt:   r.created_at,
      updatedAt:   r.updated_at,
    })));
  } catch (err) {
    console.error('GET /api/roles:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/roles — создать кастомную роль
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  if (!canManageRoles(req)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { name, color = '#4aff9e', permissions = [] } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название роли обязательно' });
  }
  if (name.trim().length > 50) {
    return res.status(400).json({ error: 'Название роли не более 50 символов' });
  }

  // Оставляем только допустимые permission-идентификаторы
  const validPerms = Array.isArray(permissions)
    ? permissions.filter(p => PERMISSION_IDS.has(p))
    : [];

  const id  = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  try {
    // Новая роль получает приоритет = max + 1 (отображается последней)
    const maxRow = await db.get('SELECT COALESCE(MAX(priority), 0) AS mp FROM custom_roles');
    const priority = (maxRow?.mp ?? 0) + 1;

    await db.run(
      'INSERT INTO custom_roles (id, name, color, permissions, priority, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name.trim(), color, JSON.stringify(validPerms), priority, req.user.id, now]
    );
    logActivity({ userId: req.user.id, username: req.user.username, action: 'role_create', targetId: id, ip: clientIp(req), details: { roleName: name.trim(), color } });
    res.status(201).json({ id, name: name.trim(), color, priority, permissions: validPerms, createdAt: now });
  } catch (err) {
    if (err.message?.toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'Роль с таким названием уже существует' });
    }
    console.error('POST /api/roles:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/roles/:id — обновить кастомную роль
// ---------------------------------------------------------------------------
router.put('/:id', requireAuth, async (req, res) => {
  if (!canManageRoles(req)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { id } = req.params;
  const role = await db.get('SELECT * FROM custom_roles WHERE id = ?', [id]);
  if (!role) return res.status(404).json({ error: 'Роль не найдена' });

  const { name, color, permissions } = req.body;

  const newName  = (name !== undefined ? name.trim() : null) || role.name;
  const newColor = color ?? role.color;
  const newPerms = Array.isArray(permissions)
    ? permissions.filter(p => PERMISSION_IDS.has(p))
    : JSON.parse(role.permissions || '[]');

  if (newName.length > 50) {
    return res.status(400).json({ error: 'Название роли не более 50 символов' });
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    await db.run(
      'UPDATE custom_roles SET name = ?, color = ?, permissions = ?, updated_at = ? WHERE id = ?',
      [newName, newColor, JSON.stringify(newPerms), now, id]
    );
    logActivity({ userId: req.user.id, username: req.user.username, action: 'role_update', targetId: id, ip: clientIp(req), details: { roleName: newName } });
    res.json({ id, name: newName, color: newColor, permissions: newPerms, updatedAt: now });
  } catch (err) {
    console.error('PUT /api/roles/:id:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/roles/:id — удалить кастомную роль
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  if (!canManageRoles(req)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { id } = req.params;
  const role = await db.get('SELECT id FROM custom_roles WHERE id = ?', [id]);
  if (!role) return res.status(404).json({ error: 'Роль не найдена' });

  // CASCADE в БД автоматически удаляет записи из user_custom_roles
  const roleRow = await db.get('SELECT name FROM custom_roles WHERE id = ?', [id]);
  await db.run('DELETE FROM custom_roles WHERE id = ?', [id]);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'role_delete', targetId: id, ip: clientIp(req), details: { roleName: roleRow?.name } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PUT /api/roles/:id/move — поднять или опустить роль в иерархии
// ---------------------------------------------------------------------------
router.put('/:id/move', requireAuth, async (req, res) => {
  if (!canManageRoles(req)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { id } = req.params;
  const { direction } = req.body; // 'up' | 'down'

  const role = await db.get('SELECT * FROM custom_roles WHERE id = ?', [id]);
  if (!role) return res.status(404).json({ error: 'Роль не найдена' });

  let neighbor;
  if (direction === 'up') {
    neighbor = await db.get(
      'SELECT * FROM custom_roles WHERE priority < ? ORDER BY priority DESC LIMIT 1',
      [role.priority]
    );
  } else {
    neighbor = await db.get(
      'SELECT * FROM custom_roles WHERE priority > ? ORDER BY priority ASC LIMIT 1',
      [role.priority]
    );
  }

  if (!neighbor) return res.json({ ok: true }); // уже на краю

  await db.run('UPDATE custom_roles SET priority = ? WHERE id = ?', [neighbor.priority, id]);
  await db.run('UPDATE custom_roles SET priority = ? WHERE id = ?', [role.priority, neighbor.id]);

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/roles/:id/users — пользователи с этой ролью
// ---------------------------------------------------------------------------
router.get('/:id/users', async (req, res) => {
  const { id } = req.params;

  try {
    const users = await db.all(
      `SELECT u.id, u.username, u.minecraft_uuid, u.role,
              (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS minecraft_name,
              ucr.granted_at,
              gb.username AS granted_by_username
       FROM user_custom_roles ucr
       JOIN users u  ON u.id  = ucr.user_id
       LEFT JOIN users gb ON gb.id = ucr.granted_by
       WHERE ucr.role_id = ?
       ORDER BY ucr.granted_at DESC`,
      [id]
    );
    res.json(users.map(u => ({
      id:                u.id,
      username:          u.username,
      minecraftName:     u.minecraft_name || null,
      minecraftUuid:     u.minecraft_uuid,
      role:              u.role,
      grantedAt:         u.granted_at,
      grantedByUsername: u.granted_by_username,
    })));
  } catch (err) {
    console.error('GET /api/roles/:id/users:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/roles/:id/users — назначить роль пользователю
// ---------------------------------------------------------------------------
router.post('/:id/users', requireAuth, async (req, res) => {
  if (!canAssignRoles(req)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { id } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });

  const role = await db.get('SELECT id FROM custom_roles WHERE id = ?', [id]);
  if (!role) return res.status(404).json({ error: 'Роль не найдена' });

  const target = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  const assignId = uuidv4();
  const now      = Math.floor(Date.now() / 1000);

  try {
    await db.run(
      'INSERT INTO user_custom_roles (id, user_id, role_id, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)',
      [assignId, userId, id, req.user.id, now]
    );
    const [roleRow2, targetUser] = await Promise.all([
      db.get('SELECT name FROM custom_roles WHERE id = ?', [id]),
      db.get('SELECT username FROM users WHERE id = ?', [userId]),
    ]);
    logActivity({ userId: req.user.id, username: req.user.username, action: 'role_assign', targetId: userId, ip: clientIp(req), details: { roleName: roleRow2?.name, targetUsername: targetUser?.username } });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.message?.toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'Роль уже назначена этому пользователю' });
    }
    console.error('POST /api/roles/:id/users:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/roles/:id/users/:userId — отозвать роль у пользователя
// ---------------------------------------------------------------------------
router.delete('/:id/users/:userId', requireAuth, async (req, res) => {
  if (!canAssignRoles(req)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { id, userId } = req.params;
  const [roleRow3, targetUser2] = await Promise.all([
    db.get('SELECT name FROM custom_roles WHERE id = ?', [id]),
    db.get('SELECT username FROM users WHERE id = ?', [userId]),
  ]);
  await db.run('DELETE FROM user_custom_roles WHERE role_id = ? AND user_id = ?', [id, userId]);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'role_revoke', targetId: userId, ip: clientIp(req), details: { roleName: roleRow3?.name, targetUsername: targetUser2?.username } });
  res.json({ ok: true });
});

module.exports = { router };
