const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const kbCfg = require('../config/kb');

const HERO_SUMMARY_SHEET = '英雄档案list';
const HERO_DETAIL_HINT_RE = /介绍|详情|档案|资料|技能|台词|语音|立绘|阵营|职业|稀有度|星级|是谁|什么英雄/i;
const SKILL_QUERY_HINT_RE = /技能|效果|基础效果|技能详情|技能描述|一星|二星|三星|四星|五星|满星|1\s*星|2\s*星|3\s*星|4\s*星|5\s*星/i;
const SKILL_POSITION_RE = /技能\s*([1-4])/i;
const SKILL_ICON_RE = /技能图标|技能icon|skill\s*icon/i;
const AVATAR_RE = /头像/i;
const QUOTE_RE = /台词|语音|语录/i;
const TITLE_RE = /称号/i;
const NAME_RE = /角色名字|角色名称|英雄名称|名字/i;
const FACTION_RE = /阵营/i;
const CAREER_RE = /职业/i;
const RARITY_RE = /星级|稀有度|英雄级别/i;
const SKILL_NAME_RE = /^(?:名称|技能名称)$/i;
const SKILL_DESC_RE = /技能详细|技能说明|技能描述|描述|效果/i;
const SKILL_BASE_DESC_RE = /(?:技能基础效果|基础效果|basic\s*effects?)/i;
const SKILL_UPGRADE_DESC_RE = /(?:(?:[一二三四五六七八九十两]|\d+)\s*星效果|满星效果|max(?:imum)?[-\s]*star|upgrade|additional|extra)/i;
const SKILL_UPGRADE_LINE_RE = /^(?:额外|追加|附加|提升|持续时间|技能效果作用于|英雄\s*[一二三四五六七八九十两\d]+\s*星|满级技能|满星效果|deals?\s+an?\s+additional|reduces?.*additional|duration\s+extended|the\s+skill\s+effect\s+applies|extra|additional|upgrade)/i;
const AGGREGATE_SKILL_COLUMN_KEYS = ['中文', '英文', '日语', '韩语'];
const BLOCK_ROW_KEY_RE = /^row_(\d+)$/i;
const EMPTY_SKILL_NAME_RE = /^(?:无此技能|none|n\/a)$/i;
const SUMMARY_CACHE_TTL_MS = 60 * 1000;
const CASUAL_MESSAGE_RE = /^(?:你好|您好|嗨|哈喽|hello|hi|hey|在吗|在么|谢谢|好的|ok|嗯|哦|行)$/i;
const NON_HERO_TOPIC_RE = /(?:世界杯|欧冠|NBA|CBA|足球|篮球|电竞|比赛|赛事|决赛|半决赛|赛程|比分|冠军|亚军|什么时候|几点|几号|哪天|天气|新闻|价格|股价|汇率|OpenAI|搜索|联网)/i;

const summaryCache = new Map();
const imageDimensionCache = new Map();

const HERO_SUMMARY_FIELD_KEYS = [
  '\u9700\u6c42\u82f1\u96c4',
  '\u82f1\u96c4\u540d\u79f0',
  '\u82f1\u96c4',
];
const HERO_SUMMARY_TARGET_SHEET_KEYS = [
  '\u8df3\u8f6c',
  'sheet',
  '\u8be6\u60c5sheet',
  ...HERO_SUMMARY_FIELD_KEYS,
];
const HERO_SUMMARY_FACTION_KEYS = ['\u9635\u8425'];
const HERO_SUMMARY_CAREER_KEYS = ['\u804c\u4e1a'];
const HERO_SUMMARY_RARITY_KEYS = ['\u82f1\u96c4\u7ea7\u522b', '\u7a00\u6709\u5ea6'];
const HERO_PROFILE_PREFIX_RE = /^(?:\u4ecb\u7ecd\u4e00\u4e0b|\u4ecb\u7ecd\u4e0b|\u4ecb\u7ecd\u4e2a|\u8bf4\u8bf4|\u8bb2\u8bb2|\u804a\u804a|\u6765\u4e2a|\u770b\u4e0b|\u770b\u770b|\u8bc4\u4ef7\u4e00\u4e0b)/u;
const HERO_TEAM_QUERY_RE = /(?:\u9635\u5bb9|\u9663\u5bb9|\u914d\u961f|\u914d\u968a|\u642d\u914d|\u63a8\u8350\u9635\u5bb9|\u63a8\u85a6\u9663\u5bb9)/u;
const HERO_CONTEXT_PRONOUN_PREFIXES = [
  '\u5979',
  '\u4ed6',
  '\u5b83',
  '\u8fd9\u4e2a',
  '\u90a3\u4e2a',
  '\u8fd9\u4f4d',
  '\u90a3\u4f4d',
  '\u8be5\u82f1\u96c4',
  '\u8fd9\u4e2a\u82f1\u96c4',
  '\u90a3\u4e2a\u82f1\u96c4',
];
const HERO_CONTEXT_CONTINUATION_PREFIXES = [
  '\u7136\u540e',
  '\u90a3\u5979',
  '\u90a3\u4ed6',
  '\u90a3\u5b83',
  '\u8fd8\u6709',
  '\u518d\u8bf4\u8bf4',
  '\u518d\u8bb2\u8bb2',
  '\u8865\u5145',
  '\u7ee7\u7eed',
];
const HERO_CONTEXT_FIELD_TOKENS = new Set([
  '\u53f0\u8bcd',
  '\u8bed\u97f3',
  '\u8bed\u5f55',
  '\u5934\u50cf',
  '\u7acb\u7ed8',
  '\u9635\u8425',
  '\u804c\u4e1a',
  '\u7a00\u6709\u5ea6',
  '\u661f\u7ea7',
  '\u6280\u80fd',
  '\u6838\u5fc3\u6280\u80fd',
]);
const HERO_CONTEXT_FIELD_FOLLOWUP_RE = /^(?:(?:\u90a3|\u8fd9|\u8fd9\u4e2a|\u90a3\u4e2a|\u8be5)?(?:\u82f1\u96c4)?(?:\u7684)?)?(?:\u53f0\u8bcd|\u8bed\u97f3|\u8bed\u5f55|\u5934\u50cf|\u7acb\u7ed8|\u9635\u8425|\u804c\u4e1a|\u7a00\u6709\u5ea6|\u661f\u7ea7|\u6280\u80fd|\u6838\u5fc3\u6280\u80fd)(?:\s*[1-4])?(?:\u5462|\u5417|\u5440|\u554a|\u600e\u4e48\u6837|\u600e\u4e48\u770b|\u662f\u4ec0\u4e48|\u662f\u5565|\u6709\u54ea\u4e9b)?$/u;
const HERO_CONTEXT_SKILL_SLOT_FOLLOWUP_RE = /^(?:(?:\u90a3|\u8fd9|\u8fd9\u4e2a|\u90a3\u4e2a)?(?:\u6280\u80fd|\u6838\u5fc3\u6280\u80fd)\s*[1-4]|(?:\u90a3|\u8fd9)?[一二三四]\u6280\u80fd)(?:\u5462|\u5417|\u5440|\u554a|\u57fa\u7840\u6548\u679c|\u4e00\u661f|\u4e8c\u661f|\u4e09\u661f|\u56db\u661f|\u4e94\u661f|\u600e\u4e48\u6837|\u662f\u4ec0\u4e48|\u662f\u5565)?$/u;
const HERO_CONTEXT_EVALUATION_FOLLOWUP_RE = /^(?:(?:你|您)?(?:觉得|看)|这(?:个)?(?:英雄)?|那(?:个)?(?:英雄)?|她|他)?(?:咋样|怎么样|如何|厉害吗|强吗|强不强|好用吗|值不值得(?:练|养)?|能不能练|推荐吗)(?:呢|呀|啊|吗)?$/u;
const HERO_QUOTE_QUERY_RE = /(?:\u53f0\u8bcd|\u8bed\u97f3|\u8bed\u5f55)/u;
const HERO_FACTION_QUERY_RE = /(?:\u9635\u8425)/u;
const HERO_CAREER_QUERY_RE = /(?:\u804c\u4e1a)/u;
const HERO_RARITY_QUERY_RE = /(?:\u7a00\u6709\u5ea6|\u661f\u7ea7)/u;
const HERO_AVATAR_QUERY_RE = /(?:\u5934\u50cf|\u7acb\u7ed8)/u;
const HERO_NAME_NOISE_RE = /(?:\u8d44\u6599\u66f4\u65b0|\u622a\u56fe|\u8be6\u89c1|https?:\/\/|hero\s*id\s*=|\u6210\u56fe\u5730\u5740|\u70b9\u51fb\u8df3\u8f6c|sheet:|row:|\u9700\u6c42\u65f6\u95f4|\u5df2\u53d1\u5e03|\u767e\u79d1\u914d\u7f6e)/iu;
const HERO_NAME_STOPWORD_PREFIX_RE = /^(?:\u8fd9\u662f|\u8fd9\u4e2a|\u90a3\u4e2a|\u8fd9\u4f4d|\u90a3\u4f4d|\u8bf7\u95ee|\u4ee5\u4e0b\u662f|\u4e0b\u9762\u662f)/u;
const HERO_CARD_REPLY_PATTERNS = [
  /^(?:\u8fd9\u662f|\u4ee5\u4e0b\u662f|\u4e0b\u9762\u662f)?([^,\u3002\uff0c\uff1a:\n]{2,24})\u7684(?:\u82f1\u96c4\u6863\u6848|\u89d2\u8272\u6863\u6848|\u6280\u80fd\u8d44\u6599|\u8d44\u6599)/u,
  /^([^\s\u300c\u300d\u300e\u300f\u201c\u201d「」『』\n]{2,24})[「\u300c\u300e\u201c][^」\u300d\u300f\u201d\n]{1,40}[」\u300d\u300f\u201d]/u,
];

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function firstNonBlank(...values) {
  for (const value of values) {
    if (!isBlank(value)) return value;
  }
  return '';
}

