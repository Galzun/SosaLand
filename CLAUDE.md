# SosaLand — сайт для Minecraft сервера

## О проекте
Веб-сайт для Minecraft сервера `Sosaland.wellduck.org` (IP: `5.188.158.73:32887`).
Показывает онлайн игроков, профили, и предоставляет систему авторизации.

## Стек

**Фронтенд:**
- **React 19** + **Vite**
- **React Router v7** (BrowserRouter)
- **SCSS** (BEM-нейминг: `.block__element--modifier`)
- **Axios** для HTTP-запросов
- **Bootstrap 5** (почти не используется)

**Бэкенд** (`backend/`):
- **Node.js + Express** — HTTP-сервер
- **PostgreSQL** + **pg** (node-postgres) — база данных; строка подключения в `backend/.env` → `DATABASE_URL=postgres://user:pass@localhost:5432/sosaland`
- **bcryptjs** — хеширование паролей
- **jsonwebtoken** — JWT авторизация
- **uuid** — генерация уникальных ID
- **multer** — загрузка файлов (изображения и любые другие файлы); использует `memoryStorage()` — файлы не пишутся на диск, сразу уходят в S3 или локальный `uploads/`
- **@aws-sdk/client-s3** — загрузка файлов в S3-совместимое хранилище (TimeWeb Object Storage)
- **cors, dotenv** — CORS и переменные окружения
- Запуск: `cd backend && npm start` → `http://localhost:3001`
- Миграции применяются **автоматически при старте сервера** (`runMigrations` в `server.js`); вручную: `cd backend && npm run migrate`
- `backend/utils/storage.js` — абстракция хранилища: если заданы `S3_BUCKET + S3_ACCESS_KEY + S3_SECRET_KEY` → S3, иначе → локальный `backend/uploads/`

### База данных — PostgreSQL

- `backend/db.js` — обёртка над `pg.Pool` с SQLite-совместимым API: `db.run`, `db.get`, `db.all`, `db.transaction(async fn)`, `db.clientQuery(client, sql, params)`
- Плейсхолдеры `?` автоматически конвертируются в `$1, $2, ...` внутри `db.js`
- `backend/schema.sql` — полная схема всех таблиц для PostgreSQL; функция `unix_now()` возвращает текущий Unix timestamp (`EXTRACT(EPOCH FROM NOW())::INTEGER`)
- **Локальная разработка**: PostgreSQL локально, та же `DATABASE_URL` в `.env`
- **Продакшн (TimeWeb)**: PostgreSQL на App Platform, `DATABASE_URL` задаётся переменной окружения
- SSL: автоматически отключается для `localhost`/`127.0.0.1`, включается для облака

### Правила при работе с SQL (PostgreSQL)

- **GROUP BY**: все не-агрегированные столбцы SELECT обязаны быть в GROUP BY. Исключение: столбцы той же таблицы, если в GROUP BY стоит её PRIMARY KEY (функциональная зависимость). Столбцы из JOIN-таблиц — всегда добавлять в GROUP BY явно.
- **Корелированные подзапросы**: нельзя ссылаться на `table.col` из внешнего агрегирующего запроса если `col` входит только в выражение типа `COALESCE(col, ...)` в GROUP BY — нужно заменять на LEFT JOIN.
- **COUNT(*) возвращает bigint** — `pg` отдаёт его как JS-строку (`'5'`). Всегда оборачивать `Number(row.count)` при форматировании ответа.
- **Транзакции**: использовать `db.transaction(async client => { await db.clientQuery(client, sql, params); ... })`. `db.serialize()` — заглушка (no-op), `BEGIN/COMMIT` через обычные `db.run` не работают (разные соединения пула).
- **UPSERT**: `INSERT ... ON CONFLICT(col) DO UPDATE SET col = EXCLUDED.col` (PostgreSQL синтаксис, не SQLite).
- **`SELECT *` в JOIN**: избегать — использовать явный список столбцов, иначе возможны дубли имён (напр. `id` из двух таблиц).
- **Проверять схему перед ORDER BY**: столбцы вроде `created_at` есть не во всех таблицах (напр. `poll_votes` его не имеет). PostgreSQL падает с ошибкой там, где SQLite молча игнорировал. Всегда сверяться с `backend/schema.sql`.

## Архитектура данных

```
useServerStatus (хук)
  1. При старте → GET /api/players (история из БД)
  2. Каждые 30 сек → api.mcsrvstat.us → онлайн-игроки
  3. Для каждого → playerdb.co → UUID
  4. POST /api/players/sync → сохраняет в БД
  ↓ players (онлайн), allPlayers (БД + текущая сессия)
App.jsx
  ↓ передаёт в
PlayerProvider (контекст)
  ↓ обогащает игроков (аватары, profileUrl, форматирование)
Все компоненты → usePlayer() / usePlayerByName() / usePlayerByUUID()

PlayerPage (/player/:username)
  1. PlayerContext → данные Minecraft-игрока (аватарка, онлайн, UUID)
  2. GET /api/users/by-minecraft/:username → данные аккаунта (cover, bg, bio/status)
  3. GET /api/users/:userId/images → фото для вкладки «Фото»
```

## Внешние API
- `api.mcsrvstat.us/3/{ip}` — список онлайн-игроков и статус сервера
- `playerdb.co` — получение UUID по нику
- `crafatar.icehost.xyz/avatars/{uuid}` — аватарки скинов (квадратные с округлёнными углами)
- `api.dicebear.com` — резервные аватарки (инициалы)

## Маршруты фронтенда
| Путь | Компонент | Описание |
|------|-----------|----------|
| `/` | Home | Грид всех игроков (онлайн + офлайн история из БД) |
| `/feed` | Feed/FeedPage | Лента постов всех пользователей |
| `/player/:username` | PlayerPage | Профиль игрока (cover, bg, статус, вкладки) |
| `/auth` | AuthPage | Вход / Регистрация |
| `/gallery` | Gallery/GalleryPage | Галерея фото всех пользователей |
| `/events` | Events/EventsPage | Список событий сервера, сетка 3 колонки с таймером |
| `/events/:slug` | Events/EventDetailPage | Страница события (две вкладки: Основная/Итоги), комментарии |
| `/dashboard/events/create` | Dashboard/EventCreate | Создание события (editor и выше) |
| `/dashboard/events/:slug/edit` | Dashboard/EventCreate | Редактирование события (editor и выше) |
| `/messages` | Messages/MessagesPage | Личные сообщения (только авторизованные) |
| `/news` | News/NewsPage | Список новостей, галерейная сетка 3 колонки |
| `/news/:slug` | News/NewsDetailPage | Страница новости с HTML-контентом и комментариями |
| `/dashboard/news/create` | Dashboard/NewsCreate | Создание новости (editor и выше) |
| `/dashboard/news/:slug/edit` | Dashboard/NewsCreate | Редактирование новости (editor и выше) |
| `/dashboard/tickets` | Dashboard/Tickets | Панель модерации заявок (admin и выше) |
| `/dashboard/profile` | Dashboard/EditProfile | Редактирование профиля (только авторизованный) |
| `/dashboard/logs` | Dashboard/LogsPage | Логи активности: загрузки и удаления файлов, посты, новости, события (admin и выше) |
| `/post/:id` | PostPage | Прямая ссылка на пост — авто-открывает PostModal |

## Лэйаут приложения
- `Header` — `position: sticky; top: 0; z-index: 1000`, рендерится ВНЕ `.app-layout`
- `.app-layout` — flex-контейнер, `max-width: 1440px`, центрирован, `min-height: calc(100vh - var(--header-h))`
- `Sidebar` — `position: sticky; top: var(--header-h)`, `width: 260px`, прозрачный фон (`backdrop-filter: blur`). На мобилке (<1024px) — `position: fixed`, открывается кнопкой ☰
- `.app__main` — `flex: 1`, основной контент справа от Sidebar
- `--header-h: 64px` — CSS-переменная высоты header, используется в sticky/max-height сайдбара
- `Header` dropdown: **Профиль** / **Редактировать профиль** / **Выйти**

