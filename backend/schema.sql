-- schema.sql
-- Полная схема базы данных SosaLand для PostgreSQL.
-- Заменяет все 30 SQLite-миграций одним файлом.
-- Запуск: npm run migrate  (или node scripts/run-migration.js)
--
-- Таблицы идут в порядке зависимостей: сначала те, на которые ссылаются другие.

-- Функция для текущего Unix timestamp (секунды)
CREATE OR REPLACE FUNCTION unix_now() RETURNS INTEGER AS $$
  SELECT EXTRACT(EPOCH FROM NOW())::INTEGER;
$$ LANGUAGE SQL STABLE;


-- ===========================================================================
-- users
-- ===========================================================================
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  minecraft_uuid  TEXT UNIQUE,
  role            TEXT DEFAULT 'user',

  cover_url        TEXT,
  background_url   TEXT,
  bio              TEXT,
  bio_color        TEXT,
  bio_font_size    INTEGER DEFAULT 14,
  bio_font_weight  INTEGER DEFAULT 700,
  created_at       INTEGER DEFAULT (unix_now()),
  updated_at       INTEGER,

  cover_pos_x      INTEGER DEFAULT 50,
  cover_pos_y      INTEGER DEFAULT 50,
  cover_scale      INTEGER DEFAULT 100,
  cover_rotation   INTEGER DEFAULT 0,
  cover_fill_color TEXT,
  cover_blur       INTEGER DEFAULT 0,
  cover_edge       INTEGER DEFAULT 0,
  cover_edge_h     INTEGER DEFAULT 0,
  cover_edge_v     INTEGER DEFAULT 0,
  cover_container_width INTEGER DEFAULT 100,
  cover_aspect_w   INTEGER DEFAULT 4,
  cover_aspect_h   INTEGER DEFAULT 1,

  bg_pos_x         INTEGER DEFAULT 50,
  bg_pos_y         INTEGER DEFAULT 50,
  bg_scale         INTEGER DEFAULT 100,
  bg_rotation      INTEGER DEFAULT 0,
  bg_fill_color    TEXT,
  bg_blur          INTEGER DEFAULT 0,
  bg_edge          INTEGER DEFAULT 0,
  bg_edge_h        INTEGER DEFAULT 0,
  bg_edge_v        INTEGER DEFAULT 0,

  card_bg_color                   TEXT DEFAULT '#1a1a1a',
  card_bg_alpha                   INTEGER DEFAULT 95,
  card_bg_blur                    INTEGER DEFAULT 0,
  content_wrapper_bg_color        TEXT,
  content_wrapper_bg_alpha        INTEGER DEFAULT 95,
  content_wrapper_blur            INTEGER DEFAULT 0,
  content_wrapper_border_color    TEXT,
  content_wrapper_border_width    INTEGER DEFAULT 0,
  content_wrapper_border_radius   INTEGER DEFAULT 12,
  content_wrapper_text_color      TEXT,
  content_wrapper_accent_color    TEXT,
  content_wrapper_font_weight     INTEGER DEFAULT 400,

  content_bg_color      TEXT,
  content_bg_alpha      INTEGER DEFAULT 0,
  content_blur          INTEGER DEFAULT 0,
  content_border_color  TEXT,
  content_border_width  INTEGER DEFAULT 0,
  content_border_radius INTEGER DEFAULT 12,
  content_text_color    TEXT,

  post_card_bg_color     TEXT DEFAULT '#1a1a1a',
  post_card_bg_alpha     INTEGER DEFAULT 95,
  post_card_blur         INTEGER DEFAULT 0,
  post_card_border_color TEXT,
  post_card_border_width  INTEGER DEFAULT 0,
  post_card_border_radius INTEGER DEFAULT 12,
  post_card_text_color   TEXT,
  post_card_accent_color TEXT,
  post_card_font_weight  INTEGER DEFAULT 400,

  tabs_bg_color  TEXT DEFAULT '#1a1a1a',
  tabs_bg_alpha  INTEGER DEFAULT 85,
  tabs_blur      INTEGER DEFAULT 0,

  post_form_bg_color  TEXT DEFAULT '#141420',
  post_form_bg_alpha  INTEGER DEFAULT 100,
  post_form_blur      INTEGER DEFAULT 0,

  is_banned      INTEGER DEFAULT 0,
  ban_reason     TEXT,
  banned_by      TEXT,
  banned_at      INTEGER,
  password_reset INTEGER DEFAULT 0
);


