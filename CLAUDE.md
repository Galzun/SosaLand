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
- **SQLite** (файл `backend/database.sqlite`) — база данных
- **bcryptjs** — хеширование паролей
- **jsonwebtoken** — JWT авторизация
- **uuid** — генерация уникальных ID
- **multer** — загрузка файлов (изображения и любые другие файлы)
- **cors, dotenv** — CORS и переменные окружения
- Запуск: `cd backend && npm start` → `http://localhost:3001`
- Миграции: `cd backend && npm run migrate`

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
| `/events` | Events/EventsPage | События сервера (заглушка) |
| `/messages` | Messages/MessagesPage | Личные сообщения (только авторизованные) |
| `/dashboard/tickets` | Dashboard/Tickets | Панель модерации заявок (только admin) |
| `/dashboard/profile` | Dashboard/EditProfile | Редактирование профиля (только авторизованный) |

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
| POST | `/api/auth/login` | все | Вход, возвращает JWT |
| GET | `/api/auth/me` | JWT | Данные текущего пользователя |
| POST | `/api/tickets` | все | Создать заявку на регистрацию |
| GET | `/api/tickets/admin` | admin | Список pending-тикетов |
| POST | `/api/tickets/admin/:id/approve` | admin | Одобрить заявку → создать пользователя |
| POST | `/api/tickets/admin/:id/reject` | admin | Отклонить заявку |
| GET | `/api/players` | все | Все игроки из БД |
| POST | `/api/players/sync` | все | Upsert батча онлайн-игроков |
| GET | `/api/users/:id` | все | Публичный профиль по ID |
| GET | `/api/users/by-minecraft/:name` | все | Профиль по нику Minecraft |
| GET | `/api/users/:userId/posts` | все | Посты конкретного пользователя (с commentsCount, attachments) |
| GET | `/api/users/:userId/images` | все | Фото конкретного пользователя (с commentsCount) |
| GET | `/api/users/:userId/profile-comments` | все | Комментарии к профилю (limit, offset) |
| POST | `/api/users/:userId/profile-comments` | JWT | Добавить комментарий к профилю |
| PUT | `/api/users/:id/profile` | JWT (владелец) | Обновить cover_url, background_url, bio, card_bg_* |
| POST | `/api/upload` | JWT | Загрузить файл(ы) → `/uploads/<file>`; поля: `image`, `file`, `files[]`; возвращает `{ url, fileUrl, fileType, fileName, size }` или `{ files: [...] }` |
| GET | `/api/posts` | все | Лента постов (limit, offset; с commentsCount, attachments[]) |
| POST | `/api/posts` | JWT | Создать пост; тело: `{ content, attachments?: [{fileUrl, fileType, fileName}] }` или `{ content, imageUrl? }` (legacy) |
| DELETE | `/api/posts/:id` | JWT (автор) | Удалить пост + все файлы с диска (из post_attachments и image_url) |
| POST | `/api/posts/:id/like` | JWT | Toggle лайк (ставит или убирает) |
| GET | `/api/posts/:postId/comments` | все | Комментарии к посту (limit, offset) |
| POST | `/api/posts/:postId/comments` | JWT | Добавить комментарий к посту |
| GET | `/api/images` | все | Глобальная лента фото (limit, offset; с commentsCount) |
| POST | `/api/images` | JWT | Добавить фото в галерею (imageUrl, title?) |
| DELETE | `/api/images/:id` | JWT (автор/admin) | Удалить фото из базы |
| GET | `/api/images/:imageId/comments` | все | Комментарии к фото (limit, offset) |
| POST | `/api/images/:imageId/comments` | JWT | Добавить комментарий к фото |
| DELETE | `/api/comments/:id` | JWT (автор/admin) | Удалить комментарий |
| GET | `/api/conversations` | JWT | Список диалогов текущего пользователя |
| GET | `/api/conversations/unread-count` | JWT | Число непрочитанных сообщений |
| GET | `/api/conversations/:userId/messages` | JWT | История сообщений с пользователем (не создаёт диалог) |
| POST | `/api/conversations/:userId/messages` | JWT | Отправить сообщение (создаёт диалог при первой отправке) |
| DELETE | `/api/messages/:id` | JWT (отправитель) | Удалить своё сообщение («отозвать») |

## База данных — таблицы (миграции 001–019)

