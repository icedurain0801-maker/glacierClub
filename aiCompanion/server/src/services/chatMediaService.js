const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cfg = require('../config/kb');
const llm = require('./llm');

let sharp = null;
try {
  // sharp 是原生二进制模块,加载失败时降级为"不提供内联图",只走文字 summary 兜底
  sharp = require('sharp');
} catch {
  sharp = null;
}

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeFileName(name) {
  return String(name || 'attachment')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'attachment';
}

function getExtension(file) {
  const originalExt = path.extname(String(file?.originalname || '')).toLowerCase();
  if (originalExt) return originalExt;

  switch (String(file?.mimetype || '').toLowerCase()) {
    case 'image/png': return '.png';
    case 'image/jpeg': return '.jpg';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'video/mp4': return '.mp4';
    case 'video/webm': return '.webm';
    case 'video/quicktime': return '.mov';
    default: return '';
  }
}

function getMediaKind(mimetype) {
  const type = String(mimetype || '').toLowerCase();
  if (IMAGE_MIME_TYPES.has(type)) return 'image';
  if (VIDEO_MIME_TYPES.has(type)) return 'video';
  return '';
}

function getMaxBytesForMime(mimetype) {
  return getMediaKind(mimetype) === 'image'
    ? cfg.chatMedia.imageMaxBytes
    : cfg.chatMedia.videoMaxBytes;
}

