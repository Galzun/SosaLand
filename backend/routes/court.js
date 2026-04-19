// routes/court.js
// Система «Суд» — жалобы игроков, чат внутри тикетов, судебные заседания.
//
// Тикеты:
//   POST   /api/court/tickets                    — создать жалобу (любой авторизованный)
//   GET    /api/court/tickets/my                 — мои тикеты (создатель)
//   GET    /api/court/tickets/pending-count      — кол-во pending (manage_court или admin+)
//   GET    /api/court/tickets                    — все тикеты (manage_court или admin+)
//   GET    /api/court/tickets/:id                — один тикет + сообщения
//   POST   /api/court/tickets/:id/review         — взять в работу (manage_court или admin+)
//   POST   /api/court/tickets/:id/reject         — отклонить (manage_court или admin+)
//   POST   /api/court/tickets/:id/close          — закрыть (manage_court или admin+)
//   POST   /api/court/tickets/:id/messages       — отправить сообщение (создатель или рецензент)
//
// Заседания:
//   GET    /api/court/cases                      — список (все авторизованные)
//   POST   /api/court/cases                      — создать (manage_court или admin+)
//   GET    /api/court/cases/:id                  — одно заседание
//   PUT    /api/court/cases/:id                  — обновить (manage_court или admin+)
//   DELETE /api/court/cases/:id                  — удалить (manage_court или admin+)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, isAdminOrPerm, ROLE_LEVEL } = require('../middleware/auth');
const avatarUrl = require('../utils/avatarUrl');
const { logActivity } = require('../utils/logActivity');

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
}

const router = express.Router();

const canManageCourt = isAdminOrPerm('manage_court');

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function now() {
  return Math.floor(Date.now() / 1000);
}

function formatUser(row) {
  if (!row || !row.user_id) return null;
  return {
    id:        row.user_id,
    username:  row.user_username,
    avatarUrl: avatarUrl(row.user_uuid, row.user_username),
  };
}

async function addSystemMessage(ticketId, content) {
  await db.run(
    `INSERT INTO court_ticket_messages (id, ticket_id, sender_id, content, is_system)
     VALUES (?, ?, NULL, ?, 1)`,
    [uuidv4(), ticketId, content]
  );
}

// ---------------------------------------------------------------------------
// POST /api/court/tickets — создать тикет-жалобу
// ---------------------------------------------------------------------------
router.post('/tickets', requireAuth, async (req, res) => {
  const { accusedName, title, description, attachments } = req.body;

  if (!accusedName?.trim()) return res.status(400).json({ error: 'Укажите имя обвиняемого игрока' });
  if (!title?.trim())       return res.status(400).json({ error: 'Укажите тему жалобы' });
  if (title.trim().length > 200) return res.status(400).json({ error: 'Тема слишком длинная (макс. 200)' });

  const id = uuidv4();
  const ts = now();

  await db.run(
    `INSERT INTO court_tickets (id, created_by, accused_name, title, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', 'pending', ?, ?)`,
    [id, req.user.id, accusedName.trim(), title.trim(), ts, ts]
  );

  logActivity({ userId: req.user.id, username: req.user.username, action: 'court_ticket_create', targetId: id, ip: clientIp(req), details: { accusedName: accusedName.trim(), title: title.trim() } });
  res.status(201).json({ id });
});

// ---------------------------------------------------------------------------
// GET /api/court/tickets/pending-count
// ---------------------------------------------------------------------------
router.get('/tickets/pending-count', requireAuth, canManageCourt, async (req, res) => {
  const row = await db.get(
    `SELECT COUNT(*) AS cnt FROM court_tickets WHERE status = 'pending'`
  );
  res.json({ count: Number(row?.cnt ?? 0) });
});

