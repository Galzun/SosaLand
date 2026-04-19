// routes/auth.js
// Маршруты аутентификации: регистрация, вход, получение профиля.
//
// Express Router — это мини-приложение, которое обрабатывает только свои маршруты.
// Подключается в server.js через app.use('/api/auth', authRouter).

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

// Читаем секрет из переменных окружения.
// Если JWT_SECRET не задан — сервер не сможет подписывать токены,
// поэтому упадём с ошибкой на старте (см. server.js).
const JWT_SECRET = process.env.JWT_SECRET;

// Время жизни JWT-токена. '7d' — 7 дней.
// После этого пользователь будет автоматически разлогинен.
const JWT_EXPIRES_IN = '7d';

// Количество раундов хеширования bcrypt.
// 10 — хороший баланс между безопасностью и скоростью (2^10 = 1024 итерации).
// Чем выше — тем медленнее перебор, но и медленнее сам логин.
const BCRYPT_ROUNDS = 10;


// ---------------------------------------------------------------------------
// POST /api/auth/register — регистрация нового пользователя
// ---------------------------------------------------------------------------
// Принимает: { username, password, minecraftUuid, minecraftName }
// Возвращает: { token, user: { id, username, minecraftUuid, role } }
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  const { username, password, minecraftUuid, minecraftName } = req.body;

  // Проверяем, что все обязательные поля переданы.
  if (!username || !password || !minecraftUuid) {
    return res.status(400).json({ error: 'Поля username, password и minecraftUuid обязательны' });
  }

  // Дополнительная проверка длины — защита от случайных опечаток.
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'Логин должен быть не короче 3 символов' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  }

  try {
    // bcrypt.hash(пароль, раунды) — асинхронно хеширует пароль.
    // Результат — строка вида "$2b$10$...", содержащая соль и хеш.
    // Соль генерируется случайно каждый раз, поэтому два одинаковых пароля
    // дадут разные хеши — это нормально и ожидаемо.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const id = uuidv4();

    const sql = `
      INSERT INTO users (id, username, password_hash, minecraft_uuid)
      VALUES (?, ?, ?, ?)
    `;

    // Используем Promise-обёртку над callback-based API sqlite3.
    await new Promise((resolve, reject) => {
      db.run(sql, [id, username.trim(), passwordHash, minecraftUuid], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Формируем JWT-токен.
    // jwt.sign(payload, secret, options) — создаёт подписанный токен.
    // payload — данные, которые будут доступны при проверке токена (req.user).
    // Не храни чувствительные данные (пароль и т.д.) в payload — он не шифруется!
    const token = jwt.sign(
      { id, username: username.trim(), role: 'user' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Возвращаем токен и данные пользователя (без пароля).
    res.status(201).json({
      token,
      user: {
        id,
        username: username.trim(),
        minecraftUuid,
        minecraftName: minecraftName || null,
        role: 'user',
      },
    });

  } catch (err) {
    // SQLITE_CONSTRAINT: UNIQUE — пользователь с таким логином или UUID уже есть.
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      if (err.message.includes('username')) {
        return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
      }
      if (err.message.includes('minecraft_uuid')) {
        return res.status(409).json({ error: 'Этот Minecraft-аккаунт уже зарегистрирован' });
      }
      return res.status(409).json({ error: 'Пользователь уже существует' });
    }

    console.error('Ошибка при регистрации:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/auth/login — вход в аккаунт
// ---------------------------------------------------------------------------
// Принимает: { username, password }
// Возвращает: { token, user: { id, username, minecraftUuid, role } }
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  try {
    // Ищем пользователя по логину.
    // Используем Promise-обёртку: db.get возвращает одну строку или undefined.
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, username, password_hash, password_reset, minecraft_uuid, role, is_banned, ban_reason FROM users WHERE username = ?',
        [username.trim()],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    // Важно: не сообщаем, что именно неверно — логин или пароль.
    // Это защищает от атак перебором логинов (user enumeration).
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    let passwordWasReset = false;

    if (user.password_reset) {
      // Режим сброса пароля: любой валидный пароль становится новым.
      if (password.length < 6) {
        return res.status(400).json({
          error: 'Новый пароль должен содержать минимум 6 символов',
          passwordReset: true,
        });
      }
      const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET password_hash = ?, password_reset = 0 WHERE id = ?',
          [newHash, user.id],
          (err) => (err ? reject(err) : resolve())
        );
      });
      passwordWasReset = true;
    } else {
      // bcrypt.compare(введённый_пароль, хеш_из_бд) — сравнивает пароль с хешем.
      // Возвращает true если совпадает, false иначе.
      // Никогда не сравнивай пароли через === — это уязвимость к timing-атакам.
      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
      }
    }

    // Пароль верный — выдаём новый токен.
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Загружаем кастомные роли и права
    let customRoles = [];
    let customPermissions = [];
    try {
      const roleRows = await db.all(
        `SELECT cr.id, cr.name, cr.color, cr.priority, cr.permissions
         FROM user_custom_roles ucr
         JOIN custom_roles cr ON cr.id = ucr.role_id
         WHERE ucr.user_id = ?
         ORDER BY cr.priority ASC`,
        [user.id]
      );
      const permSet = new Set();
      customRoles = roleRows.map(r => {
        JSON.parse(r.permissions || '[]').forEach(p => permSet.add(p));
        return { id: r.id, name: r.name, color: r.color, priority: r.priority };
      });
      customPermissions = [...permSet];
    } catch { /* таблицы могут не существовать до миграции */ }

    const mcPlayer = await db.get('SELECT name FROM players WHERE uuid = ?', [user.minecraft_uuid]);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        minecraftName: mcPlayer?.name || null,
        minecraftUuid: user.minecraft_uuid,
        role: user.role,
        isBanned: !!user.is_banned,
        banReason: user.ban_reason || null,
        customRoles,
        customPermissions,
      },
      ...(passwordWasReset ? { passwordWasReset: true } : {}),
    });

  } catch (err) {
    console.error('Ошибка при входе:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/auth/me — получить данные текущего пользователя по токену.
// Намеренно НЕ использует requireAuth: забаненный пользователь должен иметь
// возможность восстановить сессию при перезагрузке страницы.
// ---------------------------------------------------------------------------
// Заголовок: Authorization: Bearer <token>
// Возвращает: { id, username, minecraftUuid, role, createdAt, isBanned, banReason }
// ---------------------------------------------------------------------------
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Нет токена' });
  }
  const rawToken = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(rawToken, JWT_SECRET);

    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT u.id, u.username, u.minecraft_uuid, u.role, u.created_at, u.is_banned, u.ban_reason,
                (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS minecraft_name
         FROM users u WHERE u.id = ?`,
        [decoded.id],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Загружаем кастомные роли пользователя, отсортированные по приоритету
    let customRoles = [];
    let customPermissions = [];
    try {
      const rows = await db.all(
        `SELECT cr.id, cr.name, cr.color, cr.priority, cr.permissions
         FROM user_custom_roles ucr
         JOIN custom_roles cr ON cr.id = ucr.role_id
         WHERE ucr.user_id = ?
         ORDER BY cr.priority ASC`,
        [user.id]
      );
      const permSet = new Set();
      customRoles = rows.map(r => {
        const perms = JSON.parse(r.permissions || '[]');
        perms.forEach(p => permSet.add(p));
        return { id: r.id, name: r.name, color: r.color, priority: r.priority };
      });
      customPermissions = [...permSet];
    } catch { /* таблица может не существовать до миграции */ }

    res.json({
      id:                user.id,
      username:          user.username,
      minecraftName:     user.minecraft_name || null,
      minecraftUuid:     user.minecraft_uuid,
      role:              user.role,
      createdAt:         user.created_at,
      isBanned:          !!user.is_banned,
      banReason:         user.ban_reason || null,
      customRoles,
      customPermissions,
    });
  } catch {
    res.status(401).json({ error: 'Неверный токен' });
  }
});


module.exports = router;