## Бэкенд — эндпоинты

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| GET | `/api/health` | все | Проверка работоспособности |
| POST | `/api/auth/register` | все | Прямая регистрация (не используется с фронта) |
| POST | `/api/auth/login` | все | Вход, возвращает JWT; забаненные **могут войти** (бан не блокирует вход) |
| GET | `/api/auth/me` | JWT (без requireAuth) | Данные текущего пользователя (включает `isBanned`, `banReason`); **не блокирует забаненных** — они могут восстанавливать сессию при перезагрузке |
| POST | `/api/tickets` | все | Создать заявку на регистрацию |
| GET | `/api/tickets/admin` | admin+ | Список pending-тикетов |
| POST | `/api/tickets/admin/:id/approve` | admin+ | Одобрить заявку → создать пользователя |
| POST | `/api/tickets/admin/:id/reject` | admin+ | Отклонить заявку |
| GET | `/api/players` | все | Все игроки из БД (включает `isBanned`, `banReason`) |
| POST | `/api/players/sync` | все | Upsert батча онлайн-игроков (не трогает `is_banned`) |
| POST | `/api/players/ban-by-name/:name` | admin+ | **Универсальный бан** по нику `{ reason? }`; если у игрока настоящий UUID — обновляет `players` + `users`; иначе создаёт/обновляет `offline:<name>` запись |
| POST | `/api/players/unban-by-name/:name` | admin+ | **Универсальный разбан** по нику; снимает бан в `players` и `users`, очищает `ban_reason` |
| POST | `/api/players/:uuid/ban` | admin+ | Устаревший: бан по UUID (фронт использует ban-by-name) |
| POST | `/api/players/:uuid/unban` | admin+ | Устаревший: разбан по UUID (фронт использует unban-by-name) |
| GET | `/api/users/:id` | все | Публичный профиль по ID |
| GET | `/api/users/by-minecraft/:name` | все | Профиль по нику Minecraft |
| GET | `/api/users/:userId/posts` | все | Посты конкретного пользователя (с commentsCount, attachments) |
| GET | `/api/users/:userId/images` | все | Фото конкретного пользователя (с commentsCount) |
| GET | `/api/users/:userId/profile-comments` | все | Комментарии к профилю (limit, offset) |
| POST | `/api/users/:userId/profile-comments` | JWT | Добавить комментарий к профилю |
| PUT | `/api/users/:id/profile` | JWT (владелец) | Обновить cover_url, background_url, bio, card_bg_* |
| PUT | `/api/users/:id/role` | admin+ | Изменить роль пользователя (`user`\|`editor`\|`admin`\|`creator`); нельзя повысить выше своей роли |
| POST | `/api/users/:id/ban` | admin+ | Забанить пользователя `{ reason? }`; нельзя банить равного/высшего |
| POST | `/api/users/:id/unban` | admin+ | Разбанить пользователя |
| POST | `/api/users/:id/reset-password` | admin+ | Сбросить пароль; при следующем логине любой пароль ≥6 символов становится новым; нельзя применять к равному/высшему |
| PUT | `/api/users/:id/username` | admin+ | Изменить логин `{ username }`; нельзя применять к равному/высшему |
| POST | `/api/users/:id/clear-data` | admin+ | Очистить все данные аккаунта: посты + вложения, фото, альбомы, обложку/фон, bio, UI-настройки (файлы удаляются с диска); сам аккаунт остаётся; нельзя применять к равному/высшему |
| DELETE | `/api/users/:id` | admin+ | Полностью удалить аккаунт: сначала удаляет файлы с диска, затем запись из `users` (CASCADE чистит посты, вложения, изображения, альбомы, лайки, комментарии, диалоги); нельзя удалять равного/высшего |
| POST | `/api/upload` | JWT | Загрузить файл(ы) → `/uploads/<file>`; поля: `image`, `file`, `files[]`; возвращает `{ url, fileUrl, fileType, fileName, size }` или `{ files: [...] }` |
| GET | `/api/posts` | все | Лента постов (limit, offset; с commentsCount, attachments[]) |
| GET | `/api/posts/:id` | все | Один пост по ID (тот же формат что лента; для прямых ссылок `/post/:id`) |
| POST | `/api/posts` | JWT | Создать пост; тело: `{ content, attachments?: [{fileUrl, fileType, fileName}] }` или `{ content, imageUrl? }` (legacy); `content` может быть пустой строкой (для поста-опроса) |
| PUT | `/api/posts/:id` | JWT (автор) | Редактировать пост: обновить content, заменить attachments; инкрементирует edit_count, обновляет updated_at |
| DELETE | `/api/posts/:id` | JWT (автор) | Удалить пост + все файлы с диска (из post_attachments и image_url) |
| POST | `/api/posts/:id/like` | JWT | Toggle лайк (ставит или убирает) |
| GET | `/api/posts/:postId/comments` | все | Комментарии к посту (limit, offset) |
| POST | `/api/posts/:postId/comments` | JWT | Добавить комментарий к посту |
| GET | `/api/images` | все | Глобальная лента фото (limit, offset; с commentsCount) |
| GET | `/api/images/item/:id` | все | Одно фото по ID (автор, groupId, isGallery; для глубоких ссылок `/gallery?image=id`) |
| POST | `/api/images` | JWT | Добавить фото в галерею (imageUrl, title?) |
| DELETE | `/api/images/:id` | JWT (автор/admin) | Удалить одно медиа из профиля: если в альбоме → `show_in_profile=0, is_gallery=0`; иначе физически + с диска |
| DELETE | `/api/images/group/:groupId` | JWT (автор/admin) | Удалить группу (пак) из профиля: альбомные скрываются, остальные физически удаляются |
| GET | `/api/images/:imageId/comments` | все | Комментарии к фото (limit, offset) |
| POST | `/api/images/:imageId/comments` | JWT | Добавить комментарий к фото |
| DELETE | `/api/comments/:id` | JWT (автор/admin) | Удалить комментарий |
| GET | `/api/conversations` | JWT | Список диалогов текущего пользователя |
| GET | `/api/conversations/unread-count` | JWT | Число непрочитанных сообщений |
| GET | `/api/conversations/:userId/messages` | JWT | История сообщений с пользователем (не создаёт диалог) |
| POST | `/api/conversations/:userId/messages` | JWT | Отправить сообщение (создаёт диалог при первой отправке) |
| DELETE | `/api/messages/:id` | JWT (отправитель) | Удалить своё сообщение («отозвать») |
| GET | `/api/news` | все | Список опубликованных новостей (пагинация) |
| GET | `/api/news/:slug` | все | Одна новость (полный контент + счётчик просмотров) |
| POST | `/api/news` | editor+ | Создать новость |
| PUT | `/api/news/:slug` | editor+ | Обновить новость |
| DELETE | `/api/news/:slug` | admin+ | Удалить новость |
| POST | `/api/news/upload-image` | editor+ | Загрузить изображение/видео в редактор |
| GET | `/api/news/:newsId/comments` | все | Комментарии к новости |
| POST | `/api/news/:newsId/comments` | JWT | Добавить комментарий к новости |
| GET | `/api/events` | все | Список событий (пагинация, сортировка по start_time DESC) |
| GET | `/api/events/:slug` | все | Одно событие (полный контент + счётчик просмотров) |
| POST | `/api/events` | editor+ | Создать событие; обязательно `start_time` (unix timestamp) |
| PUT | `/api/events/:slug` | editor+ | Обновить событие |
| DELETE | `/api/events/:slug` | admin+ | Удалить событие |
| POST | `/api/events/upload-image` | editor+ | Загрузить изображение/видео в редактор события |
| GET | `/api/events/:eventId/comments` | все | Комментарии к событию |
| POST | `/api/events/:eventId/comments` | JWT | Добавить комментарий к событию |
| POST | `/api/polls` | admin/автор поста | Создать опрос; тело: `{ news_id?, post_id?, question, options[], is_anonymous, allow_multiple, allow_add_options, allow_change_vote, shuffle_options, ends_at? }` |
| GET | `/api/polls/:id` | все (JWT для userVotedIds) | Получить опрос с вариантами и статусом голосования |
| PUT | `/api/polls/:id` | admin/автор поста | Обновить настройки опроса; тело может содержать `options: [{id?, text}]` — обновить/добавить/удалить варианты (удаляются только варианты с 0 голосов) |
| DELETE | `/api/polls/:id` | admin/автор поста | Удалить опрос |
| POST | `/api/polls/:id/vote` | JWT | Проголосовать; тело: `{ option_ids[] }` |
| GET | `/api/polls/:id/voters` | все | Список проголосовавших (или только счётчики если анонимный) |
| POST | `/api/polls/:id/options` | JWT (если allow_add_options) | Добавить свой вариант ответа |
| GET | `/api/logs` | admin+ | Список логов с фильтрацией (action, username, userId) и пагинацией (limit/offset); возвращает `{ logs[], total, limit, offset }` |
| GET | `/api/logs/stats` | admin+ | Топ-50 пользователей по объёму загрузок + глобальные итоги (totalActions, totalFiles, totalSize) |
| GET | `/api/logs/users?q=X` | admin+ | Автодополнение ников по подстроке — возвращает массив строк (до 30) |
| DELETE | `/api/logs/:id/file` | admin+ | Удалить файл с диска по записи лога; `target_id` обнуляется, запись остаётся |
| GET | `/api/albums?userId=X` | все | Список именных альбомов пользователя |
| POST | `/api/albums` | JWT | Создать альбом `{ name }` |
| PUT | `/api/albums/:id` | JWT (владелец) | Переименовать `{ name }` |
| DELETE | `/api/albums/:id` | JWT (владелец) | Удалить альбом + физически удалить все его фото (из images, с диска) |
| GET | `/api/albums/:id/images` | все | Медиа внутри альбома |
| POST | `/api/albums/:id/images` | JWT (владелец) | Привязать медиа `{ imageIds: [] }` |
| DELETE | `/api/albums/:id/images/:imageId` | JWT (владелец) | Удалить медиа из альбома + из images + с диска |

## База данных — таблицы

**users:**
- `id` TEXT PK (UUID)
- `username` TEXT UNIQUE
- `password_hash` TEXT (bcrypt)
- `minecraft_uuid` TEXT UNIQUE
- `role` TEXT DEFAULT 'user' — `'user'` | `'editor'` | `'admin'` | `'creator'` (иерархия: creator > admin > editor > user)
- `is_banned` INTEGER DEFAULT 0 — флаг бана
- `ban_reason` TEXT — причина бана
- `banned_by` TEXT — id администратора, выдавшего бан
- `banned_at` INTEGER — unix timestamp бана
- `cover_url` TEXT — обложка профиля (NULL по умолчанию)
- `background_url` TEXT — фон страницы профиля (NULL по умолчанию)
- `bio` TEXT — статус игрока (до 50 символов, отображается под именем на профиле)
- `cover_pos_x` INTEGER DEFAULT 50 — горизонтальная позиция обложки (0-100)
- `cover_pos_y` INTEGER DEFAULT 50 — вертикальная позиция обложки (0-100)
- `cover_scale` INTEGER DEFAULT 100 — масштаб обложки (20-200%)
- `cover_rotation` INTEGER DEFAULT 0 — поворот обложки (0-359°)
- `cover_blur` INTEGER DEFAULT 0 — размытие обложки (0-20px)
- `cover_edge` INTEGER DEFAULT 0 — плавность краёв обложки (0-100)
- `cover_fill_color` TEXT — цвет заливки фона обложки
- `bg_pos_x` INTEGER DEFAULT 50 — горизонтальная позиция фона (0-100)
- `bg_pos_y` INTEGER DEFAULT 50 — вертикальная позиция фона (0-100)
- `bg_scale` INTEGER DEFAULT 100 — масштаб фона (20-200%)
- `bg_rotation` INTEGER DEFAULT 0 — поворот фона (0-359°)
- `bg_blur` INTEGER DEFAULT 0 — размытие фона (0-20px)
- `bg_edge` INTEGER DEFAULT 0 — плавность краёв фона (0-100)
- `bg_fill_color` TEXT — цвет заливки фона страницы
- `card_bg_color` TEXT DEFAULT '#1a1a1a' — цвет фона карточки профиля
- `card_bg_alpha` INTEGER DEFAULT 95 — непрозрачность фона карточки 0-100
- `card_bg_blur` INTEGER DEFAULT 0 — размытие шапки профиля
- `post_card_bg_color/alpha/blur` — фон карточек постов
- `tabs_bg_color/alpha/blur` — фон вкладок
- `post_form_bg_color/alpha/blur` — фон формы поста
- `content_bg_color/alpha/blur` — фон области контента
- `content_wrapper_bg_color/alpha/blur` — фон шапки профиля, приоритет над card_bg
- `content_wrapper_border_color/width/radius/text_color/accent_color` — рамка и цвета шапки
- `content_border_color/width/radius/text_color` — рамка области контента
- `post_card_border_color/width/radius/text_color/accent_color` — рамка и цвета карточек
- `created_at` INTEGER (unix timestamp)
- `updated_at` INTEGER (unix timestamp, обновляется при PUT /profile)

**tickets:**
- `id` TEXT PK (UUID)
- `minecraft_uuid` TEXT
- `minecraft_name` TEXT
- `username` TEXT — желаемый логин
- `password_hash` TEXT (bcrypt)
- `status` TEXT DEFAULT 'pending' — 'pending' | 'approved' | 'rejected'
- `contact` TEXT — Discord/Telegram/VK (необязательно)
- `created_at` INTEGER
- `approved_by` TEXT → users.id
- `approved_at` INTEGER
- `rejection_reason` TEXT

**players:**
- `uuid` TEXT PK — Minecraft UUID (или `'offline:<name>'` для пиратских банов)
- `name` TEXT — ник (обновляется при каждом онлайне)
- `first_seen` INTEGER (unix timestamp)
- `last_seen` INTEGER (unix timestamp)
- `is_banned` INTEGER DEFAULT 0 — визуальный бан; синхронизируется с `users.is_banned` при бане через сайт; для пиратских игроков без UUID — единственное место хранения бана
- `ban_reason` TEXT — причина бана (заполняется при бане через `ban-by-name`); отображается tooltip при наведении на карточку игрока (migration 031)

**posts:**
- `id` TEXT PK (UUID)
- `user_id` TEXT NOT NULL → users.id ON DELETE CASCADE
- `content` TEXT NOT NULL — текст поста (до 5000 символов, может быть пустой строкой если к посту прикреплён опрос)
- `image_url` TEXT — legacy: одно изображение (хранится для старых постов, новые используют post_attachments)
- `has_attachments` INTEGER DEFAULT 0 — флаг наличия вложений (migration 019, денормализация)
- `likes_count` INTEGER DEFAULT 0 — денормализованный счётчик лайков
- `edit_count` INTEGER DEFAULT 0 — сколько раз пост редактировался (migration 027); инкрементируется при `PUT /api/posts/:id`
- `created_at` INTEGER (unix timestamp, авто)
- `updated_at` INTEGER (unix timestamp) — обновляется при редактировании

**post_attachments** (migration 019):
- `id` TEXT PK (UUID)
- `post_id` TEXT NOT NULL → posts.id ON DELETE CASCADE
- `file_url` TEXT NOT NULL — путь к файлу (/uploads/...) или внешний URL
- `file_type` TEXT NOT NULL DEFAULT 'application/octet-stream' — MIME-тип
- `file_name` TEXT — оригинальное имя файла
- `file_size` INTEGER — размер в байтах
- `duration` INTEGER — длительность в секундах (для видео и аудио)
- `width` INTEGER — ширина в пикселях (для изображений и видео)
- `height` INTEGER — высота в пикселях
- `order_index` INTEGER DEFAULT 0 — порядок отображения
- `created_at` INTEGER DEFAULT (strftime('%s', 'now'))
- INDEX on post_id

**likes:**
- `id` TEXT PK (UUID)
- `user_id` TEXT NOT NULL → users.id ON DELETE CASCADE
- `post_id` TEXT NOT NULL → posts.id ON DELETE CASCADE
- `created_at` INTEGER (unix timestamp, авто)
- UNIQUE(user_id, post_id) — один пользователь лайкает пост только раз

