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
const SUMMARY_CACHE_TTL_MS = 60 * 1000;
const CASUAL_MESSAGE_RE = /^(?:你好|您好|嗨|哈喽|hello|hi|hey|在吗|在么|谢谢|好的|ok|嗯|哦|行)$/i;
const NON_HERO_TOPIC_RE = /(?:世界杯|欧冠|NBA|CBA|足球|篮球|电竞|比赛|赛事|决赛|半决赛|赛程|比分|冠军|亚军|什么时候|几点|几号|哪天|天气|新闻|价格|股价|汇率|OpenAI|搜索|联网)/i;

const summaryCache = new Map();
const imageDimensionCache = new Map();

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function firstNonBlank(...values) {
  for (const value of values) {
    if (!isBlank(value)) return value;
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

function selectAggregateSkillIcons(urls) {
  const items = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (items.length <= 4) return items.slice(0, 4);

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

  const icon = items.find(url => {
    const dimensions = getImageDimensions(url);
    if (!dimensions || !dimensions.width || !dimensions.height) return false;
    const longerSide = Math.max(dimensions.width, dimensions.height);
    const shorterSide = Math.min(dimensions.width, dimensions.height);
    return shorterSide >= 40 && shorterSide <= 96 && (longerSide / shorterSide) <= 1.25;
  });

  return icon || items[0];
}

function normalizeText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[\s\r\n\t_\-–—()（）【】[\]{}<>《》“”"'`~!@#$%^&*,.:;?\/\\|，。！；：、]+/g, '');
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

  if (/(?:浠嬬粛|璇︽儏|妗ｆ|璧勬枡|鏄皝)/i.test(text)) return true;
  if (!shouldCarryHeroFromHistory(text) && text.length <= 12 && !/[?锛焆]/u.test(text)) return true;

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
      const targetSheet = String(firstNonBlank(raw.跳转, raw.sheet, raw.详情sheet, '')).trim();
      return {
        ...row,
        raw,
        targetSheet,
        aliases: collectHeroAliases(raw, targetSheet),
      };
    })
    .filter(item => item.targetSheet && String(item.raw.__sheet || '').trim() === HERO_SUMMARY_SHEET);

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
      const positionIndex = parseSkillIndex(getSkillPosition(raw));
      if (!positionIndex) return;
      if (!SKILL_NAME_RE.test(getProjectLabel(raw))) return;

      const skillName = extractPrimaryTextLine(getEntryValue(row, raw));
      const score = Math.max(
        scoreSkillCandidate(message, skillName),
        scoreSkillCandidate(phrase, skillName)
      );
      if (!score) return;

      const sheetName = String(raw.__sheet || '').trim();
      const summary = summaries.find(item =>
        item.document_id === row.document_id && String(item.targetSheet || '').trim() === sheetName
      ) || summaries.find(item => item.document_id === row.document_id);

      if (!summary) return;
      if (!best || score > best.score) {
        best = { summary, score };
      }
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

function shouldCarryHeroFromHistory(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  if (parseStarLevel(text) || isSkillContextFollowupQuery(text)) return true;
  if (/(?:阵容|陣容|配队|配隊|搭配|推荐阵容|推薦陣容)/u.test(text)) return true;
  if (/^(?:她|他|它|这个|那个|这位|那位|该英雄|这个英雄|那个英雄)/u.test(text)) return true;
  if (/^(?:然后|那|那她|那他|那它|那这个|那那个|还有|再说说|再讲讲|补充|继续)/u.test(text)) return true;
  if (/^(?:台词|语音|语录|头像|立绘|阵营|职业|稀有度|星级|技能|技能1|技能2|技能3|技能4|核心技能)$/u.test(text)) return true;

  return false;
}

async function findHeroSummaryFromContext(versionId, message, history = []) {
  const direct = await findBestHeroSummary(versionId, message);
  if (direct) return direct;

  const bySkill = await findHeroSummaryBySkillPhrase(versionId, message);
  if (bySkill) return bySkill;

  if (!shouldCarryHeroFromHistory(message)) {
    return null;
  }

  const recentMessages = getRecentUserMessages(history);
  for (const item of recentMessages) {
    const matched = await findBestHeroSummary(versionId, item);
    if (matched) return matched;
  }

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

async function loadDetailEntries(versionId, documentId, sheetName) {
  const [rows] = await db.query(
    `SELECT id, row_index, content, raw_json
       FROM knowledge_entries
      WHERE version_id=?
        AND document_id=?
      ORDER BY row_index ASC, id ASC`,
    [versionId, documentId]
  );

  const filteredRows = rows.filter(row => {
    const raw = safeParseJson(row.raw_json);
    return String(raw.__sheet || '').trim() === String(sheetName || '').trim();
  });

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
    raw: safeParseJson(row.raw_json),
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

  detailEntries.forEach(entry => {
    const raw = entry.raw || {};
    const projectLabel = getProjectLabel(raw);
    const positionLabel = getSkillPosition(raw);
    const positionIndex = parseSkillIndex(positionLabel);

    if (SKILL_ICON_RE.test(projectLabel) && entry.images.length > 0) {
      selectAggregateSkillIcons(entry.images).forEach(url => aggregateSkillIcons.push(url));
    }

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
  const aggregateSkillMap = buildAggregateSkillKnowledge(detailEntries);
  const detailedSkillMap = buildDetailedSkillKnowledge(detailEntries);

  return mergeSkillKnowledge(skillMap, aggregateSkillMap, detailedSkillMap)
    .map((skill, index) => ({
      ...skill,
      imageUrl: preferredAggregateIcons[index] || skill.imageUrl || '',
    }));
}

function collectDetailFieldValues(detailEntries) {
  const values = [];
  let avatarUrl = '';
  let careerIconUrl = '';

  detailEntries.forEach(entry => {
    const raw = entry.raw || {};
    const projectLabel = getProjectLabel(raw);
    if (!projectLabel) return;

    if (!avatarUrl && AVATAR_RE.test(projectLabel) && entry.images.length > 0) {
      avatarUrl = entry.images[0];
    }

    if (!careerIconUrl && CAREER_RE.test(projectLabel) && entry.images.length > 0) {
      careerIconUrl = selectCareerIcon(entry.images);
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

  return { values, avatarUrl, careerIconUrl };
}

function findFieldValueByLabel(items, pattern) {
  const matched = items.find(item => pattern.test(item.label));
  return matched ? matched.value : '';
}

function buildHeroCardPayload(summaryEntry, detailEntries) {
  const summaryRaw = summaryEntry.raw || {};
  const { values, avatarUrl, careerIconUrl } = collectDetailFieldValues(detailEntries);

  const name = firstNonBlank(
    findFieldValueByLabel(values, NAME_RE),
    summaryRaw.英雄名称,
    summaryRaw.英雄,
    summaryEntry.aliases.find(alias => /[\u4e00-\u9fa5]{2,}/.test(alias)),
    summaryEntry.targetSheet
  );

  const title = firstNonBlank(
    findFieldValueByLabel(values, TITLE_RE)
  );

  const faction = firstNonBlank(
    findFieldValueByLabel(values, FACTION_RE),
    summaryRaw.阵营
  );

  const career = firstNonBlank(
    findFieldValueByLabel(values, CAREER_RE),
    summaryRaw.职业
  );

  const rarity = firstNonBlank(
    findFieldValueByLabel(values, RARITY_RE),
    summaryRaw.英雄级别,
    summaryRaw.稀有度
  );

  const quote = firstNonBlank(
    findFieldValueByLabel(values, QUOTE_RE)
  );

  return {
    name: String(name || '').trim(),
    title: String(title || '').trim(),
    faction: String(faction || '').trim(),
    career: String(career || '').trim(),
    careerIconUrl: String(careerIconUrl || '').trim(),
    rarity: String(rarity || '').trim(),
    avatarUrl: String(avatarUrl || '').trim(),
    quote: normalizeLineBreaks(quote),
    skills: buildSkillPayload(detailEntries),
  };
}

function buildHeroReplyText(card, message) {
  const name = card.name || '该英雄';
  if (/技能/.test(message)) {
    return `这是${name}的技能资料，基础信息和英雄台词也一起放在下面。`;
  }
  if (/台词|语音|语录/.test(message)) {
    return `这是${name}的英雄档案，台词和技能都在下面。`;
  }
  return `这是${name}的英雄档案，头像、阵营、稀有度、技能和英雄台词都在下面。`;
}

function formatHeroCardReply(card, message) {
  return `${buildHeroReplyText(card, message)}\n\n\`\`\`herocard\n${JSON.stringify(card, null, 2)}\n\`\`\``;
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

  const detailEntries = await loadDetailEntries(versionId, summaryEntry.document_id, summaryEntry.targetSheet);
  if (detailEntries.length === 0) return null;

  const card = buildHeroCardPayload(summaryEntry, detailEntries);
  if (!card.name || !Array.isArray(card.skills) || card.skills.length === 0) return null;

  const starLevel = parseStarLevel(message);
  const directSkill = findBestMatchingSkill(card.skills, message);
  const contextSkill = !directSkill && isSkillContextFollowupQuery(message)
    ? findSkillFromHistory(card.skills, history)
    : null;
  const skill = directSkill || contextSkill;

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

  if (!shouldReturnHeroCardRequest(message)) return null;

  const summaryEntry = await findHeroSummaryFromContext(versionId, message, history);
  if (!summaryEntry) return null;

  const detailEntries = await loadDetailEntries(versionId, summaryEntry.document_id, summaryEntry.targetSheet);
  if (detailEntries.length === 0) return null;

  const card = buildHeroCardPayload(summaryEntry, detailEntries);
  if (!card.name || !Array.isArray(card.skills) || card.skills.length === 0) {
    return null;
  }

  return {
    reply: formatHeroCardReply(card, message),
    refs: [],
    card,
  };
}

async function findHeroContextEntity(versionId, message, history = []) {
  const summaryEntry = await findHeroSummaryFromContext(versionId, message, history);
  if (!summaryEntry) return null;

  const name = String(firstNonBlank(
    summaryEntry.raw && summaryEntry.raw.鑻遍泟鍚嶇О,
    summaryEntry.raw && summaryEntry.raw.鑻遍泟,
    summaryEntry.aliases && summaryEntry.aliases.find(alias => /[\u4e00-\u9fa5]{2,}/.test(alias)),
    summaryEntry.targetSheet
  ) || '').trim();

  return {
    documentId: summaryEntry.document_id,
    targetSheet: summaryEntry.targetSheet,
    name,
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
    collectHeroAliases,
    scoreHeroCandidate,
    buildHeroCardPayload,
    buildSkillPayload,
    parseSkillIndex,
    parseStarLevel,
    extractBaseSkillDescription,
    extractSkillDetailSections,
    selectAggregateSkillIcons,
    selectCareerIcon,
    findBestMatchingSkill,
    isSkillContextFollowupQuery,
    findSkillFromHistory,
    formatSkillReply,
    formatHeroStarListReply,
    shouldCarryHeroFromHistory,
    isHeroProfileIntent,
    shouldReturnHeroCardRequest,
  },
};
