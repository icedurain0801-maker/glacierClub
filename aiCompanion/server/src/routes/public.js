const router = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const cfg = require('../config/kb');
const chatService = require('../services/chatService');
const { toAbsoluteAvatarUrl } = require('../services/botAvatarStore');

const requireVersion = ah(async (req, res, next) => {
  const raw = req.body?.versionId || req.query?.versionId;
  const versionId = parseInt(raw, 10);
  if (!versionId) return fail(res, 400, 'versionId \u5fc5\u586b');

  const [rows] = await db.query('SELECT id FROM versions WHERE id=? AND status="active"', [versionId]);
  if (rows.length === 0) return fail(res, 404, '\u7248\u672c\u4e0d\u5b58\u5728');

  req.versionId = versionId;
  next();
});

router.get('/bot', requireVersion, ah(async (req, res) => {
  const bot = await chatService.getBot(req.versionId);
  res.json({
    displayName: bot.display_name || '\u966a\u73a9\u52a9\u624b',
    avatarUrl: toAbsoluteAvatarUrl(req, bot.avatar_url),
    welcome: bot.welcome || '\u4f60\u597d\uff0c\u6211\u662f\u4f60\u7684\u6e38\u620f\u966a\u73a9\u52a9\u624b\uff0c\u6709\u4ec0\u4e48\u60f3\u804a\u7684\uff1f',
  });
}));

router.get('/history', requireVersion, ah(async (req, res) => {
  const sessionKey = String(req.query.sessionKey || '').trim();
  if (!sessionKey) return fail(res, 400, 'sessionKey \u5fc5\u586b');

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

router.post('/chat', requireVersion, ah(async (req, res) => {
  const sessionKey = String(req.body?.sessionKey || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!sessionKey) return fail(res, 400, 'sessionKey \u5fc5\u586b');
  if (!message) return fail(res, 400, '\u6d88\u606f\u4e0d\u80fd\u4e3a\u7a7a');
  if (Buffer.byteLength(message, 'utf8') > cfg.llm.maxMessageBytes) {
    return fail(res, 400, `\u5355\u6761\u6d88\u606f\u8d85\u957f(>${cfg.llm.maxMessageBytes} \u5b57\u8282)`);
  }

  try {
    const result = await chatService.handleChat({
      versionId: req.versionId,
      sessionKey,
      message,
      requestMeta: {
        ip: req.ip,
        forwardedFor: req.get('x-forwarded-for') || '',
        userAgent: req.get('user-agent') || '',
      },
    });
    res.json(result);
  } catch (err) {
    console.error('[public/chat] error:', err.message);
    return fail(res, 500, 'AI \u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5');
  }
}));

module.exports = router;