function getRawValueByKeys(raw = {}, keys = []) {
  if (!raw || typeof raw !== 'object') return '';

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && !isBlank(raw[key])) {
      return raw[key];
    }
  }

  return '';
}

function getHeroSummaryTargetSheet(raw = {}) {
  return String(firstNonBlank(getRawValueByKeys(raw, HERO_SUMMARY_TARGET_SHEET_KEYS), '')).trim();
}

function getHeroSummaryRawCandidates(raw = {}, targetSheet = '') {
  return [
    ...HERO_SUMMARY_FIELD_KEYS.map(key => raw[key]),
    targetSheet,
  ];
}

function getHeroSummaryNameCandidates(raw = {}) {
  return HERO_SUMMARY_FIELD_KEYS
    .map(key => raw[key]);
}

function sanitizeHeroAliasToken(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length < 2 || text.length > 24) return '';
  if (!/[\u4e00-\u9fa5A-Za-z]/u.test(text)) return '';
  if (/[\r\n]/u.test(text)) return '';
  if (HERO_NAME_NOISE_RE.test(text)) return '';
  return text.replace(/^[\s"'`]+|[\s"'`]+$/g, '');
}

function extractHeroAliasTokens(value) {
  const text = String(value || '').trim();
  if (!text || HERO_NAME_NOISE_RE.test(text)) return [];

  const aliases = new Set();
  const direct = sanitizeHeroAliasToken(text);
  if (direct) aliases.add(direct);

  text
    .split(/[_\-/\\|,，、()（）\[\]<>《》\s]+/u)
    .map(sanitizeHeroAliasToken)
    .filter(Boolean)
    .forEach(alias => aliases.add(alias));

  (text.match(/[\u4e00-\u9fa5]{2,}/gu) || [])
    .map(sanitizeHeroAliasToken)
    .filter(Boolean)
    .forEach(alias => {
      aliases.add(alias);
      if (alias.length > 4) aliases.add(alias.slice(-2));
      if (alias.length > 5) aliases.add(alias.slice(-3));
      if (alias.length > 6) aliases.add(alias.slice(-4));
    });

  (text.match(/[A-Za-z][A-Za-z0-9.+-]{1,}/g) || [])
    .map(sanitizeHeroAliasToken)
    .filter(Boolean)
    .forEach(alias => aliases.add(alias));

  return [...aliases];
}

function isLikelyHeroSummaryRow(raw = {}, targetSheet = '') {
  const normalizedTarget = sanitizeHeroAliasToken(targetSheet);
  if (!normalizedTarget) return false;

  const heroNameCandidates = getHeroSummaryNameCandidates(raw)
    .flatMap(extractHeroAliasTokens);
  if (heroNameCandidates.length === 0) return false;

  const heroCandidates = getHeroSummaryRawCandidates(raw, normalizedTarget)
    .flatMap(extractHeroAliasTokens);

  return heroCandidates.length > 0;
}

function getHeroSummaryDisplayName(summaryEntry) {
  if (!summaryEntry) return '';

  const raw = summaryEntry.raw || {};
  const candidates = [
    ...HERO_SUMMARY_FIELD_KEYS.map(key => raw[key]),
    summaryEntry.targetSheet,
  ];

  for (const candidate of candidates) {
    const aliases = extractHeroAliasTokens(candidate);
    const chineseAlias = aliases
      .filter(alias => /^[\u4e00-\u9fa5]{2,}$/u.test(alias))
      .sort((a, b) => a.length - b.length)[0]
      || aliases.find(alias => /[\u4e00-\u9fa5]{2,}/u.test(alias));
    if (chineseAlias) return chineseAlias;
    if (aliases[0]) return aliases[0];
  }

  return '';
}

function safeParseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function resolveKbImagePath(url) {
  const text = String(url || '').trim();
  if (!text || !text.startsWith('/kb-images/')) return '';
  const relativePath = text.replace(/^\/kb-images\/?/, '').split('/').join(path.sep);
  return path.join(kbCfg.kbImagesDir, relativePath);
}

function readPngDimensions(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) break;

    const isSofMarker =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSofMarker && offset + 9 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function getImageDimensions(url) {
  const cacheKey = String(url || '');
  if (!cacheKey) return null;
  if (imageDimensionCache.has(cacheKey)) return imageDimensionCache.get(cacheKey);

  let dimensions = null;
  try {
    const imagePath = resolveKbImagePath(cacheKey);
    if (imagePath && fs.existsSync(imagePath)) {
      const buffer = fs.readFileSync(imagePath);
      dimensions = readPngDimensions(buffer) || readJpegDimensions(buffer);
    }
  } catch {
    dimensions = null;
  }

  imageDimensionCache.set(cacheKey, dimensions);
  return dimensions;
}

function parseKbImageMeta(url) {
  const text = String(url || '').trim();
  if (!text) return null;

  const dimensions = getImageDimensions(text) || {};
  const baseName = path.basename(text);
  const match = /^(\d+)_(\d+)_(\d+)_(\d+)\.[a-z0-9]+$/i.exec(baseName);
  const width = Number(dimensions.width || 0);
  const height = Number(dimensions.height || 0);
  const longerSide = Math.max(width, height);
  const shorterSide = Math.min(width, height);

  return {
    url: text,
    width,
    height,
    longerSide,
    shorterSide,
    aspectRatio: width && height ? (longerSide / shorterSide) : 0,
    row: match ? parseInt(match[2], 10) : 0,
    col: match ? parseInt(match[3], 10) : 0,
  };
}

function clampRatio(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isAggregateSkillTableImage(meta) {
  if (!meta) return false;
  return meta.width >= 500
    && meta.height >= 240
    && meta.aspectRatio >= 1.8
    && meta.aspectRatio <= 2.4;
}

function buildAggregateSkillSpriteCrops(url, count) {
  const meta = parseKbImageMeta(url);
  if (!isAggregateSkillTableImage(meta)) return [];

  const centersX = [0.279, 0.460, 0.681, 0.883];
  const cropWidth = 0.115;
  const cropHeight = 0.17;
  const cropY = 0.015;

  return centersX
    .slice(0, Math.max(0, Math.min(count, centersX.length)))
    .map(centerX => ({
      x: clampRatio(centerX - (cropWidth / 2), 0, 1 - cropWidth),
      y: cropY,
      width: cropWidth,
      height: cropHeight,
    }));
}

function isSquareishImage(meta, { minSide = 48, maxSide = 180, maxAspectRatio = 1.2 } = {}) {
  if (!meta || !meta.shorterSide || !meta.longerSide) return false;
  return meta.shorterSide >= minSide
    && meta.shorterSide <= maxSide
    && meta.aspectRatio > 0
    && meta.aspectRatio <= maxAspectRatio;
}

function sortImageMetasByPreference(items, scorer) {
  return [...items].sort((left, right) => scorer(right) - scorer(left));
}

function selectAvatarImage(urls) {
  const items = (Array.isArray(urls) ? urls : [])
    .map(parseKbImageMeta)
    .filter(meta => isSquareishImage(meta, { minSide: 80, maxSide: 800, maxAspectRatio: 1.2 }));
  if (items.length === 0) return '';

  const scored = sortImageMetasByPreference(items, meta => {
    const heroAvatarBonus = meta.row === 7 && meta.col === 4 ? 7000 : 0;
    const portraitChipBonus = meta.row === 1 && meta.col >= 10 ? 5200 : 0;
    const rowBonus = heroAvatarBonus || portraitChipBonus
      ? 0
      : (meta.row === 7 ? 1000 : Math.max(0, 300 - Math.abs(meta.row - 7) * 40));
    const colBonus = heroAvatarBonus || portraitChipBonus
      ? 0
      : (meta.col === 4 ? 120 : Math.max(0, 60 - Math.abs(meta.col - 4) * 10));
    const sizeTarget = portraitChipBonus ? 628 : 120;
    const sizeBonus = Math.max(0, 220 - Math.abs(meta.shorterSide - sizeTarget));
    const squareBonus = meta.aspectRatio <= 1.05 ? 80 : 0;
    return heroAvatarBonus + portraitChipBonus + rowBonus + colBonus + sizeBonus + squareBonus;
  });

  return scored[0] ? scored[0].url : '';
}

function selectAggregateSkillIcons(urls) {
  const items = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (items.length <= 4) return items.slice(0, 4);

  const iconMetas = items
    .map(parseKbImageMeta)
    .filter(meta => isSquareishImage(meta, { minSide: 48, maxSide: 160, maxAspectRatio: 1.2 }));

  const groupedByRow = new Map();
  iconMetas.forEach(meta => {
    if (!meta.row || !meta.col) return;
    const rowItems = groupedByRow.get(meta.row) || [];
    rowItems.push(meta);
    groupedByRow.set(meta.row, rowItems);
  });

  const preferredGroup = [...groupedByRow.entries()]
    .map(([row, metas]) => {
      const sorted = [...metas].sort((a, b) => a.col - b.col);
      const lateIcons = sorted.filter(meta => meta.col >= 6);
      const effective = lateIcons.length >= 3 ? lateIcons : sorted;
      return {
        row,
        metas: effective,
        score: effective.length * 100 + row * 10 + effective.reduce((sum, meta) => sum + meta.col, 0),
      };
    })
    .filter(group => group.metas.length >= 3)
    .sort((a, b) => b.score - a.score)[0];

  if (preferredGroup) {
    return preferredGroup.metas.slice(0, 4).map(meta => meta.url);
  }

  const squareIcons = items.filter(url => {
    const dimensions = getImageDimensions(url);
    if (!dimensions || !dimensions.width || !dimensions.height) return false;
    const longerSide = Math.max(dimensions.width, dimensions.height);
    const shorterSide = Math.min(dimensions.width, dimensions.height);
    return shorterSide >= 48 && (longerSide / shorterSide) <= 1.2;
  });

  if (squareIcons.length >= 4) return squareIcons.slice(0, 4);
  return items.slice(items.length - 4);
}

function selectCareerIcon(urls) {
  const items = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];

  const iconMetas = items
    .map(parseKbImageMeta)
    .filter(meta => (meta.shorterSide >= 40 && meta.shorterSide <= 96 && meta.aspectRatio > 0 && meta.aspectRatio <= 1.35) || (meta.row && meta.col));
  const preferred = sortImageMetasByPreference(iconMetas, meta => {
    const rowBonus = meta.row === 5 ? 1000 : Math.max(0, 200 - Math.abs(meta.row - 5) * 40);
    const colBonus = meta.col === 6 ? 120 : Math.max(0, 60 - Math.abs(meta.col - 6) * 10);
    const sizeBonus = Math.max(0, 100 - Math.abs(meta.shorterSide - 60));
    return rowBonus + colBonus + sizeBonus;
  })[0];
  if (preferred) return preferred.url;

  const icon = items.find(url => {
    const dimensions = getImageDimensions(url);
    if (!dimensions || !dimensions.width || !dimensions.height) return false;
    const longerSide = Math.max(dimensions.width, dimensions.height);
    const shorterSide = Math.min(dimensions.width, dimensions.height);
    return shorterSide >= 40 && shorterSide <= 96 && (longerSide / shorterSide) <= 1.25;
  });

  return icon || items[0];
}

function selectFactionIcon(urls) {
  const items = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];

  const iconMetas = items
    .map(parseKbImageMeta)
    .filter(meta => (meta.shorterSide >= 28 && meta.shorterSide <= 96 && meta.aspectRatio > 0 && meta.aspectRatio <= 1.35) || (meta.row && meta.col));
  const preferred = sortImageMetasByPreference(iconMetas, meta => {
    const rowBonus = meta.row === 4 ? 1000 : Math.max(0, 220 - Math.abs(meta.row - 4) * 44);
    const colBonus = meta.col === 6 ? 140 : Math.max(0, 80 - Math.abs(meta.col - 6) * 12);
    const sizeBonus = Math.max(0, 100 - Math.abs(meta.shorterSide - 48));
    return rowBonus + colBonus + sizeBonus;
  })[0];
  if (preferred) return preferred.url;

  const icon = items.find(url => {
    const dimensions = getImageDimensions(url);
    if (!dimensions || !dimensions.width || !dimensions.height) return false;
    const longerSide = Math.max(dimensions.width, dimensions.height);
    const shorterSide = Math.min(dimensions.width, dimensions.height);
    return shorterSide >= 28 && shorterSide <= 96 && (longerSide / shorterSide) <= 1.25;
  });

  return icon || items[0];
}