**users:**
- `id` TEXT PK (UUID)
- `username` TEXT UNIQUE
- `password_hash` TEXT (bcrypt)
- `minecraft_uuid` TEXT UNIQUE
- `role` TEXT DEFAULT 'user' — 'user' | 'admin'
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
- `card_bg_color` TEXT DEFAULT '#1a1a1a' — цвет фона карточки профиля (migration 013)
- `card_bg_alpha` INTEGER DEFAULT 95 — непрозрачность фона карточки 0-100 (migration 013)
- `card_bg_blur` INTEGER DEFAULT 0 — размытие шапки профиля (migration 016)
- `post_card_bg_color/alpha/blur` — фон карточек постов (migration 016)
- `tabs_bg_color/alpha/blur` — фон вкладок (migration 016)
- `post_form_bg_color/alpha/blur` — фон формы поста (migration 016)
- `content_bg_color/alpha/blur` — фон области контента (migration 016)
- `content_wrapper_bg_color/alpha/blur` — фон шапки профиля, приоритет над card_bg (migration 016)
- `content_wrapper_border_color/width/radius/text_color/accent_color` — рамка и цвета шапки (migration 018)
- `content_border_color/width/radius/text_color` — рамка области контента (migration 018)
- `post_card_border_color/width/radius/text_color/accent_color` — рамка и цвета карточек (migration 018)
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
- `uuid` TEXT PK — Minecraft UUID
- `name` TEXT — ник (обновляется при каждом онлайне)
- `first_seen` INTEGER (unix timestamp)
- `last_seen` INTEGER (unix timestamp)

**posts:**
- `id` TEXT PK (UUID)
- `user_id` TEXT NOT NULL → users.id ON DELETE CASCADE
- `content` TEXT NOT NULL — текст поста (до 5000 символов)
- `image_url` TEXT — legacy: одно изображение (хранится для старых постов, новые используют post_attachments)
- `has_attachments` INTEGER DEFAULT 0 — флаг наличия вложений (migration 019, денормализация)
- `likes_count` INTEGER DEFAULT 0 — денормализованный счётчик лайков
- `created_at` INTEGER (unix timestamp, авто)
- `updated_at` INTEGER (unix timestamp)

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
- `title` TEXT — название фото (NULL по умолчанию, до 200 символов)
- `created_at` INTEGER DEFAULT (strftime('%s', 'now'))
- INDEX on user_id, INDEX on created_at

**comments:**
- `id` TEXT PK (UUID)
- `user_id` TEXT NOT NULL → users.id ON DELETE CASCADE — автор комментария
- `post_id` TEXT → posts.id ON DELETE CASCADE (NULL для фото/профиля)
- `image_id` TEXT → images.id ON DELETE CASCADE (NULL для поста/профиля)
- `profile_user_id` TEXT → users.id ON DELETE CASCADE (NULL для поста/фото)
- `content` TEXT NOT NULL — текст комментария (до 1000 символов)
- `created_at` INTEGER DEFAULT (strftime('%s', 'now'))
- INDEX on post_id, INDEX on image_id, INDEX on profile_user_id
- Ровно одно из post_id / image_id / profile_user_id заполнено

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
- Файлы сохраняются в `backend/uploads/` (папка в .gitignore)
- Папка создаётся автоматически при старте сервера (в `routes/upload.js`)
- Статика раздаётся через `app.use('/uploads', express.static(...))`
- Vite проксирует `/uploads/*` на `http://localhost:3001`
- Поле **`image`** — только изображения (jpg, png, gif, webp), максимум 50 МБ; используется для галереи, обложек, аватаров
- Поле **`file`** — один любой файл, максимум 50 МБ; используется для вложений в сообщениях
- Поле **`files[]`** — несколько любых файлов (до 10 за раз), максимум 50 МБ каждый; используется для вложений в постах
- Одиночный ответ: `{ url, fileUrl, fileType, fileName, size }` — `url` для обратной совместимости
- Множественный ответ: `{ files: [{ url, fileUrl, fileType, fileName, size }, ...] }`
- Имена файлов: `{timestamp}_{random}.{ext}` (уникальные)
- `fileName` (оригинальное имя) декодируется через `decodeFileName()` в `upload.js`: `Buffer.from(name, 'latin1').toString('utf8')` — исправляет русские символы, которые multer читает как Latin-1

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
5. Администратор видит красный border у кнопки «Заявки» в Sidebar (только если есть pending)
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
- `requireAuth` — проверяет JWT токен из заголовка `Authorization: Bearer <token>`
- `isAdmin` — проверяет `req.user.role === 'admin'` (используется после requireAuth)

