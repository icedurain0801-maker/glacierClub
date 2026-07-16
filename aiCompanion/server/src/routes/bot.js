const path = require('path');
const multer = require('multer');
const router = require('express').Router();
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const llm = require('../services/llm');
const { getBot } = require('../services/chatService');
const {
  createUploadTarget,
  deleteManagedAvatar,
  isDataUrl,
  isManagedAvatarPath,
  toAbsoluteAvatarUrl,
} = require('../services/botAvatarStore');

const DEFAULT_DISPLAY_NAME = '陪玩助手';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 800 * 1024;

router.use(version);

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function isQuestionMarkCorrupted(value, minimumQuestionMarks = 3) {
  const text = normalizeText(value);
  if (!text) return false;

  const questionCount = (text.match(/[?？]/g) || []).length;
  if (questionCount < minimumQuestionMarks) return false;

  const stripped = text.replace(/[\s?？~～!！,，.。:：;；'"“”‘’()（）[\]【】{}<>《》、|\\/+\-_=]+/g, '');
  return stripped.length === 0;
}

function normalizeAvatarUrl(value) {
  const avatarUrl = normalizeText(value);
  return avatarUrl || null;
}

function validateAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null;
  if (isManagedAvatarPath(avatarUrl)) return null;
  if (/^https?:\/\//i.test(avatarUrl)) return null;
  if (!isDataUrl(avatarUrl)) return '头像仅支持图片文件';
  if (avatarUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    return '头像处理后仍然过大，请重试';
  }

  const matched = avatarUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!matched) return '头像仅支持图片文件';

  let bytes = 0;
  try {
    bytes = Buffer.from(matched[1], 'base64').byteLength;
  } catch {
    return '头像图片数据无效';
  }
  if (!bytes) return '头像图片数据无效';
  if (bytes > MAX_AVATAR_BYTES) return '头像处理后仍然过大，请重试';
  return null;
}

const avatarStorage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const target = createUploadTarget(req.versionId, file);
      req.botAvatarUploadTarget = target;
      cb(null, target.dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    try {
      const target = req.botAvatarUploadTarget || createUploadTarget(req.versionId, file);
      req.botAvatarUploadTarget = target;
      cb(null, target.fileName);
    } catch (err) {
      cb(err);
    }
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter(_req, file, cb) {
    if (!file || !String(file.mimetype || '').startsWith('image/')) {
      cb(new Error('头像仅支持图片文件'));
      return;
    }
    cb(null, true);
  },
});

function uploadAvatar(req, res, next) {
  avatarUpload.single('avatar')(req, res, err => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      fail(res, 400, err.message || '头像上传失败');
      return;
    }
    fail(res, 400, err.message || '头像上传失败');
  });
}

router.get('/', ah(async (req, res) => {
  const bot = await getBot(req.versionId);
  res.json({
    displayName: bot.display_name || DEFAULT_DISPLAY_NAME,
    avatarPath: bot.avatar_url || null,
    avatarUrl: toAbsoluteAvatarUrl(req, bot.avatar_url),
    persona: bot.persona,
    welcome: bot.welcome,
    ragEnabled: !!bot.rag_enabled,
    ragTopK: bot.rag_top_k,
    kgEnabled: !!bot.kg_enabled,
    historyTurns: bot.history_turns,
    model: bot.model,
  });
}));

router.post('/avatar', uploadAvatar, ah(async (req, res) => {
  const file = req.file;
  const target = req.botAvatarUploadTarget;
  if (!file || !target) return fail(res, 400, '头像上传失败');

  res.json({
    avatarPath: target.storedPath,
    avatarUrl: toAbsoluteAvatarUrl(req, target.storedPath),
    fileName: path.basename(target.fileName),
  });
}));