-- ===========================================================================
-- tickets
-- ===========================================================================
CREATE TABLE IF NOT EXISTS tickets (
  id               TEXT PRIMARY KEY,
  minecraft_uuid   TEXT,
  minecraft_name   TEXT,
  username         TEXT,
  password_hash    TEXT,
  status           TEXT DEFAULT 'pending',
  contact          TEXT,
  created_at       INTEGER DEFAULT (unix_now()),
  approved_by      TEXT REFERENCES users(id),
  approved_at      INTEGER,
  rejection_reason TEXT
);


-- ===========================================================================
-- players
-- ===========================================================================
CREATE TABLE IF NOT EXISTS players (
  uuid       TEXT PRIMARY KEY,
  name       TEXT,
  first_seen INTEGER,
  last_seen  INTEGER,
  is_banned  INTEGER DEFAULT 0,
  ban_reason TEXT
);

-- Добавить ban_reason если таблица уже существует (безопасно)
ALTER TABLE players ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Добавить password_reset если таблица уже существует (безопасно)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset INTEGER DEFAULT 0;


-- ===========================================================================
-- posts
-- ===========================================================================
CREATE TABLE IF NOT EXISTS posts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  image_url       TEXT,
  has_attachments INTEGER DEFAULT 0,
  likes_count     INTEGER DEFAULT 0,
  edit_count      INTEGER DEFAULT 0,
  created_at      INTEGER DEFAULT (unix_now()),
  updated_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id    ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);


-- ===========================================================================
-- post_attachments
-- ===========================================================================
CREATE TABLE IF NOT EXISTS post_attachments (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  file_url    TEXT NOT NULL,
  file_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_name   TEXT,
  file_size   INTEGER,
  duration    INTEGER,
  width       INTEGER,
  height      INTEGER,
  order_index INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT (unix_now())
);

CREATE INDEX IF NOT EXISTS idx_post_attachments_post_id ON post_attachments(post_id);


-- ===========================================================================
-- likes
-- ===========================================================================
CREATE TABLE IF NOT EXISTS likes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER DEFAULT (unix_now()),
  UNIQUE(user_id, post_id)
);


-- ===========================================================================
-- images
-- ===========================================================================
CREATE TABLE IF NOT EXISTS images (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url       TEXT NOT NULL,
  file_type       TEXT,
  file_size       INTEGER,
  is_video        INTEGER DEFAULT 0,
  group_id        TEXT,
  title           TEXT,
  is_gallery      INTEGER DEFAULT 1,
  show_in_profile INTEGER DEFAULT 1,
  created_at      INTEGER DEFAULT (unix_now())
);

CREATE INDEX IF NOT EXISTS idx_images_user_id    ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_group_id   ON images(group_id);


-- ===========================================================================
-- news  (до comments — чтобы можно было сразу объявить FK)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS news (
  id                TEXT PRIMARY KEY,
  author_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  content           TEXT,
  preview_image_url TEXT,
  is_published      INTEGER DEFAULT 1,
  published_at      INTEGER,
  updated_at        INTEGER,
  edited_count      INTEGER DEFAULT 0,
  views             INTEGER DEFAULT 0,
  created_at        INTEGER DEFAULT (unix_now())
);

CREATE INDEX IF NOT EXISTS idx_news_slug         ON news(slug);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at DESC);


-- ===========================================================================
-- events  (до comments — чтобы можно было сразу объявить FK)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS events (
  id                         TEXT PRIMARY KEY,
  author_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                      TEXT NOT NULL,
  slug                       TEXT UNIQUE NOT NULL,
  preview_image_url          TEXT,
  preview_image_results_url  TEXT,
  content_main               TEXT,
  content_results            TEXT,
  start_time                 INTEGER NOT NULL,
  end_time                   INTEGER,
  is_published               INTEGER DEFAULT 1,
  published_at               INTEGER,
  updated_at                 INTEGER,
  edited_count               INTEGER DEFAULT 0,
  views                      INTEGER DEFAULT 0,
  created_at                 INTEGER DEFAULT (unix_now())
);

-- Добавить preview_image_results_url если таблица уже существует (безопасно)
ALTER TABLE events ADD COLUMN IF NOT EXISTS preview_image_results_url TEXT;

CREATE INDEX IF NOT EXISTS idx_events_slug       ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time DESC);