## Система постов
- Посты создаются авторизованными пользователями через `PostForm`
- Лента `/feed` — глобальная, все посты, сортировка по дате (новые первые)
- Страница профиля `/player/:username` — вкладки: **Посты** / **Фото**
- Лайки: toggle (поставить/убрать), счётчик хранится в `posts.likes_count`
- Удаление поста: только автор; при удалении физически удаляются все файлы с диска
- Хук `usePosts({ userId?, disabled? })`: управляет состоянием, пагинацией, лайками; `disabled=true` — не загружает ничего
- `usePosts.createPost(content, attachments=[])` — `attachments` массив `[{fileUrl, fileType, fileName}]` уже загруженных файлов; строка как второй аргумент конвертируется в legacy imageUrl (обратная совместимость)
- API возвращает `commentsCount` и `attachments[]` в каждом посте

### PostForm
- Нижняя панель: **слева** — 📎 «Добавить медиа» + 😊 «Смайлики»; **справа** — счётчик символов + кнопка «Опубликовать»
- Бейдж с количеством выбранных файлов поверх иконки скрепки
- Ограничение: суммарный размер всех файлов ≤ 100 МБ (количество файлов не ограничено)
- При превышении 100 МБ — добавляются только файлы, помещающиеся в лимит, показывается сообщение об ошибке
- Превью выбранных файлов **до загрузки**: изображения/видео — миниатюра (blob URL) без рамок, аудио/документы — FileIcon + имя
- Загрузка файлов происходит **при отправке поста** (не при выборе) — один за одним с прогрессом "Загрузка 2 / 5..."
- Object URL освобождаются при удалении файла из очереди и при размонтировании

### PostCard
- Вложения отображаются через `PostAttachments` (новый формат) или legacy `imageUrl`
- `compact={true}` ограничивает медиа-сетку до 4 ячеек с оверлеем "+N"
- Текст кликабелен: обрезание/раскрытие/PostModal — поведение без изменений

### PostModal
- Вложения отображаются через `PostAttachments` в полном размере (`compact={false}`, `disableScrollLock={true}`)
- `disableScrollLock={true}` — MediaModal не снимает блокировку скролла при закрытии (PostModal управляет скроллом сам)
- `.post-modal__attachments` — медиа-сетка переопределена (`margin:0; width:100%; border-radius:0`), аудио/документы/пагинация получают `padding: 0 20px`; двойных отрицательных отступов нет
- Закрытие: клик на оверлей или Escape (крестика закрытия нет; кнопка ✕ удаления поста — только для автора)
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
- **Навигация**: кнопки (`.media-modal__nav-btn`) со стилем как `.image-modal__arrow` — `position:fixed; top:0; bottom:0; width:60px; background:transparent; border:none`; при наведении подсвечиваются `--cards-accent-color`; зоны нажатия — полная высота экрана (60px шириной)
- Кнопка ✕ закрытия + клавиатура (Esc/←/→)
- Стрип миниатюр снизу с прокруткой; активная — обводка `--cards-accent-color`
- Счётчик "N / M" + имя текущего файла

## Галерея фото
- Глобальная галерея `/gallery` — все фото всех пользователей, сетка 3 колонки
- Авторизованный пользователь может добавить фото через форму на странице галереи
- Поток: загрузка через `POST /api/upload` (поле `file`) → сохранение записи через `POST /api/images`
- Кнопка «+ Добавить фото» использует `var(--cards-accent-color, #4aff9e)` фон — в профиле подхватывает кастомизацию, в глобальной галерее применяется дефолт `#4aff9e`
- Клик по фото открывает `ImageModal` с двухколоночным макетом: фото слева, боковая панель справа
- Боковая панель `ImageModal`: автор, дата, заголовок, блок комментариев (`CommentSection type="image"`)
- При переключении между фото (`key={current.id}`) CommentSection сбрасывает своё состояние
- `ImageModal` рендерится через `ReactDOM.createPortal` в `document.body` (обходит stacking context)
- Удаление: только автор или администратор (из базы, файл на диске остаётся)
- API возвращает `commentsCount` в каждом фото (подзапрос к `comments`)
- Компоненты: `ImageUpload`, `ImageModal` (в `src/Components/`)