function normalizeText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\p{P}\p{S}\s_]+/gu, '');
}

function normalizeLineBreaks(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPrimaryTextLine(value) {
  const text = normalizeLineBreaks(value);
  if (!text) return '';
  return text.split('\n').map(line => String(line || '').trim()).find(Boolean) || '';
}

function getProjectLabel(raw) {
  return String(firstNonBlank(raw.项目, raw.字段, raw.类型, '')).trim();
}

function getSkillPosition(raw) {
  return String(firstNonBlank(raw.对应位置, raw.位置, '')).trim();
}

function getEntryValue(entry, raw) {
  return normalizeLineBreaks(firstNonBlank(
    raw.中文,
    raw.繁中,
    raw.英文,
    raw.日语,
    raw.韩语,
    entry && entry.content
  ));
}

function extractLocalizedFieldValue(value) {
  const parts = String(value == null ? '' : value)
    .split('|')
    .map(part => normalizeLineBreaks(part))
    .filter(Boolean);
  if (parts.length === 0) return '';

  const chinesePart = parts.find(part => /[\u4e00-\u9fff]/u.test(part));
  if (chinesePart) return chinesePart;
  return parts[0];
}

function extractRarityValue(value) {
  const match = String(value == null ? '' : value).match(/\bS\+|S|A\b/i);
  return match ? String(match[0]).toUpperCase() : '';
}

function getBlockTopLevelFieldEntries(raw) {
  if (!raw || typeof raw !== 'object' || raw.__parseMode !== 'block') return [];

  return Object.entries(raw)
    .filter(([key]) => {
      const text = String(key || '').trim();
      return text
        && !text.startsWith('__')
        && !BLOCK_ROW_KEY_RE.test(text)
        && text !== '标题'
        && text !== '对应位置';
    })
    .map(([label, value]) => ({
      label: String(label || '').trim(),
      value: String(value == null ? '' : value),
    }))
    .filter(item => item.label);
}

function getBlockRowEntries(raw) {
  if (!raw || typeof raw !== 'object' || raw.__parseMode !== 'block') return [];
  return Object.entries(raw)
    .map(([key, value]) => {
      const match = BLOCK_ROW_KEY_RE.exec(String(key || ''));
      if (!match) return null;
      return {
        order: parseInt(match[1], 10),
        value: String(value == null ? '' : value),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function parseBlockSkillRow(value) {
  const parts = String(value == null ? '' : value)
    .split('|')
    .map(part => normalizeLineBreaks(part))
    .filter(part => part !== '');
  if (!parts.length) return null;

  const positionIndex = parts.findIndex(part => SKILL_POSITION_RE.test(part));
  if (positionIndex < 0) return null;

  const positionLabel = String(parts[positionIndex] || '').trim();
  const projectLabel = String(parts[positionIndex + 1] || '').trim();
  const primaryValue = String(parts[positionIndex + 2] || '').trim();
  const secondaryValue = parts.slice(positionIndex + 3).join(' | ').trim();

  if (!positionLabel || !projectLabel) return null;
  if (isBlank(primaryValue) && isBlank(secondaryValue)) return null;

  return {
    positionLabel,
    projectLabel,
    primaryValue,
    secondaryValue,
  };
}

function buildSyntheticSkillEntry(entry, skillRow) {
  const raw = entry && entry.raw || {};
  const syntheticRaw = {
    __sheet: raw.__sheet,
    __parseMode: 'block-row',
    对应位置: skillRow.positionLabel,
    项目: skillRow.projectLabel,
  };

  if (!isBlank(skillRow.primaryValue)) syntheticRaw.中文 = skillRow.primaryValue;
  if (!isBlank(skillRow.secondaryValue)) syntheticRaw.英文 = skillRow.secondaryValue;

  return {
    raw: syntheticRaw,
    images: Array.isArray(entry && entry.images) ? entry.images : [],
    content: normalizeLineBreaks([
      skillRow.positionLabel,
      skillRow.projectLabel,
      skillRow.primaryValue,
      skillRow.secondaryValue,
    ].filter(Boolean).join('\n')),
  };
}

function extractBlockSkillEntries(detailEntries) {
  const entries = [];

  (Array.isArray(detailEntries) ? detailEntries : []).forEach(entry => {
    const raw = entry && entry.raw || {};
    getBlockRowEntries(raw).forEach(row => {
      const skillRow = parseBlockSkillRow(row.value);
      if (!skillRow) return;
      if (SKILL_NAME_RE.test(skillRow.projectLabel) && EMPTY_SKILL_NAME_RE.test(skillRow.primaryValue)) return;
      entries.push(buildSyntheticSkillEntry(entry, skillRow));
    });
  });

  return entries;
}

function getExpandedSkillEntries(detailEntries) {
  const baseEntries = Array.isArray(detailEntries) ? detailEntries : [];
  return [...baseEntries, ...extractBlockSkillEntries(baseEntries)];
}

function hasBlockFieldKey(raw, pattern) {
  if (!raw || typeof raw !== 'object' || raw.__parseMode !== 'block') return false;
  return Object.keys(raw).some(key => {
    if (!key || String(key).startsWith('__') || BLOCK_ROW_KEY_RE.test(key)) return false;
    return pattern.test(String(key));
  });
}

function parseSkillIndex(label) {
  const match = SKILL_POSITION_RE.exec(String(label || ''));
  return match ? parseInt(match[1], 10) : 0;
}

function parseStarLevel(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/满星/i.test(text)) return 5;
  if (/五星|5\s*星/i.test(text)) return 5;
  if (/四星|4\s*星/i.test(text)) return 4;
  if (/三星|3\s*星/i.test(text)) return 3;
  if (/二星|两星|2\s*星/i.test(text)) return 2;
  if (/一星|1\s*星/i.test(text)) return 1;
  return 0;
}

function getStarLabel(level) {
  const labels = {
    1: '一星效果',
    2: '二星效果',
    3: '三星效果',
    4: '四星效果',
    5: '五星效果',
  };
  return labels[level] || `${level}星效果`;
}

function extractBaseSkillDescription(value) {
  const text = normalizeLineBreaks(value);
  if (!text) return '';

  const lines = text.split('\n');
  const kept = [];

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) {
      if (kept.length > 0) break;
      continue;
    }

    if (SKILL_UPGRADE_LINE_RE.test(line)) {
      if (kept.length > 0) break;
      continue;
    }

    kept.push(line);
  }

  return normalizeLineBreaks(kept.join('\n')) || text.split(/\n\s*\n/, 1)[0].trim() || text;
}

function extractSkillDetailSections(value) {
  const text = normalizeLineBreaks(value);
  if (!text) return { baseEffect: '', upgrades: {} };

  const lines = text.split('\n').map(line => String(line || '').trim()).filter(Boolean);
  const baseLines = [];
  const upgradeLines = [];
  let upgradeStarted = false;

  for (const line of lines) {
    if (!upgradeStarted && SKILL_UPGRADE_LINE_RE.test(line)) {
      upgradeStarted = true;
    }

    if (upgradeStarted) {
      upgradeLines.push(line);
    } else {
      baseLines.push(line);
    }
  }

  const upgrades = {};
  upgradeLines.forEach((line, index) => {
    if (line) upgrades[index + 1] = line;
  });

  return {
    baseEffect: normalizeLineBreaks(baseLines.join('\n')),
    upgrades,
  };
}

function ensureSkillRecord(skillMap, index, label = '') {
  if (!skillMap.has(index)) {
    skillMap.set(index, {
      index,
      label: label || `技能${index}`,
      isCore: /核心/.test(label),
      name: '',
      description: '',
      descriptionPriority: 0,
      baseEffect: '',
      upgrades: {},
      imageUrl: '',
    });
  }

  const skill = skillMap.get(index);
  if (label) {
    if (!skill.label || /^技能\d+$/.test(skill.label)) {
      skill.label = label;
    }
    if (/核心/.test(label)) {
      skill.isCore = true;
    }
  }
  return skill;
}

function setSkillDescription(skill, value, priority) {
  const normalizedValue = extractBaseSkillDescription(value);
  if (!normalizedValue) return;
  if ((skill.descriptionPriority || 0) > priority && skill.description) return;
  skill.description = normalizedValue;
  skill.descriptionPriority = priority;
  if (!skill.baseEffect) skill.baseEffect = normalizedValue;
}

function mergeUpgrades(primary = {}, fallback = {}) {
  const merged = {};
  [fallback, primary].forEach(source => {
    Object.keys(source || {})
      .map(key => parseInt(key, 10))
      .filter(level => Number.isInteger(level) && level > 0)
      .sort((a, b) => a - b)
      .forEach(level => {
        const value = normalizeLineBreaks(source[level]);
        if (value) merged[level] = value;
      });
  });
  return merged;
}

function looksLikeHeroDetailQuery(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (CASUAL_MESSAGE_RE.test(text) || NON_HERO_TOPIC_RE.test(text)) return false;
  return text.length <= 18 || HERO_DETAIL_HINT_RE.test(text);
}

function isHeroProfileIntent(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  if (HERO_PROFILE_PREFIX_RE.test(text)) return true;
  if (!shouldCarryHeroFromHistorySafe(text) && text.length <= 12 && !/[?\uFF1F]/u.test(text)) return true;

  return false;
}

function shouldReturnHeroCardRequest(message) {
  const text = String(message || '').trim();
  if (!looksLikeHeroDetailQuery(text)) return false;
  if (!isHeroProfileIntent(text)) return false;
  return true;
}

function looksLikeSkillQuery(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  return !!parseStarLevel(text) || SKILL_POSITION_RE.test(text) || SKILL_QUERY_HINT_RE.test(text);
}

function collectHeroAliases(summaryRaw, targetSheet) {
  const aliases = new Set();
  const candidates = [
    summaryRaw.需求英雄,
    summaryRaw.英雄名称,
    summaryRaw.英雄,
    targetSheet,
  ];

  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (!text) continue;

    aliases.add(text);

    const splitParts = text.split(/[_\-·,，\s()（）【】[\]<>《》]+/);
    splitParts.forEach(part => {
      const trimmed = String(part || '').trim();
      if (trimmed.length >= 2) aliases.add(trimmed);
    });

    const chineseParts = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    chineseParts.forEach(part => {
      aliases.add(part);
      if (part.length > 2) aliases.add(part.slice(-2));
      if (part.length > 3) aliases.add(part.slice(-3));
      if (part.length > 4) aliases.add(part.slice(-4));
    });

    const latinParts = text.match(/[a-zA-Z][a-zA-Z0-9+-]{1,}/g) || [];
    latinParts.forEach(part => aliases.add(part));
  }

  return [...aliases];
}

function scoreHeroCandidate(message, aliases) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage || !Array.isArray(aliases) || aliases.length === 0) return 0;

  let best = 0;
  aliases.forEach(alias => {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias || normalizedAlias.length < 2) return;

    if (normalizedMessage === normalizedAlias) {
      best = Math.max(best, 1000 + normalizedAlias.length);
      return;
    }

    if (normalizedMessage.includes(normalizedAlias)) {
      best = Math.max(best, 800 + normalizedAlias.length);
      return;
    }

    if (normalizedAlias.includes(normalizedMessage) && normalizedMessage.length >= 2) {
      best = Math.max(best, 550 + normalizedMessage.length);
    }
  });

  return best;
}

