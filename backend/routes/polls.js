// routes/polls.js
// Эндпоинты для системы опросов.
//
// Монтируется под /api/polls:
//   POST   /                   — создать опрос (admin для новостей, автор для постов)
//   GET    /:id                 — получить опрос с вариантами и статусом голосования
//   PUT    /:id                 — обновить опрос (admin или автор поста)
//   DELETE /:id                 — удалить опрос (admin или автор поста)
//   POST   /:id/vote            — проголосовать (JWT)
//   GET    /:id/voters          — список проголосовавших
//   POST   /:id/options         — добавить вариант (если allow_add_options, JWT)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { requireAuth, isAdmin } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

function dbGet(sql, params = []) {
  return new Promise((res, rej) =>
    db.get(sql, params, (err, row) => err ? rej(err) : res(row))
  );
}
function dbAll(sql, params = []) {
  return new Promise((res, rej) =>
    db.all(sql, params, (err, rows) => err ? rej(err) : res(rows))
  );
}
function dbRun(sql, params = []) {
  return new Promise((res, rej) =>
    db.run(sql, params, function(err) { err ? rej(err) : res(this); })
  );
}

// Форматирует строку poll из БД в camelCase-объект
function formatPoll(row, options = [], userVotedIds = []) {
  return {
    id:               row.id,
    newsId:           row.news_id || null,
    postId:           row.post_id || null,
    question:         row.question,
    description:      row.description || null,
    isAnonymous:      row.is_anonymous === 1,
    allowMultiple:    row.allow_multiple === 1,
    allowAddOptions:  row.allow_add_options === 1,
    allowChangeVote:  row.allow_change_vote === 1,
    shuffleOptions:   row.shuffle_options === 1,
    totalVotes:       row.total_votes || 0,
    endsAt:           row.ends_at || null,
    createdAt:        row.created_at,
    options:          options.map(o => ({
      id:          o.id,
      text:        o.option_text,
      votesCount:  o.votes_count || 0,
      orderIndex:  o.order_index || 0,
    })),
    userVotedIds,     // [] если не голосовал, [optionId, ...] если голосовал
    authorId:         row.author_id || null,
  };
}

// Загружает опрос + его варианты + голоса текущего пользователя
async function loadPollFull(pollId, userId = null) {
  const poll = await dbGet(
    `SELECT p.*,
       COALESCE(
         (SELECT user_id  FROM posts WHERE id = p.post_id),
         (SELECT author_id FROM news  WHERE id = p.news_id)
       ) AS author_id
     FROM polls p WHERE p.id = ?`,
    [pollId]
  );
  if (!poll) return null;

  const options = await dbAll(
    `SELECT * FROM poll_options WHERE poll_id = ? ORDER BY order_index ASC, created_at ASC`,
    [pollId]
  );

  let userVotedIds = [];
  if (userId) {
    const votes = await dbAll(
      `SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?`,
      [pollId, userId]
    );
    userVotedIds = votes.map(v => v.option_id);
  }

  return formatPoll(poll, options, userVotedIds);
}

// Возвращает userId автора поста (или null)
async function getPostAuthorId(postId) {
  const row = await dbGet(`SELECT user_id FROM posts WHERE id = ?`, [postId]);
  return row?.user_id || null;
}

// Проверяет, что пользователь может управлять опросом (admin/creator или автор поста)
async function canManagePoll(poll, user) {
  if (user.role === 'admin' || user.role === 'creator') return true;
  if (poll.post_id) {
    const authorId = await getPostAuthorId(poll.post_id);
    return authorId === user.id;
  }
  return false;
}