## Страница профиля — вкладки
- **Посты** — посты пользователя + PostForm для владельца; ширина 680px, центрированы; используют `--cards-*` CSS-переменные
- **Фото** — фото пользователя из таблицы `images`, сетка 3 колонки; владелец может добавлять и удалять; форма добавления фото использует `--cards-*` переменные
- **Комментарии** — вкладка с `CommentSection type="profile"` внутри блока `.player-page__comments-card` (карточка с `--cards-*` стилями); видна только если есть привязанный аккаунт
- Статус — поле `bio` (до 50 символов), отображается под именем прямо в шапке профиля (не во вкладке)
- Кнопка **«💬 Написать»** — отображается на чужом профиле при наличии аккаунта (`profile !== null`), только авторизованным; перенаправляет на `/messages?user=<username>`

## Sidebar — навигация
- Прозрачный (`backdrop-filter: blur`), `position: sticky`, виден всегда на десктопе (>1024px)
- На мобилке — `position: fixed`, открывается по кнопке ☰, закрывается при смене маршрута
- Пункты: Лента, Галерея, События, Сообщения (только авторизованные), Заявки (только admin)
- Бейдж на «Заявки» и «Сообщения»: красная обводка (`sidebar__item--pending`) при наличии pending/непрочитанных
- Непрочитанные сообщения опрашиваются каждые 15 секунд (`/api/conversations/unread-count`)
- Блок пользователя наверху: аватарка + имя → ссылка на профиль; или кнопка «Войти»
- Компонент: `src/Components/Sidebar/Sidebar.jsx`

## Система комментариев
- Комментарии к постам: кнопка 💬 в `PostCard` разворачивает `CommentSection` (autoLoad)
- Комментарии к фото: правая панель `ImageModal`, загружаются сразу при открытии
- Комментарии к профилю: вкладка «Комментарии» на `/player/:username` — `CommentSection type="profile"` внутри `.player-page__comments-card`; вкладка видна только если есть аккаунт
- `ProfileComments` / `ProfileCommentsModal` — компоненты существуют но **не используются** в текущей реализации PlayerPage
- Удалять может только автор или администратор (`DELETE /api/comments/:id`)
- Хук `useComments({ type, id })` — управляет состоянием, пагинацией, добавлением/удалением
- `CommentSection.scss` использует `--cards-*` CSS-переменные (текст, акцент, hover-фоны)
- Компоненты: `CommentSection`, `ProfileComments`, `ProfileCommentsModal` (в `src/Components/`)

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

## Что не реализовано
- [ ] Events — события сервера (заглушка, маршрут `/events` есть)
- [ ] Удаление файла с диска при удалении фото из галереи (`images`) и сообщений (`messages`)
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
- `FileIcon` (`src/Components/FileIcon/FileIcon.jsx`) — универсальная иконка файла по MIME-типу; используется в `PostCard`, `PostModal`, `PostForm`, `PostAttachments`, `ChatWindow`
- `EmojiPicker` (`src/Components/EmojiPicker/EmojiPicker.jsx`) — простой пикер смайликов (50 эмодзи). Props: `onSelect(emoji)`. Позиция: `position:absolute; bottom:calc(100%+6px); left:0` — открывается вверх. Родитель должен иметь `position:relative` и управлять `showEmoji` + закрытием по клику вне через `mousedown` + `useRef`. Используется в `PostForm`, `CommentSection`, `MessageInput`
- Все формы ввода (PostForm, CommentSection, MessageInput) имеют нижнюю панель: **слева** — 📎 + 😊; **справа** — счётчик символов + кнопка отправки. Стиль иконок — `background:none; border:none; color:--cards-text-dim`, hover → `--cards-accent-color`
- Загрузка файлов использует поле **`file`** (одиночный) или **`files[]`** (множественный) — принимают любые типы. Поле **`image`** — только для галереи и обложек профиля.
- Определение типа вложения: `fileType.startsWith('image/')` → изображение, `video/` → видео, `audio/` → аудио, иначе → документ. Хелперы `isImage/isVideo/isAudio/isMedia` экспортируются из `PostAttachments.jsx`
