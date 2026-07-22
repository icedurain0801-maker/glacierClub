const multer = require('multer');
const router = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const cfg = require('../config/kb');
const chatService = require('../services/chatService');
const chatMediaService = require('../services/chatMediaService');
const { toAbsoluteAvatarUrl } = require('../services/botAvatarStore');

const requireVersion = ah(async (req, res, next) => {
  const raw = req.body?.versionId || req.query?.versionId;
  const versionId = parseInt(raw, 10);
  if (!versionId) return fail(res, 400, 'versionId 必填');

  const [rows] = await db.query('SELECT id FROM versions WHERE id=? AND status="active"', [versionId]);
  if (rows.length === 0) return fail(res, 404, '版本不存在');

  req.versionId = versionId;
  next();
});

const chatUploadStorage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const target = chatMediaService.createUploadTarget(req.body?.versionId || req.query?.versionId, file);
      req.chatMediaUploadTarget = target;
      cb(null, target.dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    try {
      const target = req.chatMediaUploadTarget || chatMediaService.createUploadTarget(req.body?.versionId || req.query?.versionId, file);
      req.chatMediaUploadTarget = target;
      cb(null, target.fileName);
    } catch (err) {
      cb(err);
    }
  },
});

const chatUpload = multer({
  storage: chatUploadStorage,
  limits: {
    files: 1,
    fileSize: cfg.chatMedia.maxUploadBytes,
  },
  fileFilter(_req, file, cb) {
    const kind = chatMediaService.getMediaKind(file?.mimetype);
    if (!kind) {
      cb(new Error('附件仅支持图片或视频'));
      return;
    }
    cb(null, true);
  },
});

function parseChatPayload(req, res, next) {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }

  chatUpload.single('attachment')(req, res, err => {
    if (!err) {
      if (req.file && req.chatMediaUploadTarget) {
        req.file.storedPath = req.chatMediaUploadTarget.storedPath;
      }
      next();
      return;
    }

    const message = err instanceof multer.MulterError
      ? (err.message || '附件上传失败')
      : (err.message || '附件上传失败');
    fail(res, 400, message);
  });
}

router.get('/bot', requireVersion, ah(async (req, res) => {
  const bot = await chatService.getBot(req.versionId);
  res.json({
    displayName: bot.display_name || '陪玩助手',
    avatarUrl: toAbsoluteAvatarUrl(req, bot.avatar_url),
    welcome: bot.welcome || '你好，我是你的游戏陪玩助手，有什么想聊的？',
  });
}));

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

router.post('/chat', parseChatPayload, requireVersion, ah(async (req, res) => {
  const sessionKey = String(req.body?.sessionKey || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!sessionKey) return fail(res, 400, 'sessionKey 必填');
  if (!message) return fail(res, 400, '消息不能为空');
  if (Buffer.byteLength(message, 'utf8') > cfg.llm.maxMessageBytes) {
    return fail(res, 400, `单条消息超长(>${cfg.llm.maxMessageBytes} 字节)`);
  }

  const wantsStream = String(req.headers.accept || '').includes('text/event-stream');
  const requestMeta = {
    ip: req.ip,
    forwardedFor: req.get('x-forwarded-for') || '',
    userAgent: req.get('user-agent') || '',
  };

  let mediaContext = null;
  if (req.file) {
    try {
      mediaContext = await chatMediaService.analyzeUploadedMedia({
        file: req.file,
        previewImageDataUrl: req.body?.attachmentPreviewDataUrl || '',
      });
    } catch (err) {
      await chatMediaService.cleanupUploadedFile(req.file.path);
      return fail(res, 400, err.message || '附件解析失败');
    }
  }

  const chatArgs = {
    versionId: req.versionId,
    sessionKey,
    message,
    requestMeta,
    mediaContext,
  };

  if (!wantsStream) {
    try {
      const result = await chatService.handleChat(chatArgs);
      res.json(result);
    } catch (err) {
      console.error('[public/chat] error:', err.message);
      return fail(res, 500, 'AI 服务暂时不可用，请稍后再试');
    }
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await chatService.handleChat({
      ...chatArgs,
      onStage: stage => sendEvent('stage', { stage }),
      skipPolish: true,
    });
    sendEvent('done', result);
  } catch (err) {
    console.error('[public/chat] error:', err.message);
    sendEvent('error', { error: 'AI 服务暂时不可用，请稍后再试' });
  } finally {
    res.end();
  }
}));

module.exports = router;
