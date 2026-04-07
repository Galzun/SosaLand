// routes/users.js
// Маршруты для работы с профилями пользователей.
//
//   GET  /api/users/by-minecraft/:minecraftName — найти пользователя по нику Minecraft
//   GET  /api/users/:id                         — получить профиль по ID
//   PUT  /api/users/:id/profile                 — обновить профиль (только владелец)
//   GET  /api/users/:userId/posts               — посты конкретного пользователя

const express = require('express');
const jwt     = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { fetchPosts, optionalAuth } = require('./posts');
const { getAlbums } = require('./images');
const { profileCommentsRouter } = require('./comments');

const router = express.Router();

const BIO_MAX_LENGTH = 500;

// Генерирует список колонок профиля с опциональным префиксом таблицы.
// Используем prefix='u.' в JOIN-запросе, чтобы избежать неоднозначности.
const profileCols = (prefix = '') => `
  ${prefix}id, ${prefix}username, ${prefix}minecraft_uuid, ${prefix}role,
  ${prefix}cover_url, ${prefix}background_url, ${prefix}bio,
  ${prefix}created_at, ${prefix}updated_at,
  ${prefix}cover_pos_x, ${prefix}cover_pos_y, ${prefix}cover_scale,
  ${prefix}bg_pos_x,    ${prefix}bg_pos_y,    ${prefix}bg_scale,
  ${prefix}cover_rotation, ${prefix}cover_fill_color, ${prefix}cover_blur, ${prefix}cover_edge,
  ${prefix}bg_rotation,    ${prefix}bg_fill_color,    ${prefix}bg_blur,   ${prefix}bg_edge,
  ${prefix}card_bg_color,  ${prefix}card_bg_alpha,    ${prefix}card_bg_blur,
  ${prefix}post_card_bg_color, ${prefix}post_card_bg_alpha, ${prefix}post_card_blur,
  ${prefix}tabs_bg_color,      ${prefix}tabs_bg_alpha,      ${prefix}tabs_blur,
  ${prefix}post_form_bg_color, ${prefix}post_form_bg_alpha, ${prefix}post_form_blur,
  ${prefix}content_bg_color,   ${prefix}content_bg_alpha,   ${prefix}content_blur,
  ${prefix}content_wrapper_bg_color, ${prefix}content_wrapper_bg_alpha, ${prefix}content_wrapper_blur,
  ${prefix}content_wrapper_border_color, ${prefix}content_wrapper_border_width, ${prefix}content_wrapper_border_radius,
  ${prefix}content_wrapper_text_color, ${prefix}content_wrapper_accent_color,
  ${prefix}content_border_color, ${prefix}content_border_width, ${prefix}content_border_radius, ${prefix}content_text_color,
  ${prefix}post_card_border_color, ${prefix}post_card_border_width, ${prefix}post_card_border_radius,
  ${prefix}post_card_text_color, ${prefix}post_card_accent_color
`;

