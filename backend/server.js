// server.js — точка входа. Запускает Express-сервер.

// dotenv читает файл .env и добавляет переменные в process.env.
// Должен вызываться самым первым, до остальных импортов.
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');
const { runMigrations } = require('./scripts/run-migration');

// Импортируем роутер аутентификации.
// Все маршруты внутри будут доступны по префиксу /api/auth.
const authRouter    = require('./routes/auth');

// Роутер для системы тикетов регистрации.
// Маршруты: POST /api/tickets, GET+POST /api/tickets/admin/...
const ticketsRouter = require('./routes/tickets');

// Роутер для истории игроков.
// Маршруты: GET /api/players, POST /api/players/sync
const playersRouter = require('./routes/players');

// Роутер для профилей пользователей.
// Маршруты: GET /api/users/:id, GET /api/users/by-minecraft/:name, PUT /api/users/:id/profile,
//           GET /api/users/:userId/posts
const usersRouter   = require('./routes/users');

// Роутер для загрузки файлов.
// Маршруты: POST /api/upload
const uploadRouter  = require('./routes/upload');

// Роутер для постов и лайков.
// Маршруты: POST /api/posts, GET /api/posts, DELETE /api/posts/:id, POST /api/posts/:id/like
const { router: postsRouter } = require('./routes/posts');

// Роутер для галереи фотографий.
// Маршруты: GET /api/images, POST /api/images, DELETE /api/images/:id
const { router: imagesRouter } = require('./routes/images');

// Роутер для удаления комментариев.
// Маршрут: DELETE /api/comments/:id
const { commentsDeleteRouter } = require('./routes/comments');

// Роутеры системы личных сообщений.
//   conversationsRouter    — монтируется на /api/conversations
//   messagesDeleteRouter   — монтируется на /api/messages
const { conversationsRouter, messagesDeleteRouter } = require('./routes/messages');

// Роутер новостей.
// Маршруты: GET/POST /api/news, GET/PUT/DELETE /api/news/:slug
const { router: newsRouter } = require('./routes/news');

// Роутер опросов.
// Маршруты: POST /api/polls, GET/PUT/DELETE /api/polls/:id, POST /api/polls/:id/vote, ...
const { router: pollsRouter } = require('./routes/polls');

// Роутер именных альбомов.
// Маршруты: GET /api/albums, POST /api/albums, PUT/DELETE /api/albums/:id,
//           GET/POST /api/albums/:id/images, DELETE /api/albums/:id/images/:imageId
const { router: albumsRouter } = require('./routes/albums');

// Роутер событий.
// Маршруты: GET/POST /api/events, GET/PUT/DELETE /api/events/:slug, /upload-image, /comments
const { router: eventsRouter } = require('./routes/events');

// Роутер логов активности (только admin+).
// Маршруты: GET /api/logs, GET /api/logs/stats
const { router: logsRouter } = require('./routes/logs');

// Роутер реакций (эмодзи на посты, новости, события и комментарии).
const { router: reactionsRouter } = require('./routes/reactions');