**images:**
- `id` TEXT PK (UUID)
- `user_id` TEXT NOT NULL → users.id ON DELETE CASCADE
- `image_url` TEXT NOT NULL — путь к файлу (/uploads/...) или внешний URL
- `title` TEXT — название/подпись фото (до 200 символов); при пакетной загрузке (`POST /api/images`) сохраняется из пользовательского поля `title`, либо fallback — оригинальное имя файла (`f.fileName`); используется для сортировки по дате из имени файла (формат Minecraft `2026-02-10_20.20.19.png`)
- `created_at` INTEGER DEFAULT (strftime('%s', 'now'))
- INDEX on user_id, INDEX on created_at

**comments:**
- `id` TEXT PK (UUID)
- `user_id` TEXT NOT NULL → users.id ON DELETE CASCADE — автор комментария
- `post_id` TEXT → posts.id ON DELETE CASCADE (NULL для остальных)
- `image_id` TEXT → images.id ON DELETE CASCADE (NULL для остальных)
- `profile_user_id` TEXT → users.id ON DELETE CASCADE (NULL для остальных)
- `news_id` TEXT → news.id ON DELETE CASCADE (NULL для остальных)
- `event_id` TEXT → events.id ON DELETE CASCADE (NULL для остальных) — добавлено migration 028
- `content` TEXT NOT NULL — текст комментария (до 1000 символов)
- `created_at` INTEGER DEFAULT (strftime('%s', 'now'))
- INDEX on post_id, image_id, profile_user_id, news_id, event_id
- Ровно одно из post_id / image_id / profile_user_id / news_id / event_id заполнено

**conversations** (migration 017):
- `id` TEXT PK (UUID)
- `participant1` TEXT NOT NULL → users.id ON DELETE CASCADE
- `participant2` TEXT NOT NULL → users.id ON DELETE CASCADE
- `last_message` TEXT — денормализованный текст последнего сообщения
- `last_message_time` INTEGER — unix timestamp последнего сообщения
- `created_at` INTEGER DEFAULT (strftime('%s', 'now'))
- UNIQUE(participant1, participant2) — одна запись на пару; participant1 < participant2 лексикографически
- INDEX on participant1, INDEX on participant2

**messages** (migration 017):
- `id` TEXT PK (UUID)
- `conversation_id` TEXT NOT NULL → conversations.id ON DELETE CASCADE
- `sender_id` TEXT NOT NULL → users.id ON DELETE CASCADE
- `content` TEXT NOT NULL — текст сообщения (до 5000 символов, может быть пустым если есть файл)
- `file_url` TEXT — путь к файлу (/uploads/...)
- `file_type` TEXT — MIME-тип вложения
- `file_name` TEXT — оригинальное имя файла
- `is_read` INTEGER DEFAULT 0 — 0/1
- `read_at` INTEGER — unix timestamp прочтения
- `created_at` INTEGER DEFAULT (strftime('%s', 'now'))
- INDEX on conversation_id, INDEX on sender_id

## Загрузка файлов

### Хранилище (`backend/utils/storage.js`)
- **S3 (продакшн)**: если заданы `S3_BUCKET + S3_ACCESS_KEY + S3_SECRET_KEY` — файлы уходят в TimeWeb Object Storage; публичный URL: `https://<bucket>.s3.timeweb.cloud/<filename>` или `S3_PUBLIC_URL` из `.env`
- **Локально (разработка)**: если S3 не настроен — файлы сохраняются в `backend/uploads/`; статика раздаётся через `app.use('/uploads', express.static(...))` (только когда `USE_S3 = false`); Vite проксирует `/uploads/*` на `http://localhost:3001`
- `uploadFile(buffer, filename, mimetype)` — загружает файл и возвращает публичный URL
- `deleteFile(fileUrl)` — удаляет файл из S3 или с диска по URL
- `deleteFileAsync(fileUrl)` — fire-and-forget обёртка над `deleteFile`
- `generateFilename(originalname)` — генерирует уникальное имя `{timestamp}_{random}.{ext}`
- `USE_S3` — булев флаг, экспортируется для условной логики в `server.js` и роутах
- multer везде использует `memoryStorage()` — файлы не пишутся на диск, обрабатываются в памяти

### Поля загрузки
- Поле **`image`** — только изображения (jpg, png, gif, webp), максимум **1 ГБ**; используется для галереи, обложек, аватаров
- Поле **`file`** — один любой файл, максимум **1 ГБ**; используется для вложений в сообщениях
- Поле **`files[]`** — несколько любых файлов (до 200 за раз), максимум **1 ГБ** каждый; используется для вложений в постах
- **Rate limit**: не более **1 ГБ в час** на пользователя (in-memory Map, ключ = userId, окно сбрасывается каждый час); при превышении → HTTP 429, уже сохранённые файлы текущего запроса удаляются; реализовано в `checkHourlyLimit()` в `routes/upload.js`
- `logActivity` для `file_upload` сохраняет `targetId: fileUrl` — нужен для ссылки из логов и для удаления файла через `DELETE /api/logs/:id/file`
- Одиночный ответ: `{ url, fileUrl, fileType, fileName, size }` — `url` для обратной совместимости
- Множественный ответ: `{ files: [{ url, fileUrl, fileType, fileName, size }, ...] }`
- `fileName` (оригинальное имя) декодируется через `decodeFileName()` в `upload.js`: `Buffer.from(name, 'latin1').toString('utf8')` — исправляет русские символы, которые multer читает как Latin-1

### Переменные окружения S3 (TimeWeb)
```
S3_ACCESS_KEY=...        # Ключ доступа из панели TimeWeb → Object Storage
S3_SECRET_KEY=...        # Секретный ключ
S3_BUCKET=...            # Название бакета
S3_ENDPOINT=https://s3.timeweb.cloud
S3_REGION=ru-1
S3_PUBLIC_URL=https://<bucket>.s3.timeweb.cloud  # опционально
```

## Фон страницы игрока
- Фон рендерится как `position:fixed; inset:0; z-index:-1` — покрывает весь viewport
- Оверлей (`::after`, rgba 55%) добавляется **только** при наличии фонового изображения (`backgroundUrl`) — класс `player-page__bg-layer--image`; при сплошном цвете оверлея нет, цвет отображается точно как выбранный
- `bg-layer` рендерится если задан `backgroundUrl` **или** `bgFillColor` — можно задать сплошной цвет без изображения
- Скролл страницы не влияет на фон (он не привязан к потоку документа)
- Позиция, масштаб, поворот, размытие, плавность краёв — CSS трансформации на inner-div

## UI-кастомизация страницы профиля

Каждый блок страницы профиля управляется своей группой CSS-переменных, задаваемых через `inline style` на `<main class="player-page">`. Все переменные вычисляются в `PlayerPage.jsx` через `hexAlphaToRgba()`.

**Важно:** `hexAlphaToRgba` использует `isNaN(r) ? 26 : r` (не `|| 26`), иначе `#000000` превращался в `#1a1a1a` (ноль — falsy).

### Группы фона/рамки

| Группа DB (`users`) | CSS-переменные | Элемент SCSS |
|---|---|---|
| `card_bg_color/alpha/blur` | `--card-bg-computed`, `--card-bg-blur` | `player-page__content-wrapper` (фоллбэк) |
| `content_wrapper_bg_color/alpha/blur` | `--content-wrapper-bg-computed`, `--content-wrapper-blur` | `player-page__content-wrapper` (приоритет) |
| `content_bg_color/alpha/blur` | `--content-bg-computed`, `--content-blur` | `player-page__content` |
| `post_card_bg_color/alpha/blur` | `--cards-bg-computed`, `--cards-blur` | вкладки, карточки постов, форма поста, комментарии, модалки |

- **Фон задаётся на `player-page__content-wrapper`**, не на `player-page__header` — это исключает 1px просвет цвета по скруглённым углам поверх обложки (баг `overflow:hidden` + `border-radius`)
- `tabs_bg_color/alpha/blur` и `post_form_bg_color/alpha/blur` в БД хранятся но на фронте продублированы значениями `post_card_*` (объединены в группу «Карточки и вкладки»)
- Миграция 013 добавила `card_bg_*`, миграция 016 добавила все остальные группы, миграция 018 добавила рамки и цвета текста

### Цвет текста и акцент

Вычисляются в `PlayerPage.jsx` как RGBA-строки и передаются CSS-переменными:

| Группа | CSS-переменные |
|---|---|
| Шапка профиля | `--header-text-color`, `--header-text-muted` (65%), `--header-text-dim` (50%) |
| Шапка — акцент | `--header-accent-color`, `--header-accent-10`, `--header-accent-12`, `--header-accent-35` |
| Карточки/вкладки | `--cards-text-color`, `--cards-text-muted` (65%), `--cards-text-dim` (50%) |
| Карточки — акцент | `--cards-accent-color`, `--cards-accent-04`, `--cards-accent-08`, `--cards-accent-25` |

- Текстовые оттенки вычисляются только если пользователь задал цвет, иначе — CSS fallback на исходные значения
- Акцентные alpha-варианты вычисляются всегда (используют дефолт `#4aff9e` если цвет не задан)
- Переменные `--cards-*` каскадируют на: `PostCard`, `PostForm`, `PostAttachments`, `CommentSection`, вкладки профиля, `player-page__comments-card`, форму добавления фото

### CSS-переменные в модальных окнах

`ImageModal`, `PostModal` и `MediaModal` рендерятся через `createPortal` в `document.body` — вне `.player-page`, CSS-переменные туда не каскадируют. Решение: `cssVars` передаётся пропом по цепочке `PlayerPage → PostCard → PostAttachments → MediaModal/PostModal` и применяется как `style` на корневой элемент модального окна.

- На страницах вне профиля (Feed, Gallery) модалки открываются без `cssVars` и показывают дефолтные цвета
- `PostModal`: одна колонка, `cssVars` применяется на `.post-modal` — все дочерние элементы наследуют `--cards-*` переменные
- `MediaModal`: `cssVars` применяется на `.media-modal` — цвет акцента используется для активной миниатюры в стрипе

## Система регистрации
Регистрация проходит **модерацию администратора**:
1. Игрок выбирает свой Minecraft-аккаунт из списка
2. Вводит желаемый логин и пароль
3. `RegisterForm` → `POST /api/tickets` — заявка сохраняется со статусом `pending`
4. Показывается сообщение: "Заявка отправлена. Администратор рассмотрит её в ближайшее время."
5. Администратор (и создатель) видит красный border у кнопки «Заявки» в Sidebar (только если есть pending)
6. На странице `/dashboard/tickets` одобряет/отклоняет заявки
7. При одобрении → автоматически создаётся пользователь в `users`, статус меняется на `approved`
8. Пользователь может войти через LoginForm

## Редактирование профиля
1. Авторизованный пользователь открывает `/dashboard/profile` (через Header → выпадающее меню или кнопку на странице профиля)
2. Может загрузить обложку (cover) и фон (background) через `ImageUpload` или вставить URL
3. **Цвет обложки/фона задаётся без изображения** — `ColorField` «Цвет обложки» / «Цвет фона страницы» всегда видны, не зависят от наличия URL
4. Для изображений (при наличии URL): ползунки позиции, масштаба, поворота, размытия, плавности краёв
5. Может задать Статус (до 50 символов, поле `bio` в БД) — отображается под именем на профиле
6. Секция «Настройка UI-элементов» — 3 раскрывающихся группы: **Шапка профиля**, **Область контента**, **Карточки и вкладки**; каждая: фон (цвет + прозрачность + blur), рамка (цвет + ширина + радиус), текст и акцент + кнопка «Сбросить всё»
   - «Шапка профиля» и «Карточки и вкладки» имеют цвет текста + акцент
   - «Область контента» — только фон и рамка (текста там нет)
7. Может удалить изображение кнопкой "Удалить обложку/фон" (сохраняется null в БД)
8. Сохранение → `PUT /api/users/:id/profile` → редирект на `/player/:username`
9. Кнопка «Редактировать профиль» — в Header (выпадающее меню) и прямо на странице профиля (только владелец)