function resolveHeroDetailSheetName(sheetName, aliases = [], candidateSheetNames = []) {
  const requestedSheet = String(sheetName || '').trim();
  const candidates = [...new Set((Array.isArray(candidateSheetNames) ? candidateSheetNames : [])
    .map(item => String(item || '').trim())
    .filter(Boolean))];

  if (!candidates.length) return requestedSheet;
  if (requestedSheet && candidates.includes(requestedSheet)) return requestedSheet;

  const messages = [...new Set([
    requestedSheet,
    ...(Array.isArray(aliases) ? aliases : []),
  ].map(item => String(item || '').trim()).filter(Boolean))];

  let best = null;
  candidates.forEach(candidate => {
    const candidateAliases = extractHeroAliasTokens(candidate);
    const score = messages.reduce(
      (currentBest, message) => Math.max(currentBest, scoreHeroCandidate(message, candidateAliases)),
      0
    );
    if (!score) return;
    if (!best || score > best.score) {
      best = { name: candidate, score };
    }
  });

  if (!best || best.score < 800) return requestedSheet;
  return best.name;
}

function collectHeroAliasesSafe(summaryRaw, targetSheet) {
  const aliases = new Set();
  getHeroSummaryRawCandidates(summaryRaw || {}, targetSheet)
    .flatMap(extractHeroAliasTokens)
    .forEach(alias => aliases.add(alias));

  return [...aliases].sort((a, b) => b.length - a.length);
}

function scoreSkillCandidate(message, candidate) {
  const normalizedMessage = normalizeText(message);
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedMessage || !normalizedCandidate || normalizedCandidate.length < 2) return 0;

  if (normalizedMessage === normalizedCandidate) {
    return 1000 + normalizedCandidate.length;
  }
  if (normalizedMessage.includes(normalizedCandidate)) {
    return 850 + normalizedCandidate.length;
  }
  if (normalizedCandidate.includes(normalizedMessage) && normalizedMessage.length >= 2) {
    return 650 + normalizedMessage.length;
  }
  return 0;
}

