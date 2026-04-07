// routes/messages.js
// Маршруты системы личных сообщений.
//
// Все эндпоинты требуют авторизации (JWT).
// Только участники диалога могут видеть его сообщения.
//
// GET  /api/conversations                   — список диалогов текущего пользователя
// GET  /api/conversations/unread-count      — количество непрочитанных сообщений
// GET  /api/conversations/:userId/messages  — история сообщений с пользователем
// POST /api/conversations/:userId/messages  — отправить сообщение пользователю
// DELETE /api/messages/:id                  — удалить своё сообщение (отозвать)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Вспомогательная функция: найти или создать диалог между двумя пользователями.
//
// Чтобы соблюдать UNIQUE(participant1, participant2), всегда кладём
// меньший UUID в participant1, больший — в participant2.
// Это гарантирует, что пара (A,B) и пара (B,A) дают одну строку.
// ---------------------------------------------------------------------------
function findOrCreateConversation(userId1, userId2) {
  // Упорядочиваем участников лексикографически
  const [p1, p2] = userId1 < userId2
    ? [userId1, userId2]
    : [userId2, userId1];

  return new Promise((resolve, reject) => {
    // Сначала пробуем найти существующий диалог
    db.get(
      `SELECT * FROM conversations WHERE participant1 = ? AND participant2 = ?`,
      [p1, p2],
      (err, row) => {
        if (err) return reject(err);

        if (row) {
          // Диалог уже существует — возвращаем его
          return resolve(row);
        }

        // Диалог не найден — создаём новый
        const id = uuidv4();
        db.run(
          `INSERT INTO conversations (id, participant1, participant2) VALUES (?, ?, ?)`,
          [id, p1, p2],
          function (err2) {
            if (err2) return reject(err2);
            db.get(
              `SELECT * FROM conversations WHERE id = ?`,
              [id],
              (err3, newRow) => {
                if (err3) return reject(err3);
                resolve(newRow);
              }
            );
          }
        );
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Вспомогательная функция: обновить last_message в диалоге.
// Берёт последнее сообщение из таблицы messages для данного диалога.
// ---------------------------------------------------------------------------
function updateLastMessage(conversationId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT content, file_name, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [conversationId],
      (err, row) => {
        if (err) return reject(err);

        // Формируем текст последнего сообщения (текст или имя файла)
        const lastMsg = row
          ? (row.content || row.file_name || 'Файл')
          : null;
        const lastTime = row ? row.created_at : null;

        db.run(
          `UPDATE conversations
           SET last_message = ?, last_message_time = ?
           WHERE id = ?`,
          [lastMsg, lastTime, conversationId],
          (err2) => {
            if (err2) return reject(err2);
            resolve();
          }
        );
      }
    );
  });
}


// ---------------------------------------------------------------------------
// GET /api/conversations/unread-count
// ---------------------------------------------------------------------------
// Возвращает количество непрочитанных сообщений текущего пользователя.
// Используется Sidebar для отображения бейджа.
//
// ВАЖНО: этот маршрут должен быть ДО /api/conversations/:userId/...,
// иначе Express воспримет "unread-count" как :userId.
// ---------------------------------------------------------------------------
router.get('/unread-count', requireAuth, (req, res) => {
  const myId = req.user.id;

  // Считаем все непрочитанные сообщения, которые пришли НЕ от меня,
  // в диалогах, где я участвую.
  db.get(
    `SELECT COUNT(*) as count
     FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     WHERE (c.participant1 = ? OR c.participant2 = ?)
       AND m.sender_id != ?
       AND m.is_read = 0`,
    [myId, myId, myId],
    (err, row) => {
      if (err) {
        console.error('Ошибка подсчёта непрочитанных:', err.message);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
      res.json({ count: row?.count ?? 0 });
    }
  );
});


// ---------------------------------------------------------------------------
// GET /api/conversations
// ---------------------------------------------------------------------------
// Возвращает список диалогов текущего пользователя.
// Для каждого диалога: данные собеседника, последнее сообщение, непрочитанные.
// Сортировка по времени последнего сообщения (новые сверху).
// ---------------------------------------------------------------------------
router.get('/', requireAuth, (req, res) => {
  const myId = req.user.id;

  // Получаем все диалоги, где я участвую.
  // JOIN с users для получения данных собеседника.
  // CASE WHEN позволяет определить, кто из двух участников — собеседник.
  db.all(
    `SELECT
       c.id,
       c.last_message,
       c.last_message_time,
       c.created_at,
       -- Данные собеседника
       u.id         AS partner_id,
       u.username   AS partner_username,
       u.minecraft_uuid AS partner_minecraft_uuid,
       -- Количество непрочитанных сообщений от собеседника
       (
         SELECT COUNT(*)
         FROM messages m
         WHERE m.conversation_id = c.id
           AND m.sender_id != ?
           AND m.is_read = 0
       ) AS unread_count
     FROM conversations c
     JOIN users u ON u.id = CASE
       WHEN c.participant1 = ? THEN c.participant2
       ELSE c.participant1
     END
     WHERE c.participant1 = ? OR c.participant2 = ?
     ORDER BY c.last_message_time DESC NULLS LAST`,
    [myId, myId, myId, myId],
    (err, rows) => {
      if (err) {
        console.error('Ошибка загрузки диалогов:', err.message);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }

      // Форматируем ответ в camelCase для фронтенда
      const conversations = rows.map(r => ({
        id:               r.id,
        lastMessage:      r.last_message,
        lastMessageTime:  r.last_message_time,
        createdAt:        r.created_at,
        unreadCount:      r.unread_count,
        partner: {
          id:           r.partner_id,
          username:     r.partner_username,
          minecraftUuid: r.partner_minecraft_uuid,
        },
      }));

      res.json(conversations);
    }
  );
});


// ---------------------------------------------------------------------------
// GET /api/conversations/:userId/messages
// ---------------------------------------------------------------------------
// Возвращает историю сообщений с конкретным пользователем.
// Автоматически помечает входящие сообщения как прочитанные.
//
// Query params:
//   limit  — сколько сообщений вернуть (по умолчанию 50)
//   offset — пропустить N сообщений (для подгрузки старых при скролле вверх)
// ---------------------------------------------------------------------------
router.get('/:userId/messages', requireAuth, async (req, res) => {
  const myId       = req.user.id;
  const partnerId  = req.params.userId;
  const limit      = Math.min(parseInt(req.query.limit)  || 50, 100);
  const offset     = parseInt(req.query.offset) || 0;

  // Нельзя переписываться с самим собой
  if (myId === partnerId) {
    return res.status(400).json({ error: 'Нельзя отправить сообщение самому себе' });
  }

  // Проверяем, существует ли собеседник
  db.get(`SELECT id FROM users WHERE id = ?`, [partnerId], (err, partner) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!partner) return res.status(404).json({ error: 'Пользователь не найден' });

    // Ищем существующий диалог БЕЗ создания нового.
    // Диалог создаётся только при первой отправке сообщения (POST).
    const [p1, p2] = myId < partnerId ? [myId, partnerId] : [partnerId, myId];

    db.get(
      `SELECT id FROM conversations WHERE participant1 = ? AND participant2 = ?`,
      [p1, p2],
      (err2, conversation) => {
        if (err2) return res.status(500).json({ error: 'Ошибка сервера' });

        // Диалога ещё нет — возвращаем пустую историю
        if (!conversation) {
          return res.json({ messages: [], conversationId: null });
        }

        // Помечаем сообщения собеседника как прочитанные
        const now = Math.floor(Date.now() / 1000);
        db.run(
          `UPDATE messages
           SET is_read = 1, read_at = ?
           WHERE conversation_id = ?
             AND sender_id = ?
             AND is_read = 0`,
          [now, conversation.id, partnerId],
          (err3) => {
            if (err3) console.error('Ошибка при отметке прочтения:', err3.message);
          }
        );

        // Загружаем сообщения, сортировка: старые сверху
        db.all(
          `SELECT
             m.id,
             m.conversation_id,
             m.sender_id,
             m.content,
             m.file_url,
             m.file_type,
             m.file_name,
             m.is_read,
             m.read_at,
             m.created_at,
             u.username       AS sender_username,
             u.minecraft_uuid AS sender_minecraft_uuid
           FROM messages m
           JOIN users u ON u.id = m.sender_id
           WHERE m.conversation_id = ?
           ORDER BY m.created_at ASC
           LIMIT ? OFFSET ?`,
          [conversation.id, limit, offset],
          (err4, rows) => {
            if (err4) {
              console.error('Ошибка загрузки сообщений:', err4.message);
              return res.status(500).json({ error: 'Ошибка сервера' });
            }

            const messages = rows.map(m => ({
              id:             m.id,
              conversationId: m.conversation_id,
              senderId:       m.sender_id,
              content:        m.content,
              fileUrl:        m.file_url,
              fileType:       m.file_type,
              fileName:       m.file_name,
              isRead:         m.is_read === 1,
              readAt:         m.read_at,
              createdAt:      m.created_at,
              sender: {
                id:            m.sender_id,
                username:      m.sender_username,
                minecraftUuid: m.sender_minecraft_uuid,
              },
            }));

            res.json({ messages, conversationId: conversation.id });
          }
        );
      }
    );
  });
});


// ---------------------------------------------------------------------------
// POST /api/conversations/:userId/messages
// ---------------------------------------------------------------------------
// Отправляет сообщение пользователю.
// Создаёт диалог, если его нет.
// Обновляет last_message в диалоге.
//
// Body: { content, file_url?, file_type?, file_name? }
// ---------------------------------------------------------------------------
router.post('/:userId/messages', requireAuth, async (req, res) => {
  const myId      = req.user.id;
  const partnerId = req.params.userId;
  const { content, file_url, file_type, file_name } = req.body;

  // Валидация
  if (myId === partnerId) {
    return res.status(400).json({ error: 'Нельзя отправить сообщение самому себе' });
  }

  // Контент обязателен, если нет файла; файл может идти без текста
  const trimmedContent = (content || '').trim();
  if (!trimmedContent && !file_url) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  if (trimmedContent.length > 5000) {
    return res.status(400).json({ error: 'Сообщение слишком длинное (максимум 5000 символов)' });
  }

  // Проверяем существование собеседника
  db.get(`SELECT id, username FROM users WHERE id = ?`, [partnerId], async (err, partner) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!partner) return res.status(404).json({ error: 'Пользователь не найден' });

    try {
      // Находим или создаём диалог
      const conversation = await findOrCreateConversation(myId, partnerId);

      const msgId  = uuidv4();
      const now    = Math.floor(Date.now() / 1000);

      // Сохраняем сообщение
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO messages
             (id, conversation_id, sender_id, content, file_url, file_type, file_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            msgId,
            conversation.id,
            myId,
            trimmedContent || '',
            file_url  || null,
            file_type || null,
            file_name || null,
            now,
          ],
          function (err2) {
            if (err2) reject(err2);
            else resolve();
          }
        );
      });

      // Обновляем last_message в диалоге
      await updateLastMessage(conversation.id);

      // Возвращаем созданное сообщение с данными отправителя
      db.get(
        `SELECT
           m.id, m.conversation_id, m.sender_id, m.content,
           m.file_url, m.file_type, m.file_name,
           m.is_read, m.read_at, m.created_at,
           u.username AS sender_username,
           u.minecraft_uuid AS sender_minecraft_uuid
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.id = ?`,
        [msgId],
        (err3, row) => {
          if (err3) return res.status(500).json({ error: 'Ошибка сервера' });

          res.status(201).json({
            id:             row.id,
            conversationId: row.conversation_id,
            senderId:       row.sender_id,
            content:        row.content,
            fileUrl:        row.file_url,
            fileType:       row.file_type,
            fileName:       row.file_name,
            isRead:         false,
            readAt:         null,
            createdAt:      row.created_at,
            sender: {
              id:            row.sender_id,
              username:      row.sender_username,
              minecraftUuid: row.sender_minecraft_uuid,
            },
          });
        }
      );
    } catch (e) {
      console.error('Ошибка в POST /conversations/:userId/messages:', e.message);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });
});