// ---------------------------------------------------------------------------
// POST /api/polls — создать опрос
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  const {
    news_id, post_id,
    question, description,
    options,
    is_anonymous     = 0,
    allow_multiple   = 0,
    allow_add_options = 0,
    allow_change_vote = 0,
    shuffle_options  = 0,
    ends_at,
  } = req.body;

  // Валидация: news_id и post_id оба указаны — ошибка
  // Оба пустых — разрешено только для admin (опрос будет привязан позже через PUT)
  if (news_id && post_id) {
    return res.status(400).json({ error: 'Укажите только одно: news_id или post_id' });
  }
  if (!news_id && !post_id && !['admin', 'creator'].includes(req.user.role)) {
    return res.status(400).json({ error: 'Укажите news_id или post_id' });
  }
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Вопрос обязателен' });
  }
  if (question.trim().length > 300) {
    return res.status(400).json({ error: 'Вопрос не более 300 символов' });
  }
  if (description && description.length > 500) {
    return res.status(400).json({ error: 'Описание не более 500 символов' });
  }
  if (!Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Укажите минимум 2 варианта ответа' });
  }
  if (options.length > 25) {
    return res.status(400).json({ error: 'Максимум 25 вариантов ответа' });
  }
  for (const opt of options) {
    if (!opt || typeof opt !== 'string' || !opt.trim()) {
      return res.status(400).json({ error: 'Вариант ответа не может быть пустым' });
    }
    if (opt.trim().length > 200) {
      return res.status(400).json({ error: 'Вариант ответа не более 200 символов' });
    }
  }

  // Проверяем права: для новостей только admin/creator, для постов — автор или admin/creator
  if (news_id && !['admin', 'creator'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Создавать опросы в новостях может только администратор' });
  }
  if (post_id) {
    const authorId = await getPostAuthorId(post_id);
    if (!['admin', 'creator'].includes(req.user.role) && authorId !== req.user.id) {
      return res.status(403).json({ error: 'Создавать опросы в чужих постах нельзя' });
    }
  }

  try {
    const pollId = uuidv4();
    await dbRun(
      `INSERT INTO polls
         (id, news_id, post_id, question, description,
          is_anonymous, allow_multiple, allow_add_options, allow_change_vote, shuffle_options, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pollId, news_id || null, post_id || null, question.trim(), description?.trim() || null,
       is_anonymous ? 1 : 0, allow_multiple ? 1 : 0,
       allow_add_options ? 1 : 0, allow_change_vote ? 1 : 0,
       shuffle_options ? 1 : 0, ends_at || null]
    );

    // Вставляем варианты
    for (let i = 0; i < options.length; i++) {
      await dbRun(
        `INSERT INTO poll_options (id, poll_id, option_text, order_index)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), pollId, options[i].trim(), i]
      );
    }

    const poll = await loadPollFull(pollId, req.user.id);
    res.status(201).json(poll);
  } catch (err) {
    console.error('Ошибка создания опроса:', err.message);
    res.status(500).json({ error: 'Ошибка при создании опроса' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/polls/:id — получить опрос
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  // Получаем userId из JWT если он есть (не требуем)
  let userId = null;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      userId = decoded.id;
    } catch { /* игнорируем */ }
  }

  try {
    const poll = await loadPollFull(req.params.id, userId);
    if (!poll) return res.status(404).json({ error: 'Опрос не найден' });
    res.json(poll);
  } catch (err) {
    console.error('Ошибка получения опроса:', err.message);
    res.status(500).json({ error: 'Ошибка при получении опроса' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/polls/:id — обновить настройки опроса (и варианты ответов)
// ---------------------------------------------------------------------------
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const poll = await dbGet(`SELECT * FROM polls WHERE id = ?`, [req.params.id]);
    if (!poll) return res.status(404).json({ error: 'Опрос не найден' });

    if (!(await canManagePoll(poll, req.user))) {
      return res.status(403).json({ error: 'Нет прав для редактирования этого опроса' });
    }

    const {
      news_id,
      question, description,
      is_anonymous, allow_multiple, allow_add_options,
      allow_change_vote, shuffle_options, ends_at,
      options, // [{id?, text}] — если передан, обновляем варианты
    } = req.body;

    if (question !== undefined) {
      if (!question.trim()) return res.status(400).json({ error: 'Вопрос не может быть пустым' });
      if (question.trim().length > 300) return res.status(400).json({ error: 'Вопрос не более 300 символов' });
    }

    // Валидация вариантов (если переданы)
    if (Array.isArray(options)) {
      if (options.length < 2) {
        return res.status(400).json({ error: 'Минимум 2 варианта ответа' });
      }
      if (options.length > 25) {
        return res.status(400).json({ error: 'Максимум 25 вариантов ответа' });
      }
      for (const opt of options) {
        if (!opt.text || typeof opt.text !== 'string' || !opt.text.trim()) {
          return res.status(400).json({ error: 'Вариант ответа не может быть пустым' });
        }
        if (opt.text.trim().length > 200) {
          return res.status(400).json({ error: 'Вариант ответа не более 200 символов' });
        }
      }
    }

    await dbRun(
      `UPDATE polls SET
         news_id           = COALESCE(?, news_id),
         question          = COALESCE(?, question),
         description       = ?,
         is_anonymous      = COALESCE(?, is_anonymous),
         allow_multiple    = COALESCE(?, allow_multiple),
         allow_add_options = COALESCE(?, allow_add_options),
         allow_change_vote = COALESCE(?, allow_change_vote),
         shuffle_options   = COALESCE(?, shuffle_options),
         ends_at           = ?
       WHERE id = ?`,
      [
        news_id || null,
        question?.trim() || null,
        description !== undefined ? (description?.trim() || null) : poll.description,
        is_anonymous !== undefined ? (is_anonymous ? 1 : 0) : null,
        allow_multiple !== undefined ? (allow_multiple ? 1 : 0) : null,
        allow_add_options !== undefined ? (allow_add_options ? 1 : 0) : null,
        allow_change_vote !== undefined ? (allow_change_vote ? 1 : 0) : null,
        shuffle_options !== undefined ? (shuffle_options ? 1 : 0) : null,
        ends_at !== undefined ? (ends_at || null) : poll.ends_at,
        req.params.id,
      ]
    );

    // Обновляем варианты ответов, если переданы
    if (Array.isArray(options)) {
      const existingOptions = await dbAll(
        `SELECT id, votes_count FROM poll_options WHERE poll_id = ?`, [req.params.id]
      );
      const providedIds = new Set(options.filter(o => o.id).map(o => o.id));

      // Обновляем текст существующих вариантов
      for (const opt of options) {
        if (opt.id) {
          await dbRun(
            `UPDATE poll_options SET option_text = ? WHERE id = ? AND poll_id = ?`,
            [opt.text.trim(), opt.id, req.params.id]
          );
        }
      }

      // Добавляем новые варианты
      const maxOrderRow = await dbGet(
        `SELECT MAX(order_index) as mx FROM poll_options WHERE poll_id = ?`, [req.params.id]
      );
      let nextOrder = (maxOrderRow?.mx ?? -1) + 1;
      for (const opt of options) {
        if (!opt.id) {
          await dbRun(
            `INSERT INTO poll_options (id, poll_id, option_text, order_index) VALUES (?, ?, ?, ?)`,
            [uuidv4(), req.params.id, opt.text.trim(), nextOrder++]
          );
        }
      }

      // Удаляем варианты, которых нет в новом списке (только если нет голосов)
      for (const existing of existingOptions) {
        if (!providedIds.has(existing.id) && existing.votes_count === 0) {
          await dbRun(`DELETE FROM poll_options WHERE id = ?`, [existing.id]);
        }
      }
    }

    const updated = await loadPollFull(req.params.id, req.user.id);
    res.json(updated);
  } catch (err) {
    console.error('Ошибка обновления опроса:', err.message);
    res.status(500).json({ error: 'Ошибка при обновлении опроса' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/polls/:id — удалить опрос
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const poll = await dbGet(`SELECT * FROM polls WHERE id = ?`, [req.params.id]);
    if (!poll) return res.status(404).json({ error: 'Опрос не найден' });

    if (!(await canManagePoll(poll, req.user))) {
      return res.status(403).json({ error: 'Нет прав для удаления этого опроса' });
    }

    await dbRun(`DELETE FROM polls WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления опроса:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении опроса' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/polls/:id/vote — проголосовать
// ---------------------------------------------------------------------------
router.post('/:id/vote', requireAuth, async (req, res) => {
  const { option_ids } = req.body;

  if (!Array.isArray(option_ids) || option_ids.length === 0) {
    return res.status(400).json({ error: 'Укажите option_ids' });
  }

  try {
    const poll = await dbGet(`SELECT * FROM polls WHERE id = ?`, [req.params.id]);
    if (!poll) return res.status(404).json({ error: 'Опрос не найден' });

    // Проверяем срок голосования
    if (poll.ends_at && Math.floor(Date.now() / 1000) > poll.ends_at) {
      return res.status(400).json({ error: 'Срок голосования истёк' });
    }

    // Проверяем, голосовал ли уже
    const existingVotes = await dbAll(
      `SELECT * FROM poll_votes WHERE poll_id = ? AND user_id = ?`,
      [poll.id, req.user.id]
    );

    if (existingVotes.length > 0 && !poll.allow_change_vote) {
      return res.status(400).json({ error: 'Вы уже голосовали в этом опросе' });
    }

    // Если нет allow_multiple — только один вариант
    if (!poll.allow_multiple && option_ids.length > 1) {
      return res.status(400).json({ error: 'В этом опросе можно выбрать только один вариант' });
    }

    // Проверяем, что все option_ids принадлежат этому опросу
    const validOptions = await dbAll(
      `SELECT id FROM poll_options WHERE poll_id = ?`,
      [poll.id]
    );
    const validIds = new Set(validOptions.map(o => o.id));
    for (const oid of option_ids) {
      if (!validIds.has(oid)) {
        return res.status(400).json({ error: `Неверный вариант: ${oid}` });
      }
    }

    // Если allow_change_vote — удаляем старые голоса
    if (existingVotes.length > 0 && poll.allow_change_vote) {
      // Декрементируем счётчики старых вариантов
      for (const vote of existingVotes) {
        await dbRun(
          `UPDATE poll_options SET votes_count = GREATEST(0, votes_count - 1) WHERE id = ?`,
          [vote.option_id]
        );
      }
      await dbRun(
        `DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?`,
        [poll.id, req.user.id]
      );
      // Корректируем total_votes
      await dbRun(
        `UPDATE polls SET total_votes = GREATEST(0, total_votes - ?) WHERE id = ?`,
        [existingVotes.length, poll.id]
      );
    }

    // Вставляем новые голоса
    for (const optionId of option_ids) {
      await dbRun(
        `INSERT INTO poll_votes (id, poll_id, option_id, user_id) VALUES (?, ?, ?, ?)`,
        [uuidv4(), poll.id, optionId, req.user.id]
      );
      await dbRun(
        `UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = ?`,
        [optionId]
      );
    }

    // Обновляем total_votes
    await dbRun(
      `UPDATE polls SET total_votes = total_votes + ? WHERE id = ?`,
      [option_ids.length, poll.id]
    );

    const updated = await loadPollFull(poll.id, req.user.id);
    res.json(updated);
  } catch (err) {
    console.error('Ошибка голосования:', err.message);
    res.status(500).json({ error: 'Ошибка при голосовании' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/polls/:id/voters — список проголосовавших
// ---------------------------------------------------------------------------
router.get('/:id/voters', async (req, res) => {
  try {
    const poll = await dbGet(`SELECT * FROM polls WHERE id = ?`, [req.params.id]);
    if (!poll) return res.status(404).json({ error: 'Опрос не найден' });

    if (poll.is_anonymous) {
      // Для анонимного опроса — только числа
      const counts = await dbAll(
        `SELECT option_id, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_id`,
        [poll.id]
      );
      return res.json({
        anonymous: true,
        counts: counts.map(c => ({ option_id: c.option_id, count: Number(c.count) })),
      });
    }

    // Публичный: возвращаем пользователей по каждому варианту
    const rows = await dbAll(
      `SELECT pv.option_id, u.id, u.username, u.minecraft_uuid
       FROM poll_votes pv
       JOIN users u ON u.id = pv.user_id
       WHERE pv.poll_id = ?
       ORDER BY pv.option_id`,
      [poll.id]
    );

    // Группируем по option_id
    const byOption = {};
    for (const row of rows) {
      if (!byOption[row.option_id]) byOption[row.option_id] = [];
      byOption[row.option_id].push({
        id:            row.id,
        username:      row.username,
        minecraftUuid: row.minecraft_uuid || null,
      });
    }

    res.json({ anonymous: false, byOption });
  } catch (err) {
    console.error('Ошибка получения проголосовавших:', err.message);
    res.status(500).json({ error: 'Ошибка при получении данных' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/polls/:id/options — добавить вариант (если allow_add_options)
// ---------------------------------------------------------------------------
router.post('/:id/options', requireAuth, async (req, res) => {
  const { option_text } = req.body;

  if (!option_text || typeof option_text !== 'string' || !option_text.trim()) {
    return res.status(400).json({ error: 'Текст варианта обязателен' });
  }
  if (option_text.trim().length > 200) {
    return res.status(400).json({ error: 'Вариант ответа не более 200 символов' });
  }

  try {
    const poll = await dbGet(`SELECT * FROM polls WHERE id = ?`, [req.params.id]);
    if (!poll) return res.status(404).json({ error: 'Опрос не найден' });

    if (!poll.allow_add_options && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Добавление вариантов запрещено в этом опросе' });
    }

    // Проверяем лимит вариантов
    const countRow = await dbGet(`SELECT COUNT(*) as cnt FROM poll_options WHERE poll_id = ?`, [poll.id]);
    if (countRow.cnt >= 25) {
      return res.status(400).json({ error: 'Достигнуто максимальное количество вариантов (25)' });
    }

    const maxOrder = await dbGet(
      `SELECT MAX(order_index) as mx FROM poll_options WHERE poll_id = ?`, [poll.id]
    );
    const newOrder = (maxOrder?.mx ?? -1) + 1;

    await dbRun(
      `INSERT INTO poll_options (id, poll_id, option_text, order_index) VALUES (?, ?, ?, ?)`,
      [uuidv4(), poll.id, option_text.trim(), newOrder]
    );

    const updated = await loadPollFull(poll.id, req.user.id);
    res.status(201).json(updated);
  } catch (err) {
    console.error('Ошибка добавления варианта:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении варианта' });
  }
});

module.exports = { router };