async function loadHeroSummaries(versionId) {
  const cached = summaryCache.get(versionId);
  if (cached && Date.now() - cached.updatedAt < SUMMARY_CACHE_TTL_MS) {
    return cached.items;
  }

  const [rows] = await db.query(
    `SELECT id, document_id, row_index, content, raw_json
       FROM knowledge_entries
      WHERE version_id=?
      ORDER BY document_id ASC, row_index ASC, id ASC`,
    [versionId]
  );

  const items = rows
    .map(row => {
      const raw = safeParseJson(row.raw_json);
      const targetSheet = getHeroSummaryTargetSheet(raw);
      return {
        ...row,
        raw,
        targetSheet,
        aliases: collectHeroAliasesSafe(raw, targetSheet),
      };
    })
    .filter(item =>
      String(item.raw.__sheet || '').trim() === HERO_SUMMARY_SHEET
      && isLikelyHeroSummaryRow(item.raw, item.targetSheet)
      && Array.isArray(item.aliases)
      && item.aliases.length > 0
    );

  summaryCache.set(versionId, { updatedAt: Date.now(), items });
  return items;
}

async function findBestHeroSummary(versionId, message) {
  const summaries = await loadHeroSummaries(versionId);
  let best = null;

  summaries.forEach(item => {
    const score = scoreHeroCandidate(message, item.aliases);
    if (!score) return;
    if (!best || score > best.score) {
      best = { item, score };
    }
  });

  if (!best || best.score < 550) return null;
  return best.item;
}

