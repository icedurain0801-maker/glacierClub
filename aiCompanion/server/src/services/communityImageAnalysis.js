const crypto = require('crypto');
const db = require('../config/db');
const cfg = require('../config/kb');
const llm = require('./llm');

const DEFAULT_MAX_IMAGES_PER_PAGE = 3;
const NOISE_URL_RE = /(?:avatar|icon|emoji|logo|badge|sprite|favicon|loading|placeholder)/i;

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
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

function normalizeText(value, limit = 320) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit);
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (['true', 'yes', 'y'].includes(text)) return true;
    if (['false', 'no', 'n'].includes(text)) return false;
  }
  return null;
}

function guessMimeType(url, mimeType) {
  const normalized = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (normalized.startsWith('image/')) return normalized;

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
    if (pathname.endsWith('.webp')) return 'image/webp';
    if (pathname.endsWith('.gif')) return 'image/gif';
    if (pathname.endsWith('.bmp')) return 'image/bmp';
  } catch {
    // Ignore URL parse failure and fall back to jpeg.
  }

  return 'image/jpeg';
}

function buildUsefulText(summary, extractedText) {
  const parts = [];
  if (summary) parts.push(summary);
  if (extractedText && extractedText !== summary) parts.push(`图片文字：${extractedText}`);
  return parts.join('\n').trim();
}

function normalizeModelResult(raw) {
  const parsed = safeJsonParse(raw);
  const summary = normalizeText(parsed?.summary || raw, 240);
  const extractedText = normalizeText(parsed?.text || parsed?.ocrText || parsed?.extractedText || '', 500);
  const explicitUseful = normalizeBoolean(parsed?.isUseful);
  const usefulText = buildUsefulText(summary, extractedText);
  const isUseful = explicitUseful == null ? Boolean(usefulText) : explicitUseful && Boolean(usefulText);
  return {
    isUseful,
    analysisText: isUseful ? usefulText : '',
  };
}

function isAbortLikeError(err, signal) {
  return Boolean(
    signal?.aborted ||
    err?.name === 'AbortError' ||
    err?.name === 'CommunitySyncCancelledError'
  );
}

function looksLikeUsefulImageUrl(url) {
  try {
    const value = new URL(url).toString();
    return !NOISE_URL_RE.test(value);
  } catch {
    return false;
  }
}

async function findCachedAnalysis(versionId, imageHash) {
  const [rows] = await db.query(
    `SELECT analysis_text, is_useful
       FROM community_sync_image_analysis
      WHERE version_id=? AND image_hash=?
      LIMIT 1`,
    [versionId, imageHash]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    cached: true,
    isUseful: Boolean(row.is_useful),
    analysisText: String(row.analysis_text || ''),
  };
}

async function saveCachedAnalysis(versionId, imageHash, sourceUrl, mimeType, result) {
  await db.query(
    `INSERT INTO community_sync_image_analysis (version_id, image_hash, source_url, mime_type, analysis_text, is_useful)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       source_url=VALUES(source_url),
       mime_type=VALUES(mime_type),
       analysis_text=VALUES(analysis_text),
       is_useful=VALUES(is_useful)`,
    [
      versionId,
      imageHash,
      sourceUrl,
      mimeType,
      result.analysisText || '',
      result.isUseful ? 1 : 0,
    ]
  );
}

async function analyzeImageBuffer({ versionId, url, buffer, mimeType }) {
  if (!versionId || !buffer || !buffer.length) return null;
  if (buffer.length > cfg.chatMedia.imageMaxBytes) return null;

  const imageHash = hashBuffer(buffer);
  const cached = await findCachedAnalysis(versionId, imageHash);
  if (cached) return { ...cached, imageHash };

  const effectiveMimeType = guessMimeType(url, mimeType);
  const dataUrl = `data:${effectiveMimeType};base64,${buffer.toString('base64')}`;
  const messages = [
    {
      role: 'system',
      content: '你是社区图片知识抽取助手。只输出合法 JSON，不要输出额外说明。',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            '判断这张图片是否包含值得写入知识库的事实信息。',
            '优先关注可读文本、活动规则、奖励、时间、地点、名称、数值、截图里的对话或公告。',
            '忽略头像、表情、装饰图、纯风景、重复 UI 外壳、没有信息量的配图。',
            '只描述画面里能直接看见的内容，不要猜测画面外信息。',
            '返回 JSON：{"isUseful":true/false,"summary":"一句中文概括","text":"若图片里有可读文字或关键事实则提取，没有就留空"}',
          ].join('\n'),
        },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ];

  const { content } = await llm.chat(messages, {
    model: cfg.llm.mediaAnalysisModel || undefined,
  });
  const result = normalizeModelResult(content);
  await saveCachedAnalysis(versionId, imageHash, url, effectiveMimeType, result);
  return { ...result, cached: false, imageHash };
}

async function analyzePageImages({ versionId, imageUrls, fetchImage, maxImagesPerPage = DEFAULT_MAX_IMAGES_PER_PAGE, signal }) {
  if (!versionId || typeof fetchImage !== 'function') return [];
  const limit = Math.max(parseInt(maxImagesPerPage, 10) || 0, 0);
  if (!limit) return [];

  const queue = [];
  const seenUrls = new Set();
  for (const rawUrl of Array.isArray(imageUrls) ? imageUrls : []) {
    const url = String(rawUrl || '').trim();
    if (!url || seenUrls.has(url) || !looksLikeUsefulImageUrl(url)) continue;
    seenUrls.add(url);
    queue.push(url);
    if (queue.length >= limit) break;
  }

  const results = [];
  const seenHashes = new Set();
  for (const url of queue) {
    try {
      const downloaded = await fetchImage(url);
      const analyzed = await analyzeImageBuffer({
        versionId,
        url: downloaded?.url || url,
        buffer: downloaded?.buffer,
        mimeType: downloaded?.mimeType || '',
      });
      if (!analyzed?.isUseful || !analyzed.analysisText) continue;
      if (seenHashes.has(analyzed.imageHash)) continue;
      seenHashes.add(analyzed.imageHash);
      results.push({
        url,
        imageHash: analyzed.imageHash,
        analysisText: analyzed.analysisText,
        cached: analyzed.cached,
      });
    } catch (err) {
      if (isAbortLikeError(err, signal)) throw err;
    }
  }

  return results;
}

function formatImageInsights(insights) {
  const lines = [];
  for (const [index, item] of (Array.isArray(insights) ? insights : []).entries()) {
    const text = normalizeText(item?.analysisText, 700);
    if (!text) continue;
    lines.push(`- 图片${index + 1}：${text}`);
  }
  return lines.length ? ['图片补充信息：', ...lines].join('\n') : '';
}

module.exports = {
  analyzeImageBuffer,
  analyzePageImages,
  formatImageInsights,
  _normalizeModelResult: normalizeModelResult,
};