## Middleware
- `requireAuth` — проверяет JWT токен из заголовка `Authorization: Bearer <token>`; забаненные пользователи получают 403 на все защищённые (write) действия, но могут просматривать сайт в read-only режиме и восстанавливать сессию через `/api/auth/me`
- `isAdmin` — разрешает доступ `admin` и `creator` (level ≥ 3); используется после requireAuth
- `isEditor` — разрешает доступ `editor`, `admin`, `creator` (level ≥ 2); используется после requireAuth
- `optionalAuth` — если токен есть и валиден → req.user, иначе → req.user = null; для забаненных всегда null
- `ROLE_LEVEL` — `{ user: 1, editor: 2, admin: 3, creator: 4 }` — экспортируется для сравнения ролей в роутах

## Иерархия ролей
| Уровень | Роль | Описание |
|---------|------|----------|
| 4 | `creator` | Создатель — полный доступ, не может быть понижен/забанен другими |
| 3 | `admin` | Администратор — управление сайтом, удаление контента, бан/разбан, смена роли ниже себя |
| 2 | `editor` | Редактор — создание и редактирование новостей и событий |
| 1 | `user` | Игрок — базовый доступ (посты, комментарии, галерея, сообщения) |

Правила управления ролями:
- Нельзя изменить роль пользователя равного или выше себя
- Нельзя назначить роль выше собственной
- Нельзя изменить собственную роль
- Забаненный пользователь: **может войти** и просматривать сайт (read-only), но `requireAuth` блокирует все write-действия (посты, комментарии, лайки и т.д.) с кодом 403; `/api/auth/me` работает без `requireAuth` — страница не выбрасывает забаненного при обновлении

## Система постов
- Посты создаются авторизованными пользователями через `PostForm`
- Лента `/feed` — глобальная, все посты, сортировка по дате (новые первые)
- Прямая ссылка на пост `/post/:id` — страница `PostPage` загружает пост через `GET /api/posts/:id` и сразу открывает `PostModal` (`autoOpenModal` prop); кнопка «← Лента» для возврата
- Страница профиля `/player/:username` — вкладки: **Посты** / **Фото**
- Лайки: toggle (поставить/убрать), счётчик хранится в `posts.likes_count`
- Удаление поста: автор **или admin/creator** (для модерации); при удалении физически удаляются все файлы с диска
- **Редактирование поста**: только автор; кнопка ✏️ рядом с 🗑 в шапке PostCard и PostModal; открывает модалку с PostForm в режиме редактирования (`initialPost` prop); после сохранения пост обновляется в локальном состоянии через `patchPost`; под постом (если редактировался) отображается «Изменено N раз · время»; **модалка не закрывается по клику вне** (только кнопка «Отмена»); оверлей имеет `overflow-y: auto` — содержимое прокручивается при необходимости
- Хук `usePosts({ userId?, disabled? })`: управляет состоянием, пагинацией, лайками; `disabled=true` — не загружает ничего
- `usePosts.createPost(content, attachments=[])` — `attachments` массив `[{fileUrl, fileType, fileName}]` уже загруженных файлов; строка как второй аргумент конвертируется в legacy imageUrl (обратная совместимость)
- `usePosts.editPost(postId, content, attachments=[])` — обновляет пост через `PUT /api/posts/:id`; принимает полный итоговый список вложений; обновляет пост в локальном состоянии
- `usePosts.patchPost(postId, patch)` — обновляет поля поста в локальном состоянии без запроса к API; используется после создания опроса чтобы записать `pollId` в уже добавленный пост
- API возвращает `commentsCount`, `attachments[]`, `pollId`, `editCount` и `updatedAt` в каждом посте

### PostForm
- Нижняя панель: **слева** — 📎 «Добавить медиа» + 😊 «Смайлики» + 📊 «Добавить опрос»; **справа** — счётчик символов + кнопка «Опубликовать»
- Бейдж с количеством выбранных файлов поверх иконки скрепки
- Ограничений по размеру на стороне фронта **нет** (убраны); ограничение на бэкенде — 1 ГБ/ч на пользователя
- Превью выбранных файлов **до загрузки**: изображения/видео — миниатюра (blob URL) без рамок, аудио/документы — FileIcon + имя + **размер файла** (маленький текст `9px` под именем)
- Загрузка файлов происходит **при отправке поста** (не при выборе) — один за одним с прогрессом "Загрузка 2 / 5..."
- Object URL освобождаются при удалении файла из очереди и при размонтировании
- **Пост-опрос**: текст поста необязателен, если прикреплён опрос (`pendingPoll`); кнопка «Опубликовать» активна при наличии хотя бы одного из двух
- Props: `onSubmit(content, attachments)` — обязательный; `onPollLinked(postId, pollId)` — опциональный; `initialPost` — объект поста для режима редактирования; `onCancel()` — кнопка ��Отмена» в режиме редактирования
- Режим редактирования (`initialPost` задан): кнопка «Опубликовать» → «Сохранить��, placeholder изменён, кнопка опроса скрыта; существующие вложения показываются как `ExistingAttachmentPreview` (можно удалить из поста); новые файлы добавляются как обычно; итоговые вложения = оставшиеся старые + новые загруженные
- Стиль `.post-form--editing` — без фона, рамки и отступов (модалка задаёт контекст)
- **Оверлей PollBuilder** не закрывается по клику вне окна — только через кнопку ✕

### PostCard
- Вложения отображаются через `PostAttachments` (новый формат) или legacy `imageUrl`
- `compact={true}` ограничивает медиа-сетку до 4 ячеек с оверлеем "+N"
- Текст кликабелен: обрезание/раскрытие/PostModal — поведение без изменений
- Кнопка 🔗 «Скопировать ссылку» (`.post-card__share`) — всегда видна, копирует `/post/${post.id}` через `navigator.clipboard`; opacity 0.5 по умолчанию, акцентный цвет при наведении
- Props: добавлены `onCommentAdded` (callback при добавлении комментария) и `autoOpenModal` (если true — PostModal открыт сразу при монтировании)
- Если `post.pollId` задан — рендерит `<PollViewer pollId={post.pollId} cssVars={cssVars} />` над текстом поста

### PostModal
- Вложения отображаются через `PostAttachments` в полном размере (`compact={false}`, `disableScrollLock={true}`)
- `disableScrollLock={true}` — MediaModal не снимает блокировку скролла при закрытии (PostModal управляет скроллом сам)
- `.post-modal__attachments` — медиа-сетка переопределена (`margin:0; width:100%; border-radius:0`), аудио/документы/пагинация получают `padding: 0 20px`; двойных отрицательных отступов нет
- Закрытие: клик на оверлей или Escape (крестика закрытия нет; кнопка ✕ удаления поста — только для автора)
- Если `post.pollId` задан — рендерит `<PollViewer pollId={post.pollId} cssVars={cssVars} />` над текстом поста (аналогично PostCard)
- `overflow-x: hidden` на `.post-modal__box` — никаких горизонтальных полос прокрутки
- **Изменение ширины**: ручка `.post-modal__resize-handle` — дочерний элемент `.post-modal` (оверлея), не `.post-modal__box`. Позиционируется через `position: absolute; left: calc(50% - modalWidth/2)` — всегда на левом краю модала и не скроллируется с контентом. Ширина 16px, акцентная линия + 6 точек-грипперов цветом `--cards-accent-color`. Drag: `onMouseDown` → `mousemove/mouseup` на `document`; дельта умножается на 2 (модал центрирован → левый край точно следует за курсором). Диапазон: 400–1280px, дефолт 680px. Сохраняется в `localStorage` по ключу `sosaland:postModalWidth`.

### PostAttachments (`src/Components/PostAttachments/`)
Отображает вложения поста в трёх секциях:
1. **Медиа-сетка** (изображения + видео): CSS Grid с раскладкой 1/2/3/4 ячеек; gap=2px (вплотную); видео показывает первый кадр (`<video preload="metadata">`) + иконку ▶; клик → `MediaModal`
2. **Аудио-плееры**: `<audio controls style={{ colorScheme: 'dark' }}>` для каждого файла; `accent-color` использует `--cards-accent-color`; без рамок (только фон и box-shadow при наведении)
3. **Документы**: `<a download>` с `FileIcon` + имя + размер + стрелка скачивания; без рамок

**Пагинация** (`compact={false}`, т.е. в PostModal): если элементов > 4, показываются первые 4 + кнопки «Показать ещё →» / «Свернуть ↑» **прижаты к левому краю** (`justify-content: flex-start`), `font-size: 1rem`, цвет `--cards-accent-color`, underline при наведении. Медиа, аудио, документы — независимые секции пагинации. При «Свернуть» — `scrollIntoView({ behavior:'smooth', block:'start' })` к началу секции. Сетка медиа центрирована (`align-items:center` на `.post-attachments`).

**Остановка медиа**: `<audio>` в AudioList и `<video>` в MediaModal имеют `onPlay` обработчик `stopOtherMedia(el)` — при воспроизведении одного элемента автоматически ставит на паузу все другие `audio/video` на странице через `document.querySelectorAll`.

Props: `disableScrollLock` — пробрасывается в MediaModal.

Хелперы экспортируются: `isImage(att)`, `isVideo(att)`, `isAudio(att)`, `isMedia(att)`

### MediaModal (`src/Components/MediaModal/`)
- Portal в `document.body`, получает `cssVars` и `disableScrollLock` пропами
- `disableScrollLock={true}` — не трогает `document.body` scroll lock (используется из PostModal)
- Изображения: `<img>` + drag:none
- Видео: `<video controls autoPlay playsInline style={{ colorScheme:'dark' }}>`; при смене слайда — `key={fileUrl}` перезапускает элемент
- **Навигация**: кнопки `.media-modal__nav-btn` — `position:fixed; top:0; bottom:0; width:60px; background:transparent`; при наведении подсвечиваются `--cards-accent-color`
- **Верхняя полоса** `.media-modal__top-bar` — `position:fixed; top:0; left:0; right:0; height:60px; z-index:1000; background:transparent` — кликабельная зона поверх стрелок; внутри кнопка ✕
- Стрип миниатюр снизу с прокруткой; активная — обводка `--cards-accent-color`
- Счётчик "N / M" (имя файла не отображается)
- Клавиатура: Esc/←/→

## Галерея фото
- Глобальная галерея `/gallery` — паки всех пользователей (is_gallery = 1), сетка 3 колонки
- Файлы, загруженные за один раз, объединяются в **пак** (`group_id`) — авто-группировка при пакетной загрузке
- Авторизованный пользователь может добавить фото/видео через форму на странице галереи
- Поток: загрузка через `POST /api/upload` (поле `files[]`) → сохранение через `POST /api/images`
- «Удаление» пака из галереи: `DELETE /api/images/album/:groupId` → устанавливает `is_gallery=0` (мягкое скрытие); медиа остаётся в профиле и альбомах
- Клик по фото открывает `ImageModal` — «кинотеатр» для скриншотов/видео
- **Глубокая ссылка** `/gallery?image=<id>` — при загрузке страницы читается `?image` через `useSearchParams`; после загрузки всех альбомов (`useEffect` на `[deepLinkImageId, allItems]`) автоматически открывается `ImageModal` с нужным фото
- `ImageModal` рендерится через `ReactDOM.createPortal` в `document.body`
- Компоненты: `ImageUpload`, `ImageModal`, `GalleryAlbum` (в `src/Components/`)

### Именные альбомы (вкладка «Альбомы» на профиле)
- Пользователь создаёт именные альбомы — тематические коллекции медиа
- **Альбом** (named album, таблица `albums`) ≠ **пак** (auto `group_id` в images)
- При загрузке в альбом: файлы → `/api/upload` → `/api/images` → `/api/albums/:id/images`
- Форма загрузки содержит два чекбокса (оба `true` по умолчанию): **«Также загрузить на страницу»** → `show_in_profile` (видно на вкладке «Фото»); **«Также загрузить в галерею»** → `is_gallery` (видно в глобальной галерее)
### Иерархия удаления медиа (1 > 2 > 3)

**1. Альбом** (наивысший приоритет):
- 🗑 одного медиа из альбома (`DELETE /api/albums/:id/images/:imageId`) → физически: удаляет из `images`, cascade убирает `album_images`, удаляет файл с диска
- Удалить весь альбом (`DELETE /api/albums/:id`) → физически удаляет все медиа альбома из `images` + с диска; записи `file_delete` в логах