function extractSkillCandidatePhrases(message) {
  const cleaned = String(message || '')
    .replace(/介绍一下|介绍|说说|讲讲|技能详情|技能描述|基础效果|技能效果|技能|效果|是什么|是啥|多少|几星|一星|二星|三星|四星|五星|满星|的|呢|呀|啊|吗/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  const phrases = cleaned.match(/[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9._+\-·]{1,20}/g) || [];
  return [...new Set(phrases.map(item => item.trim()).filter(item => item.length >= 2))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
}

async function findHeroSummaryBySkillPhrase(versionId, message) {
  const phrases = extractSkillCandidatePhrases(message);
  if (phrases.length === 0) return null;

  const summaries = await loadHeroSummaries(versionId);
  let best = null;

  for (const phrase of phrases) {
    const [rows] = await db.query(
      `SELECT document_id, row_index, raw_json, content
         FROM knowledge_entries
        WHERE version_id=?
          AND content LIKE ?
        ORDER BY row_index ASC, id ASC
        LIMIT 40`,
      [versionId, `%${phrase}%`]
    );

    rows.forEach(row => {
      const raw = safeParseJson(row.raw_json);
      const skillEntries = getExpandedSkillEntries([{ ...row, raw, images: [] }]);

      skillEntries.forEach(skillEntry => {
        const skillRaw = skillEntry.raw || {};
        const positionIndex = parseSkillIndex(getSkillPosition(skillRaw));
        if (!positionIndex) return;
        if (!SKILL_NAME_RE.test(getProjectLabel(skillRaw))) return;

        const skillName = extractPrimaryTextLine(getEntryValue(skillEntry, skillRaw));
        const score = Math.max(
          scoreSkillCandidate(message, skillName),
          scoreSkillCandidate(phrase, skillName)
        );
        if (!score) return;

        const sheetName = String(skillRaw.__sheet || raw.__sheet || '').trim();
        const summary = summaries.find(item =>
          item.document_id === row.document_id && String(item.targetSheet || '').trim() === sheetName
        ) || summaries.find(item => item.document_id === row.document_id);

        if (!summary) return;
        if (!best || score > best.score) {
          best = { summary, score };
        }
      });
    });

    if (best && best.score >= 850) break;
  }

  return best ? best.summary : null;
}

function getRecentUserMessages(history, limit = 4) {
  return [...(Array.isArray(history) ? history : [])]
    .reverse()
    .filter(item => item && item.role === 'user' && !isBlank(item.content))
    .slice(0, limit)
    .map(item => String(item.content || '').trim());
}

function getRecentAssistantMessages(history, limit = 6) {
  return [...(Array.isArray(history) ? history : [])]
    .reverse()
    .filter(item => item && item.role === 'assistant' && !isBlank(item.content))
    .slice(0, limit)
    .map(item => String(item.content || '').trim());
}

function extractHeroNameFromAssistantCardPayload(content) {
  const text = String(content || '').trim();
  if (!text) return '';

  const heroCardMatch = /```herocard\s*([\s\S]*?)```/iu.exec(text);
  if (!heroCardMatch) return '';

  try {
    const payload = JSON.parse(heroCardMatch[1]);
    const name = String(payload && payload.name || '').trim();
    return isValidHeroNameCandidateSafe(name) ? name : '';
  } catch {
    return '';
  }
}

function isValidHeroNameCandidate(value) {
  const text = String(value || '').trim();
  if (!text || text.length < 2 || text.length > 24) return false;
  if (!/[\u4e00-\u9fa5A-Za-z]/u.test(text)) return false;
  if (/[：:]/u.test(text)) return false;
  if (/^(?:这是|这个|那个|该|这位|那位)/u.test(text)) return false;
  return true;
}

function extractHeroNameFromAssistantReply(content) {
  const text = String(content || '').trim();
  if (!text) return '';

  const heroCardMatch = /```herocard\s*([\s\S]*?)```/iu.exec(text);
  if (heroCardMatch) {
    try {
      const payload = JSON.parse(heroCardMatch[1]);
      const name = String(payload && payload.name || '').trim();
      if (isValidHeroNameCandidate(name)) return name;
    } catch {
      // ignore invalid herocard payload
    }
  }

  const patterns = [
    /这是([^，。\n]{2,24})的(?:英雄档案|技能资料)/u,
    /^([^「\n]{2,24})「[^」\n]{1,24}」/u,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const candidate = String(match[1] || '').trim();
    if (isValidHeroNameCandidate(candidate)) return candidate;
  }

  return '';
}

async function findHeroSummaryFromAssistantHistory(versionId, history = []) {
  const recentAssistantMessages = getRecentAssistantMessages(history);

  for (const item of recentAssistantMessages) {
    const heroName = extractHeroNameFromAssistantCardPayload(item);
    if (!heroName) continue;

    const matched = await findBestHeroSummary(versionId, heroName);
    if (matched) return matched;
  }

  for (const item of recentAssistantMessages) {
    const heroName = extractHeroNameFromAssistantReplySafe(item);
    if (!heroName) continue;

    const matched = await findBestHeroSummary(versionId, heroName);
    if (matched) return matched;
  }

  return null;
}

function shouldCarryHeroFromHistory(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  if (parseStarLevel(text) || isSkillContextFollowupQuery(text)) return true;
  if (/(?:\u9635\u5bb9|\u9663\u5bb9|\u914d\u961f|\u914d\u968a|\u642d\u914d|\u63a8\u8350\u9635\u5bb9|\u63a8\u85a6\u9663\u5bb9)/u.test(text)) return true;
  if (["\u5979", "\u4ed6", "\u5b83", "\u8fd9\u4e2a", "\u90a3\u4e2a", "\u8fd9\u4f4d", "\u90a3\u4f4d", "\u8be5\u82f1\u96c4", "\u8fd9\u4e2a\u82f1\u96c4", "\u90a3\u4e2a\u82f1\u96c4"].some(prefix => text.startsWith(prefix))) return true;
  if (["\u7136\u540e", "\u90a3\u5979", "\u90a3\u4ed6", "\u90a3\u5b83", "\u90a3\u8fd9\u4e2a", "\u90a3\u90a3\u4e2a", "\u8fd8\u6709", "\u518d\u8bf4\u8bf4", "\u518d\u8bb2\u8bb2", "\u8865\u5145", "\u7ee7\u7eed"].some(prefix => text.startsWith(prefix))) return true;
  if (["\u53f0\u8bcd", "\u8bed\u97f3", "\u8bed\u5f55", "\u5934\u50cf", "\u7acb\u7ed8", "\u9635\u8425", "\u804c\u4e1a", "\u7a00\u6709\u5ea6", "\u661f\u7ea7", "\u6280\u80fd", "\u6838\u5fc3\u6280\u80fd"].includes(text)) return true;

  return false;
}

function isValidHeroNameCandidateSafe(value) {
  const text = String(value || '').trim();
  if (!text || text.length < 2 || text.length > 24) return false;
  if (!/[\u4e00-\u9fa5A-Za-z]/u.test(text)) return false;
  if (/[\r\n,，。！？!?：:]/u.test(text)) return false;
  if (HERO_NAME_NOISE_RE.test(text)) return false;
  if (HERO_NAME_STOPWORD_PREFIX_RE.test(text)) return false;
  return true;
}

function extractHeroNameFromAssistantReplySafe(content) {
  const text = String(content || '').trim();
  if (!text) return '';

  const heroCardMatch = /```herocard\s*([\s\S]*?)```/iu.exec(text);
  if (heroCardMatch) {
    try {
      const payload = JSON.parse(heroCardMatch[1]);
      const name = String(payload && payload.name || '').trim();
      if (isValidHeroNameCandidateSafe(name)) return name;
    } catch {
      // ignore invalid herocard payload
    }
  }

  for (const pattern of HERO_CARD_REPLY_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const candidate = String(match[1] || '').trim();
    if (isValidHeroNameCandidateSafe(candidate)) return candidate;
  }

  return '';
}

function shouldCarryHeroFromHistorySafe(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  if (parseStarLevel(text) || isSkillContextFollowupQuery(text)) return true;
  if (HERO_TEAM_QUERY_RE.test(text)) return true;
  if (HERO_CONTEXT_PRONOUN_PREFIXES.some(prefix => text.startsWith(prefix))) return true;
  if (HERO_CONTEXT_CONTINUATION_PREFIXES.some(prefix => text.startsWith(prefix))) return true;
  if (HERO_CONTEXT_FIELD_TOKENS.has(text)) return true;
  if (text.length <= 16 && HERO_CONTEXT_FIELD_FOLLOWUP_RE.test(text)) return true;
  if (text.length <= 16 && HERO_CONTEXT_SKILL_SLOT_FOLLOWUP_RE.test(text)) return true;
  if (text.length <= 16 && HERO_CONTEXT_EVALUATION_FOLLOWUP_RE.test(text)) return true;

  return false;
}

async function findHeroSummaryFromContext(versionId, message, history = []) {
  const direct = await findBestHeroSummary(versionId, message);
  if (direct) return direct;

  const bySkill = await findHeroSummaryBySkillPhrase(versionId, message);
  if (bySkill) return bySkill;

  if (!shouldCarryHeroFromHistorySafe(message)) {
    return null;
  }

  const recentMessages = getRecentUserMessages(history);
  for (const item of recentMessages) {
    const matched = await findBestHeroSummary(versionId, item);
    if (matched) return matched;
  }

  const assistantMatched = await findHeroSummaryFromAssistantHistory(versionId, history);
  if (assistantMatched) return assistantMatched;

  const combined = [message, ...recentMessages].filter(Boolean).join(' ');
  if (combined && combined !== message) {
    const matched = await findBestHeroSummary(versionId, combined);
    if (matched) return matched;
  }

  for (const item of recentMessages) {
    const matched = await findHeroSummaryBySkillPhrase(versionId, item);
    if (matched) return matched;
  }

  return null;
}

async function loadDetailEntries(versionId, documentId, sheetName, aliases = []) {
  const [rows] = await db.query(
    `SELECT id, row_index, content, raw_json
       FROM knowledge_entries
      WHERE version_id=?
        AND document_id=?
      ORDER BY row_index ASC, id ASC`,
    [versionId, documentId]
  );

  const rowsBySheet = new Map();
  rows.forEach(row => {
    const raw = safeParseJson(row.raw_json);
    const resolvedSheetName = String(raw.__sheet || '').trim();
    if (!resolvedSheetName) return;
    if (!rowsBySheet.has(resolvedSheetName)) rowsBySheet.set(resolvedSheetName, []);
    rowsBySheet.get(resolvedSheetName).push({
      ...row,
      raw,
    });
  });

  const resolvedSheetName = resolveHeroDetailSheetName(
    sheetName,
    aliases,
    [...rowsBySheet.keys()]
  );
  const filteredRows = rowsBySheet.get(resolvedSheetName) || [];

  if (filteredRows.length === 0) return [];

  const entryIds = filteredRows.map(row => row.id);
  const [imageRows] = await db.query(
    `SELECT entry_id, url
       FROM kb_entry_images
      WHERE entry_id IN (${entryIds.map(() => '?').join(',')})
      ORDER BY id ASC`,
    entryIds
  );

  const imagesByEntry = new Map();
  imageRows.forEach(row => {
    if (!imagesByEntry.has(row.entry_id)) imagesByEntry.set(row.entry_id, []);
    imagesByEntry.get(row.entry_id).push(row.url);
  });

  return filteredRows.map(row => ({
    ...row,
    raw: row.raw || safeParseJson(row.raw_json),
    images: imagesByEntry.get(row.id) || [],
  }));
}

function buildAggregateSkillKnowledge(detailEntries) {
  const skillMap = new Map();

  detailEntries.forEach(entry => {
    const raw = entry.raw || {};
    const projectLabel = getProjectLabel(raw);
    if (!projectLabel) return;
    if (parseSkillIndex(getSkillPosition(raw))) return;

    const starLevel = parseStarLevel(projectLabel);
    const isSkillNameRow = /技能名称|skill\s*name/i.test(projectLabel);
    const isBaseRow = SKILL_BASE_DESC_RE.test(projectLabel);
    if (!isSkillNameRow && !isBaseRow && !starLevel) return;

    AGGREGATE_SKILL_COLUMN_KEYS.forEach((key, index) => {
      const value = extractPrimaryTextLine(raw[key]);
      if (!value) return;

      const skill = ensureSkillRecord(skillMap, index + 1);
      if (isSkillNameRow) {
        if (!skill.name) skill.name = value;
        return;
      }

      if (isBaseRow) {
        if (!skill.baseEffect) skill.baseEffect = value;
        return;
      }

      if (starLevel && !skill.upgrades[starLevel]) {
        skill.upgrades[starLevel] = value;
      }
    });
  });

  return skillMap;
}

function buildDetailedSkillKnowledge(detailEntries) {
  const skillMap = new Map();

  detailEntries.forEach(entry => {
    const raw = entry.raw || {};
    const positionLabel = getSkillPosition(raw);
    const positionIndex = parseSkillIndex(positionLabel);
    if (!positionIndex) return;

    const projectLabel = getProjectLabel(raw);
    const value = getEntryValue(entry, raw);
    const skill = ensureSkillRecord(skillMap, positionIndex, positionLabel || `技能${positionIndex}`);

    if (!skill.imageUrl && entry.images.length > 0) {
      skill.imageUrl = entry.images[0];
    }

    if (SKILL_NAME_RE.test(projectLabel)) {
      if (value) skill.name = value;
      return;
    }

    const starLevel = parseStarLevel(projectLabel);
    if (starLevel) {
      const upgradeValue = extractPrimaryTextLine(value) || normalizeLineBreaks(value);
      if (upgradeValue && !skill.upgrades[starLevel]) {
        skill.upgrades[starLevel] = upgradeValue;
      }
      return;
    }

    if (SKILL_BASE_DESC_RE.test(projectLabel)) {
      const baseEffect = extractBaseSkillDescription(value);
      if (baseEffect) skill.baseEffect = baseEffect;
      return;
    }

    if (SKILL_DESC_RE.test(projectLabel)) {
      const sections = extractSkillDetailSections(value);
      if (sections.baseEffect && !skill.baseEffect) {
        skill.baseEffect = sections.baseEffect;
      }
      skill.upgrades = mergeUpgrades(sections.upgrades, skill.upgrades);
    }
  });

  return skillMap;
}

function mergeSkillKnowledge(baseSkillMap, aggregateSkillMap, detailedSkillMap) {
  const merged = new Map();

  const mergeOne = skill => {
    if (!skill || !skill.index) return;

    if (!merged.has(skill.index)) {
      merged.set(skill.index, {
        index: skill.index,
        label: skill.label || `技能${skill.index}`,
        isCore: !!skill.isCore,
        name: '',
        description: '',
        descriptionPriority: 0,
        baseEffect: '',
        upgrades: {},
        imageUrl: '',
      });
    }

    const target = merged.get(skill.index);
    if (skill.label && (!target.label || /^技能\d+$/.test(target.label))) {
      target.label = skill.label;
    }
    if (skill.isCore) target.isCore = true;
    if (skill.name && !target.name) target.name = skill.name;
    if (skill.baseEffect && !target.baseEffect) target.baseEffect = skill.baseEffect;
    if (skill.imageUrl && !target.imageUrl) target.imageUrl = skill.imageUrl;
    if (skill.description && !target.description) target.description = skill.description;
    target.upgrades = mergeUpgrades(skill.upgrades, target.upgrades);
  };

  [...baseSkillMap.values(), ...aggregateSkillMap.values(), ...detailedSkillMap.values()].forEach(mergeOne);

  return [...merged.values()]
    .filter(skill => {
      const normalizedName = String(skill && skill.name || '').trim();
      if (EMPTY_SKILL_NAME_RE.test(normalizedName)) return false;
      const hasContent = !isBlank(skill.baseEffect)
        || !isBlank(skill.description)
        || Object.keys(skill.upgrades || {}).length > 0;
      return !isBlank(normalizedName) || hasContent;
    })
    .sort((a, b) => a.index - b.index)
    .slice(0, 4)
    .map(skill => ({
      ...skill,
      baseEffect: normalizeLineBreaks(skill.baseEffect || skill.description),
      description: normalizeLineBreaks(skill.baseEffect || skill.description),
      upgrades: mergeUpgrades(skill.upgrades),
    }));
}

function buildSkillPayload(detailEntries) {
  const aggregateSkillIcons = [];
  const skillMap = new Map();
  const expandedDetailEntries = getExpandedSkillEntries(detailEntries);

  detailEntries.forEach(entry => {
    const raw = entry.raw || {};
    const projectLabel = getProjectLabel(raw);

    if ((SKILL_ICON_RE.test(projectLabel) || hasBlockFieldKey(raw, SKILL_ICON_RE)) && entry.images.length > 0) {
      selectAggregateSkillIcons(entry.images).forEach(url => aggregateSkillIcons.push(url));
    }
  });

  expandedDetailEntries.forEach(entry => {
    const raw = entry.raw || {};
    const projectLabel = getProjectLabel(raw);
    const positionLabel = getSkillPosition(raw);
    const positionIndex = parseSkillIndex(positionLabel);

    if (!positionIndex) return;

    const skill = ensureSkillRecord(skillMap, positionIndex, positionLabel || `技能${positionIndex}`);
    const value = getEntryValue(entry, raw);

    if (!skill.imageUrl && entry.images.length > 0) {
      skill.imageUrl = entry.images[0];
    }

    if (SKILL_NAME_RE.test(projectLabel)) {
      skill.name = value || skill.name;
      return;
    }

    if (SKILL_UPGRADE_DESC_RE.test(projectLabel)) {
      return;
    }

    if (SKILL_BASE_DESC_RE.test(projectLabel)) {
      setSkillDescription(skill, value, 3);
      return;
    }

    if (SKILL_DESC_RE.test(projectLabel)) {
      setSkillDescription(skill, value, 2);
      return;
    }

    if (!skill.name && projectLabel && value) {
      skill.name = value;
    } else if (!skill.description && value) {
      setSkillDescription(skill, value, 1);
    }
  });

  const preferredAggregateIcons = aggregateSkillIcons.slice(0, 4);
  const aggregateSkillMap = buildAggregateSkillKnowledge(expandedDetailEntries);
  const detailedSkillMap = buildDetailedSkillKnowledge(expandedDetailEntries);
  const mergedSkills = mergeSkillKnowledge(skillMap, aggregateSkillMap, detailedSkillMap);

  // Some hero sheets only provide a single aggregate skill icon for the entire skill row.
  // Reuse it for the remaining slots so cards do not render partially blank.
  if (preferredAggregateIcons.length === 1) {
    const fallbackIcon = preferredAggregateIcons[0];
    const spriteCrops = buildAggregateSkillSpriteCrops(fallbackIcon, mergedSkills.length);
    return mergedSkills.map(skill => ({
      ...skill,
      imageUrl: skill.imageUrl || fallbackIcon,
      imageCrop: !skill.imageUrl ? (spriteCrops[skill.index - 1] || null) : null,
    }));
  }

  return mergedSkills.map((skill, index) => ({
    ...skill,
    imageUrl: preferredAggregateIcons[index] || skill.imageUrl || '',
    imageCrop: null,
  }));
}

function collectDetailFieldValues(detailEntries) {
  const values = [];
  let avatarUrl = '';
  let factionIconUrl = '';
  let careerIconUrl = '';

  detailEntries.forEach(entry => {
    const raw = entry.raw || {};
    const topLevelFields = getBlockTopLevelFieldEntries(raw);
    if (topLevelFields.length > 0) {
      if (!avatarUrl && topLevelFields.some(field => AVATAR_RE.test(field.label)) && entry.images.length > 0) {
        avatarUrl = selectAvatarImage(entry.images);
      }

      if (!careerIconUrl && topLevelFields.some(field => CAREER_RE.test(field.label)) && entry.images.length > 0) {
        careerIconUrl = selectCareerIcon(entry.images);
      }

      if (!factionIconUrl && topLevelFields.some(field => FACTION_RE.test(field.label)) && entry.images.length > 0) {
        factionIconUrl = selectFactionIcon(entry.images);
      }

      topLevelFields.forEach(field => {
        if (SKILL_ICON_RE.test(field.label)) return;

        const normalizedValue = RARITY_RE.test(field.label)
          ? extractRarityValue(field.value)
          : extractLocalizedFieldValue(field.value);
        if (isBlank(normalizedValue)) return;

        values.push({
          label: field.label,
          value: normalizedValue,
        });
      });
    }

    const projectLabel = getProjectLabel(raw);
    if (!projectLabel) return;

    if (!avatarUrl && AVATAR_RE.test(projectLabel) && entry.images.length > 0) {
      avatarUrl = selectAvatarImage(entry.images) || entry.images[0];
    }

    if (!careerIconUrl && CAREER_RE.test(projectLabel) && entry.images.length > 0) {
      careerIconUrl = selectCareerIcon(entry.images);
    }

    if (!factionIconUrl && FACTION_RE.test(projectLabel) && entry.images.length > 0) {
      factionIconUrl = selectFactionIcon(entry.images);
    }

    const positionIndex = parseSkillIndex(getSkillPosition(raw));
    if (positionIndex) return;
    if (SKILL_ICON_RE.test(projectLabel)) return;

    const value = getEntryValue(entry, raw);
    if (isBlank(value)) return;

    values.push({
      label: projectLabel,
      value,
    });
  });

  if (!avatarUrl) {
    avatarUrl = selectAvatarImage(
      detailEntries.flatMap(entry => Array.isArray(entry.images) ? entry.images : [])
    );
  }

  return { values, avatarUrl, factionIconUrl, careerIconUrl };
}

function findFieldValueByLabel(items, pattern) {
  const matched = items.find(item => pattern.test(item.label));
  return matched ? matched.value : '';
}

function buildHeroCardPayload(summaryEntry, detailEntries) {
  const summaryRaw = summaryEntry.raw || {};
  const { values, avatarUrl, factionIconUrl, careerIconUrl } = collectDetailFieldValues(detailEntries);

  const name = firstNonBlank(
    findFieldValueByLabel(values, NAME_RE),
    getRawValueByKeys(summaryRaw, HERO_SUMMARY_FIELD_KEYS.slice(1)),
    getHeroSummaryDisplayName(summaryEntry),
    Array.isArray(summaryEntry.aliases) ? summaryEntry.aliases.find(alias => /[\u4e00-\u9fa5]{2,}/.test(alias)) : '',
    summaryEntry.targetSheet
  );

  const title = firstNonBlank(
    findFieldValueByLabel(values, TITLE_RE)
  );

  const faction = firstNonBlank(
    findFieldValueByLabel(values, FACTION_RE),
    getRawValueByKeys(summaryRaw, HERO_SUMMARY_FACTION_KEYS)
  );

  const career = firstNonBlank(
    findFieldValueByLabel(values, CAREER_RE),
    getRawValueByKeys(summaryRaw, HERO_SUMMARY_CAREER_KEYS)
  );

  const rarity = firstNonBlank(
    findFieldValueByLabel(values, RARITY_RE),
    getRawValueByKeys(summaryRaw, HERO_SUMMARY_RARITY_KEYS)
  );

  const quote = firstNonBlank(
    findFieldValueByLabel(values, QUOTE_RE)
  );

  return {
    name: String(name || '').trim(),
    title: String(title || '').trim(),
    faction: String(faction || '').trim(),
    factionIconUrl: String(factionIconUrl || '').trim(),
    career: String(career || '').trim(),
    careerIconUrl: String(careerIconUrl || '').trim(),
    rarity: String(rarity || '').trim(),
    avatarUrl: String(avatarUrl || '').trim(),
    quote: normalizeLineBreaks(quote),
    skills: buildSkillPayload(detailEntries),
  };
}

function getHeroFieldReply(card, message) {
  const text = String(message || '').trim();
  if (!text || !card || !card.name) return '';

  if (HERO_QUOTE_QUERY_RE.test(text) && card.quote) {
    return `${card.name}的英雄台词：${String(card.quote).replace(/\s+/g, ' ').trim()}`;
  }

  if (HERO_FACTION_QUERY_RE.test(text) && card.faction) {
    return `${card.name}的阵营是${card.faction}。`;
  }

  if (HERO_CAREER_QUERY_RE.test(text) && card.career) {
    return `${card.name}的职业是${card.career}。`;
  }

  if (HERO_RARITY_QUERY_RE.test(text) && card.rarity) {
    return `${card.name}的稀有度是${card.rarity}。`;
  }

  if (HERO_AVATAR_QUERY_RE.test(text) && card.avatarUrl) {
    return `${card.name}有专属头像资料，当前头像已在英雄卡中展示。`;
  }

  return '';
}

async function findHeroFieldReply(versionId, message, history = []) {
  if (!shouldCarryHeroFromHistorySafe(message)) return null;

  const summaryEntry = await findHeroSummaryFromContext(versionId, message, history);
  if (!summaryEntry) return null;

  const detailEntries = await loadDetailEntries(
    versionId,
    summaryEntry.document_id,
    summaryEntry.targetSheet,
    summaryEntry.aliases
  );
  if (detailEntries.length === 0) return null;

  const card = buildHeroCardPayload(summaryEntry, detailEntries);
  if (!card.name) return null;

  const reply = getHeroFieldReply(card, message);
  if (!reply) return null;

  return {
    reply,
    refs: [],
    card,
  };
}

function shouldReturnHeroOverviewReply(message) {
  const text = String(message || '').trim();
  if (!text || !shouldCarryHeroFromHistorySafe(text)) return false;
  return /(?:\u600e\u4e48\u6837|\u600e\u4e48\u770b|\u5982\u4f55|\u5389\u5bb3\u5417|\u5f3a\u5417|\u597d\u7528\u5417|\u503c\u5f97\u7ec3\u5417|\u503c\u5f97\u517b\u5417|\u8bc4\u4ef7|\u5b9a\u4f4d)/u.test(text);
}

function findBestMatchingSkill(skills, message) {
  if (!Array.isArray(skills) || skills.length === 0) return null;

  if (/核心技能/i.test(String(message || ''))) {
    const coreSkill = skills.find(skill => skill.isCore);
    if (coreSkill) return coreSkill;
  }

  const explicitIndex = parseSkillIndex(message);
  if (explicitIndex) {
    const indexedSkill = skills.find(skill => skill.index === explicitIndex);
    if (indexedSkill) return indexedSkill;
  }

  let best = null;
  skills.forEach(skill => {
    [skill.name, skill.label].filter(Boolean).forEach(candidate => {
      const score = scoreSkillCandidate(message, candidate);
      if (!score) return;
      if (!best || score > best.score) {
        best = { skill, score };
      }
    });
  });

  return best && best.score >= 850 ? best.skill : null;
}

function isSkillContextFollowupQuery(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  if (findBestMatchingSkill([], text)) return false;

  return (
    text.length <= 12
    && (
      !!parseStarLevel(text)
      || /基础效果|技能效果|效果|这个技能|这个|那|呢|捏|还有|然后/i.test(text)
    )
  );
}

function findSkillFromHistory(skills, history = []) {
  if (!Array.isArray(skills) || skills.length === 0) return null;

  const recentMessages = [...(Array.isArray(history) ? history : [])]
    .reverse()
    .filter(item => item && !isBlank(item.content))
    .slice(0, 8);

  for (const item of recentMessages) {
    const matched = findBestMatchingSkill(skills, item.content);
    if (matched) return matched;

    if (item.role !== 'assistant') continue;

    const replyText = String(item.content || '');
    const quotedSkill = /「([^」]{2,24})」/.exec(replyText);
    if (!quotedSkill) continue;

    const replyMatched = findBestMatchingSkill(skills, quotedSkill[1]);
    if (replyMatched) return replyMatched;
  }

  return null;
}

function isAllSkillsQuery(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  if (/(?:所有|全部|整套|全套|全部的|所有的).{0,6}(?:技能)/u.test(text)) return true;
  if (/(?:技能).{0,6}(?:都|全部|所有|一起|统一)/u.test(text)) return true;
  if (/(?:all\s+skills|every\s+skill|entire\s+skill\s+set)/iu.test(text)) return true;
  return false;
}

function formatSkillReply(card, skill, starLevel) {
  const skillName = skill.name || skill.label || `技能${skill.index}`;
  const lines = [`${card.name || '该英雄'}「${skillName}」`];

  if (skill.baseEffect) {
    lines.push(`基础效果：${skill.baseEffect}`);
  }

  if (starLevel) {
    const upgrade = skill.upgrades && skill.upgrades[starLevel];
    lines.push(`${getStarLabel(starLevel)}：${upgrade || '知识库里没有找到这档效果。'}`);
  }

  return lines.join('\n');
}

function formatHeroStarListReply(card, starLevel) {
  const items = (Array.isArray(card.skills) ? card.skills : [])
    .map(skill => ({
      name: skill.name || skill.label || `技能${skill.index}`,
      upgrade: skill.upgrades && skill.upgrades[starLevel],
    }))
    .filter(item => item.upgrade);

  if (items.length === 0) return '';

  return `${card.name || '该英雄'}的${getStarLabel(starLevel)}如下：\n${items
    .map(item => `- ${item.name}：${item.upgrade}`)
    .join('\n')}`;
}

function shouldReturnSpecificSkillReply(message, skill) {
  if (!skill) return false;
  if (parseStarLevel(message)) return true;
  if (SKILL_POSITION_RE.test(message)) return true;
  if (/基础效果|技能详情|技能描述|技能效果|介绍|说说|讲讲|什么/.test(String(message || ''))) return true;
  return scoreSkillCandidate(message, skill.name || skill.label || '') >= 850;
}

async function findHeroSkillReply(versionId, message, history = []) {
  if (!looksLikeSkillQuery(message)) return null;

  const summaryEntry = await findHeroSummaryFromContext(versionId, message, history);
  if (!summaryEntry) return null;

  const detailEntries = await loadDetailEntries(
    versionId,
    summaryEntry.document_id,
    summaryEntry.targetSheet,
    summaryEntry.aliases
  );
  if (detailEntries.length === 0) return null;

  const card = buildHeroCardPayload(summaryEntry, detailEntries);
  if (!card.name || !Array.isArray(card.skills) || card.skills.length === 0) return null;

  const starLevel = parseStarLevel(message);
  const allSkillsQuery = isAllSkillsQuery(message);
  const directSkill = findBestMatchingSkill(card.skills, message);
  const contextSkill = !allSkillsQuery && !directSkill && isSkillContextFollowupQuery(message)
    ? findSkillFromHistory(card.skills, history)
    : null;
  const skill = directSkill || contextSkill;

  if (allSkillsQuery && starLevel) {
    const reply = formatHeroStarListReply(card, starLevel);
    if (reply) {
      return {
        reply,
        refs: [],
        card,
      };
    }
  }

  if (shouldReturnSpecificSkillReply(message, skill)) {
    return {
      reply: formatSkillReply(card, skill, starLevel),
      refs: [],
      card,
    };
  }

  if (skill && starLevel) {
    return {
      reply: formatSkillReply(card, skill, starLevel),
      refs: [],
      card,
    };
  }

  if (!skill && starLevel) {
    const reply = formatHeroStarListReply(card, starLevel);
    if (reply) {
      return {
        reply,
        refs: [],
        card,
      };
    }
  }

  return null;
}

async function findHeroCardReply(versionId, message, history = []) {
  const skillReply = await findHeroSkillReply(versionId, message, history);
  if (skillReply) return skillReply;

  const fieldReply = await findHeroFieldReply(versionId, message, history);
  if (fieldReply) return fieldReply;

  const overviewQuery = shouldReturnHeroOverviewReply(message);
  if (!overviewQuery && !shouldReturnHeroCardRequest(message)) return null;

  const summaryEntry = await findHeroSummaryFromContext(versionId, message, history);
  if (!summaryEntry) return null;

  const detailEntries = await loadDetailEntries(
    versionId,
    summaryEntry.document_id,
    summaryEntry.targetSheet,
    summaryEntry.aliases
  );
  if (detailEntries.length === 0) return null;

  const card = buildHeroCardPayload(summaryEntry, detailEntries);
  if (!card.name || !Array.isArray(card.skills) || card.skills.length === 0) {
    return null;
  }

  return {
    replyMode: 'card',
    overviewQuery,
    refs: [],
    card,
  };
}

async function findHeroContextEntity(versionId, message, history = []) {
  const summaryEntry = await findHeroSummaryFromContext(versionId, message, history);
  if (!summaryEntry) {
    const heroName = shouldCarryHeroFromHistorySafe(message)
      ? getRecentAssistantMessages(history)
        .map(extractHeroNameFromAssistantReplySafe)
        .find(isValidHeroNameCandidateSafe)
      : '';

    if (!heroName) return null;

    return {
      documentId: null,
      targetSheet: '',
      name: heroName,
      aliases: [heroName],
    };
  }

  return {
    documentId: summaryEntry.document_id,
    targetSheet: summaryEntry.targetSheet,
    name: getHeroSummaryDisplayName(summaryEntry),
    aliases: Array.isArray(summaryEntry.aliases) ? [...summaryEntry.aliases] : [],
  };
}

module.exports = {
  findHeroCardReply,
  findHeroContextEntity,
  looksLikeHeroDetailQuery,
  __test__: {
    normalizeText,
    looksLikeHeroDetailQuery,
    collectHeroAliases: collectHeroAliasesSafe,
    scoreHeroCandidate,
    buildHeroCardPayload,
    buildSkillPayload,
    parseSkillIndex,
    parseStarLevel,
    extractBaseSkillDescription,
    extractSkillDetailSections,
    selectAggregateSkillIcons,
    buildAggregateSkillSpriteCrops,
    selectFactionIcon,
    selectCareerIcon,
    findBestMatchingSkill,
    isSkillContextFollowupQuery,
    findSkillFromHistory,
    formatSkillReply,
    formatHeroStarListReply,
    isAllSkillsQuery,
    shouldCarryHeroFromHistory: shouldCarryHeroFromHistorySafe,
    isHeroProfileIntent,
    shouldReturnHeroCardRequest,
    extractHeroNameFromAssistantReply: extractHeroNameFromAssistantReplySafe,
    isValidHeroNameCandidate: isValidHeroNameCandidateSafe,
    resolveHeroDetailSheetName,
  },
};
