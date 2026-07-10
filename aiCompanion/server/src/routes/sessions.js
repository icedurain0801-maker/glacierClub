const router = require('express').Router();
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');

router.use(version);

// GET /api/sessions — 分页列表(最新在前)
router.get('/', ah(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const [rows] = await db.query(
    `SELECT id, session_key, title, message_count, created_at, updated_at
       FROM chat_sessions WHERE version_id=?
      ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [req.versionId, limit, offset]
  );
  res.json(rows);
}));

// GET /api/sessions/:id — 详情 + 全部消息
router.get('/:id', ah(async (req, res) => {
  const [sess] = await db.query(
    'SELECT id, session_key, title, message_count, created_at FROM chat_sessions WHERE id=? AND version_id=?',
    [req.params.id, req.versionId]
  );
  if (sess.length === 0) return fail(res, 404, '会话不存在');
  const [msgs] = await db.query(
    'SELECT id, role, content, refs_json, created_at FROM chat_messages WHERE session_id=? ORDER BY id',
    [req.params.id]
  );
  res.json({ session: sess[0], messages: msgs });
}));

// DELETE /api/sessions/:id
router.delete('/:id', ah(async (req, res) => {
  const [r] = await db.query('DELETE FROM chat_sessions WHERE id=? AND version_id=?', [req.params.id, req.versionId]);
  if (r.affectedRows === 0) return fail(res, 404, '会话不存在');
  res.json({ ok: true });
}));

module.exports = router;