**2. Профиль** (`DELETE /api/images/:id` или `DELETE /api/images/group/:groupId`):
- Если медиа **в именном альбоме** (`album_images`) → `show_in_profile=0, is_gallery=0` (скрывается из профиля и галереи, файл остаётся в альбоме)
- Если медиа **НЕ в именном альбоме** → физически: удаляет из `images`, файл с диска, запись `file_delete` в логах

**3. Галерея** (наименьший приоритет):
- `DELETE /api/images/album/:groupId` → `is_gallery=0`; медиа остаётся в профиле и альбоме, файл на диске не трогается
- `GET /api/albums?userId=X`: показывает все альбомы пользователя; возвращает `coverUrl`, `coverFileType` (для корректного рендера видео-обложки), `count`
- Кнопка 🗑 в топ-баре `ImageModal` — prop `onDeleteItem(imageId)`; рендерится только когда передан; для альбомного ImageModal передаётся владельцем через PlayerPage
- **Сортировка внутри альбома** — панель кнопок над сеткой (показывается при ≥2 файлах): «По дате ↓/↑» (парсит дату из `item.title` по паттерну `YYYY-MM-DD_HH.MM.SS`, fallback — `createdAt`) и «Добавлено ↓/↑» (по `createdAt`); стейт `albumSort` в `PlayerPage`; `parseDateFromFilename(title)` — утилита вне компонента; сортировка применяется к `sortedAlbumImages` (useMemo), которое используется и в сетке, и в `ImageModal`
- **Обложка альбома**: если `coverFileType` начинается с `video/` — рендерится `<video>` вместо `<img>`

### ImageModal (`src/Components/ImageModal/`)
- **«Кинотеатр»** — медиа занимает весь экран (`position:fixed; inset:0`), боковая панель выезжает справа
- Контролы (топ-бар, стрелки, стрип) наложены поверх медиа; появляются при движении мыши (`onMouseMove`), исчезают через 2 сек (`setTimeout 2000`); реализовано через класс `.image-modal--controls` на корне
- Курсор скрыт (`cursor:none`) когда контролы спрятаны
- Навигация стрелками (`hasPrev`/`hasNext`) **не сбрасывает** таймер скрытия контролов
- **Стрип** — всегда резервирует место (`min-height:72px`); появляется только для альбомов с ≥2 фото; активная миниатюра масштабируется `scale(1.08)` + обводка акцентом; `.image-modal__bottom` имеет `max-width:60%; margin:0 auto` — центрирован и не перекрывает боковые элементы
- **Видео + стрип**: класс `.image-modal--video` на корне; стрип поднят на `bottom:52px` (выше нативного контрол-бара браузера), дополнительно ограничен по ширине `min(720px, calc(100%-340px))` — не перекрывает кнопки play/volume/fullscreen по бокам
- **Альбомы**: `albumRanges [{startIndex, items[]}]` — вычисляется в `Gallery.jsx` и `PlayerPage.jsx` и передаётся в `ImageModal`; текущий диапазон определяется динамически по `currentIndex`
- **Боковая панель**: по умолчанию закрыта; кнопка `◀`/`▶` в топ-баре; `width:0 → 380px` с `transition:width 0.25s`; внутри — автор, дата, заголовок, `CommentSection stickyForm={true}`; prop `showSidebar` (default `true`) — при `false` кнопка сайдбара и сам сайдбар не рендерятся (используется для лайтбокса новостей/событий)
- **Кнопка удаления** 🗑: prop `onDeleteItem(imageId)` — если передан, в топ-баре появляется кнопка 🗑; показывает `showConfirm`, навигирует к соседнему медиа (или закрывает если последнее), затем вызывает callback. Передаётся из Gallery (для авторизованных), из PlayerPage «Фото» (для владельца) и из PlayerPage «Альбомы» (для владельца)
- **Кнопка поделиться** 🔗 (`.image-modal__btn--share`) в топ-баре — копирует `/gallery?image=${current.id}` через `navigator.clipboard`; всегда видна; класс в SCSS `&--share`
- **Тег альбома** в топ-баре: бейдж `📁 название` — читается из `current.albumName` / `current.albumOwnerUsername` (поля каждого image-объекта, приходят с бэкенда). Prop `showAlbumTag` (default `true`); внутри альбомного ImageModal передаётся `showAlbumTag={false}`. Бэкенд добавляет `albumName`/`albumOwnerUsername` через subquery в `getAlbums` (images.js)
- При смене фото — плавный fade-in изображения (opacity 0→1 после onLoad)
- Скролл body блокируется через `position:fixed + top:-scrollY` (как в MediaModal)
- Клавиатура: Esc/←/→

## Страница профиля — вкладки
- **Посты** — посты пользователя + PostForm для владельца; ширина 680px, центрированы; используют `--cards-*` CSS-переменные
- **Фото** — фото пользователя (`show_in_profile = 1`), сетка 3 колонки; владелец может добавлять и удалять; форма добавления фото использует `--cards-*` переменные
- **Альбомы** — именные коллекции; список карточек → внутри альбома сетка + форма загрузки; подробнее в разделе «Именные альбомы»
- **Комментарии** — вкладка с `CommentSection type="profile"` внутри блока `.player-page__comments-card` (карточка с `--cards-*` стилями); видна только если есть привязанный аккаунт
- Статус — поле `bio` (до 50 символов), отображается под именем прямо в шапке профиля (не во вкладке)
- Кнопка **«💬 Написать»** — отображается на чужом профиле при наличии аккаунта (`profile !== null`), только авторизованным; перенаправляет на `/messages?user=<username>`
- Кнопка **«Удалить»** — отображается на чужом профиле для admin/creator (только если уровень цели ниже уровня текущего пользователя); находится в `.player-page__top-actions` справа рядом с «Написать»; при клике открывается дропдаун-меню через `createPortal` в `document.body` с `position:fixed` (чтобы не обрезалось `overflow:hidden` шапки):
  - Первые **5 секунд** кнопки неактивны (обратный отсчёт «Кнопки станут активны через N сек...»)
  - **«Очистить данные»** (жёлтая) → `POST /api/users/:id/clear-data` — удаляет контент, аккаунт остаётся
  - **«Удалить аккаунт»** (красная) → `DELETE /api/users/:id` — полное необратимое удаление; после успеха перенаправляет на `/`
  - Меню закрывается по клику вне (исключая кнопку и само меню) и при переходе на другой профиль

## Sidebar — навигация
- Прозрачный (`backdrop-filter: blur`), `position: sticky`, виден всегда на десктопе (>1024px)
- На мобилке — `position: fixed`, открывается по кнопке ☰, закрывается при смене маршрута
- Пункты: Лента, Галерея, События, Сообщения (только авторизованные), Заявки (только admin+), Логи (только admin+)
- Бейдж на «Заявки» и «Сообщения»: красная обводка (`sidebar__item--pending`) при наличии pending/непрочитанных
- Непрочитанные сообщения опрашиваются каждые 15 секунд (`/api/conversations/unread-count`)
- Блок пользователя наверху: аватарка + имя → ссылка на профиль; под именем — роль с цветом:
  - `creator` → золотой `#ffd700`
  - `admin` → зелёный `#4aff9e`
  - `editor` → голубой `#7eb8f7`
  - `user` → серый `#555`
- **Футер с авторами** (`sidebar__footer`) в самом низу: `by Galzun, DeepSeek, ClaudeCode`; hover-цвета: Galzun → белый, DeepSeek → синий `#1e8cf7`, ClaudeCode → оранжевый `#e8793a`
- Компонент: `src/Components/Sidebar/Sidebar.jsx`

## Логи активности

Страница `/dashboard/logs` — только для `admin` и `creator`. Фиксирует ключевые действия пользователей на сайте.

### Что логируется

| Действие | action | Где пишется |
|---|---|---|
| Загрузка файла (любое поле) | `file_upload` | `routes/upload.js` — после сохранения каждого файла |
| Физическое удаление файла | `file_delete` | `routes/images.js`, `routes/albums.js`, `routes/logs.js` — при удалении из профиля/альбома/кнопкой в логах |
| Создание поста | `post_create` | `routes/posts.js` — после `INSERT INTO posts` |
| Удаление поста | `post_delete` | `routes/posts.js` — после `DELETE FROM posts` |
| Создание новости | `news_create` | `routes/news.js` |
| Изменение новости | `news_update` | `routes/news.js` |
| Удаление новости | `news_delete` | `routes/news.js` |
| Создание события | `event_create` | `routes/events.js` |
| Изменение события | `event_update` | `routes/events.js` |
| Удаление события | `event_delete` | `routes/events.js` |

### Хелперы логирования

`backend/utils/logActivity.js` — два хелпера:

```js
logActivity({ userId, username, action, targetType, targetId, fileName, fileType, fileSize, fileCount, ip, details })
```
- fire-and-forget; никогда не бросает исключений
- `targetId` для `file_upload` = fileUrl (`/uploads/...`) — используется для ссылки в логах и для `markFileDeletedInLogs`

```js
await markFileDeletedInLogs(fileUrl)
```
- Обнуляет `file_size` и `target_id` в `activity_logs` для записи с `target_id = fileUrl`
- Вызывать с `await` при физическом удалении файла — статистика "Занято на диске" уменьшится немедленно
- Вызывается в: `routes/images.js` (profile/group delete), `routes/albums.js` (album delete + item delete), `routes/posts.js` (post delete/edit), `routes/logs.js` (admin file delete via logs page)

### Страница LogsPage (`src/pages/Dashboard/LogsPage.jsx`)

- Редирект на `/auth` если не авторизован, на `/` если роль ниже admin
- **Секция статистики**: 3 карточки (файлов загружено / занято на диске / действий всего) + топ по объёму загрузок
- **Топ загрузчиков**: показывает первые 5 строк, кнопка «Показать ещё +5» раскрывает по 5, кнопка «Свернуть ↑» сворачивает и скроллит к началу (`pageTopRef`)
- **Фильтр по типу**: таб-кнопки «Все / Загрузки файлов / Удаления файлов / Посты / Удаления постов / Новости / Удаления новостей / События / Удаления событий»; «Новости» и «События» фильтруют по `action=X_create,X_update` (запятая = IN)
- **Поиск по нику**: поле с автодополнением (debounce 220 мс, `GET /api/logs/users?q=X`); дропдаун закрывается по `mousedown` вне (`searchWrapRef`); `onMouseDown` на подсказках (не `onClick`) — чтобы blur не закрыл дропдаун раньше клика
- Клик по нику в таблице → фильтрация по этому игроку + скролл к началу
- **Таблица**: Игрок (аватарка + ник + ↗ профиль) / Действие (бейдж с цветом по типу) / Файл или описание / Размер (с цветовой подсветкой >10/100/500 МБ) / Тип MIME / Дата / Действия
  - Столбец «Файл»: если `targetId` начинается с `/uploads/` — рендерится как кликабельная ссылка `<a href=... target="_blank">` (открывает файл в новой вкладке); класс `.logs-page__cell-file--link`
  - Столбец «Действия»: для `file_upload`-записей с `targetId` — кнопка 🗑 удаления файла; вызывает `DELETE /api/logs/:id/file`, после чего `targetId` обнуляется и кнопка/ссылка исчезают из строки (без перезагрузки)
- **Пагинация**: 50 записей на страницу
- Страница без `max-width` — занимает всю ширину `.app__main`

### Цвета бейджей действий (`actionColor`)

| action | цвет |
|---|---|
| `file_upload` | `#4aff9e` (акцент) |
| `file_delete` | `#ff4a4a` (красный) |
| `post_create` | `#7eb8f7` (голубой) |
| `post_delete` | `#ff4a4a` (красный) |
| `news_create` / `news_update` | `#7eb8f7` (голубой) |
| `news_delete` | `#ff4a4a` (красный) |
| `event_create` / `event_update` | `#7eb8f7` (голубой) |
| `event_delete` | `#ff4a4a` (красный) |
| `comment_create` | `#ffd700` (золотой) |

### Важно: PostgreSQL — JOIN + WHERE с одинаковыми именами столбцов

В `GET /api/logs` основной запрос JOIN'ит `activity_logs al` и `users u` — оба имеют колонку `username`. Решение: **два отдельных WHERE-построителя**:
- `mainWhere[]` — для основного запроса (JOIN), префикс `al.username`
- `cntWhere[]` — для COUNT-запроса (без JOIN), без префикса
Один набор `params[]` используется для обоих запросов.

