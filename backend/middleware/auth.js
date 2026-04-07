// middleware/auth.js
// Middleware для проверки JWT-токена.
//
// Middleware — это функция, которая выполняется между получением запроса
// и вызовом конечного обработчика (эндпоинта).
// Сигнатура: (req, res, next) — если всё ок, вызываем next() для продолжения.

const jwt = require('jsonwebtoken');

// JWT_SECRET должен совпадать с тем, что используется при выдаче токена.
// Читаем из переменной окружения, а не хардкодим в коде.
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * requireAuth — middleware, который защищает приватные эндпоинты.
 *
 * Ожидает заголовок:  Authorization: Bearer <токен>
 *
 * При успехе: добавляет req.user = { id, username, role } и вызывает next().
 * При ошибке: возвращает 401 Unauthorized.
 */
function requireAuth(req, res, next) {
  // Заголовок Authorization приходит в формате "Bearer eyJhb..."
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }

  // Разбиваем строку "Bearer TOKEN" на две части и берём вторую.
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Неверный формат токена' });
  }

  try {
    // jwt.verify бросает исключение если токен просрочен, подписан другим секретом,
    // или повреждён. В этом случае обрабатываем в catch.
    const decoded = jwt.verify(token, JWT_SECRET);

    // Сохраняем данные пользователя в объекте запроса —
    // теперь они доступны в любом последующем обработчике через req.user.
    req.user = decoded;

    // Передаём управление следующему обработчику.
    next();
  } catch (err) {
    // TokenExpiredError — токен просрочен
    // JsonWebTokenError — токен повреждён или подписан другим секретом
    return res.status(401).json({ error: 'Токен недействителен или просрочен' });
  }
}

/**
 * isAdmin — middleware, который разрешает доступ только администраторам.
 *
 * Должен использоваться ПОСЛЕ requireAuth, т.к. зависит от req.user.
 * Пример: router.get('/admin/tickets', requireAuth, isAdmin, handler)
 */
function isAdmin(req, res, next) {
  // req.user добавляется middleware requireAuth из JWT-токена.
  // Если role не 'admin' — возвращаем 403 Forbidden (авторизован, но нет прав).
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права администратора' });
  }
  next();
}

module.exports = { requireAuth, isAdmin };