-- ===========================================================================
-- comments  (после news и events — FK объявляются сразу)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS comments (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  post_id          TEXT          REFERENCES posts(id)   ON DELETE CASCADE,
  image_id         TEXT          REFERENCES images(id)  ON DELETE CASCADE,
  profile_user_id  TEXT          REFERENCES users(id)   ON DELETE CASCADE,
  news_id          TEXT          REFERENCES news(id)    ON DELETE CASCADE,
  event_id         TEXT          REFERENCES events(id)  ON DELETE CASCADE,
  content          TEXT NOT NULL,
  image_url        TEXT,
  created_at       INTEGER DEFAULT (unix_now())
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id         ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_image_id        ON comments(image_id);
CREATE INDEX IF NOT EXISTS idx_comments_profile_user_id ON comments(profile_user_id);
CREATE INDEX IF NOT EXISTS idx_comments_news_id         ON comments(news_id);
CREATE INDEX IF NOT EXISTS idx_comments_event_id        ON comments(event_id);


-- ===========================================================================
-- conversations
-- ===========================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id                TEXT PRIMARY KEY,
  participant1      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant2      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message      TEXT,
  last_message_time INTEGER,
  created_at        INTEGER DEFAULT (unix_now()),
  UNIQUE(participant1, participant2)
);

CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON conversations(participant1);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON conversations(participant2);


-- ===========================================================================
-- messages
-- ===========================================================================
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  content         TEXT NOT NULL DEFAULT '',
  file_url        TEXT,
  file_type       TEXT,
  file_name       TEXT,
  files_json      TEXT,
  is_read         INTEGER DEFAULT 0,
  read_at         INTEGER,
  created_at      INTEGER DEFAULT (unix_now())
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id       ON messages(sender_id);

-- Добавить files_json если таблица уже существует (безопасно)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS files_json TEXT;


-- ===========================================================================
-- polls
-- ===========================================================================
CREATE TABLE IF NOT EXISTS polls (
  id                TEXT PRIMARY KEY,
  news_id           TEXT REFERENCES news(id)  ON DELETE CASCADE,
  post_id           TEXT REFERENCES posts(id) ON DELETE CASCADE,
  question          TEXT NOT NULL,
  description       TEXT,
  is_anonymous      INTEGER DEFAULT 0,
  allow_multiple    INTEGER DEFAULT 0,
  allow_add_options INTEGER DEFAULT 0,
  allow_change_vote INTEGER DEFAULT 0,
  shuffle_options   INTEGER DEFAULT 0,
  total_votes       INTEGER DEFAULT 0,
  ends_at           INTEGER,
  created_at        INTEGER DEFAULT (unix_now())
);

CREATE TABLE IF NOT EXISTS poll_options (
  id          TEXT PRIMARY KEY,
  poll_id     TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  votes_count INTEGER DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT (unix_now())
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id        TEXT PRIMARY KEY,
  poll_id   TEXT NOT NULL REFERENCES polls(id)        ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  UNIQUE(poll_id, option_id, user_id)
);


-- ===========================================================================
-- albums
-- ===========================================================================
CREATE TABLE IF NOT EXISTS albums (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER DEFAULT (unix_now()),
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS album_images (
  id       TEXT PRIMARY KEY,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  added_at INTEGER DEFAULT (unix_now()),
  UNIQUE(album_id, image_id)
);


-- ===========================================================================
-- activity_logs  (логи действий пользователей)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  username    TEXT NOT NULL,                    -- снимок ника на момент действия
  action      TEXT NOT NULL,                    -- 'file_upload' | 'post_create' | 'post_delete' | 'image_add' | 'comment_create'
  target_type TEXT,                             -- 'post' | 'gallery' | 'message' | 'news' | 'event' | 'cover' | 'avatar'
  target_id   TEXT,                             -- ID связанного объекта
  file_name   TEXT,                             -- оригинальное имя файла (для file_upload)
  file_type   TEXT,                             -- MIME-тип файла
  file_size   INTEGER,                          -- размер файла в байтах
  file_count  INTEGER DEFAULT 1,                -- кол-во файлов в батче
  ip          TEXT,                             -- IP-адрес клиента
  details     TEXT,                             -- JSON: доп. данные (напр. имя поста)
  created_at  INTEGER DEFAULT (unix_now())
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action     ON activity_logs(action);