router.post('/polish-persona', ah(async (req, res) => {
  const text = normalizeText(req.body?.text);
  if (!text) return fail(res, 400, '具体设定不能为空');
  if (text.length > 8000) return fail(res, 400, '具体设定过长(>8000)');

  const bot = await getBot(req.versionId);
  const { content } = await llm.chat([
    {
      role: 'system',
      content: [
        '你是一名资深角色设定编辑。',
        '请对用户提供的“角色具体设定”做整体润色。',
        '要求：',
        '1. 保留原始事实，不新增未提供的人设信息；',
        '2. 不改变原始世界观、角色关系、能力、阵营、身份等核心设定；',
        '3. 提升表达的清晰度、完整度和感染力；',
        '4. 保留原文语气，必要时优化段落和句式；',
        '5. 只返回润色后的最终文本，不要解释。',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ], { model: bot.model || undefined });

  res.json({ text: normalizeText(content) });
}));

router.put('/', ah(async (req, res) => {
  const displayName = normalizeText(req.body?.displayName);
  const avatarUrl = normalizeAvatarUrl(req.body?.avatarUrl);
  const persona = normalizeText(req.body?.persona);
  const welcome = normalizeText(req.body?.welcome);
  const ragEnabled = req.body?.ragEnabled;
  const ragTopK = req.body?.ragTopK;
  const kgEnabled = req.body?.kgEnabled;
  const historyTurns = req.body?.historyTurns;
  const model = normalizeText(req.body?.model);

  if (!displayName || !persona || !welcome) {
    return fail(res, 400, 'displayName / persona / welcome 必填');
  }
  if (displayName.length > 64) return fail(res, 400, 'displayName 过长(>64)');
  if (persona.length > 8000) return fail(res, 400, 'persona 过长(>8000)');
  if (welcome.length > 512) return fail(res, 400, 'welcome 过长(>512)');
  if (
    isQuestionMarkCorrupted(displayName) ||
    isQuestionMarkCorrupted(persona) ||
    isQuestionMarkCorrupted(welcome)
  ) {
    return fail(res, 400, '检测到文本编码异常，请在后台页面重新填写后再保存');
  }

  const avatarError = validateAvatarUrl(avatarUrl);
  if (avatarError) return fail(res, 400, avatarError);

  const topK = parseInt(ragTopK, 10);
  if (Number.isNaN(topK) || topK < 1 || topK > 20) return fail(res, 400, 'ragTopK 需在 1-20');
  const turns = parseInt(historyTurns, 10);
  if (Number.isNaN(turns) || turns < 1 || turns > 50) return fail(res, 400, 'historyTurns 需在 1-50');

  const [existingRows] = await db.query('SELECT avatar_url FROM bots WHERE version_id=? LIMIT 1', [req.versionId]);
  const previousAvatarUrl = existingRows[0] ? existingRows[0].avatar_url : null;

  try {
    await db.query(
      `INSERT INTO bots (version_id, display_name, avatar_url, persona, welcome, rag_enabled, rag_top_k, kg_enabled, history_turns, model)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         display_name=VALUES(display_name),
         avatar_url=VALUES(avatar_url),
         persona=VALUES(persona),
         welcome=VALUES(welcome),
         rag_enabled=VALUES(rag_enabled),
         rag_top_k=VALUES(rag_top_k),
         kg_enabled=VALUES(kg_enabled),
         history_turns=VALUES(history_turns),
         model=VALUES(model)`,
      [
        req.versionId,
        displayName,
        avatarUrl,
        persona,
        welcome,
        ragEnabled ? 1 : 0,
        topK,
        kgEnabled === undefined || kgEnabled ? 1 : 0,
        turns,
        model || null,
      ]
    );
  } catch (err) {
    if (err && (err.code === 'ER_NET_PACKET_TOO_LARGE' || err.code === 'ECONNRESET')) {
      return fail(res, 400, '头像处理后仍然过大，请重试');
    }
    throw err;
  }

  if (previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
    deleteManagedAvatar(previousAvatarUrl);
  }

  res.json({ ok: true });
}));

module.exports = router;