## Система комментариев
- Комментарии к постам: кнопка 💬 в `PostCard` разворачивает `CommentSection` (autoLoad)
- Комментарии к фото: правая панель `ImageModal`, загружаются сразу при открытии
- Комментарии к профилю: вкладка «Комментарии» на `/player/:username` — `CommentSection type="profile"` внутри `.player-page__comments-card`; вкладка видна только если есть аккаунт
- `ProfileComments` / `ProfileCommentsModal` — компоненты существуют но **не используются** в текущей реализации PlayerPage
- Удалять может только автор или администратор (`DELETE /api/comments/:id`)
- Хук `useComments({ type, id })` — управляет состоянием, пагинацией, добавлением/удалением; поддерживаемые типы: `post | image | profile | news | event`
- `CommentSection.scss` использует `--cards-*` CSS-переменные (текст, акцент, hover-фоны)
- Компоненты: `CommentSection`, `ProfileComments`, `ProfileCommentsModal` (в `src/Components/`)

### CommentSection — режимы отображения формы

| Prop | Режим | Применяется |
|------|-------|-------------|
| (по умолчанию) | Список + форма снизу, обычный поток | PostCard, профиль, галерея |
| `stickyForm={true}` | `.comment-section--modal`: flex-column, список с `overflow-y:auto`, форма `flex-shrink:0` внизу | PostModal, ImageModal (вложенный скролл) |
| `stickyBottom={true}` | `.comment-section--sticky-bottom`: обычный поток, форма в `.comment-section__form-sticky` с `position:sticky; bottom:0` | NewsDetailPage, EventDetailPage (page-level document scroll) |

- `stickyBottom` — форма прилипает к низу viewport при скролле документа через секцию комментариев; фон `rgba(10,10,26,0.97)` + `backdrop-filter:blur(8px)` чтобы перекрывать контент

## Система личных сообщений
- Страница `/messages` — двухколоночный макет: список диалогов слева (300px) + чат справа
- Открыть чат с конкретным пользователем: `/messages?user=<minecraft_username>`
- Диалог **создаётся только при первой отправке сообщения** (GET истории не создаёт диалог)
- Список диалогов показывает только тех, с кем реально переписывались
- Polling каждые 5 секунд при открытом чате (обновляет новые сообщения, статус прочтения)
- Оптимистичное обновление при отправке: сообщение сразу появляется справа с `senderId = user.id`
- Прочтение: входящие помечаются как прочитанные при открытии чата (is_read=1, read_at=timestamp)
- Удаление сообщения («отозвать»): только отправитель, `DELETE /api/messages/:id`
- Вложения: изображения — превью в пузыре, клик → лайтбокс; другие файлы — иконка + скачать
- Аватарки — квадратные с скруглёнными углами (`border-radius: 6px`), т.к. голова скина Minecraft
- Хук `useMessages()` — состояние диалогов, сообщений, отправка, удаление, пагинация
- Компоненты: `ConversationList`, `ChatWindow`, `MessageInput`, `FileIcon` (в `src/Components/`)
- Роутеры бэкенда: `conversationsRouter` → `/api/conversations`, `messagesDeleteRouter` → `/api/messages`

## Система опросов

Опросы можно создавать внутри **новостей** (через кнопку 📊 в тулбаре RichTextEditor) и **постов** (через кнопку 📊 в PostForm). Один опрос привязан к одной новости или одному посту.

### Компоненты

- **`PollBuilder`** (`src/Components/PollBuilder/`) — конструктор: вопрос, описание, варианты ответа (2–25), настройки. Вызывается из RichTextEditor, PostForm и PollViewer через portal-модал. Props: `onConfirm(pollData)`, `onCancel()`, `initialData?` — если передан, переходит в режим редактирования (заголовок «✏️ Редактировать опрос», кнопка «Сохранить»). В режиме редактирования `options` в `pollData` — массив `[{id?, text}]`; в режиме создания — массив строк. Варианты с `votesCount > 0` нельзя удалить (кнопка удаления задизейблена с подсказкой). **Оверлей не закрывается по клику вне окна** — только через кнопку ✕.
- **`PollViewer`** (`src/Components/PollViewer/`) — отображение опроса: голосование (radio/checkbox), прогресс-бары результатов, пагинация вариантов (по 5), кнопка «Добавить вариант», «Изменить ответ». Цвета через `--cards-*` CSS-переменные. Кнопка **✏️** в шапке видна **только автору контента** (`user.id === poll.authorId`) — бэкенд возвращает `authorId` из таблицы `posts.user_id` или `news.author_id`; открывает PollBuilder в режиме редактирования через portal; сохранение вызывает `PUT /api/polls/:id` с обновлёнными полями и вариантами.
- **`VotersModal`** (`src/Components/VotersModal/`) — portal-модал со списком проголосовавших. Режим `mode='option'` — один вариант, `mode='all'` — все варианты. Для анонимных опросов — только числа.

### Интеграция в новости

- В тулбар RichTextEditor добавлена кнопка **📊**. Доступна при наличии prop `onCreatePoll`. Открывает PollBuilder через portal.
- После создания опроса в редактор вставляется блок `div.rte-poll-marker[data-poll-id]` — видимая плашка «📊 Опрос: вопрос».
- `NewsDetailPage` рендерит контент через `NewsContent` — разбивает HTML на части, заменяя маркеры (`[POLL:...]`, `[SLIDER:...]`, `[PLAYERLIST:...]`, `[IMAGEROW:...]`) на соответствующие компоненты. После рендера `useEffect` обходит все `<a>` и проставляет `target="_blank" rel="noopener noreferrer"`. Event delegation обрабатывает клики по `<img>` → открывает `ImageModal` (`showSidebar=false`).
- При создании новой новости опросы создаются без `news_id` (admin разрешено) и хранятся в `pendingPollIdsRef`; после сохранения новости все pending-опросы патчатся через `PUT /api/polls/:id` с `news_id`.
- При редактировании новости удаление маркера опроса из редактора вызывает `deleteOrphanedPolls()` в `PUT /api/news/:slug` — опросы, которых нет в новом контенте, удаляются из БД (вместе с голосами через CASCADE).

### Интеграция в посты

- В нижней панели PostForm добавлена кнопка **📊**. Открывает PollBuilder через portal. Текст поста необязателен если есть опрос.
- Опрос хранится в `pendingPoll` (state), не создаётся до отправки поста.
- Поток после публикации: `onSubmit(content, attachments)` → `createPost` добавляет пост в ленту с `pollId: null` → `POST /api/polls` с `post_id` → `onPollLinked(postId, pollId)` → `patchPost(postId, { pollId })` обновляет пост в ленте — PollViewer появляется без перезагрузки.
- **`onSubmit` в FeedPage и PlayerPage возвращает объект поста** (`return await createPost(...)`). PostForm принимает опциональный `onPollLinked(postId, pollId)`.
- PostCard и PostModal: если `post.pollId` задан — рендерят `<PollViewer>` над текстом поста.
- API `GET /api/posts` возвращает `pollId` (subquery: `SELECT id FROM polls WHERE post_id = p.id LIMIT 1`).

### Таблицы БД (миграция 023)

**polls:**
- `id` TEXT PK; `news_id` → news.id CASCADE; `post_id` → posts.id CASCADE
- `question` TEXT NOT NULL (≤300); `description` TEXT (≤500)
- `is_anonymous`, `allow_multiple`, `allow_add_options`, `allow_change_vote`, `shuffle_options` INTEGER DEFAULT 0
- `total_votes` INTEGER DEFAULT 0; `ends_at` INTEGER; `created_at` INTEGER

**poll_options:**
- `id` TEXT PK; `poll_id` → polls.id CASCADE; `option_text` TEXT NOT NULL (≤200)
- `votes_count` INTEGER DEFAULT 0; `order_index` INTEGER DEFAULT 0; `created_at` INTEGER

**poll_votes:**
- `id` TEXT PK; `poll_id` → polls.id CASCADE; `option_id` → poll_options.id CASCADE; `user_id` → users.id CASCADE
- UNIQUE INDEX на `(poll_id, option_id, user_id)`

**events** (migration 028):
- `id` TEXT PK (UUID)
- `author_id` TEXT NOT NULL → users.id ON DELETE CASCADE
- `title` TEXT NOT NULL (≤200)
- `slug` TEXT UNIQUE NOT NULL — URL-идентификатор (translit + уникальный суффикс)
- `preview_image_url` TEXT — превью для карточки и шапки
- `content_main` TEXT — основная информация (HTML из RichTextEditor)
- `content_results` TEXT — итоги (HTML из RichTextEditor, NULL пока не заполнено)
- `start_time` INTEGER NOT NULL — unix timestamp начала события
- `end_time` INTEGER — unix timestamp окончания (NULL = без конца)
- `is_published` INTEGER DEFAULT 1 — 1 = опубликовано
- `published_at` INTEGER — unix timestamp первой публикации
- `updated_at` INTEGER — unix timestamp последнего редактирования
- `edited_count` INTEGER DEFAULT 0
- `views` INTEGER DEFAULT 0 — счётчик просмотров (один раз в 24ч с одного IP)
- `created_at` INTEGER DEFAULT (strftime('%s', 'now'))
- INDEX on slug, published_at, start_time

**albums** (migration 025):
- `id` TEXT PK; `user_id` → users.id CASCADE; `name` TEXT NOT NULL (≤100)
- `created_at`, `updated_at` INTEGER

**album_images** (migration 025):
- `id` TEXT PK; `album_id` → albums.id CASCADE; `image_id` → images.id CASCADE
- `added_at` INTEGER; UNIQUE(album_id, image_id)

**activity_logs:**
- `id` TEXT PK (UUID)
- `user_id` TEXT → users.id ON DELETE SET NULL — может стать NULL если аккаунт удалён
- `username` TEXT NOT NULL — ник на момент действия (денормализация; не меняется при смене ника)
- `action` TEXT — тип действия: `'file_upload'` | `'file_delete'` | `'post_create'` | `'post_delete'` | `'comment_create'` | `'news_create'` | `'news_update'` | `'news_delete'` | `'event_create'` | `'event_update'` | `'event_delete'`
- `target_type` TEXT — уточнение цели: `'post'` | `'cover'` | `'message'` | `'gallery'` | `'profile'` | `'album'` и т.д.
- `target_id` TEXT — id целевого объекта (поста, изображения и т.п.)
- `file_name` TEXT — оригинальное имя файла
- `file_type` TEXT — MIME-тип файла
- `file_size` INTEGER — размер в байтах
- `file_count` INTEGER DEFAULT 1 — количество файлов в пакетной операции
- `ip` TEXT — IP-адрес пользователя
- `details` TEXT — JSON-строка с дополнительными данными (например, `{ preview: 'первые 80 символов поста' }`)
- `created_at` INTEGER DEFAULT unix_now()
- INDEX on user_id, created_at DESC, action
- **Не имеет CASCADE** на users — запись остаётся при удалении аккаунта (историческая запись)

**images** — дополнительные поля:
- `is_gallery` INTEGER DEFAULT 1 (migration 024) — 1 = видно в глобальной галерее; `DELETE /api/images/album/:groupId` устанавливает 0; профильное удаление альбомных файлов тоже устанавливает 0
- `show_in_profile` INTEGER DEFAULT 1 (migration 026) — 1 = видно на вкладке «Фото» профиля; устанавливается в 0 когда альбомный файл удаляется из профиля (но не физически — он остаётся в альбоме)

## Система новостей

### Страница списка `/news`
- Галерейная сетка 3 колонки (2 на планшете, 1 на мобилке), без группировки по дням
- `NewsCard` — карточка: изображение сверху (16:9, object-fit: cover), заголовок + дата + просмотры + комментарии снизу
- Кнопка «+ Написать новость» — только для admin
- `timeAgo` принимает **миллисекунды** → передаём `publishedAt * 1000`