// ---------------------------------------------------------------------------
// Вспомогательная функция: форматирует строку БД в объект пользователя (camelCase).
// ---------------------------------------------------------------------------
function formatUser(row) {
  return {
    id:             row.id,
    username:       row.username,
    minecraftUuid:  row.minecraft_uuid,
    role:           row.role,
    coverUrl:       row.cover_url        || null,
    backgroundUrl:  row.background_url   || null,
    bio:            row.bio              || null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at       || null,
    // Позиционирование обложки
    coverPosX:      row.cover_pos_x      ?? 50,
    coverPosY:      row.cover_pos_y      ?? 50,
    coverScale:     row.cover_scale      ?? 100,
    // Дополнительные параметры обложки
    coverRotation:  row.cover_rotation   ?? 0,
    coverFillColor: row.cover_fill_color || null,
    coverBlur:      row.cover_blur       ?? 0,
    coverEdge:      row.cover_edge       ?? 0,
    // Позиционирование фона
    bgPosX:         row.bg_pos_x         ?? 50,
    bgPosY:         row.bg_pos_y         ?? 50,
    bgScale:        row.bg_scale         ?? 100,
    // Дополнительные параметры фона
    bgRotation:     row.bg_rotation      ?? 0,
    bgFillColor:    row.bg_fill_color    || null,
    bgBlur:         row.bg_blur          ?? 0,
    bgEdge:         row.bg_edge          ?? 0,
    cardBgColor:    row.card_bg_color    || '#1a1a1a',
    cardBgAlpha:    row.card_bg_alpha    ?? 95,
    cardBgBlur:     row.card_bg_blur     ?? 0,
    // UI-элементы профиля
    postCardBgColor:       row.post_card_bg_color       || '#1a1a1a',
    postCardBgAlpha:       row.post_card_bg_alpha       ?? 95,
    postCardBlur:          row.post_card_blur           ?? 0,
    tabsBgColor:           row.tabs_bg_color            || '#1a1a1a',
    tabsBgAlpha:           row.tabs_bg_alpha            ?? 85,
    tabsBlur:              row.tabs_blur                ?? 0,
    postFormBgColor:       row.post_form_bg_color       || '#141420',
    postFormBgAlpha:       row.post_form_bg_alpha       ?? 100,
    postFormBlur:          row.post_form_blur           ?? 0,
    contentBgColor:        row.content_bg_color         || '#0a0a1a',
    contentBgAlpha:        row.content_bg_alpha         ?? 0,
    contentBlur:           row.content_blur             ?? 0,
    contentWrapperBgColor: row.content_wrapper_bg_color || '#1a1a1a',
    contentWrapperBgAlpha: row.content_wrapper_bg_alpha ?? 95,
    contentWrapperBlur:    row.content_wrapper_blur     ?? 0,
    contentWrapperBorderColor:  row.content_wrapper_border_color  || null,
    contentWrapperBorderWidth:  row.content_wrapper_border_width  ?? 0,
    contentWrapperBorderRadius: row.content_wrapper_border_radius ?? 12,
    contentWrapperTextColor:    row.content_wrapper_text_color    || null,
    contentWrapperAccentColor:  row.content_wrapper_accent_color  || null,
    contentBorderColor:  row.content_border_color  || null,
    contentBorderWidth:  row.content_border_width  ?? 0,
    contentBorderRadius: row.content_border_radius ?? 10,
    contentTextColor:    row.content_text_color    || null,
    postCardBorderColor:  row.post_card_border_color  || null,
    postCardBorderWidth:  row.post_card_border_width  ?? 1,
    postCardBorderRadius: row.post_card_border_radius ?? 12,
    postCardTextColor:    row.post_card_text_color    || null,
    postCardAccentColor:  row.post_card_accent_color  || null,
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/by-minecraft/:minecraftName
// ---------------------------------------------------------------------------
// Ищет аккаунт сайта по нику Minecraft-игрока. Доступ: публичный.
// ---------------------------------------------------------------------------
router.get('/by-minecraft/:minecraftName', async (req, res) => {
  const { minecraftName } = req.params;

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT ${profileCols('u.')}
         FROM users u
         INNER JOIN players p ON p.uuid = u.minecraft_uuid
         WHERE p.name = ? COLLATE NOCASE`,
        [minecraftName],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    if (!user) return res.status(404).json({ error: 'Аккаунт не найден' });

    res.json(formatUser(user));
  } catch (err) {
    console.error('Ошибка при поиске пользователя по нику:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------
// Возвращает публичный профиль пользователя по его UUID. Доступ: публичный.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT ${profileCols()} FROM users WHERE id = ?`,
        [id],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    res.json(formatUser(user));
  } catch (err) {
    console.error('Ошибка при получении профиля:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// PUT /api/users/:id/profile
// ---------------------------------------------------------------------------
// Обновляет поля профиля. Доступ: только владелец (JWT).
// ---------------------------------------------------------------------------
router.put('/:id/profile', requireAuth, async (req, res) => {
  const { id } = req.params;

  if (req.user.id !== id) {
    return res.status(403).json({ error: 'Нет доступа: можно редактировать только свой профиль' });
  }

  const {
    coverUrl, backgroundUrl, bio,
    coverPosX, coverPosY, coverScale,
    bgPosX, bgPosY, bgScale,
    coverRotation, coverFillColor, coverBlur, coverEdge,
    bgRotation, bgFillColor, bgBlur, bgEdge,
    cardBgColor, cardBgAlpha, cardBgBlur,
    postCardBgColor, postCardBgAlpha, postCardBlur,
    tabsBgColor, tabsBgAlpha, tabsBlur,
    postFormBgColor, postFormBgAlpha, postFormBlur,
    contentBgColor, contentBgAlpha, contentBlur,
    contentWrapperBgColor, contentWrapperBgAlpha, contentWrapperBlur,
    contentWrapperBorderColor, contentWrapperBorderWidth, contentWrapperBorderRadius,
    contentWrapperTextColor, contentWrapperAccentColor,
    contentBorderColor, contentBorderWidth, contentBorderRadius, contentTextColor,
    postCardBorderColor, postCardBorderWidth, postCardBorderRadius,
    postCardTextColor, postCardAccentColor,
  } = req.body;

  if (bio !== undefined && bio !== null && bio.length > BIO_MAX_LENGTH) {
    return res.status(400).json({ error: `Описание не должно превышать ${BIO_MAX_LENGTH} символов` });
  }

  const clamp = (val, min, max) => Math.min(max, Math.max(min, Math.round(Number(val))));

  try {
    const cur = await new Promise((resolve, reject) => {
      db.get(
        `SELECT ${profileCols()} FROM users WHERE id = ?`,
        [id],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    if (!cur) return res.status(404).json({ error: 'Пользователь не найден' });

    // Для каждого поля: новое значение или существующее.
    const n = {
      coverUrl:       coverUrl       !== undefined ? coverUrl       : cur.cover_url,
      bgUrl:          backgroundUrl  !== undefined ? backgroundUrl  : cur.background_url,
      bio:            bio            !== undefined ? bio            : cur.bio,
      coverPosX:      coverPosX      !== undefined ? clamp(coverPosX,    0, 100) : (cur.cover_pos_x   ?? 50),
      coverPosY:      coverPosY      !== undefined ? clamp(coverPosY,    0, 100) : (cur.cover_pos_y   ?? 50),
      coverScale:     coverScale     !== undefined ? clamp(coverScale,  20, 200) : (cur.cover_scale   ?? 100),
      bgPosX:         bgPosX         !== undefined ? clamp(bgPosX,       0, 100) : (cur.bg_pos_x      ?? 50),
      bgPosY:         bgPosY         !== undefined ? clamp(bgPosY,       0, 100) : (cur.bg_pos_y      ?? 50),
      bgScale:        bgScale        !== undefined ? clamp(bgScale,     20, 200) : (cur.bg_scale      ?? 100),
      coverRotation:  coverRotation  !== undefined ? clamp(coverRotation,  0, 359) : (cur.cover_rotation  ?? 0),
      coverFillColor: coverFillColor !== undefined ? (coverFillColor || null) : (cur.cover_fill_color || null),
      coverBlur:      coverBlur      !== undefined ? clamp(coverBlur,   0, 20)  : (cur.cover_blur     ?? 0),
      coverEdge:      coverEdge      !== undefined ? clamp(coverEdge,   0, 100) : (cur.cover_edge     ?? 0),
      bgRotation:     bgRotation     !== undefined ? clamp(bgRotation,     0, 359) : (cur.bg_rotation  ?? 0),
      bgFillColor:    bgFillColor    !== undefined ? (bgFillColor || null)      : (cur.bg_fill_color  || null),
      bgBlur:         bgBlur         !== undefined ? clamp(bgBlur,      0, 20)  : (cur.bg_blur        ?? 0),
      bgEdge:         bgEdge         !== undefined ? clamp(bgEdge,      0, 100) : (cur.bg_edge        ?? 0),
      cardBgColor:    cardBgColor    !== undefined ? (cardBgColor || '#1a1a1a') : (cur.card_bg_color || '#1a1a1a'),
      cardBgAlpha:    cardBgAlpha    !== undefined ? clamp(cardBgAlpha, 0, 100) : (cur.card_bg_alpha ?? 95),
      cardBgBlur:     cardBgBlur     !== undefined ? clamp(cardBgBlur,  0, 20)  : (cur.card_bg_blur  ?? 0),
      postCardBgColor:       postCardBgColor       !== undefined ? (postCardBgColor || '#1a1a1a')       : (cur.post_card_bg_color       || '#1a1a1a'),
      postCardBgAlpha:       postCardBgAlpha       !== undefined ? clamp(postCardBgAlpha,       0, 100) : (cur.post_card_bg_alpha       ?? 95),
      postCardBlur:          postCardBlur          !== undefined ? clamp(postCardBlur,          0, 20)  : (cur.post_card_blur           ?? 0),
      tabsBgColor:           tabsBgColor           !== undefined ? (tabsBgColor || '#1a1a1a')           : (cur.tabs_bg_color            || '#1a1a1a'),
      tabsBgAlpha:           tabsBgAlpha           !== undefined ? clamp(tabsBgAlpha,           0, 100) : (cur.tabs_bg_alpha            ?? 85),
      tabsBlur:              tabsBlur              !== undefined ? clamp(tabsBlur,              0, 20)  : (cur.tabs_blur                ?? 0),
      postFormBgColor:       postFormBgColor       !== undefined ? (postFormBgColor || '#141420')       : (cur.post_form_bg_color       || '#141420'),
      postFormBgAlpha:       postFormBgAlpha       !== undefined ? clamp(postFormBgAlpha,       0, 100) : (cur.post_form_bg_alpha       ?? 100),
      postFormBlur:          postFormBlur          !== undefined ? clamp(postFormBlur,          0, 20)  : (cur.post_form_blur           ?? 0),
      contentBgColor:        contentBgColor        !== undefined ? (contentBgColor || '#0a0a1a')        : (cur.content_bg_color         || '#0a0a1a'),
      contentBgAlpha:        contentBgAlpha        !== undefined ? clamp(contentBgAlpha,        0, 100) : (cur.content_bg_alpha         ?? 0),
      contentBlur:           contentBlur           !== undefined ? clamp(contentBlur,           0, 20)  : (cur.content_blur             ?? 0),
      contentWrapperBgColor: contentWrapperBgColor !== undefined ? (contentWrapperBgColor || '#1a1a1a') : (cur.content_wrapper_bg_color || '#1a1a1a'),
      contentWrapperBgAlpha: contentWrapperBgAlpha !== undefined ? clamp(contentWrapperBgAlpha, 0, 100) : (cur.content_wrapper_bg_alpha ?? 95),
      contentWrapperBlur:    contentWrapperBlur    !== undefined ? clamp(contentWrapperBlur,    0, 20)  : (cur.content_wrapper_blur    ?? 0),
      contentWrapperBorderColor:  contentWrapperBorderColor  !== undefined ? (contentWrapperBorderColor  || null) : (cur.content_wrapper_border_color  || null),
      contentWrapperBorderWidth:  contentWrapperBorderWidth  !== undefined ? clamp(contentWrapperBorderWidth,  0, 20) : (cur.content_wrapper_border_width  ?? 0),
      contentWrapperBorderRadius: contentWrapperBorderRadius !== undefined ? clamp(contentWrapperBorderRadius, 0, 48) : (cur.content_wrapper_border_radius ?? 12),
      contentWrapperTextColor:    contentWrapperTextColor    !== undefined ? (contentWrapperTextColor    || null) : (cur.content_wrapper_text_color    || null),
      contentWrapperAccentColor:  contentWrapperAccentColor  !== undefined ? (contentWrapperAccentColor  || null) : (cur.content_wrapper_accent_color  || null),
      contentBorderColor:  contentBorderColor  !== undefined ? (contentBorderColor  || null) : (cur.content_border_color  || null),
      contentBorderWidth:  contentBorderWidth  !== undefined ? clamp(contentBorderWidth,  0, 20) : (cur.content_border_width  ?? 0),
      contentBorderRadius: contentBorderRadius !== undefined ? clamp(contentBorderRadius, 0, 48) : (cur.content_border_radius ?? 10),
      contentTextColor:    contentTextColor    !== undefined ? (contentTextColor    || null) : (cur.content_text_color    || null),
      postCardBorderColor:  postCardBorderColor  !== undefined ? (postCardBorderColor  || null) : (cur.post_card_border_color  || null),
      postCardBorderWidth:  postCardBorderWidth  !== undefined ? clamp(postCardBorderWidth,  0, 20) : (cur.post_card_border_width  ?? 1),
      postCardBorderRadius: postCardBorderRadius !== undefined ? clamp(postCardBorderRadius, 0, 48) : (cur.post_card_border_radius ?? 12),
      postCardTextColor:    postCardTextColor    !== undefined ? (postCardTextColor    || null) : (cur.post_card_text_color    || null),
      postCardAccentColor:  postCardAccentColor  !== undefined ? (postCardAccentColor  || null) : (cur.post_card_accent_color  || null),
    };

    const updatedAt = Math.floor(Date.now() / 1000);

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users
         SET cover_url = ?,      background_url = ?,    bio = ?,            updated_at = ?,
             cover_pos_x = ?,    cover_pos_y = ?,       cover_scale = ?,
             bg_pos_x = ?,       bg_pos_y = ?,          bg_scale = ?,
             cover_rotation = ?, cover_fill_color = ?,  cover_blur = ?,     cover_edge = ?,
             bg_rotation = ?,    bg_fill_color = ?,     bg_blur = ?,        bg_edge = ?,
             card_bg_color = ?,  card_bg_alpha = ?,     card_bg_blur = ?,
             post_card_bg_color = ?,  post_card_bg_alpha = ?,  post_card_blur = ?,
             tabs_bg_color = ?,       tabs_bg_alpha = ?,       tabs_blur = ?,
             post_form_bg_color = ?,  post_form_bg_alpha = ?,  post_form_blur = ?,
             content_bg_color = ?,    content_bg_alpha = ?,    content_blur = ?,
             content_wrapper_bg_color = ?, content_wrapper_bg_alpha = ?, content_wrapper_blur = ?,
             content_wrapper_border_color = ?, content_wrapper_border_width = ?, content_wrapper_border_radius = ?,
             content_wrapper_text_color = ?, content_wrapper_accent_color = ?,
             content_border_color = ?, content_border_width = ?, content_border_radius = ?, content_text_color = ?,
             post_card_border_color = ?, post_card_border_width = ?, post_card_border_radius = ?,
             post_card_text_color = ?, post_card_accent_color = ?
         WHERE id = ?`,
        [
          n.coverUrl, n.bgUrl, n.bio, updatedAt,
          n.coverPosX, n.coverPosY, n.coverScale,
          n.bgPosX, n.bgPosY, n.bgScale,
          n.coverRotation, n.coverFillColor, n.coverBlur, n.coverEdge,
          n.bgRotation, n.bgFillColor, n.bgBlur, n.bgEdge,
          n.cardBgColor, n.cardBgAlpha, n.cardBgBlur,
          n.postCardBgColor, n.postCardBgAlpha, n.postCardBlur,
          n.tabsBgColor, n.tabsBgAlpha, n.tabsBlur,
          n.postFormBgColor, n.postFormBgAlpha, n.postFormBlur,
          n.contentBgColor, n.contentBgAlpha, n.contentBlur,
          n.contentWrapperBgColor, n.contentWrapperBgAlpha, n.contentWrapperBlur,
          n.contentWrapperBorderColor, n.contentWrapperBorderWidth, n.contentWrapperBorderRadius,
          n.contentWrapperTextColor, n.contentWrapperAccentColor,
          n.contentBorderColor, n.contentBorderWidth, n.contentBorderRadius, n.contentTextColor,
          n.postCardBorderColor, n.postCardBorderWidth, n.postCardBorderRadius,
          n.postCardTextColor, n.postCardAccentColor,
          id,
        ],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const updated = await new Promise((resolve, reject) => {
      db.get(
        `SELECT ${profileCols()} FROM users WHERE id = ?`,
        [id],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    res.json(formatUser(updated));
  } catch (err) {
    console.error('Ошибка при обновлении профиля:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/users/:userId/images — фотографии конкретного пользователя.
// Используется на вкладке «Фото» страницы профиля.
// Query-параметры: limit (default 30, max 60), offset (default 0)
// ---------------------------------------------------------------------------
router.get('/:userId/images', async (req, res) => {
  const { userId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit)  || 30, 60);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);

  try {
    // Проверяем, что пользователь существует
    const user = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const albums = await getAlbums('WHERE i.user_id = ?', [userId], limit, offset);

    res.json(albums);
  } catch (err) {
    console.error('Ошибка получения фото пользователя:', err.message);
    res.status(500).json({ error: 'Ошибка при получении фото' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/users/:userId/posts — посты конкретного пользователя.
// Используется на странице профиля (/player/:username).
// Query-параметры: limit (default 20, max 50), offset (default 0)
// ---------------------------------------------------------------------------
router.get('/:userId/posts', optionalAuth, async (req, res) => {
  const { userId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);

  try {
    // Проверяем, что пользователь существует
    const user = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // fetchPosts из posts.js — общая функция для получения постов с JOIN
    const posts = await fetchPosts(
      'WHERE p.user_id = ?',
      [userId],
      req.user?.id,
      limit,
      offset
    );
    res.json(posts);
  } catch (err) {
    console.error('Ошибка получения постов пользователя:', err.message);
    res.status(500).json({ error: 'Ошибка при получении постов' });
  }
});


// Монтируем роутер комментариев к профилям.
// Маршруты: GET/POST /api/users/:userId/profile-comments
router.use('/:userId/profile-comments', profileCommentsRouter);


module.exports = router;