// ---------------------------------------------------------------------------
// GET /api/court/tickets/my — мои тикеты
// ---------------------------------------------------------------------------
router.get('/tickets/my', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT ct.*,
            ru.username AS reviewer_username,
            ru.minecraft_uuid AS reviewer_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = ru.minecraft_uuid LIMIT 1) AS reviewer_minecraft_name
     FROM court_tickets ct
     LEFT JOIN users ru ON ru.id = ct.reviewer_id
     WHERE ct.created_by = ?
     ORDER BY ct.created_at DESC`,
    [req.user.id]
  );

  res.json(rows.map(formatTicket));
});

// ---------------------------------------------------------------------------
// GET /api/court/tickets — все тикеты (manage_court или admin+)
// ---------------------------------------------------------------------------
router.get('/tickets', requireAuth, canManageCourt, async (req, res) => {
  const { status } = req.query;
  const params = [];
  let where = '';

  if (status) {
    where = 'WHERE ct.status = ?';
    params.push(status);
  }

  const rows = await db.all(
    `SELECT ct.*,
            cu.username AS creator_username,
            cu.minecraft_uuid AS creator_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = cu.minecraft_uuid LIMIT 1) AS creator_minecraft_name,
            ru.username AS reviewer_username,
            ru.minecraft_uuid AS reviewer_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = ru.minecraft_uuid LIMIT 1) AS reviewer_minecraft_name
     FROM court_tickets ct
     LEFT JOIN users cu ON cu.id = ct.created_by
     LEFT JOIN users ru ON ru.id = ct.reviewer_id
     ${where}
     ORDER BY
       CASE ct.status
         WHEN 'pending'   THEN 0
         WHEN 'reviewing' THEN 1
         WHEN 'closed'    THEN 2
         WHEN 'rejected'  THEN 3
       END,
       ct.created_at DESC`,
    params
  );

  res.json(rows.map(r => ({
    ...formatTicket(r),
    creator: {
      id:           r.created_by,
      username:     r.creator_username,
      minecraftName: r.creator_minecraft_name || null,
      avatarUrl:    avatarUrl(r.creator_uuid, r.creator_username),
    },
  })));
});

// ---------------------------------------------------------------------------
// GET /api/court/tickets/:id — один тикет с сообщениями
// ---------------------------------------------------------------------------
router.get('/tickets/:id', requireAuth, async (req, res) => {
  const ticket = await db.get(
    `SELECT ct.*,
            cu.username AS creator_username,
            cu.minecraft_uuid AS creator_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = cu.minecraft_uuid LIMIT 1) AS creator_minecraft_name,
            ru.username AS reviewer_username,
            ru.minecraft_uuid AS reviewer_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = ru.minecraft_uuid LIMIT 1) AS reviewer_minecraft_name
     FROM court_tickets ct
     LEFT JOIN users cu ON cu.id = ct.created_by
     LEFT JOIN users ru ON ru.id = ct.reviewer_id
     WHERE ct.id = ?`,
    [req.params.id]
  );

  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });

  // Доступ: создатель или manage_court/admin+
  const callerLevel = ROLE_LEVEL[req.user.role] ?? 0;
  const canManage   = callerLevel >= ROLE_LEVEL.admin || req.user.customPermissions?.has('manage_court');
  if (ticket.created_by !== req.user.id && !canManage) {
    return res.status(403).json({ error: 'Нет доступа к этому тикету' });
  }

  const messages = await db.all(
    `SELECT ctm.*,
            u.username AS sender_username,
            u.minecraft_uuid AS sender_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS sender_minecraft_name
     FROM court_ticket_messages ctm
     LEFT JOIN users u ON u.id = ctm.sender_id
     WHERE ctm.ticket_id = ?
     ORDER BY ctm.created_at ASC`,
    [req.params.id]
  );

  res.json({
    ...formatTicket(ticket),
    creator: {
      id:           ticket.created_by,
      username:     ticket.creator_username,
      minecraftName: ticket.creator_minecraft_name || null,
      avatarUrl:    avatarUrl(ticket.creator_uuid, ticket.creator_username),
    },
    messages: messages.map(m => ({
      id:        m.id,
      senderId:  m.sender_id,
      content:   m.content,
      isSystem:  !!m.is_system,
      createdAt: m.created_at,
      fileUrl:   m.file_url   || null,
      fileType:  m.file_type  || null,
      fileName:  m.file_name  || null,
      files:     m.files_json ? (() => { try { return JSON.parse(m.files_json); } catch { return []; } })() : [],
      isRead:    true,
      sender: m.sender_id ? {
        id:           m.sender_id,
        username:     m.sender_username,
        minecraftName: m.sender_minecraft_name || null,
        avatarUrl:    avatarUrl(m.sender_uuid, m.sender_username),
      } : null,
    })),
  });
});

// ---------------------------------------------------------------------------
// POST /api/court/tickets/:id/review — взять в работу
// ---------------------------------------------------------------------------
router.post('/tickets/:id/review', requireAuth, canManageCourt, async (req, res) => {
  const ticket = await db.get(
    `SELECT id, status FROM court_tickets WHERE id = ?`,
    [req.params.id]
  );
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  if (ticket.status !== 'pending') {
    return res.status(409).json({ error: `Тикет нельзя взять в работу (статус: ${ticket.status})` });
  }

  const ts = now();
  await db.run(
    `UPDATE court_tickets
     SET status = 'reviewing', reviewer_id = ?, review_started_at = ?, updated_at = ?
     WHERE id = ?`,
    [req.user.id, ts, ts, req.params.id]
  );

  await addSystemMessage(req.params.id, `⚖️ Тикет взят в рассмотрение модератором @${req.user.username}`);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'court_ticket_review', targetId: req.params.id, ip: clientIp(req) });

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/court/tickets/:id/reject — отклонить тикет
// ---------------------------------------------------------------------------
router.post('/tickets/:id/reject', requireAuth, canManageCourt, async (req, res) => {
  const { reason } = req.body;

  const ticket = await db.get(
    `SELECT id, status FROM court_tickets WHERE id = ?`,
    [req.params.id]
  );
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  if (ticket.status === 'closed' || ticket.status === 'rejected') {
    return res.status(409).json({ error: `Тикет уже закрыт (статус: ${ticket.status})` });
  }

  const ts = now();
  await db.run(
    `UPDATE court_tickets
     SET status = 'rejected', closed_at = ?, closed_by = ?, rejection_reason = ?, updated_at = ?
     WHERE id = ?`,
    [ts, req.user.id, reason?.trim() || null, ts, req.params.id]
  );

  const msg = reason?.trim()
    ? `❌ Тикет отклонён. Причина: ${reason.trim()}`
    : '❌ Тикет отклонён.';
  await addSystemMessage(req.params.id, msg);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'court_ticket_reject', targetId: req.params.id, ip: clientIp(req), details: reason?.trim() ? { reason: reason.trim() } : undefined });

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/court/tickets/:id/close — закрыть тикет после рассмотрения
// ---------------------------------------------------------------------------
router.post('/tickets/:id/close', requireAuth, canManageCourt, async (req, res) => {
  const ticket = await db.get(
    `SELECT id, status FROM court_tickets WHERE id = ?`,
    [req.params.id]
  );
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  if (ticket.status === 'closed' || ticket.status === 'rejected') {
    return res.status(409).json({ error: `Тикет уже закрыт (статус: ${ticket.status})` });
  }

  const ts = now();
  await db.run(
    `UPDATE court_tickets
     SET status = 'closed', closed_at = ?, closed_by = ?, updated_at = ?
     WHERE id = ?`,
    [ts, req.user.id, ts, req.params.id]
  );

  await addSystemMessage(req.params.id, `✅ Тикет закрыт модератором @${req.user.username}`);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'court_ticket_close', targetId: req.params.id, ip: clientIp(req) });

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/court/tickets/:id/messages — отправить сообщение в чат тикета
// ---------------------------------------------------------------------------
router.post('/tickets/:id/messages', requireAuth, async (req, res) => {
  const { content, fileUrl, fileType, fileName, filesJson } = req.body;

  const hasText  = content?.trim();
  const hasFile  = fileUrl || (filesJson && filesJson !== '[]');
  if (!hasText && !hasFile) return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  if (hasText && content.trim().length > 2000) return res.status(400).json({ error: 'Сообщение слишком длинное (макс. 2000)' });

  const ticket = await db.get(
    `SELECT id, created_by, reviewer_id, status FROM court_tickets WHERE id = ?`,
    [req.params.id]
  );
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });

  // Только создатель или manage_court/admin+ может писать
  const callerLevel = ROLE_LEVEL[req.user.role] ?? 0;
  const canManage   = callerLevel >= ROLE_LEVEL.admin || req.user.customPermissions?.has('manage_court');
  const isCreator   = ticket.created_by === req.user.id;

  if (!isCreator && !canManage) {
    return res.status(403).json({ error: 'Нет доступа к чату тикета' });
  }
  if (ticket.status === 'closed' || ticket.status === 'rejected') {
    return res.status(409).json({ error: 'Тикет закрыт — сообщения не принимаются' });
  }

  const id = uuidv4();
  const ts = now();

  await db.run(
    `INSERT INTO court_ticket_messages
       (id, ticket_id, sender_id, content, is_system, file_url, file_type, file_name, files_json, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [id, req.params.id, req.user.id, hasText ? content.trim() : '',
     fileUrl || null, fileType || null, fileName || null,
     filesJson || null, ts]
  );

  await db.run(`UPDATE court_tickets SET updated_at = ? WHERE id = ?`, [ts, req.params.id]);

  const u = await db.get(
    `SELECT u.username, u.minecraft_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS minecraft_name
     FROM users u WHERE u.id = ?`,
    [req.user.id]
  );

  const parsedFiles = (() => { try { return JSON.parse(filesJson || '[]'); } catch { return []; } })();

  res.status(201).json({
    id,
    senderId:  req.user.id,
    content:   hasText ? content.trim() : '',
    isSystem:  false,
    createdAt: ts,
    fileUrl:   fileUrl  || null,
    fileType:  fileType || null,
    fileName:  fileName || null,
    files:     parsedFiles,
    isRead:    true,
    sender: {
      id:           req.user.id,
      username:     u.username,
      minecraftName: u.minecraft_name || null,
      avatarUrl:    avatarUrl(u.minecraft_uuid, u.username),
    },
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/court/tickets/:id — удалить тикет (manage_court или admin+)
// ---------------------------------------------------------------------------
router.delete('/tickets/:id', requireAuth, canManageCourt, async (req, res) => {
  const ticket = await db.get(`SELECT id FROM court_tickets WHERE id = ?`, [req.params.id]);
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  await db.run(`DELETE FROM court_tickets WHERE id = ?`, [req.params.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/court/cases — список заседаний
// ---------------------------------------------------------------------------
router.get('/cases', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT cc.*,
            u.username AS creator_username,
            u.minecraft_uuid AS creator_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS creator_minecraft_name,
            ct.title AS ticket_title,
            ct.accused_name AS ticket_accused
     FROM court_cases cc
     LEFT JOIN users u ON u.id = cc.created_by
     LEFT JOIN court_tickets ct ON ct.id = cc.ticket_id
     ORDER BY cc.hearing_at DESC NULLS LAST, cc.created_at DESC`
  );

  res.json(rows.map(r => ({
    id:              r.id,
    title:           r.title,
    description:     r.description,
    verdict:         r.verdict,
    hearingAt:            r.hearing_at,
    hearingAtApproximate: Number(r.hearing_at_approximate) === 1,
    status:          r.status,
    previewImageUrl:        r.preview_image_url         || null,
    previewVerdictImageUrl: r.preview_verdict_image_url || null,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
    ticketId:        r.ticket_id,
    ticketTitle:     r.ticket_title,
    ticketAccused:   r.ticket_accused,
    creator: {
      id:           r.created_by,
      username:     r.creator_username,
      minecraftName: r.creator_minecraft_name || null,
      avatarUrl:    avatarUrl(r.creator_uuid, r.creator_username),
    },
  })));
});

// ---------------------------------------------------------------------------
// POST /api/court/cases — создать заседание
// ---------------------------------------------------------------------------
router.post('/cases', requireAuth, canManageCourt, async (req, res) => {
  const { title, description, verdict, ticketId, hearingAt, hearingAtApproximate, status, previewImageUrl, previewVerdictImageUrl } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'Укажите название заседания' });
  if (title.trim().length > 200) return res.status(400).json({ error: 'Название слишком длинное (макс. 200)' });

  if (ticketId) {
    const t = await db.get(`SELECT id FROM court_tickets WHERE id = ?`, [ticketId]);
    if (!t) return res.status(400).json({ error: 'Тикет не найден' });
  }

  const VALID_STATUS = ['scheduled', 'in_progress', 'completed'];
  const caseStatus = VALID_STATUS.includes(status) ? status : 'scheduled';

  const id = uuidv4();
  const ts = now();

  await db.run(
    `INSERT INTO court_cases (id, ticket_id, title, description, verdict, hearing_at, hearing_at_approximate, created_by, status, preview_image_url, preview_verdict_image_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, ticketId || null, title.trim(), description?.trim() || null, verdict?.trim() || null, hearingAt || null, hearingAtApproximate ? 1 : 0, req.user.id, caseStatus, previewImageUrl?.trim() || null, previewVerdictImageUrl?.trim() || null, ts, ts]
  );

  logActivity({ userId: req.user.id, username: req.user.username, action: 'court_case_create', targetId: id, ip: clientIp(req), details: { title: title.trim() } });
  res.status(201).json({ id });
});

// ---------------------------------------------------------------------------
// GET /api/court/cases/:id
// ---------------------------------------------------------------------------
router.get('/cases/:id', requireAuth, async (req, res) => {
  const r = await db.get(
    `SELECT cc.*,
            u.username AS creator_username,
            u.minecraft_uuid AS creator_uuid,
            (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS creator_minecraft_name,
            ct.title AS ticket_title,
            ct.accused_name AS ticket_accused
     FROM court_cases cc
     LEFT JOIN users u ON u.id = cc.created_by
     LEFT JOIN court_tickets ct ON ct.id = cc.ticket_id
     WHERE cc.id = ?`,
    [req.params.id]
  );

  if (!r) return res.status(404).json({ error: 'Заседание не найдено' });

  res.json({
    id:              r.id,
    title:           r.title,
    description:     r.description,
    verdict:         r.verdict,
    hearingAt:            r.hearing_at,
    hearingAtApproximate: Number(r.hearing_at_approximate) === 1,
    status:          r.status,
    previewImageUrl:        r.preview_image_url         || null,
    previewVerdictImageUrl: r.preview_verdict_image_url || null,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
    ticketId:        r.ticket_id,
    ticketTitle:     r.ticket_title,
    ticketAccused:   r.ticket_accused,
    creator: {
      id:           r.created_by,
      username:     r.creator_username,
      minecraftName: r.creator_minecraft_name || null,
      avatarUrl:    avatarUrl(r.creator_uuid, r.creator_username),
    },
  });
});

// ---------------------------------------------------------------------------
// PUT /api/court/cases/:id
// ---------------------------------------------------------------------------
router.put('/cases/:id', requireAuth, canManageCourt, async (req, res) => {
  const { title, description, verdict, hearingAt, hearingAtApproximate, status, ticketId, previewImageUrl, previewVerdictImageUrl } = req.body;

  const c = await db.get(`SELECT id, preview_image_url, preview_verdict_image_url, hearing_at, hearing_at_approximate FROM court_cases WHERE id = ?`, [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Заседание не найдено' });

  const VALID_STATUS = ['scheduled', 'in_progress', 'completed'];
  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }

  if (ticketId) {
    const t = await db.get(`SELECT id FROM court_tickets WHERE id = ?`, [ticketId]);
    if (!t) return res.status(400).json({ error: 'Тикет не найден' });
  }

  const ts = now();
  await db.run(
    `UPDATE court_cases
     SET title             = COALESCE(?, title),
         description       = ?,
         verdict           = ?,
         hearing_at        = ?,
         hearing_at_approximate = ?,
         status            = COALESCE(?, status),
         ticket_id         = COALESCE(?, ticket_id),
         preview_image_url        = ?,
         preview_verdict_image_url = ?,
         updated_at               = ?
     WHERE id = ?`,
    [
      title?.trim() || null,
      description?.trim() ?? null,
      verdict?.trim() ?? null,
      hearingAt !== undefined ? (hearingAt || null) : c.hearing_at,
      hearingAtApproximate !== undefined ? (hearingAtApproximate ? 1 : 0) : c.hearing_at_approximate,
      status || null,
      ticketId || null,
      previewImageUrl !== undefined ? (previewImageUrl?.trim() || null) : c.preview_image_url,
      previewVerdictImageUrl !== undefined ? (previewVerdictImageUrl?.trim() || null) : c.preview_verdict_image_url,
      ts,
      req.params.id,
    ]
  );

  logActivity({ userId: req.user.id, username: req.user.username, action: 'court_case_update', targetId: req.params.id, ip: clientIp(req), details: title?.trim() ? { title: title.trim() } : undefined });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/court/cases/:id
// ---------------------------------------------------------------------------
router.delete('/cases/:id', requireAuth, canManageCourt, async (req, res) => {
  const c = await db.get(`SELECT id, title FROM court_cases WHERE id = ?`, [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Заседание не найдено' });

  await db.run(`DELETE FROM court_cases WHERE id = ?`, [req.params.id]);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'court_case_delete', targetId: req.params.id, ip: clientIp(req), details: { title: c.title } });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Форматтер тикета
// ---------------------------------------------------------------------------
function formatTicket(r) {
  let attachments = [];
  try { attachments = JSON.parse(r.attachments || '[]'); } catch {}
  return {
    id:              r.id,
    accusedName:     r.accused_name,
    title:           r.title,
    description:     r.description,
    status:          r.status,
    attachments,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
    reviewStartedAt: r.review_started_at,
    closedAt:        r.closed_at,
    rejectionReason: r.rejection_reason,
    reviewer: r.reviewer_id ? {
      id:           r.reviewer_id,
      username:     r.reviewer_username,
      minecraftName: r.reviewer_minecraft_name || null,
      avatarUrl:    avatarUrl(r.reviewer_uuid, r.reviewer_username),
    } : null,
  };
}

module.exports = { router };
