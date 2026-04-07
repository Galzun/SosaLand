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
const { requireAuth } = require('../middleware/auth');

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
        'SELECT id, username, password_hash, minecraft_uuid, role FROM users WHERE username = ?',
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

    // bcrypt.compare(введённый_пароль, хеш_из_бд) — сравнивает пароль с хешем.
    // Возвращает true если совпадает, false иначе.
    // Никогда не сравнивай пароли через === — это уязвимость к timing-атакам.
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Пароль верный — выдаём новый токен.
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        minecraftUuid: user.minecraft_uuid,
        role: user.role,
      },
    });

  } catch (err) {
    console.error('Ошибка при входе:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/auth/me — получить данные текущего пользователя по токену
// ---------------------------------------------------------------------------
// Заголовок: Authorization: Bearer <token>
// Возвращает: { id, username, minecraftUuid, role, createdAt }
// ---------------------------------------------------------------------------
router.get('/me', requireAuth, async (req, res) => {
  // req.user был добавлен middleware requireAuth (содержит { id, username, role }).
  // Делаем запрос к БД чтобы получить актуальные данные (на случай изменений).
  try {
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, username, minecraft_uuid, role, created_at FROM users WHERE id = ?',
        [req.user.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!user) {
      // Токен валиден, но пользователь удалён из БД — редкий, но возможный случай.
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({
      id: user.id,
      username: user.username,
      minecraftUuid: user.minecraft_uuid,
      role: user.role,
      createdAt: user.created_at,
    });

  } catch (err) {
    console.error('Ошибка при получении профиля:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


module.exports = router;
