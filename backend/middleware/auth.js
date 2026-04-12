// middleware/auth.js
// Middleware для проверки JWT-токена и ролей пользователей.
//
// Иерархия ролей:
//   creator  (создатель) — полный доступ
//   admin    (администратор) — управление сайтом, кроме смены роли создателя
//   editor   (редактор) — создание/редактирование новостей и событий
//   user     (игрок) — базовый доступ
//
// Забаненные пользователи блокируются на уровне requireAuth (проверка идёт из БД,
// чтобы бан вступал в силу немедленно, не дожидаясь истечения токена).

const jwt = require('jsonwebtoken');
const db  = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

// Уровень прав роли (чем выше — тем больше прав)
const ROLE_LEVEL = {
  user:    1,
  editor:  2,
  admin:   3,
  creator: 4,
};

/**
 * requireAuth — проверяет JWT и проверяет бан из БД.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Неверный формат токена' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Токен недействителен или просрочен' });
  }

  // Проверяем бан из БД — токен мог быть выдан до бана
  db.get('SELECT is_banned, ban_reason, role FROM users WHERE id = ?', [decoded.id])
    .then(row => {
      if (!row) return res.status(401).json({ error: 'Пользователь не найден' });

      if (row.is_banned) {
        const reason = row.ban_reason ? `: ${row.ban_reason}` : '';
        return res.status(403).json({ error: `Ваш аккаунт заблокирован${reason}` });
      }

      // Берём роль из БД (актуальнее чем в токене — могла измениться)
      req.user = { ...decoded, role: row.role };
      next();
    })
    .catch(() => res.status(401).json({ error: 'Пользователь не найден' }));
}

/**
 * isAdmin — разрешает доступ администраторам и создателю.
 * Использовать ПОСЛЕ requireAuth.
 */
function isAdmin(req, res, next) {
  const level = ROLE_LEVEL[req.user?.role] ?? 0;
  if (level < ROLE_LEVEL.admin) {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права администратора' });
  }
  next();
}

/**
 * isEditor — разрешает доступ редакторам, администраторам и создателю.
 * Использовать ПОСЛЕ requireAuth.
 */
function isEditor(req, res, next) {
  const level = ROLE_LEVEL[req.user?.role] ?? 0;
  if (level < ROLE_LEVEL.editor) {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права редактора' });
  }
  next();
}

/**
 * optionalAuth — если токен есть и валиден → req.user, иначе → req.user = null.
 * Не блокирует, не проверяет бан из БД (используется для публичных эндпоинтов).
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) { req.user = null; return next(); }
  const token = authHeader.split(' ')[1];
  if (!token)  { req.user = null; return next(); }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { requireAuth, isAdmin, isEditor, optionalAuth, ROLE_LEVEL };
