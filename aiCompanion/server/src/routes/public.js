// C 端匿名对话:不经 auth 中间件,每接口自校验 versionId 存在且 status='active'。
const router = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const cfg = require('../config/kb');
const chatService = require('../services/chatService');

// 中间件:校验 versionId (用 ah 包裹避免 async 中间件的 rejected promise 被吞)
const requireVersion = ah(async (req, res, next) => {
  const raw = req.body?.versionId || req.query?.versionId;
  const versionId = parseInt(raw, 10);
  if (!versionId) return fail(res, 400, 'versionId 必填');
  const [rows] = await db.query('SELECT id FROM versions WHERE id=? AND status="active"', [versionId]);
  if (rows.length === 0) return fail(res, 404, '版本不存在');
  req.versionId = versionId;
  next();
});

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

// POST /api/public/chat — 核心。Accept: text/event-stream 时走 SSE 推送真实处理阶段,
// 否则走原有一次性 JSON 返回(向后兼容,B端/测试均走此路径)。
router.post('/chat', requireVersion, ah(async (req, res) => {
  const sessionKey = String(req.body?.sessionKey || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!sessionKey) return fail(res, 400, 'sessionKey 必填');
  if (!message) return fail(res, 400, '消息不能为空');
  if (Buffer.byteLength(message, 'utf8') > cfg.llm.maxMessageBytes) {
    return fail(res, 400, `单条消息超长(>${cfg.llm.maxMessageBytes} 字节)`);
  }

  const wantsStream = String(req.headers.accept || '').includes('text/event-stream');

  if (!wantsStream) {
    try {
      const result = await chatService.handleChat({ versionId: req.versionId, sessionKey, message });
      res.json(result);
    } catch (err) {
      console.error('[public/chat] error:', err.message);
      return fail(res, 500, 'AI 服务暂时不可用,请稍后再试');
    }
    return;
  }

  // SSE 路径:响应头一旦写出就不能再变更状态码,失败也要用 error 帧承载,不能走 ah()/fail()。
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const sendEvent = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const result = await chatService.handleChat({
      versionId: req.versionId,
      sessionKey,
      message,
      onStage: stage => sendEvent('stage', { stage }),
    });
    sendEvent('done', result);
  } catch (err) {
    console.error('[public/chat] error:', err.message);
    sendEvent('error', { error: 'AI 服务暂时不可用,请稍后再试' });
  } finally {
    res.end();
  }
}));

module.exports = router;