// Проверяем, что JWT_SECRET задан в .env.
// Без него сервер не сможет подписывать и проверять токены — лучше упасть сразу.
if (!process.env.JWT_SECRET) {
  console.error('ОШИБКА: переменная JWT_SECRET не задана в .env');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
// Middleware — функции, которые обрабатывают запрос перед тем, как он дойдёт до эндпоинта.

// express.json() автоматически парсит тело запроса из JSON в JavaScript-объект (req.body).
// Лимит 100mb для JSON-тела (загрузка файлов идёт через multer, а не JSON).
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// cors() разрешает запросы с других доменов (например, с localhost:5173 — фронтенд на Vite).
// Без этого браузер заблокирует запросы с фронтенда к бэкенду.
app.use(cors());

// Раздача статических файлов из папки uploads/ — только для локальной разработки.
// В продакшне (S3 настроен) файлы раздаются напрямую из S3, этот middleware не используется.
const { USE_S3 } = require('./utils/storage');
if (!USE_S3) {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}


// --- Эндпоинты ---
// Эндпоинт — это URL, на который можно отправить запрос.
// Формат: app.МЕТОД('/путь', (req, res) => { ... })
//   req (request)  — объект с данными запроса (тело, параметры, заголовки)
//   res (response) — объект для отправки ответа

// GET /api/health — проверка, что сервер работает.
// Удобно для мониторинга и отладки.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Подключаем роутер аутентификации.
// app.use(prefix, router) — все маршруты роутера будут иметь этот префикс.
// /register → /api/auth/register
// /login    → /api/auth/login
// /me       → /api/auth/me
app.use('/api/auth', authRouter);

// Тикеты: /api/tickets (публичный POST) и /api/tickets/admin/... (только админ)
app.use('/api/tickets', ticketsRouter);

// История игроков: GET /api/players и POST /api/players/sync
app.use('/api/players', playersRouter);

// Профили пользователей: GET /api/users/:id, PUT /api/users/:id/profile
app.use('/api/users', usersRouter);

// Загрузка файлов: POST /api/upload
app.use('/api/upload', uploadRouter);

// Посты и лайки: GET/POST /api/posts, DELETE/POST /api/posts/:id(/like)
app.use('/api/posts', postsRouter);

// Галерея фотографий: GET/POST /api/images, DELETE /api/images/:id
app.use('/api/images', imagesRouter);

// Удаление комментариев: DELETE /api/comments/:id
// GET/POST комментариев монтируются внутри posts.js, images.js, users.js
app.use('/api/comments', commentsDeleteRouter);

// Личные сообщения:
//   GET/POST /api/conversations/... — диалоги и история
//   DELETE   /api/messages/:id      — удаление сообщения
app.use('/api/conversations', conversationsRouter);
app.use('/api/messages',      messagesDeleteRouter);

// Новости: GET/POST /api/news, GET/PUT/DELETE/comments /api/news/:slug
app.use('/api/news', newsRouter);

// Опросы: POST/GET/PUT/DELETE /api/polls/:id, vote, voters, options
app.use('/api/polls', pollsRouter);

// Именные альбомы: GET/POST /api/albums, PUT/DELETE /api/albums/:id, ...
app.use('/api/albums', albumsRouter);

// События: GET/POST /api/events, GET/PUT/DELETE/comments /api/events/:slug
app.use('/api/events', eventsRouter);

// Логи активности: GET /api/logs, GET /api/logs/stats (только admin+)
app.use('/api/logs', logsRouter);

// Реакции эмодзи: GET /api/reactions, POST /api/reactions/toggle
app.use('/api/reactions', reactionsRouter);


// --- Раздача собранного фронтенда (продакшн) ---
// В продакшне React-приложение собрано в ../dist/.
// Express раздаёт его как статику, а все незнакомые маршруты отдают index.html
// (React Router сам разберётся, какую страницу показать).
// В разработке папка dist может не существовать — это нормально,
// запросы к API всё равно обрабатываются выше.
const distPath = path.join(__dirname, '../dist');
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// --- Запуск сервера ---
// Сначала применяем миграции (безопасно при IF NOT EXISTS), затем стартуем.
runMigrations(db.pool)
  .catch(err => {
    console.error('Не удалось применить миграции, сервер не запустится:', err.message);
    process.exit(1);
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Сервер запущен: http://localhost:${PORT}`);
      console.log(`Проверь работу: http://localhost:${PORT}/api/health`);
      console.log(`Авторизация:    http://localhost:${PORT}/api/auth/...`);
      console.log(`Тикеты:         http://localhost:${PORT}/api/tickets`);
      console.log(`Профили:        http://localhost:${PORT}/api/users/...`);
      console.log(`Загрузки:       http://localhost:${PORT}/api/upload`);
      console.log(`Статика:        http://localhost:${PORT}/uploads/...`);
      console.log(`Посты:          http://localhost:${PORT}/api/posts`);
      console.log(`Галерея:        http://localhost:${PORT}/api/images`);
    });
  });