function createUploadTarget(versionId, file) {
  const versionPart = `v${parseInt(versionId, 10) || 0}`;
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const dir = path.join(cfg.chatMediaDir, versionPart, datePart);
  ensureDir(dir);

  const baseName = path.basename(normalizeFileName(file?.originalname), path.extname(String(file?.originalname || '')));
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${baseName.slice(0, 48) || 'attachment'}${getExtension(file)}`;
  const storedPath = `/${versionPart}/${datePart}/${fileName}`.replace(/\\/g, '/');

  return {
    dir,
    fileName,
    absolutePath: path.join(dir, fileName),
    storedPath,
  };
}

function validateUploadedFile(file) {
  if (!file) throw new Error('附件上传失败');

  const mimetype = String(file.mimetype || '').toLowerCase();
  const kind = getMediaKind(mimetype);
  if (!kind) throw new Error('附件仅支持图片或视频');

  const maxBytes = getMaxBytesForMime(mimetype);
  if (file.size > maxBytes) {
    throw new Error(kind === 'image' ? '图片不能超过 10MB' : '视频不能超过 25MB');
  }

  return { kind, maxBytes };
}

function stripCodeFence(text) {
  const value = String(text || '').trim();
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : value;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(stripCodeFence(text));
  } catch {
    return null;
  }
}

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  const deduped = [];
  for (const item of list) {
    const value = String(item || '').trim();
    if (!value || deduped.includes(value)) continue;
    deduped.push(value);
    if (deduped.length >= 6) break;
  }
  return deduped;
}

function normalizeAnalysisResult(raw, kind) {
  const parsed = safeJsonParse(raw);
  if (parsed && typeof parsed === 'object') {
    const summary = String(parsed.summary || '').trim();
    const tags = normalizeTags(parsed.tags);
    if (summary) return { kind, summary, tags };
  }

  const summary = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 240);
  if (!summary) throw new Error('附件解析失败，请稍后重试');
  return { kind, summary, tags: [] };
}

function validatePreviewDataUrl(value) {
  const dataUrl = String(value || '').trim();
  if (!dataUrl) return '';

  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error('视频预览帧格式不正确');

  const bytes = Buffer.from(match[2], 'base64').byteLength;
  if (!bytes || bytes > cfg.chatMedia.previewMaxBytes) {
    throw new Error('视频预览帧过大，请重新选择视频');
  }

  return dataUrl;
}

async function readImageAsDataUrl(filePath, mimetype) {
  const buffer = await fs.promises.readFile(filePath);
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
}

// 产出供主对话内联使用的小图 dataUrl(jpeg,缩到 ≤inlineImageMaxEdge,质量 inlineImageQuality)。
// 用 sharp 缩图,避免 10MB 原图 base64 化后撑爆主对话消息体。
// sharp 不可用或缩图失败时返回空串,上层自动降级为纯文字 summary 兜底。
async function readImageAsInlineDataUrl(filePath) {
  if (!sharp) return '';
  try {
    const maxEdge = Math.max(64, Number(cfg.chatMedia.inlineImageMaxEdge) || 512);
    const quality = Math.min(95, Math.max(40, Number(cfg.chatMedia.inlineImageQuality) || 80));
    const maxBytes = Math.max(8 * 1024, Number(cfg.chatMedia.inlineImageMaxBytes) || 200 * 1024);

    const pipeline = sharp(filePath, { failOn: 'none' })
      .rotate()                              // 按_EXIF_自动旋正
      .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true });

    let buffer = await pipeline.toBuffer();
    // 若一次缩出来仍超 maxBytes,逐档降质量再压一次
    let q = quality;
    while (buffer.byteLength > maxBytes && q > 40) {
      q -= 15;
      buffer = await sharp(filePath, { failOn: 'none' })
        .rotate()
        .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: q, mozjpeg: true })
        .toBuffer();
    }
    if (buffer.byteLength > maxBytes) return ''; // 仍超限就放弃内联,走文字兜底
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

async function analyzeUploadedMedia({ file, previewImageDataUrl = '' }) {
  const { kind } = validateUploadedFile(file);
  const mediaDataUrl = kind === 'image'
    ? await readImageAsDataUrl(file.path, file.mimetype)
    : validatePreviewDataUrl(previewImageDataUrl);

  if (!mediaDataUrl) {
    throw new Error('视频暂时无法解析，请重新选择视频');
  }

  const prompt = kind === 'image'
    ? [
        '请识别这张图片里玩家能直接看到的内容。',
        '只描述可见事实，不要猜剧情、音频、意图或画面外信息。',
        '返回 JSON：{"summary":"一句简洁中文概括","tags":["标签1","标签2"]}。',
      ].join('\n')
    : [
        '这是一段视频的代表帧，请基于这一帧和文件信息概括玩家当前看到的画面内容。',
        `文件名：${String(file.originalname || '').trim() || 'video'}`,
        `MIME：${String(file.mimetype || '').trim()}`,
        '不要假设后续剧情、音频或镜头外信息。',
        '返回 JSON：{"summary":"一句简洁中文概括","tags":["标签1","标签2"]}。',
      ].join('\n');

  const messages = [
    {
      role: 'system',
      content: '你是聊天附件解析助手。你只输出合法 JSON，不要输出额外说明。',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: mediaDataUrl } },
      ],
    },
  ];

  let content = '';
  let analysisError = null;
  try {
    const result = await llm.chat(messages, { model: cfg.llm.visionModel || cfg.llm.mediaAnalysisModel || undefined });
    content = result.content;
  } catch (err) {
    // 附件分析失败(网关 400/损坏图等)不应让整个对话崩掉:
    // 退回通用概括 + 空 inlineDataUrl,让主对话走文字兜底回复。
    analysisError = err;
    console.error('[analyzeUploadedMedia] 附件分析失败,走兜底:', err.message);
  }
  const analysis = analysisError
    ? { summary: '附件内容无法解析(图片可能已损坏或不被模型支持)', tags: ['附件解析失败'] }
    : normalizeAnalysisResult(content, kind);

  // 主对话真多模态用的小图 dataUrl:图片走 sharp 缩图,视频直接用预览帧(已是小图)
  let inlineDataUrl = '';
  if (kind === 'image') {
    inlineDataUrl = await readImageAsInlineDataUrl(file.path);
  } else if (mediaDataUrl) {
    inlineDataUrl = mediaDataUrl; // 视频预览帧已是小图,直接复用
  }

  return {
    ...analysis,
    mimeType: String(file.mimetype || '').toLowerCase(),
    originalName: String(file.originalname || '').trim(),
    size: file.size || 0,
    storedPath: file.storedPath || '',
    inlineDataUrl, // 缩图后的小图 dataUrl,供主对话 image_url 多模态使用;空串表示无图,走文字 summary 兜底
  };
}

async function cleanupUploadedFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore cleanup failure
  }
}

module.exports = {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  getMediaKind,
  getMaxBytesForMime,
  createUploadTarget,
  validateUploadedFile,
  validatePreviewDataUrl,
  analyzeUploadedMedia,
  cleanupUploadedFile,
};