### Страница новости `/news/:slug`
- Полный HTML-контент рендерится через компонент `NewsContent` (не напрямую `dangerouslySetInnerHTML`) — парсит маркеры опросов, слайдеров, списков игроков
- **Лайтбокс изображений**: `NewsContent` принимает `onOpenLightbox(images, index)`. Клик по `<img>` в HTML-контенте открывает `ImageModal` (`showSidebar=false`) со всеми HTML-изображениями страницы. Ряды изображений (`ImageRowViewer`) открываются отдельно — только картинки своего ряда. Изображения внутри `.slider-viewer`, `.player-list-viewer`, `.image-row-viewer` исключаются из event delegation (у каждого свой обработчик). `.news-content img` имеет `cursor:pointer` и `opacity:0.88` hover
- Форма комментария использует `stickyBottom={true}` — прилипает к низу viewport при скролле через секцию комментариев
- Счётчик просмотров (`views`): **один просмотр в 24 ч с одного IP** — in-memory Map в `backend/routes/news.js`, очищается раз в час. Перезагрузка сервера сбрасывает счётчик ограничений (не критично). Счётчик **не отображается** на странице.
- Шапка: `.news-detail__byline` — автор (ссылка на профиль, без аватарки) **слева**, дата публикации **справа** (`justify-content: space-between`); аватарка и просмотры убраны
- Информация об изменении (`editedCount > 0`) — выводится после контента в `.news-detail__edited` (text-align: right), НЕ в шапке
- CSS-классы выравнивания в `.news-content`: `.rte-media-align-left` (float:left, max-width:50%), `.rte-media-align-center` (margin:auto), `.rte-media-align-right` (float:right); clearfix через `&::after { clear:both }`

### Редактор новостей `/dashboard/news/create` и `/dashboard/news/:slug/edit`
- Только admin, компонент `NewsCreate.jsx`
- Поля: превью-изображение (URL или загрузка), заголовок (max 200), контент (RichTextEditor)
- Режим предпросмотра — переключатель ✏️/👁; предпросмотр рендерит `NewsPreviewContent` — та же логика парсинга маркеров, что `NewsContent` на странице новости
- `ImageUpload` для превью использует `showPreview={false}` — иначе изображение появилось бы дважды
- `POST /api/news/upload-image` принимает **изображения и видео** (max 1 ГБ), возвращает `{ url, fileType }`
- `allPlayers` из `usePlayer()` передаётся в `RichTextEditor` для кнопки 👥

### SliderViewer (`src/Components/SliderViewer/`)
- Карусель изображений/видео — вставляется в тело новости через маркер `div.rte-slider[data-images]`
- Props: `images` — `[{ url, fileType }]`, `cssVars` — CSS-переменные `--cards-*`
- `__main` имеет `aspect-ratio: 16/9; overflow:hidden` — фиксированная высота контейнера предотвращает прыжки страницы при переключении картинка↔видео
- Картинка и видео: `width:100%; height:100%; object-fit:contain` — заполняют контейнер без деформаций
- Стрелки ‹ › — `position:absolute; top:0; bottom:0; width:72px; background:transparent`; hover → `rgba(255,255,255,0.07)` + `--cards-accent-color`
- При видео (класс `.slider-viewer--video` на корне) — стрелки получают `bottom:120px`, освобождая нативную панель управления браузера
- Клик по изображению → открывает `ImageModal` со всеми слайдами; для видео функция открытия через ImageModal не реализована
- Стрип миниатюр: 56×56px, `justify-content:center`, `background:transparent`; активная — `scale(1.08)` + border `--cards-accent-color`; для видео-миниатюр — `<video src="#t=0.1" preload="metadata">`
- `.slider-viewer__strip-thumb` использует `position:absolute; inset:0; object-fit:cover` — обходит `.news-content img { height:auto; margin:16px 0; border-radius:12px }` (specificity 0,1,1 > 0,1,0)
- `albumRanges = [{ startIndex:0, items: modalImages }]` — все слайды как один альбом, ImageModal показывает полный стрип
- При переключении — `scrollIntoView` активной миниатюры в стрипе
- **Важно:** `.news-content` в `NewsDetailPage.scss` имеет правила `img`/`a`/`video` со специфичностью (0,1,1), которые перебивают стили компонентов (0,1,0). Решение: `!important` или `position:absolute; inset:0` для обхода

### PlayerListViewer (`src/Components/PlayerListViewer/`)
- Grid-список игроков, 3 колонки (`grid-template-columns: repeat(3, 1fr)`) — вставляется в тело новости через маркер `div.rte-player-list[data-players]`
- Props: `players` — `[{ name, uuid }]`, `cssVars` — CSS-переменные `--cards-*`
- Каждый элемент: flex-строка — аватарка 48px (`border-radius:6px`, без border) слева, имя справа (`font-size:1rem; font-weight:600`); ссылка `<Link to="/player/:name">`
- Hover: фон `rgba(255,255,255,0.05)`, имя → `--cards-accent-color`
- `text-decoration: none !important` — перебивает `.news-content a { text-decoration: underline }` (0,1,1)