// ---------------------------------------------------------------------------
// Роутер для DELETE /api/messages/:id
// ---------------------------------------------------------------------------
// Вынесен в отдельный роутер (messagesDeleteRouter), чтобы корректно
// монтироваться на /api/messages в server.js.
// Удаляет сообщение (для всех — "отозвать").
// Только отправитель может удалить своё сообщение.
// ---------------------------------------------------------------------------
const messagesDeleteRouter = express.Router();

messagesDeleteRouter.delete('/:id', requireAuth, (req, res) => {
  const myId  = req.user.id;
  const msgId = req.params.id;

  // Находим сообщение
  db.get(
    `SELECT id, conversation_id, sender_id FROM messages WHERE id = ?`,
    [msgId],
    (err, msg) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });

      // Только отправитель может удалить
      if (msg.sender_id !== myId) {
        return res.status(403).json({ error: 'Нет прав на удаление этого сообщения' });
      }

      // Удаляем
      db.run(`DELETE FROM messages WHERE id = ?`, [msgId], async (err2) => {
        if (err2) return res.status(500).json({ error: 'Ошибка сервера' });

        // Обновляем last_message (берёт предыдущее сообщение)
        try {
          await updateLastMessage(msg.conversation_id);
        } catch (e) {
          console.error('Ошибка обновления last_message:', e.message);
        }

        res.json({ success: true });
      });
    }
  );
});


// router      — монтируется на /api/conversations
// messagesDeleteRouter — монтируется на /api/messages
module.exports = { conversationsRouter: router, messagesDeleteRouter };
