// C 端匿名对话:不经 auth 中间件,每接口自校验 versionId 存在且 status='active'。
const router = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const cfg = require('../config/kb');
const chatService = require('../services/chatService');

// 中间件:校验 versionId
async function requireVersion(req, res, next) {
  const raw = req.body?.versionId || req.query?.versionId;
  const versionId = parseInt(raw, 10);
  if (!versionId) return fail(res, 400, 'versionId 必填');
  const [rows] = await db.query('SELECT id FROM versions WHERE id=? AND status="active"', [versionId]);
  if (rows.length === 0) return fail(res, 404, '版本不存在');
  req.versionId = versionId;
  next();
}

// GET /api/public/bot — 只返 welcome
router.get('/bot', requireVersion, ah(async (req, res) => {
  const [rows] = await db.query('SELECT welcome FROM bots WHERE version_id=?', [req.versionId]);
  const welcome = rows[0]?.welcome || '你好,我是你的游戏陪玩助手,有什么想聊的?';
  res.json({ welcome });
}));

// GET /api/public/history — 恢复历史
router.get('/history', requireVersion, ah(async (req, res) => {
  const sessionKey = String(req.query.sessionKey || '').trim();
  if (!sessionKey) return fail(res, 400, 'sessionKey 必填');
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  const [sess] = await db.query(
    'SELECT id FROM chat_sessions WHERE version_id=? AND session_key=?',
    [req.versionId, sessionKey]
  );
  if (sess.length === 0) return res.json({ messages: [] });

  const [msgs] = await db.query(
    'SELECT role, content, refs_json, created_at FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT ?',
    [sess[0].id, limit]
  );
  res.json({ messages: msgs.reverse() });
}));

// POST /api/public/chat — 核心
router.post('/chat', requireVersion, ah(async (req, res) => {
  const sessionKey = String(req.body?.sessionKey || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!sessionKey) return fail(res, 400, 'sessionKey 必填');
  if (!message) return fail(res, 400, '消息不能为空');
  if (Buffer.byteLength(message, 'utf8') > cfg.llm.maxMessageBytes) {
    return fail(res, 400, `单条消息超长(>${cfg.llm.maxMessageBytes} 字节)`);
  }

  try {
    const result = await chatService.handleChat({ versionId: req.versionId, sessionKey, message });
    res.json(result);
  } catch (err) {
    console.error('[public/chat] error:', err.message);
    return fail(res, 500, 'AI 服务暂时不可用,请稍后再试');
  }
}));

module.exports = router;