### RichTextEditor (`src/Components/RichTextEditor/`)
- Основан на `contentEditable` + `document.execCommand` (deprecated в TypeScript-типах, но работает во всех браузерах)
- **Тулбар**: B / I / H2 / H3 / H4 / ¶ / ❝ / •— / 1. / — / 🔗 / Медиа / URL / ⬅ ⬛ ➡ / 🎠 / 🖼️ / 👥 / 📊
- **Sticky-шапка**: тулбар и медиа-бар обёрнуты в `.rte__sticky-header` (`position: sticky; top: var(--header-h, 64px); z-index: 10`) — оба блока приклеиваются вместе под хедером при прокрутке. `.rte` использует `overflow: clip` (не `hidden`) чтобы не создавать scroll-container, который подавил бы sticky
- **Редактор** (`.rte__editor`): `min-height: 320px`, без `max-height` и `overflow-y` — высота растёт по содержимому, скролла внутри нет
- **Активное состояние**: `selectionchange` → `queryCommandState/Value` → подсветка активной кнопки (`rte__btn--active`); ссылка определяется через `closest('a')` вручную
- **Blockquote**: Enter → выходит в `<p>`; повторный клик ❝ — тоже выходит в `<p>`
- **Заголовки**: Enter → выходит в `<p>` (H2/H3/H4 не продолжаются)
- **Горизонтальная линия** (—): `execCommand('insertHorizontalRule')`
- **Медиа** (кнопка «Медиа»): загрузка файла `image/*,video/*`; изображения вставляются как `<img style="width:400px">`, видео — как `<video style="width:400px"><p><br></p>` (фикс курсора — после `<video>` браузер не создаёт пустой текстовый узел)
- **URL** (кнопка «URL»): `prompt` → YouTube → `<iframe embed>`, mp4/webm/ogg → `<video><p><br></p>`, иначе → `<iframe>`; iframe получает `aspect-ratio:16/9` в CSS
- **Гиперссылки** (кнопка 🔗): выделить текст → `prompt` с URL → `execCommand('createLink')`; после этого `setAllLinksBlank()` делает `querySelectorAll('a')` и проставляет `target="_blank" rel="noopener noreferrer"` всем ссылкам (выбирать через `window.getSelection()` после `createLink` ненадёжно); если курсор внутри ссылки — `prompt` с текущим `href` (очистить = удалить через `execCommand('unlink')`). **Важно**: `setAllLinksBlank` должен быть объявлен до `handleToolbarClick`, иначе temporal dead zone в dependency array `useCallback`
- **Изменение размера медиа**: клик на img/video → панель `.rte__media-bar` (внутри `.rte__sticky-header`) с кнопками S(200px)/M(400px)/L(600px)/Full(100%) + числовой инпут в пикселях + кнопки выравнивания (⬅ ⬛ ➡) + кнопки курсора (↑¶ ¶↓); **iframe** имеют `pointer-events:none` в CSS — клики перехватываются bounding box (±4px буфер) в `handleEditorMouseDown`; у iframe не задаётся `height:auto` при ресайзе (сохраняется `aspect-ratio:16/9`); выбранный элемент получает класс `rte-selected` (outline #4aff9e)
- **Выравнивание медиа** (кнопки ⬅ ⬛ ➡ в media-bar): применяет `margin`-выравнивание инлайн-стилем — **НЕ `float`**; `float` создаёт обтекание и утягивает следующий элемент в тот же ряд, поэтому для предсказуемого позиционирования используется только `margin-left/right: auto`; для текстового блока (без выбранного медиа) — `execCommand('justifyLeft/Center/Right')`
- **Кнопки курсора ↑¶ и ¶↓** (в media-bar): переставляют курсор в параграф-разделитель выше/ниже выбранного медиа; если `<p>` уже есть — переходят в него; если нет — создают новый. Решают проблему «невозможно поставить курсор рядом с медиа»
- **Слайдер** (кнопка 🎠): вставляет `div.rte-slider[data-images=encoded-JSON]` — плашка «🎠 Слайдер: N файлов». **Клик по плашке** открывает `SliderModal` в режиме редактирования; существующие файлы загружаются как `isExisting:true`. Доступна только при наличии `onUploadImage`
- **Ряд изображений** (кнопка 🖼️): вставляет `div.rte-image-row[data-images=encoded-JSON]` — плашка «🖼️ Ряд: N файлов». Тот же `SliderModal` (с `title`/`editTitle` пропами), но маркер отличается классом `rte-image-row`. На странице новости рендерится как `ImageRowViewer` — flex-ряд, все изображения видны одновременно. **Клик по плашке** открывает модал редактирования. Доступна только при наличии `onUploadImage`
- **Список игроков** (кнопка 👥): вставляет `div.rte-player-list[data-players=encoded-JSON]` — плашка «👥 Игроки: имена». **Клик по плашке** открывает модал в режиме редактирования с предвыбранными игроками (кнопки «Сохранить» и «Удалить»). Доступна только при наличии пропа `allPlayers`
- **Опрос** (кнопка 📊): создаётся через `onCreatePoll`; редактирование — только через кнопку ✏️ в `PollViewer` на странице новости (не из редактора)
- **Защита медиа от случайного удаления**: `isIsolatedBlock(node)` — предикат, true для `contenteditable="false"` маркеров, `<video>`, `<iframe>`, а также `<p>`/`<div>` содержащих единственный `<img>`/`<video>`/`<iframe>`. `ensureMarkerSeparators(el)` — вызывается при каждом `handleInput`, **а также при инициализации и загрузке контента** (не только на ввод), гарантирует `<p><br></p>` вокруг каждого изолированного блока. Пустые `<p>` получают CSS-подсказку при наведении `← нажмите для ввода текста`. `handleKeyDown` блокирует Backspace/Delete когда курсор стоит у границы изолированного блока
- **Видео/iframe**: все `focus()` вызовы при клике на медиа используют `{ preventScroll: true }` — предотвращает прыжок страницы наверх при клике на видео
- `SliderModal` принимает `title` и `editTitle` пропы для кастомного заголовка; используется и для слайдера, и для ряда изображений
- **Стили модалей** (`SliderModal`, `PlayerModal`, PollBuilder-оверлей) — полностью в SCSS (`RichTextEditor.scss`), инлайн-стилей нет. Классы: `.rte__modal-overlay`, `.rte__modal-box` (`--narrow` для PlayerModal), `.rte__modal-header`, `.rte__modal-title`, `.rte__modal-close`, `.rte__modal-grid`, `.rte__modal-thumb`, `.rte__modal-thumb-preview`, `.rte__modal-thumb-placeholder`, `.rte__modal-thumb-name`, `.rte__modal-thumb-remove`, `.rte__modal-add-btn`, `.rte__modal-actions`, `.rte__modal-actions-right`, `.rte__modal-cancel`, `.rte__modal-confirm`, `.rte__modal-delete`, `.rte__modal-search`, `.rte__modal-list`, `.rte__modal-empty`, `.rte__modal-player` (`--selected`), `.rte__modal-player-checkbox/avatar/name`, `.rte__modal-selected-count`, `.rte__modal-poll-inner`
- **Кнопки тулбара B/I** — визуальные стили (`font-weight:700`, `font-style:italic`) заданы через классы `.rte__btn--bold` / `.rte__btn--italic` в SCSS; в массиве `TOOLBAR` используется поле `cls` вместо `style`
- Props: `value` (HTML), `onChange(html)`, `onUploadImage(file) → { url, fileType? }`, `onCreatePoll(pollData) → { id }` (опционально), `allPlayers` (массив из PlayerContext, опционально), `placeholder`

### ImageRowViewer (`src/Components/ImageRowViewer/`)
- Flex-ряд изображений/видео — вставляется в тело новости через маркер `div.rte-image-row[data-images]`
- Props: `images` — `[{ url, fileType }]`, `cssVars` — CSS-переменные `--cards-*` (опционально), `onImageClick(idx)` — callback открытия лайтбокса; при передаче изображения получают `cursor:pointer` + класс `--clickable` (hover opacity 0.88)
- Два изображения: `max-width: calc(50% - 4px)` каждое; три и более: `max-width: calc(33.33% - 6px)` для третьего+; одно: `width: 100%`
- `flex-wrap: wrap` — при узком экране изображения переносятся
- Видео в ряду не получают `onImageClick` (только `<img>` элементы кликабельны)

### Маркеры в HTML-контенте новостей

Редактор вставляет `contenteditable="false"` div-блоки, которые при сохранении остаются в HTML. `NewsContent` (в NewsDetailPage) и `NewsPreviewContent` (в NewsCreate) нормализуют их в текстовые токены и разбивают контент на части:

| Div-маркер в редакторе | Текстовый токен | Рендерится как |
|---|---|---|
| `div.rte-poll-marker[data-poll-id]` | `[POLL:uuid]` | `<PollViewer pollId=...>` |
| `div.rte-slider[data-images=JSON]` | `[SLIDER:encoded]` | `<SliderViewer images=...>` |
| `div.rte-player-list[data-players=JSON]` | `[PLAYERLIST:encoded]` | `<PlayerListViewer players=...>` |
| `div.rte-image-row[data-images=JSON]` | `[IMAGEROW:encoded]` | `<ImageRowViewer images=...>` |

- `parseContentParts(html)` — функция разбивает нормализованный HTML на массив `{type, ...}` частей
- Части `{type:'html'}` рендерятся через `dangerouslySetInnerHTML`
- Функция `normalizeContent(html)` заменяет div-маркеры токенами через regex; SEP-символ `\x00` используется как разделитель чтобы не смешивать токены с соседним HTML

## Система событий

### Страница списка `/events`
- Галерейная сетка 3 колонки (2 на планшете, 1 на мобилке), без группировки
- `EventCard` — карточка с превью-изображением (16:9, object-fit:cover) + таймер поверх изображения (`position:absolute; bottom:10px; right:10px`)
- Таймер обновляется каждые 60 секунд через `setInterval`; логика `getTimerLabel(startTime, endTime)`:
  - `delta > 0` (ещё не началось) → «Через X д Y ч Z мин» (зелёный)
  - `start_time ≤ now ≤ end_time` или нет `end_time` и уже началось → «В процессе» (жёлтый, класс `--started`)
  - `now > end_time` → «Завершено» (жёлтый, класс `--started`)
- Кнопка «+ Создать событие» — только для admin; ссылка на `/dashboard/events/create`
- `timeAgo` принимает **миллисекунды** → передаём `startTime * 1000`

### Страница события `/events/:slug`
- Компонент `EventDetailPage`; данные загружаются через `GET /api/events/:slug`
- Заголовок и таймер (`EventTimer`) в одной строке `.event-detail__title-row`
- **Две вкладки**: «Основная информация» (всегда) и «Итоги» (скрыта если `contentResults` пуст)
- Контент рендерится через `EventContent` — та же логика парсинга маркеров (`parseContentParts` / `normalizeContent` / SEP `\x00`), что и `NewsContent`, поддерживает PollViewer, SliderViewer, PlayerListViewer, ImageRowViewer. Принимает `onOpenLightbox` — та же механика лайтбокса, что в `NewsContent` (event delegation + ImageRowViewer `onImageClick`)
- Счётчик просмотров: один просмотр в 24ч с одного IP — in-memory Map в `backend/routes/events.js`
- Комментарии: `<CommentSection type="event" id={event.id} stickyBottom={true} />`

### Редактор события `/dashboard/events/create` и `/dashboard/events/:slug/edit`
- Только admin, компонент `EventCreate.jsx`
- Поля: превью-изображение (URL или загрузка), заголовок (max 200), даты начала/окончания (`datetime-local`, сетка 2 колонки)
- Вспомогательные функции: `tsToDatetimeLocal(ts)` — unix timestamp → строка YYYY-MM-DDTHH:MM; `datetimeLocalToTs(str)` — обратно
- **Единый `activeTab`** (`'main' | 'results'`) — общий для режима редактора и режима предпросмотра; один объект `tabBar` переиспользуется в обоих режимах
- В редакторе: tabBar располагается между датами и редактором; активный RTE условно рендерится (`key="editor-main"` / `key="editor-results"`) — переключение вкладки перемонтирует редактор, инициализируя его из текущего state
- В предпросмотре: заголовок → tabBar → превью-изображение → контент
- Два отдельных `useRef` для контента: `mainContentRef` / `resultsContentRef` — хранят актуальный HTML без лишних ре-рендеров
- Опросы: `handleCreatePoll` передаётся как `onCreatePoll` в оба RichTextEditor (`POST /api/polls` без `news_id` / `post_id` — admin-разрешено); удаление orphan-опросов при редактировании **не реализовано**
- `allPlayers` из `usePlayer()` передаётся в RTE для кнопки 👥
- `POST /api/events/upload-image` принимает изображения и видео (max 1 ГБ), возвращает `{ url, fileType }`

## Управление игроками (Home — карточки)

На главной странице `/` каждая карточка игрока (`PlayerCard`) имеет кнопку `⋮` (три вертикальные точки) в правом верхнем углу — видна только для `admin` и `creator`. Кнопка без фона, при наведении становится белой.

При клике `⋮` → кнопка превращается в `✕`, а **содержимое карточки заменяется меню** (аватар/divider/ник скрываются). При клике `✕` или вне карточки — содержимое возвращается. Профиль сайта загружается через `GET /api/users/by-minecraft/:name` при первом открытии меню.

Пункты меню:
- **Сделать администратором** — `PUT /api/users/:id/role { role: 'admin' }` (только creator; скрыта если игрок уже admin)
- **Сделать редактором** — `PUT /api/users/:id/role { role: 'editor' }` (скрыта если игрок уже editor)
- **Сделать игроком** — `PUT /api/users/:id/role { role: 'user' }` (скрыта если игрок уже user)
- **Забанить / Разбанить** — доступно для **любого** игрока; при бане открывается `showPrompt` (кастомный диалог) для ввода причины (необязательно); пустая строка = бан без причины, `null` = отмена

Кнопки смены роли показываются только если у игрока есть аккаунт (`profile !== null`) и его роль ниже роли текущего пользователя (`targetLevel < callerLevel`). Нельзя управлять собственной ролью.

Кнопка бана/разбана всегда доступна, кроме случая когда `profile !== null` и `targetLevel >= callerLevel` (нельзя банить равного или высшего).

**Механика бана (унифицированная):**
- Фронт **всегда** вызывает `POST /api/players/ban-by-name/:name` (или `unban-by-name`) — единый эндпоинт для всех игроков
- Бэкенд сам определяет тип: если игрок найден с настоящим UUID → обновляет `players` + `users`; иначе → создаёт/обновляет запись `offline:<name>`
- Причина бана (`reason`) передаётся в теле запроса, сохраняется в `players.ban_reason` и `users.ban_reason`
- После вызова API → `setBanOverride(rawUuid, username, isBanned, banReason)` в `PlayerContext` — визуальное обновление мгновенно применяется ко всем карточкам

**`PlayerContext` — ключевые поля:**
- `banOverrides` — dict `{ uuid | 'name:xxx' → { isBanned, banReason } }` — мгновенные оверрайды; живут в контексте, не сбрасываются при навигации
- `rawUuid` — полный UUID включая `'offline:...'` (для ban endpoint); `null` для offline-записей в отображаемом `uuid`
- `setBanOverride(rawUuid, username, isBanned, banReason?)` — записывает оверрайд по UUID и по имени
- Каждый enhanced player содержит поля `isBanned` и `banReason`

**Забаненный игрок** (карточка со статусом `banned`):
- Красный divider вместо зелёного/серого
- Красная обводка карточки
- При наведении на карточку — tooltip с причиной бана (`🚫 <текст причины>`) снизу карточки (только если причина задана)
- Визуальный статус обновляется **мгновенно** после бана/разбана без перезагрузки страницы
- В Home список сортируется: забаненные — в конце

`PlayerCard` принимает пропы: `username`, `status` (`'online'|'offline'`), `currentUser`, `token`

## Что не реализовано
- [ ] Удаление файла с диска при удалении фото из галереи (`images`) и сообщений (`messages`) — для сообщений; для альбомного удаления — реализовано
- [ ] Уведомление игрока об одобрении/отклонении заявки
- [ ] Редактирование комментариев и сообщений (только удаление)
- [ ] WebSocket для real-time сообщений (сейчас polling каждые 5 сек)
- [ ] Метаданные вложений постов: `duration`, `width`, `height` — поля в БД есть, но не заполняются при загрузке

## Соглашения
- Стили — SCSS с BEM, файл рядом с компонентом (`Component.jsx` + `Component.scss` или общий `Auth.scss`)
- Цвета: зелёный акцент `#4aff9e`, фон карточек `#1a1a1a`, фон страницы `#0a0a1a`, красный `#ff4a4a`
- Текст ошибок — `#ff6b6b`
- CSS-переменные профиля задаются inline style на `<main class="player-page">` и каскадируют на дочерние элементы (см. раздел «UI-кастомизация»)
- Все пользовательские тексты на **русском языке**
- snake_case в SQLite, camelCase в JS/React — преобразование в роутах
- Аватарки Minecraft везде квадратные с `border-radius: 4–6px` (не круглые)
- Кнопки «Опубликовать», «Отправить», «+ Добавить фото» используют акцентный цвет фоном (`--cards-accent-color`) и тёмный текст `#0a0a1a`. Если пользователь поставит чёрный акцент — текст сольётся. Намеренно не исправляется (нет поля для цвета текста кнопок в редакторе профиля).
- **Кастомные диалоги** (вместо `window.confirm` / `window.prompt` / `alert`): `src/Components/Dialog/` — три файла: `dialogManager.js` (синглтон), `Dialog.jsx` (`DialogRenderer` монтируется в `App.jsx` один раз), `Dialog.scss`. API: `showConfirm(msg, opts?)` → `Promise<boolean>`, `showPrompt(msg, opts?)` → `Promise<string|null>` (`null` = отмена, `""` = подтверждено без текста), `showAlert(msg, opts?)` → `Promise<void>`. Поведение при клике вне: `confirm` — закрывается, `prompt` и `alert` — только кнопками/Escape. **Все** `window.confirm` / `window.prompt` / `alert` в проекте заменены на эти функции.
- `FileIcon` (`src/Components/FileIcon/FileIcon.jsx`) — универсальная иконка файла по MIME-типу; используется в `PostCard`, `PostModal`, `PostForm`, `PostAttachments`, `ChatWindow`
- `EmojiPicker` (`src/Components/EmojiPicker/EmojiPicker.jsx`) — простой пикер смайликов (50 эмодзи). Props: `onSelect(emoji)`. Позиция: `position:absolute; bottom:calc(100%+6px); left:0` — открывается вверх. Родитель должен иметь `position:relative` и управлять `showEmoji` + закрытием по клику вне через `mousedown` + `useRef`. Используется в `PostForm`, `CommentSection`, `MessageInput`
- Все формы ввода (PostForm, CommentSection, MessageInput) имеют нижнюю панель: **слева** — 📎 + 😊; **справа** — счётчик символов + кнопка отправки. Стиль иконок — `background:none; border:none; color:--cards-text-dim`, hover → `--cards-accent-color`
- Загрузка файлов использует поле **`file`** (одиночный) или **`files[]`** (множественный) — принимают любые типы. Поле **`image`** — только для галереи и обложек профиля.
- Определение типа вложения: `fileType.startsWith('image/')` → изображение, `video/` → видео, `audio/` → аудио, иначе → документ. Хелперы `isImage/isVideo/isAudio/isMedia` экспортируются из `PostAttachments.jsx`
