const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const cfg = require('../config/kb');
const llm = require('./llm');
const ragContext = require('./ragContext');
const kgContext = require('./kgContext');
const liveTools = require('./liveTools');
const heroCardService = require('./heroCardService');
const kbEntryLocales = require('./kbEntryLocales');
const qualityScoring = require('./qualityScoring');

const GLOBAL_CONSTRAINTS_PATH = path.join(__dirname, '../../prompts/c-end-robot-constraints.md');
const PROMPT_RULES_START = '<!-- PROMPT_RULES_START -->';
const PROMPT_RULES_END = '<!-- PROMPT_RULES_END -->';

const globalConstraintsCache = {
  mtimeMs: 0,
  promptRules: '',
};

const DEFAULT_BOT_PROFILE = {
  display_name: '陪伴助手',
  avatar_url: null,
  persona: '你是一个热情耐心的游戏陪玩助手。',
  welcome: '你好，我是你的游戏陪玩助手，有什么想聊的？',
  rag_enabled: 1,
  rag_top_k: 5,
  kg_enabled: 1,
  history_turns: 10,
  model: null,
};

const WEATHER_LOCATION_PROMPT = '你想查哪个城市的天气？直接发“上海天气”或“北京明天会不会下雨”这种就行。';

const DIRECT_KB_REPLY_MAX_LINES = 12;
const DIRECT_KB_REPLY_MAX_CHARS = 1200;
const KB_METADATA_LABEL_RE = /^(?:sheet|rows?|reference|context|guide title|status|publish time|asset path|category)\s*:/i;
const HERO_DETAIL_FIELD_RE = /(?:技能|台词|语音|阵营|职业|稀有度|稀有|定位|简介|介绍|背景|基础效果|一星|二星|三星|四星|五星)/u;
const GAME_QUERY_KEYWORDS = [
  /(?:hero|skill|skills|build|loadout|team comp|lineup|formation|quest|campaign|raid|gacha|character|rarity|faction|class|gear|boss)/iu,
  /(?:英雄|技能|台词|语音|阵营|职业|稀有度|定位|阵容|配队|体力|关卡|副本|主线|抽卡|角色|装备|boss|游戏)/u,
];
const SEARCH_FAILURE_FOLLOWUP_RE = /^(?:这也不知道吗|这都不知道吗|这也查不到吗|怎么这都查不到|不是能联网吗|不是能搜索吗|再查(?:一下|下|下吧)?|再搜(?:一下|下|下吧)?|重新查(?:一下|下|下吧)?|重新搜(?:一下|下|下吧)?|你再查查|你再搜搜|search again|try again|you don't know that\??)$/iu;

const BOUND_GAME_REFERENCE_PATTERNS = [
  /(?:\u8fd9\u6b3e\u6e38\u620f|\u8fd9\u4e2a\u6e38\u620f|\u8fd9\u6e38\u620f|\u5f53\u524d\u7248\u672c|\u8fd9\u4e2a\u7248\u672c|\u8fd9\u7248\u672c)/u,
  /(?:\u56de\u5751|\u65b0\u624b\u5165\u95e8|\u65b0\u624b|\u5165\u95e8|\u600e\u4e48\u73a9|\u600e\u4e48\u5f00\u5c40|\u5f00\u5c40|\u53d1\u80b2|\u517b\u6210|\u63a8\u56fe|\u63a8\u5173|\u4e3b\u7ebf|\u9635\u5bb9|\u914d\u961f|\u8d44\u6e90|\u4f18\u5148\u517b|\u8be5\u505a\u4ec0\u4e48|\u6700\u503c\u5f97\u505a|\u503c\u5f97\u505a)/u,
];
const NON_GAME_CONTEXT_KEYWORDS = [
  /(?:\u4e16\u754c\u676f|nba|cba|\u8db3\u7403|\u7bee\u7403|\u51b3\u8d5b|\u534a\u51b3\u8d5b|\u5b63\u519b\u8d5b|\u8d5b\u7a0b|\u6bd4\u5206|\u51a0\u519b|\u4e9a\u519b)/iu,
  /(?:\u5929\u6c14|\u4e0b\u96e8|\u6c14\u6e29|\u98ce\u529b|\u53f0\u98ce|\u51b7\u7a7a\u6c14)/u,
  /(?:\u54c1\u724c|\u6c7d\u8f66|\u7279\u65af\u62c9|tesla|apple|openai|chatgpt|iphone)/iu,
];

function isQuestionMarkCorrupted(value, minimumQuestionMarks = 3) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return false;

  const questionCount = (text.match(/[?\uFF1F]/g) || []).length;
  if (questionCount < minimumQuestionMarks) return false;

  const stripped = text.replace(/[\s?\uFF1F"'“”‘’()[\]{}<>.,，。!！:：;；/\\+\-_=]+/g, '');
  return stripped.length === 0;
}

function sanitizeBotRow(row = {}) {
  const bot = { ...DEFAULT_BOT_PROFILE, ...row };

  if (isQuestionMarkCorrupted(bot.display_name)) {
    bot.display_name = DEFAULT_BOT_PROFILE.display_name;
  }
  if (isQuestionMarkCorrupted(bot.persona)) {
    bot.persona = DEFAULT_BOT_PROFILE.persona;
  }
  if (isQuestionMarkCorrupted(bot.welcome)) {
    bot.welcome = DEFAULT_BOT_PROFILE.welcome;
  }

  return bot;
}

function extractPromptRules(markdown = '') {
  const content = String(markdown || '');
  const startIndex = content.indexOf(PROMPT_RULES_START);
  const endIndex = content.indexOf(PROMPT_RULES_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return content.trim();
  }

  return content
    .slice(startIndex + PROMPT_RULES_START.length, endIndex)
    .trim();
}

function loadGlobalBotConstraints() {
  try {
    const stat = fs.statSync(GLOBAL_CONSTRAINTS_PATH);
    if (
      globalConstraintsCache.promptRules
      && globalConstraintsCache.mtimeMs === stat.mtimeMs
    ) {
      return globalConstraintsCache.promptRules;
    }

    const markdown = fs.readFileSync(GLOBAL_CONSTRAINTS_PATH, 'utf8');
    const promptRules = extractPromptRules(markdown);

    globalConstraintsCache.mtimeMs = stat.mtimeMs;
    globalConstraintsCache.promptRules = promptRules;
    return promptRules;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[chatService] loadGlobalBotConstraints failed:', err.message);
    }
    return '';
  }
}

async function getBot(versionId) {
  const [rows] = await db.query('SELECT * FROM bots WHERE version_id=?', [versionId]);
  if (rows.length > 0) return sanitizeBotRow(rows[0]);
  return { ...DEFAULT_BOT_PROFILE };
}

async function getVersionContext(versionId) {
  const [rows] = await db.query(
    'SELECT id, code, game_name, region, display_name FROM versions WHERE id=? LIMIT 1',
    [versionId]
  );
  return rows[0] || null;
}

async function findOrCreateSession(versionId, sessionKey, firstMessage) {
  const [rows] = await db.query(
    'SELECT id FROM chat_sessions WHERE version_id=? AND session_key=?',
    [versionId, sessionKey]
  );
  if (rows.length > 0) return { id: rows[0].id, isNew: false };

  const title = String(firstMessage || '').slice(0, 30);
  try {
    const [ins] = await db.query(
      'INSERT INTO chat_sessions (version_id, session_key, title) VALUES (?,?,?)',
      [versionId, sessionKey, title]
    );
    return { id: ins.insertId, isNew: true };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const [again] = await db.query(
        'SELECT id FROM chat_sessions WHERE version_id=? AND session_key=?',
        [versionId, sessionKey]
      );
      return { id: again[0].id, isNew: false };
    }
    throw err;
  }
}

async function loadHistory(sessionId, limit) {
  const [rows] = await db.query(
    'SELECT role, content FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT ?',
    [sessionId, limit]
  );
  return rows.reverse();
}

function sliceUtf8(text, remainingBytes) {
  if (remainingBytes <= 0) return '';
  return Buffer.from(String(text || ''), 'utf8').slice(0, remainingBytes).toString('utf8');
}

function appendBlockWithBudget(systemContent, usedBytes, block, budgetBytes) {
  if (!block) return { systemContent, usedBytes, exhausted: false };

  const normalizedBlock = String(block || '').trim();
  if (!normalizedBlock) return { systemContent, usedBytes, exhausted: false };

  const nextBlock = systemContent ? `\n\n${normalizedBlock}` : normalizedBlock;
  const nextBytes = Buffer.byteLength(nextBlock, 'utf8');

  if (usedBytes + nextBytes <= budgetBytes) {
    return {
      systemContent: systemContent + nextBlock,
      usedBytes: usedBytes + nextBytes,
      exhausted: false,
    };
  }

  const remainingBytes = budgetBytes - usedBytes;
  if (remainingBytes <= 0) {
    return { systemContent, usedBytes, exhausted: true };
  }

  return {
    systemContent: systemContent + sliceUtf8(nextBlock, remainingBytes),
    usedBytes: budgetBytes,
    exhausted: true,
  };
}

function formatSearchResultsForPrompt(results = []) {
  return results
    .slice(0, 5)
    .map((item, index) => [
      `[${index + 1}] Title: ${item.title || ''}`,
      item.time ? `Time: ${item.time}` : '',
      item.source ? `Source: ${item.source}` : '',
      item.snippet ? `Snippet: ${item.snippet}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n');
}

const SEARCH_REQUIRED_KEYWORDS = [
  '\u641c\u7d22',
  '\u641c\u4e00\u4e0b',
  '\u641c\u4e00\u641c',
  '\u5e2e\u6211\u641c',
  '\u5e2e\u6211\u67e5',
  '\u67e5\u4e00\u4e0b',
  '\u6700\u65b0',
  '\u6700\u8fd1',
  '\u65b0\u95fb',
  '\u5b98\u7f51',
  '\u5b9e\u65f6',
  '\u70ed\u641c',
  '\u4eca\u5929',
  '\u4eca\u65e5',
  '\u73b0\u5728',
  '\u76ee\u524d',
  '\u672c\u5468',
  '\u8fd1\u65e5',
  '\u4e16\u754c\u676f',
  '\u6b27\u51a0',
  'nba',
  'cba',
  '\u8db3\u7403',
  '\u7bee\u7403',
  '\u7535\u7ade',
  '\u6bd4\u8d5b',
  '\u8d5b\u4e8b',
  '\u51b3\u8d5b',
  '\u534a\u51b3\u8d5b',
  '\u8d5b\u7a0b',
  '\u6bd4\u5206',
  '\u51a0\u519b',
  '\u4e9a\u519b',
  '\u4ec0\u4e48\u65f6\u5019',
  '\u51e0\u70b9',
  '\u51e0\u53f7',
  '\u54ea\u5929',
  '\u4f55\u65f6',
  '\u4ef7\u683c',
  '\u80a1\u4ef7',
  '\u6c47\u7387',
  'latest',
  'news',
  'official',
  'current',
  'today',
  'now',
  'price',
  'when',
  'schedule',
  'final',
  'world cup',
];

function shouldReturnSearchUnavailableFallback(query) {
  const text = String(query == null ? '' : query).trim().toLowerCase();
  if (!text) return false;
  return SEARCH_REQUIRED_KEYWORDS.some(keyword => text.includes(keyword));
}

function buildSearchUnavailableReply(query) {
  if (!shouldReturnSearchUnavailableFallback(query)) return '';
  switch (detectUserLocale(query)) {
    case 'en-US':
      return 'This question needs current or latest information. I do not have reliable search results right now, so I should not guess. Please try again later or confirm through an official source.';
    case 'ja-JP':
      return '\u3053\u306e\u8cea\u554f\u306f\u6700\u65b0\u60c5\u5831\u306e\u78ba\u8a8d\u304c\u5fc5\u8981\u3067\u3059\u3002\u4eca\u306f\u4fe1\u983c\u3067\u304d\u308b\u691c\u7d22\u7d50\u679c\u3092\u53d6\u308c\u3066\u3044\u306a\u3044\u306e\u3067\u3001\u63a8\u6e2c\u3067\u306f\u7b54\u3048\u307e\u305b\u3093\u3002\u5c11\u3057\u3057\u3066\u304b\u3089\u3082\u3046\u4e00\u5ea6\u8a66\u3059\u304b\u3001\u516c\u5f0f\u60c5\u5831\u3067\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002';
    case 'ko-KR':
      return '\uc774 \uc9c8\ubb38\uc740 \uc2e4\uc2dc\uac04 \ub610\ub294 \ucd5c\uc2e0 \uc815\ubcf4 \ud655\uc778\uc774 \ud544\uc694\ud569\ub2c8\ub2e4. \uc9c0\uae08\uc740 \uc2e0\ub8b0\ud560 \ub9cc\ud55c \uac80\uc0c9 \uacb0\uacfc\ub97c \ud655\ubcf4\ud558\uc9c0 \ubabb\ud574 \ucd94\uce21\ud574\uc11c \ub2f5\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud558\uac70\ub098 \uacf5\uc2dd \ucc44\ub110\uc5d0\uc11c \ud655\uc778\ud574 \uc8fc\uc138\uc694.';
    case 'zh-TW':
      return '\u9019\u500b\u554f\u984c\u9700\u8981\u67e5\u5373\u6642\u6216\u6700\u65b0\u8cc7\u8a0a\uff0c\u6211\u9019\u908a\u66ab\u6642\u6c92\u6709\u62ff\u5230\u53ef\u9760\u7684\u641c\u5c0b\u7d50\u679c\uff0c\u4e0d\u80fd\u4e82\u5831\u3002\u4f60\u53ef\u4ee5\u7a0d\u5f8c\u518d\u8a66\u4e00\u6b21\uff0c\u6216\u76f4\u63a5\u67e5\u5b98\u65b9\u7ba1\u9053\u78ba\u8a8d\u3002';
    case 'zh-CN':
    default:
      return '\u8fd9\u4e2a\u95ee\u9898\u9700\u8981\u67e5\u5b9e\u65f6\u6216\u6700\u65b0\u4fe1\u606f\uff0c\u6211\u8fd9\u8fb9\u6682\u65f6\u6ca1\u62ff\u5230\u53ef\u9760\u641c\u7d22\u7ed3\u679c\uff0c\u4e0d\u80fd\u4e71\u62a5\u3002\u4f60\u53ef\u4ee5\u7a0d\u540e\u518d\u8bd5\u4e00\u6b21\uff0c\u6216\u76f4\u63a5\u67e5\u5b98\u65b9\u6e20\u9053\u786e\u8ba4\u3002';
  }
}

function looksLikeSearchUnavailableReply(reply) {
  const text = String(reply || '').trim();
  if (!text) return false;
  return /(?:可靠搜索结果|官方渠道确认|latest information|reliable search results|official source)/iu.test(text);
}

function getPendingSearchRetryQuery(message, history) {
  const text = String(message || '').trim();
  if (!text || !Array.isArray(history) || history.length < 2) return '';
  if (!SEARCH_FAILURE_FOLLOWUP_RE.test(text)) return '';

  const lastTurn = history[history.length - 1];
  if (!lastTurn || lastTurn.role !== 'assistant' || !looksLikeSearchUnavailableReply(lastTurn.content)) {
    return '';
  }

  for (let index = history.length - 2; index >= 0; index -= 1) {
    const item = history[index];
    if (!item || item.role !== 'user') continue;
    const candidate = String(item.content || '').trim();
    if (candidate) return candidate;
  }

  return '';
}

function splitDirectKnowledgeLines(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => String(line || '').trim())
    .filter(Boolean);
}

function isDirectKbMetadataLine(line) {
  const text = String(line || '').trim();
  if (!text) return true;
  if (KB_METADATA_LABEL_RE.test(text)) return true;
  if (/(?:https?:\/\/|\\\\|\/kb-images\/)/iu.test(text)) return true;
  return false;
}

function shouldKeepKnowledgeHeadingLine(line) {
  return /^(?:sheet|guide title)\s*:/iu.test(String(line || '').trim());
}

function isReplySkippedKnowledgeLine(line) {
  if (shouldKeepKnowledgeHeadingLine(line)) return false;
  if (isAssetNoiseKnowledgeLine(line)) return true;
  return isDirectKbMetadataLine(line);
}

function normalizeDirectKnowledgeLine(line) {
  const text = String(line || '').trim();
  if (!text) return '';

  if (text.includes(' | ')) {
    const parts = text.split(/\s+\|\s+/);
    const zhLike = parts.find(part => /[\u4e00-\u9fa5]/u.test(part));
    if (zhLike) return zhLike.trim();
  }

  return text;
}

function isAssetNoiseKnowledgeLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;

  if (/(?:icon的图标id|icon图标id|icon\s*id|图标id|图标编号|图标资源|资源id|asset\s*id)/iu.test(text)) {
    return true;
  }

  return /^\*?(?:如果|若|如).{0,24}(?:icon|图标).{0,24}(?:只列|填写|提供|使用)/iu.test(text);
}

function detectUserLocale(message) {
  const text = String(message || '').trim();
  if (!text) return 'zh-CN';
  if (/[\u3040-\u30ff\u31f0-\u31ff]/u.test(text)) return 'ja-JP';
  if (/[\uac00-\ud7af]/u.test(text)) return 'ko-KR';
  if (/[\u4e00-\u9fff]/u.test(text)) return 'zh-CN';
  if (/[a-z]/iu.test(text)) return 'en-US';
  return 'zh-CN';
}

function getLocaleAnswerInstruction(locale) {
  switch (kbEntryLocales.normalizeLocale(locale)) {
    case 'en-US':
      return 'Answer only in English. Do not mix in Chinese, Japanese, Korean, or translated duplicates.';
    case 'ja-JP':
      return 'Answer only in Japanese. Do not mix in Chinese, English, Korean, or translated duplicates.';
    case 'ko-KR':
      return 'Answer only in Korean. Do not mix in Chinese, English, Japanese, or translated duplicates.';
    case 'zh-TW':
      return 'Answer only in Traditional Chinese. Do not mix in English, Japanese, Korean, or translated duplicates.';
    case 'zh-CN':
    default:
      return 'Answer only in Simplified Chinese. Do not mix in English, Japanese, Korean, or translated duplicates.';
  }
}

function getLocaleAudienceLabel(locale) {
  switch (kbEntryLocales.normalizeLocale(locale)) {
    case 'en-US':
      return 'an English-speaking end user';
    case 'ja-JP':
      return 'a Japanese-speaking end user';
    case 'ko-KR':
      return 'a Korean-speaking end user';
    case 'zh-TW':
      return 'a Traditional Chinese-speaking end user';
    case 'zh-CN':
    default:
      return 'a Simplified Chinese-speaking end user';
  }
}

function getLocaleFieldLocale(label) {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]?\d+$/u, '');
  if (!normalized) return '';

  for (const def of kbEntryLocales.LOCALE_FIELD_DEFS) {
    const labels = [def.label, ...(Array.isArray(def.keys) ? def.keys : [])];
    if (labels.some(item => String(item || '').trim().toLowerCase() === normalized)) {
      return def.locale;
    }
  }

  return '';
}

function getStandaloneLocaleLineLocale(line) {
  const normalized = String(line || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]?\d+$/u, '');
  if (!normalized) return '';

  const standaloneMap = new Map([
    ['中文', 'zh-CN'],
    ['简中', 'zh-CN'],
    ['简体', 'zh-CN'],
    ['简体中文', 'zh-CN'],
    ['english', 'en-US'],
    ['英文', 'en-US'],
    ['英语', 'en-US'],
    ['繁中', 'zh-TW'],
    ['繁体', 'zh-TW'],
    ['繁體', 'zh-TW'],
    ['繁体中文', 'zh-TW'],
    ['繁體中文', 'zh-TW'],
    ['traditional chinese', 'zh-TW'],
    ['日文', 'ja-JP'],
    ['日语', 'ja-JP'],
    ['日本語', 'ja-JP'],
    ['japanese', 'ja-JP'],
    ['韩文', 'ko-KR'],
    ['韩语', 'ko-KR'],
    ['韓文', 'ko-KR'],
    ['韓語', 'ko-KR'],
    ['한국어', 'ko-KR'],
    ['korean', 'ko-KR'],
  ]);

  return standaloneMap.get(normalized) || getLocaleFieldLocale(normalized);
}

function isCompatibleLocale(targetLocale, candidateLocale) {
  const target = kbEntryLocales.normalizeLocale(targetLocale);
  const candidate = kbEntryLocales.normalizeLocale(candidateLocale);
  if (!target || !candidate) return false;
  if (target === candidate) return true;
  if (target.startsWith('zh-') || candidate.startsWith('zh-')) return false;
  return target.split('-')[0] === candidate.split('-')[0];
}

function dedupeLines(lines) {
  const seen = new Set();
  const output = [];

  for (const line of Array.isArray(lines) ? lines : []) {
    const text = String(line || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }

  return output;
}

function isKnowledgeMetadataFieldLabel(label) {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]?\d+$/u, '');

  return /^(?:sheet|rows?|reference|context|guide title|status|publish time|asset path|category|row|module|project|notes?|remark|remarks|项目|模块|备注|分类|参考|素材地址|成图地址|百科链接)$/iu.test(normalized);
}

function filterKnowledgeLinesByLocale(lines, preferredLocale) {
  const normalizedLines = (Array.isArray(lines) ? lines : [])
    .map(normalizeDirectKnowledgeLine)
    .filter(Boolean);
  if (normalizedLines.length === 0) return [];

  const sequence = [];
  const localeOrder = [];
  const localeSeen = new Set();
  let activeLocale = '';

  for (const line of normalizedLines) {
    const standaloneLocale = getStandaloneLocaleLineLocale(line);
    if (standaloneLocale) {
      activeLocale = standaloneLocale;
      if (!localeSeen.has(standaloneLocale)) {
        localeSeen.add(standaloneLocale);
        localeOrder.push(standaloneLocale);
      }
      continue;
    }

    const parsed = parseKnowledgeFieldLine(line);
    const lineLocale = parsed ? getLocaleFieldLocale(parsed.label) : '';
    if (!lineLocale) {
      if (parsed) {
        if (activeLocale && !isKnowledgeMetadataFieldLabel(parsed.label)) {
          sequence.push({ locale: activeLocale, line });
          continue;
        }
        activeLocale = '';
        sequence.push({ locale: '', line });
        continue;
      }
      if (activeLocale) {
        sequence.push({ locale: activeLocale, line });
        continue;
      }
      sequence.push({ locale: '', line });
      continue;
    }

    activeLocale = lineLocale;
    if (!localeSeen.has(lineLocale)) {
      localeSeen.add(lineLocale);
      localeOrder.push(lineLocale);
    }

    const value = normalizeDirectKnowledgeLine(parsed.value);
    if (value) sequence.push({ locale: lineLocale, line: value });
  }

  if (localeOrder.length === 0) return dedupeLines(normalizedLines);

  const selectedLocale = localeOrder.find(locale => isCompatibleLocale(preferredLocale, locale));
  const filtered = sequence
    .filter(item => !item.locale || (selectedLocale && isCompatibleLocale(selectedLocale, item.locale)))
    .map(item => item.line);

  return dedupeLines(filtered);
}

function looksLikeStructuredKnowledgeLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (/^[一二三四五六七八九十]+[、.]/u.test(text)) return true;
  if (/^\d+[.、]/u.test(text)) return true;
  if (/^[^:：\s][^:：\n]{0,30}[:：]\s*\S+/u.test(text)) return true;
  return /[\u4e00-\u9fa5]/u.test(text) && text.length >= 10;
}

function looksLikeGuideKnowledgeLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return false;

  const joined = lines.join('\n');
  if (!joined.trim()) return false;

  return /(?:新手|入门|上手|攻略|指南|教程|每日必做|日常必做|how to|guide|getting started|quick start|daily must-?do|recommended daily actions)/iu.test(joined);
}

function hasPreferredLocaleContent(lines, preferredLocale) {
  const locale = kbEntryLocales.normalizeLocale(preferredLocale);
  if (!Array.isArray(lines) || lines.length === 0) return false;

  switch (locale) {
    case 'en-US':
      return lines.some(line => (String(line || '').match(/[A-Za-z]+/g) || []).length >= 4);
    case 'ja-JP':
      return lines.some(line => (String(line || '').match(/[\u3040-\u30ff\u31f0-\u31ff]/g) || []).length >= 4);
    case 'ko-KR':
      return lines.some(line => (String(line || '').match(/[\uac00-\ud7af]/g) || []).length >= 4);
    case 'zh-TW':
    case 'zh-CN':
    default:
      return lines.some(line => (String(line || '').match(/[\u4e00-\u9fff]/g) || []).length >= 6);
  }
}

function isHeroAliasMappingKnowledge(query, lines) {
  if (!heroCardService.looksLikeHeroDetailQuery(query)) return false;
  if (!Array.isArray(lines) || lines.length === 0) return false;

  const aliasFieldLabels = new Set(['lastwar', '位面2名', '位面2', '灯塔名', '灯塔', '稀有等级', '评级']);
  let aliasFieldCount = 0;
  let detailFieldCount = 0;

  for (const line of lines) {
    const parsed = parseKnowledgeFieldLine(line);
    if (!parsed) {
      if (/ \| /u.test(String(line || ''))) aliasFieldCount += 1;
      continue;
    }

    const normalizedLabel = parsed.label.toLowerCase();
    if (aliasFieldLabels.has(normalizedLabel)) {
      aliasFieldCount += 1;
      continue;
    }

    if (/(?:技能|台词|语音|阵营|职业|稀有度|定位|简介|介绍|背景)/u.test(parsed.label)) {
      detailFieldCount += 1;
    }
  }

  return aliasFieldCount >= 2 && detailFieldCount === 0;
}

function isAliasTableOnlyLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return false;

  let aliasSignalCount = 0;
  let detailSignalCount = 0;

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;

    const parsed = parseKnowledgeFieldLine(line);
    if (parsed) {
      const label = parsed.label.toLowerCase();
      if (/(?:lastwar|位面2名|位面2|灯塔名|灯塔|别名|对照|映射|稀有等级|评级)/u.test(label)) {
        aliasSignalCount += 1;
        continue;
      }
      if (HERO_DETAIL_FIELD_RE.test(parsed.label)) {
        detailSignalCount += 1;
        continue;
      }
      if (parsed.value.includes('|')) {
        aliasSignalCount += 1;
        continue;
      }
    } else {
      if (line.includes('|')) {
        aliasSignalCount += 1;
        continue;
      }
      if (HERO_DETAIL_FIELD_RE.test(line)) {
        detailSignalCount += 1;
        continue;
      }
    }

    if (looksLikeStructuredKnowledgeLine(line) && line.length > 16) {
      detailSignalCount += 1;
    }
  }

  return aliasSignalCount > 0 && detailSignalCount === 0;
}

function isLocaleFieldLabel(label) {
  const text = String(label || '').trim().toLowerCase();
  if (!text) return false;
  return /^(?:项目|中文|英文|日语|韩语|한语|繁中|繁體|繁体|备注|備注|basic effects)$/iu.test(text);
}

function isHeaderOnlyKnowledgeLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return false;

  const parsedLines = lines.map(parseKnowledgeFieldLine).filter(Boolean);
  if (parsedLines.length < 2 || parsedLines.length !== lines.length) return false;
  if (!parsedLines.every(item => isLocaleFieldLabel(item.label))) return false;

  const values = parsedLines
    .map(item => String(item.value || '').trim())
    .filter(Boolean);

  if (values.length < 2) return false;
  if (values.some(value => value.length > 32)) return false;
  if (values.some(value => /[\d。！？.!?：:；;]/u.test(value))) return false;

  return new Set(values.map(value => value.toLowerCase())).size >= 2;
}

function isCatalogOnlyKnowledgeLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 10) return false;

  const normalizedLines = lines
    .map(line => normalizeDirectKnowledgeLine(line))
    .filter(Boolean);
  if (normalizedLines.length < 2) return false;
  if (normalizedLines.some(line => line.length > 24)) return false;
  if (normalizedLines.some(line => /[。！？!?]/u.test(line))) return false;
  if (normalizedLines.some(line => /\d{2,}/u.test(line))) return false;

  const localeOrTitleCount = normalizedLines.filter(
    line => /[A-Za-z]/.test(line) || /[\u3040-\u30ff]/u.test(line) || /[\uac00-\ud7af]/u.test(line)
  ).length;

  return localeOrTitleCount >= 2;
}

function hasOnlyHeroAliasMappingRefs(query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return false;

  let aliasRefCount = 0;
  let descriptiveRefCount = 0;

  for (const ref of refs) {
    const lines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isDirectKbMetadataLine(line))
      .filter(Boolean);

    if (lines.length === 0) continue;

    if (isHeroAliasMappingKnowledge(query, lines) || isAliasTableOnlyLines(lines)) {
      aliasRefCount += 1;
      continue;
    }

    descriptiveRefCount += 1;
  }

  return aliasRefCount > 0 && descriptiveRefCount === 0;
}

function hasOnlyHeaderOnlyRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return false;

  let headerOnlyCount = 0;
  let descriptiveRefCount = 0;

  for (const ref of refs) {
    const lines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isDirectKbMetadataLine(line))
      .filter(Boolean);

    if (lines.length === 0) continue;

    if (isHeaderOnlyKnowledgeLines(lines)) {
      headerOnlyCount += 1;
      continue;
    }

    descriptiveRefCount += 1;
  }

  return headerOnlyCount > 0 && descriptiveRefCount === 0;
}

function hasOnlyCatalogRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return false;

  let catalogCount = 0;
  let descriptiveRefCount = 0;

  for (const ref of refs) {
    const lines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isDirectKbMetadataLine(line))
      .filter(Boolean);

    if (lines.length === 0) continue;

    if (isCatalogOnlyKnowledgeLines(lines)) {
      catalogCount += 1;
      continue;
    }

    descriptiveRefCount += 1;
  }

  return catalogCount > 0 && descriptiveRefCount === 0;
}

function isPreferredKnowledgeReplyRef(ref) {
  return Number(ref?.metadataPenalty || 0) < 10;
}

function getRefText(ref) {
  return String(ref?.matchText || ref?.snippet || '').trim();
}

function getRefMetadataPenalty(ref) {
  const explicitPenalty = Number(ref?.metadataPenalty);
  if (Number.isFinite(explicitPenalty) && explicitPenalty >= 0) return explicitPenalty;
  return ragContext.scoreMetadataPenalty(getRefText(ref));
}

function isKnownPlanningOrUiNoiseRef(ref) {
  const text = getRefText(ref);
  if (!text) return false;

  return /(?:产粮排期|百科UI需求|UI需求|预计产出时间|关联文档|资料网盘|贴文内容参考|期望带有的元素和设计方向)/u.test(text)
    || /(?:\bschedule\b|ui\s*requirement|reference\s+doc|asset\s+path|publish\s+time)/iu.test(text);
}

function isKnownJunkKnowledgeRef(ref) {
  const lines = splitDirectKnowledgeLines(getRefText(ref))
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isDirectKbMetadataLine(line))
    .filter(Boolean);

  if (lines.length === 0) return false;

  const junkCount = lines.filter(isAssetNoiseKnowledgeLine).length;
  if (junkCount === 0) return false;

  const informativeCount = lines.filter(
    line => !isAssetNoiseKnowledgeLine(line) && looksLikeStructuredKnowledgeLine(line)
  ).length;

  return informativeCount === 0;
}

function getKnowledgeQueryIntent(query) {
  const text = String(query || '').trim();
  if (!text) return 'general';

  if (/(?:台词|语音|配音|说了什么|原话)/u.test(text)) return 'quote';
  if (/(?:阵营|所属阵营)/u.test(text)) return 'faction';
  if (/(?:职业|定位|职阶)/u.test(text)) return 'career';
  if (/(?:稀有度|稀有|品级|品质|评级)/u.test(text)) return 'rarity';
  if (/(?:技能|基础效果|一星|二星|三星|四星|五星|大招|被动)/u.test(text)) return 'skill';
  if (/(?:简介|介绍|背景|故事|设定|人设)/u.test(text)) return 'profile';
  if (/(?:阵容|配队|搭配)/u.test(text)) return 'team';
  if (
    /(?:咋样|怎么样|如何|厉害|强不强|值不值得|好不好用|能不能用|推荐吗)/u.test(text)
    && /(?:英雄|角色|她|他|这个英雄|这个角色)/u.test(text)
  ) {
    return 'hero_overview';
  }

  return 'general';
}

function getKnowledgeFieldSignals(ref) {
  const lines = splitDirectKnowledgeLines(getRefText(ref))
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean);

  const signals = {
    quote: false,
    faction: false,
    career: false,
    rarity: false,
    skill: false,
    profile: false,
    team: false,
  };

  for (const line of lines) {
    const parsed = parseKnowledgeFieldLine(line);
    const label = String(parsed?.label || '').trim();
    const value = String(parsed?.value || line || '').trim();
    const source = `${label} ${value}`;

    if (/(?:台词|语音|配音)/u.test(source)) signals.quote = true;
    if (/(?:阵营|所属阵营)/u.test(source)) signals.faction = true;
    if (/(?:职业|定位|职阶)/u.test(source)) signals.career = true;
    if (/(?:稀有度|稀有|品级|品质|评级)/u.test(source)) signals.rarity = true;
    if (/(?:技能|基础效果|一星|二星|三星|四星|五星|大招|被动)/u.test(source)) signals.skill = true;
    if (/(?:简介|介绍|背景|故事|设定|人设)/u.test(source)) signals.profile = true;
    if (/(?:阵容|配队|搭配|推荐阵容)/u.test(source)) signals.team = true;
  }

  return signals;
}

function isRefCompatibleWithQueryIntent(query, ref) {
  const intent = getKnowledgeQueryIntent(query);
  if (intent === 'general') return true;

  const signals = getKnowledgeFieldSignals(ref);
  const hasOverviewSignal = (
    signals.skill
    || signals.faction
    || signals.career
    || signals.rarity
    || signals.profile
    || signals.team
  );

  switch (intent) {
    case 'quote':
      return signals.quote;
    case 'faction':
      return signals.faction;
    case 'career':
      return signals.career;
    case 'rarity':
      return signals.rarity;
    case 'skill':
      return signals.skill;
    case 'profile':
      return signals.profile || hasOverviewSignal;
    case 'team':
      return signals.team || signals.skill || signals.career;
    case 'hero_overview':
      return hasOverviewSignal;
    default:
      return true;
  }
}

function filterRefsForAnswer(query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return [];

  let filtered = refs.filter(ref => getRefText(ref));
  if (filtered.length === 0) return [];

  filtered = filtered.filter(
    ref => !isKnownPlanningOrUiNoiseRef(ref) && !isKnownJunkKnowledgeRef(ref)
  );
  if (filtered.length === 0) return [];

  const intentCompatible = filtered.filter(ref => isRefCompatibleWithQueryIntent(query, ref));
  if (intentCompatible.length > 0) {
    filtered = intentCompatible;
  } else if (getKnowledgeQueryIntent(query) !== 'general') {
    return [];
  }

  const narrow = (predicate) => {
    const next = filtered.filter(predicate);
    if (next.length > 0) filtered = next;
  };

  if (ragContext.isGenericBeginnerGuideQuery(query)) {
    narrow((ref) => {
      const text = getRefText(ref);
      const intentScore = Number(
        ref?.intentScore != null
          ? ref.intentScore
          : ragContext.scoreIntentAlignment(query, text)
      );
      const knowledgeLines = splitDirectKnowledgeLines(text)
        .filter(line => !isReplySkippedKnowledgeLine(line))
        .filter(Boolean);

      return intentScore >= 12 || looksLikeGuideKnowledgeLines(knowledgeLines);
    });
  }

  narrow(ref => getRefMetadataPenalty(ref) < 12);
  narrow((ref) => {
    const intentScore = Number(
      ref?.intentScore != null
        ? ref.intentScore
        : ragContext.scoreIntentAlignment(query, getRefText(ref))
    );
    return intentScore >= 0;
  });
  const stronglyAligned = filtered.filter(ref => hasStrongAnswerRefAlignment(query, ref));
  if (stronglyAligned.length > 0) {
    filtered = stronglyAligned;
  } else if (looksLikeConstraintStyleFollowup(query) || /[，,、]/u.test(String(query || ''))) {
    filtered = [];
  }

  return filtered;
}

function shouldUseHeroAliasReply(query) {
  const text = String(query || '').trim();
  if (!text) return false;

  return /(?:对照|对应|别名|另一个游戏|另一个版本|LastWar|灯塔|位面)/iu.test(text);
}

function getDirectKnowledgeReply(query, refs, preferredLocale = detectUserLocale(query)) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  if (hasOnlyHeaderOnlyRefs(refs)) return '';
  if (hasOnlyCatalogRefs(refs)) return '';

  const preferredRefs = refs.filter(isPreferredKnowledgeReplyRef);
  if (preferredRefs.length === 0) return '';

  const candidates = preferredRefs
    .filter(ref => !ragContext.isMetadataHeavyContent(ref.matchText || ref.snippet || ''))
    .filter(ref => !isKnownJunkKnowledgeRef(ref));
  const baseRefs = (candidates.length > 0 ? candidates : preferredRefs)
    .filter(ref => !isKnownJunkKnowledgeRef(ref));
  if (baseRefs.length === 0) return '';

  const sourceRefs = baseRefs.filter(ref => {
    const lines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isReplySkippedKnowledgeLine(line))
      .map(normalizeDirectKnowledgeLine)
      .filter(Boolean);
    return !isHeaderOnlyKnowledgeLines(lines) && !isCatalogOnlyKnowledgeLines(lines);
  });
  const matchedRefs = sourceRefs.filter(ref => hasStrongAnswerRefAlignment(query, ref));
  const topRef = matchedRefs[0];
  if (!topRef) return '';

  const lines = splitDirectKnowledgeLines(topRef.matchText || topRef.snippet || '')
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean);
  const localizedLines = filterKnowledgeLinesByLocale(lines, preferredLocale);

  if (localizedLines.length < 2) return '';
  if (!hasPreferredLocaleContent(localizedLines, preferredLocale)) return '';
  if (isHeroAliasMappingKnowledge(query, localizedLines)) return '';

  const titleIndex = localizedLines.findIndex(line => ragContext.hasTitleStyleMatch(query, line));
  const startIndex = titleIndex >= 0 ? titleIndex : 0;
  const picked = [];
  let usedChars = 0;

  for (let index = startIndex; index < localizedLines.length; index += 1) {
    const line = localizedLines[index];
    const nextUsed = usedChars + line.length + (picked.length > 0 ? 1 : 0);
    if (nextUsed > DIRECT_KB_REPLY_MAX_CHARS && picked.length > 0) break;
    picked.push(line);
    usedChars = nextUsed;
    if (picked.length >= DIRECT_KB_REPLY_MAX_LINES) break;
  }

  if (picked.length < 2) return '';
  if (picked.filter(looksLikeStructuredKnowledgeLine).length < 2) return '';

  return picked.join('\n');
}

function getLiteralKnowledgeReply(query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  if (hasOnlyHeroAliasMappingRefs(query, refs)) return '';
  if (hasOnlyHeaderOnlyRefs(refs)) return '';
  if (hasOnlyCatalogRefs(refs)) return '';

  const preferredLocale = detectUserLocale(query);
  const isGenericBeginnerGuide = ragContext.isGenericBeginnerGuideQuery(query);

  const collected = [];
  const seen = new Set();
  const preferredRefs = refs
    .filter(isPreferredKnowledgeReplyRef)
    .filter(ref => !isKnownJunkKnowledgeRef(ref));
  if (preferredRefs.length === 0) return '';

  const sourceRefs = preferredRefs.filter(ref => String(ref.matchText || ref.snippet || '').trim());

  for (const ref of sourceRefs) {
    const rawLines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isReplySkippedKnowledgeLine(line))
      .filter(Boolean);
    const lines = filterKnowledgeLinesByLocale(rawLines, preferredLocale);

    if (lines.length === 0) continue;
    if (isHeaderOnlyKnowledgeLines(lines) || isCatalogOnlyKnowledgeLines(lines)) continue;
    if (!hasPreferredLocaleContent(lines, preferredLocale)) continue;

    const matchedIndexes = lines
      .map((line, index) => (
        ragContext.hasTitleStyleMatch(query, line) || ragContext.hasTokenOverlap(query, line)
          ? index
          : -1
      ))
      .filter(index => index >= 0);

    if (matchedIndexes.length === 0) {
      if (!isGenericBeginnerGuide || !looksLikeGuideKnowledgeLines(lines)) continue;
    }

    const startIndex = matchedIndexes.length > 0
      ? Math.max(0, matchedIndexes[0] - 2)
      : 0;
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index];
      if (seen.has(line)) continue;
      seen.add(line);
      collected.push(line);
      if (collected.length >= 8) break;
    }

    if (collected.length >= 8) break;
  }

  const compacted = collected.filter((line, index, items) => {
    const text = String(line || '').trim();
    if (!text) return false;
    if (text.length > 6) return true;

    return !items.some((other, otherIndex) => (
      otherIndex !== index
      && String(other || '').trim() !== text
      && /[:：]/u.test(String(other || ''))
      && String(other || '').includes(text)
    ));
  });

  if (compacted.length < 2) return '';
  return compacted.join('\n');
}

function parseKnowledgeFieldLine(line) {
  const match = /^\s*([^:：]{1,30})\s*[:：]\s*(.+?)\s*$/u.exec(String(line || '').trim());
  if (!match) return null;
  return {
    label: match[1].trim(),
    value: match[2].trim(),
  };
}

function getHeroAliasReply(query, refs) {
  if (!shouldUseHeroAliasReply(query)) return '';
  if (!Array.isArray(refs) || refs.length === 0) return '';

  const preferredOrder = ['稀有等级', '评级', 'LastWar', '位面2名', '位面2', '灯塔名', '灯塔'];
  const aliasLabels = new Set(preferredOrder.map(item => item.toLowerCase()));
  const fields = new Map();
  let matchedQuery = false;

  for (const ref of refs) {
    const lines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isDirectKbMetadataLine(line));

    for (const line of lines) {
      const parsed = parseKnowledgeFieldLine(line);
      if (!parsed) continue;

      const normalizedLabel = parsed.label.toLowerCase();
      if (!aliasLabels.has(normalizedLabel)) continue;
      if (!fields.has(parsed.label)) fields.set(parsed.label, parsed.value);
      if (
        ragContext.hasTitleStyleMatch(query, parsed.value)
        || ragContext.hasTokenOverlap(query, parsed.value)
      ) {
        matchedQuery = true;
      }
    }
  }

  if (!matchedQuery) return '';

  const orderedLines = preferredOrder
    .map(label => (fields.has(label) ? `${label}：${fields.get(label)}` : ''))
    .filter(Boolean);

  const aliasCount = orderedLines.filter(line => /(?:LastWar|位面2|灯塔)/u.test(line)).length;
  if (aliasCount < 2) return '';

  return `只命中到名称对照：\n${orderedLines.join('\n')}`;
}

function isGenericTrailingFollowupLine(line, locale) {
  const text = String(line || '').trim();
  if (!text) return false;
  const compactText = text.replace(/\s+/gu, '');

  if (
    /(?:如果想了解|想了解).*(?:继续问|繼續問|再问我|再問我)/u.test(compactText)
    || /(?:具体系统|具體系統|某个系统|某個系統|不懂).*(?:继续问|繼續問|再问|再問)/u.test(compactText)
    || /(?:了解|不懂).*(?:继续问|繼續問|再问|再問)/u.test(compactText)
    || /(?:有哪|哪块|哪個|哪个).*(?:不清楚|不明白).*(?:继续问|繼續問|再问|再問)/u.test(compactText)
    || /需要的话我可以.*(?:继续|繼續)?.*(?:补充|補充)/u.test(compactText)
  ) {
    return true;
  }

  switch (kbEntryLocales.normalizeLocale(locale)) {
    case 'en-US':
      return /^(?:would you like\b.*|if you want\b.*i can\b.*|let me know if you want\b.*|want details on any specific part\b.*|feel free to ask\b.*|ask about any specific .*you want to dig into\b.*)$/iu.test(text);
    case 'ja-JP':
      return /^(?:詳しく知りたい点はありますか|必要なら.*補足できます|必要であれば.*補足できます)$/u.test(text);
    case 'ko-KR':
      return /^(?:더 궁금한 점이 있나요|원하면 .*더 설명해 드릴게요|필요하면 .*더 설명해 드릴게요)$/u.test(text);
    case 'zh-TW':
      return /^(?:還想了解什麼|有(?:什麼)?(?:具體)?想(?:繼續)?(?:深入)?了解.*|想(?:進一步)?了解.*(?:嗎|可以繼續問|的話可以繼續問|比如[:：]?|的話告訴我)|如果你還想了解.*我可以.*|需要的話我可以再.*)$/u.test(text);
    case 'zh-CN':
    default:
      return /^(?:还想了解什么|有(?:什么)?(?:具体)?想(?:继续)?(?:深入)?了解.*|想(?:进一步)?了解.*(?:吗|可以继续问|的话可以继续问|比如[:：]?|的话告诉我)|如果你还想了解.*我可以.*|需要的话我可以再.*)$/u.test(text);
  }
}

function stripSimpleMarkdownScaffold(reply) {
  const lines = String(reply || '')
    .replace(/\r\n/g, '\n')
    .split('\n');

  const normalized = lines
    .map((line) => {
      const text = String(line || '').trimEnd();
      if (/^\s*#{1,6}\s+/u.test(text)) {
        return text.replace(/^\s*#{1,6}\s+/u, '');
      }
      if (/^\s*[-*_]{3,}\s*$/u.test(text)) {
        return '';
      }
      return text;
    });

  const compacted = [];
  for (const line of normalized) {
    if (!line && (!compacted.length || !compacted[compacted.length - 1])) continue;
    compacted.push(line);
  }

  while (compacted.length > 0 && !compacted[compacted.length - 1]) {
    compacted.pop();
  }

  return compacted.join('\n').trim();
}

function stripStandaloneMarkdownEmphasis(reply) {
  return String(reply || '')
    .replace(/^\s*\*\*(.+?)\*\*\s*$/gmu, '$1')
    .replace(/^\s*__(.+?)__\s*$/gmu, '$1');
}

function stripInlineMarkdownEmphasis(reply) {
  return String(reply || '')
    .replace(/\*\*([^*\n]+?)\*\*/gu, '$1')
    .replace(/__([^_\n]+?)__/gu, '$1');
}

function isLikelyKbSectionLabel(line, locale) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (/^[-*+]\s+/u.test(text) || /^\d+\.\s+/u.test(text) || /^>\s*/u.test(text)) return false;
  if (/[:：。！？!?；;，,.]$/u.test(text)) return false;
  const normalizedLocale = kbEntryLocales.normalizeLocale(locale);
  const maxLength = normalizedLocale === 'en-US' ? 48 : 24;
  const maxWords = normalizedLocale === 'en-US' ? 8 : 5;

  if (text.length > maxLength) return false;

  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length > maxWords) return false;

  return /[A-Za-z0-9\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/u.test(text);
}

function getLocaleLabelSeparator(locale, bodyCount) {
  const normalizedLocale = kbEntryLocales.normalizeLocale(locale);
  if (bodyCount <= 1) {
    return normalizedLocale === 'en-US' ? ': ' : '：';
  }
  return normalizedLocale === 'en-US' ? ': ' : '：';
}

function getLocaleListSeparator(locale) {
  return kbEntryLocales.normalizeLocale(locale) === 'en-US' ? '; ' : '；';
}

function collapseKbSectionBlocks(reply, locale) {
  const lines = String(reply || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const collapsed = [];

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = String(lines[index] || '');
    const currentText = currentLine.trim();

    if (!isLikelyKbSectionLabel(currentText, locale)) {
      collapsed.push(currentLine);
      continue;
    }

    let cursor = index + 1;
    while (cursor < lines.length && !String(lines[cursor] || '').trim()) {
      cursor += 1;
    }

    if (cursor >= lines.length) {
      collapsed.push(currentLine);
      continue;
    }

    const bodyLines = [];
    let bodyCursor = cursor;
    while (bodyCursor < lines.length) {
      const bodyText = String(lines[bodyCursor] || '').trim();
      if (!bodyText) break;
      if (isLikelyKbSectionLabel(bodyText, locale)) break;
      bodyLines.push(bodyText.replace(/^[-*+]\s+/u, '').trim());
      bodyCursor += 1;
    }

    if (!bodyLines.length) {
      collapsed.push(currentLine);
      continue;
    }

    const mergedBody = bodyLines.join(getLocaleListSeparator(locale));
    collapsed.push(`${currentText}${getLocaleLabelSeparator(locale, bodyLines.length)}${mergedBody}`);
    index = bodyCursor - 1;
  }

  return collapsed.join('\n');
}

function normalizeKbGroundedReply(reply) {
  return String(reply || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function postProcessAssistantReply(reply, query, refs, locale) {
  let output = trimGenericTrailingFollowup(reply, locale);

  if (Array.isArray(refs) && refs.length > 0) {
    output = stripStandaloneMarkdownEmphasis(output);
    output = stripInlineMarkdownEmphasis(output);
    output = collapseKbSectionBlocks(output, locale);
    output = normalizeKbGroundedReply(output);
  }

  if (ragContext.isGenericBeginnerGuideQuery(query) && Array.isArray(refs) && refs.length > 0) {
    output = stripSimpleMarkdownScaffold(output);
    output = normalizeKbGroundedReply(output);
  }

  return output;
}

function trimGenericTrailingFollowup(reply, locale) {
  const lines = String(reply || '')
    .replace(/\r\n/g, '\n')
    .split('\n');

  let followupStart = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = String(lines[index] || '').trim();
    if (!line) continue;

    if (/^[-*]\s+/u.test(line)) {
      continue;
    }

    if (isGenericTrailingFollowupLine(line, locale)) {
      followupStart = index;
      continue;
    }

    break;
  }

  if (followupStart >= 0) {
    lines.splice(followupStart);
    while (lines.length > 0 && !String(lines[lines.length - 1] || '').trim()) {
      lines.pop();
    }
  }

  return lines.join('\n').trim();
}

function shouldIncludeVersionLabelForLocale(value, locale) {
  const text = String(value || '').trim();
  if (!text) return false;

  switch (kbEntryLocales.normalizeLocale(locale)) {
    case 'en-US':
      return /[A-Za-z]{2,}/.test(text);
    case 'ja-JP':
      return /[\u3040-\u30ff\u31f0-\u31ff]/u.test(text);
    case 'ko-KR':
      return /[\uac00-\ud7af]/u.test(text);
    case 'zh-TW':
    case 'zh-CN':
      return /[\u4e00-\u9fff]/u.test(text);
    default:
      return true;
  }
}

async function getSearchGroundedReply(bot, query, results, preferredLocale = detectUserLocale(query), options = {}) {
  if (!Array.isArray(results) || results.length === 0) return '';

  const systemPrompt = buildAugmentedSystemPrompt(
    buildBaseSystemPrompt(bot, query, {
      versionContext: options.versionContext || null,
      domainMode: options.domainMode === 'general' ? 'general' : 'game',
    }),
    [
      'When web search results are provided, answer directly from those results first.',
      'If the user asks about latest, current, recent, today, or news, summarize the latest developments instead of giving generic background.',
      'For ambiguous time or schedule questions about recurring sports events, infer the user wants the current or upcoming edition. Lead with the current/upcoming event, and mention past editions only if needed as secondary context.',
      'Do not say you cannot browse. Do not mention the knowledge base. Do not output URLs, citations, or images.',
      'If the search results are still insufficient, say the search did not return enough reliable information, then only add clearly labeled general background if it helps.',
      'If the search results show an official confirmed event schedule, match date, kickoff time, or organizer-announced arrangement, state it as confirmed and do not soften it into words like "??", "??", or "??" unless the results themselves are explicitly uncertain.',
      'Keep the answer concise. Lead with the conclusion.',
    ]
  );

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: [
        `Question: ${query}`,
        '',
        'Web search results:',
        formatSearchResultsForPrompt(results),
      ].join('\n'),
    },
  ];

  const { content } = await llm.chat(messages, { model: bot.model || undefined });
  return trimGenericTrailingFollowup(String(content || '').trim(), preferredLocale);
}

function shouldUseNoHitEntityFallback(message, refs, facts, liveBlock = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  if (String(liveBlock || '').trim()) return false;
  if (Array.isArray(refs) && refs.length > 0) return false;
  if (Array.isArray(facts) && facts.length > 0) return false;
  return !!heroCardService.looksLikeHeroDetailQuery(text);
}

async function getNoHitEntityReply(bot, query, preferredLocale = detectUserLocale(query), options = {}) {
  const text = String(query || '').trim();
  if (!text) return '';

  const systemPrompt = buildAugmentedSystemPrompt(
    buildBaseSystemPrompt(bot, text, {
      versionContext: options.versionContext || null,
      domainMode: options.domainMode === 'general' ? 'general' : 'game',
    }),
    [
      'The game knowledge path did not return a matching in-game role or entity record for this query.',
      'Do not invent any game hero profile, rarity, camp, career, skill, quote, strength tier, or collection status.',
      'Do not mention the knowledge base, retrieval, references, images, or internal process.',
      'If the term has a common real-world meaning, answer that meaning directly and concisely.',
      'If the term is ambiguous, briefly state the likely meanings and ask one short clarification question.',
      'If you are unsure, say the term alone is ambiguous. Never fabricate.',
      'Keep the answer concise.',
    ]
  );

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: text,
    },
  ];

  const { content } = await llm.chat(messages, { model: bot.model || undefined });
  return String(content || '').trim();
}

async function getResolvedFollowupReply(bot, query, preferredLocale = detectUserLocale(query), options = {}) {
  const text = String(query || '').trim();
  if (!text) return '';

  const systemPrompt = buildAugmentedSystemPrompt(
    buildBaseSystemPrompt(bot, text, {
      versionContext: options.versionContext || null,
      domainMode: options.domainMode === 'general' ? 'general' : 'game',
    }),
    [
      'The follow-up subject has already been resolved into a standalone question.',
      'Answer that resolved question directly.',
      'Do not ask the user to repeat which person, game, brand, or topic they mean.',
      'Do not mention the knowledge base, retrieval, references, images, or internal process.',
      'If you know the answer from common knowledge, answer naturally and concisely.',
      'If you are genuinely unsure, say you are not sure instead of fabricating.',
    ]
  );

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: text,
    },
  ];

  const { content } = await llm.chat(messages, { model: bot.model || undefined });
  return trimGenericTrailingFollowup(String(content || '').trim(), preferredLocale);
}

function buildHeroCardBlock(card) {
  return `\`\`\`herocard\n${JSON.stringify(card, null, 2)}\n\`\`\``;
}

function normalizeHeroPromptValue(value, maxLength = 180) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildHeroCardFacts(card) {
  if (!card || typeof card !== 'object') return '';

  const facts = [
    ['Name', card.name],
    ['Title', card.title],
    ['Faction', card.faction],
    ['Career', card.career],
    ['Rarity', card.rarity],
    ['Quote', normalizeHeroPromptValue(card.quote, 120)],
  ]
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => `${label}: ${value}`);

  const skillLines = (Array.isArray(card.skills) ? card.skills : [])
    .slice(0, 4)
    .map((skill) => {
      if (!skill) return '';
      const segments = [
        skill.index ? `#${skill.index}` : '',
        skill.name || skill.label || '',
        skill.isCore ? '(core)' : '',
        normalizeHeroPromptValue(skill.baseEffect || skill.description, 120),
      ].filter(Boolean);
      return segments.join(' ');
    })
    .filter(Boolean);

  if (skillLines.length > 0) {
    facts.push('Skills:');
    skillLines.forEach(line => facts.push(`- ${line}`));
  }

  return facts.join('\n');
}

function getRecentConversationForHeroPrompt(history = [], limit = 6) {
  return [...(Array.isArray(history) ? history : [])]
    .slice(-Math.max(0, limit))
    .map((item) => {
      if (!item || !item.role) return '';
      const raw = String(item.content || '').trim();
      if (!raw) return '';
      const visible = item.role === 'assistant'
        ? (extractTrailingHeroCardBlock(raw).prose || raw)
        : raw;
      const content = normalizeHeroPromptValue(visible, 180);
      if (!content) return '';
      return `${item.role}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildHeroCardFallbackReply(card) {
  const heroName = String(card && card.name || '').trim() || '\u8fd9\u4e2a\u82f1\u96c4';
  return `\u6211\u5148\u628a${heroName}\u7684\u5b8c\u6574\u6863\u6848\u8d34\u4e0a\u6765\uff0c\u4f60\u76f4\u63a5\u7ed3\u5408\u8fd9\u8f6e\u95ee\u9898\u770b\u5373\u53ef\u3002`;
}

async function getHeroCardGroundedReply(
  bot,
  query,
  card,
  history = [],
  preferredLocale = detectUserLocale(query),
  options = {}
) {
  const text = String(query || '').trim();
  if (!text || !card || !card.name) return '';

  const systemPrompt = buildAugmentedSystemPrompt(
    buildBaseSystemPrompt(bot, text, {
      versionContext: options.versionContext || null,
      domainMode: options.domainMode === 'general' ? 'general' : 'game',
    }),
    [
      'The current user question is about a specific in-game hero and that hero has already been resolved.',
      'Answer the current question directly and keep the reply connected to the recent conversation when history is provided.',
      'Use the resolved hero facts as constraints. Do not invent faction, career, rarity, skill effects, quotes, strength claims, or lineup conclusions that are not supported by those facts.',
      'If the user is asking for an evaluation or whether the hero is worth building, give a concise judgment tied to the shown role, rarity, and skill structure.',
      'A hero card will be attached after the visible prose. Do not mechanically enumerate every card field and do not use fixed lead-ins like "这是XX的英雄档案" unless the wording is genuinely needed.',
      'Write like a natural player-facing chat reply, not a wiki entry, release note, or customer-service template.',
      'Do not mention the knowledge base, retrieval, structured data, or internal process.',
      'Keep it concise and useful.',
    ]
  );

  const recentConversation = getRecentConversationForHeroPrompt(history);
  const heroFacts = buildHeroCardFacts(card);
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: [
        `Current user question:\n${text}`,
        recentConversation ? `Recent conversation:\n${recentConversation}` : '',
        `Resolved hero facts:\n${heroFacts}`,
        `Hero card JSON:\n${JSON.stringify(card, null, 2)}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];

  try {
    const { content } = await llm.chat(messages, { model: bot.model || undefined });
    return trimGenericTrailingFollowup(String(content || '').trim(), preferredLocale);
  } catch (err) {
    console.error('[chatService] getHeroCardGroundedReply failed:', err.message);
    return '';
  }
}

function extractTrailingHeroCardBlock(reply) {
  const text = String(reply || '').trim();
  if (!text) return { prose: '', heroCardBlock: '' };

  const match = /(?:\n{2,}|^)```herocard\s*[\s\S]*?```\s*$/u.exec(text);
  if (!match) return { prose: text, heroCardBlock: '' };

  const heroCardBlock = match[0].trim();
  const prose = text.slice(0, match.index).trim();
  return { prose, heroCardBlock };
}

function getRecentAssistantSamples(history, limit = 3) {
  return [...(Array.isArray(history) ? history : [])]
    .reverse()
    .filter(item => item && item.role === 'assistant' && String(item.content || '').trim())
    .slice(0, limit)
    .map(item => String(item.content || '').trim());
}

async function polishReplyThroughAi(bot, query, draftReply, {
  history = [],
  refs = [],
  preferredLocale = detectUserLocale(query),
  versionContext = null,
  domainMode = 'game',
} = {}) {
  const raw = String(draftReply || '').trim();
  if (!raw) return '';

  const { prose, heroCardBlock } = extractTrailingHeroCardBlock(raw);
  const visibleDraft = prose || raw;
  if (!visibleDraft) return raw;

  const recentAssistantSamples = getRecentAssistantSamples(history)
    .map((item, index) => `- Recent reply ${index + 1}: ${item.slice(0, 200)}`)
    .join('\n');

  const systemPrompt = buildAugmentedSystemPrompt(
    buildBaseSystemPrompt(bot, query, {
      versionContext,
      domainMode: domainMode === 'general' ? 'general' : 'game',
    }),
    [
      'Rewrite the draft reply into a natural chat answer.',
      'Keep the meaning and facts from the draft reply exactly consistent. Do not add new facts, new examples, new images, new citations, or new references.',
      'The final answer must stay tightly relevant to the current user question.',
      'Avoid fixed lead-ins, repeated stock phrases, customer-service tone, and generic closing prompts.',
      'Do not mention the knowledge base, retrieval, internal process, or that you are rewriting a draft.',
      heroCardBlock
        ? 'A hero card structured block will be attached after the rewritten prose. Rewrite only the visible prose. Do not mention the block itself.'
        : 'Output only the rewritten final answer.',
      Array.isArray(refs) && refs.length > 0
        ? 'This draft is grounded by retrieved content. Keep it concise and faithful to the grounded facts.'
        : 'Keep it concise and direct.',
    ]
  );

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: [
        `Current user question:\n${String(query || '').trim()}`,
        '',
        recentAssistantSamples ? `Recent assistant replies to avoid repeating:\n${recentAssistantSamples}` : '',
        recentAssistantSamples ? '' : '',
        `Draft reply:\n${visibleDraft}`,
      ].filter(Boolean).join('\n'),
    },
  ];

  try {
    const { content } = await llm.chat(messages, { model: bot.model || undefined });
    const rewritten = trimGenericTrailingFollowup(String(content || '').trim(), preferredLocale);
    if (!rewritten) return raw;
    return heroCardBlock ? `${rewritten}\n\n${heroCardBlock}` : rewritten;
  } catch (err) {
    console.error('[chatService] polishReplyThroughAi failed:', err.message);
    return raw;
  }
}

function hasSubstantiveKnowledgeRefs(refs = []) {
  return Array.isArray(refs) && refs.some((ref) => {
    const lines = splitDirectKnowledgeLines(ref && ref.matchText)
      .filter(line => line && !KB_METADATA_LABEL_RE.test(line));
    return lines.length >= 2;
  });
}

function isLikelyGameDomainQuery(query, {
  heroContext = null,
  facts = [],
  refs = [],
  directKnowledgeReply = '',
  literalKnowledgeReply = '',
  heroAliasReply = '',
} = {}) {
  const text = String(query || '').trim();
  if (!text) return false;
  if (heroContext) return true;
  if (directKnowledgeReply || literalKnowledgeReply || heroAliasReply) return true;
  if (Array.isArray(facts) && facts.length > 0) return true;
  if (hasSubstantiveKnowledgeRefs(refs)) return true;
  if (
    BOUND_GAME_REFERENCE_PATTERNS.every(pattern => pattern.test(text))
    && !NON_GAME_CONTEXT_KEYWORDS.some(pattern => pattern.test(text))
  ) {
    return true;
  }
  return GAME_QUERY_KEYWORDS.some(pattern => pattern.test(text));
}

function buildMessages(bot, history, userMessage, contextBlock, factBlock = '', liveBlock = '', versionContext = null, options = {}) {
  const budget = cfg.llm.maxPromptBytes;
  const userBytes = Buffer.byteLength(userMessage, 'utf8');
  const systemBudget = Math.max(200, budget - userBytes - 200);
  const preferredLocale = detectUserLocale(userMessage);
  const domainMode = options && options.domainMode === 'general' ? 'general' : 'game';

  const globalConstraints = loadGlobalBotConstraints();
  const displayName = String(bot.display_name || '').trim();
  const persona = String(bot.persona || '').trim();
  const versionDisplayName = String(versionContext?.display_name || '').trim();
  const versionGameName = String(versionContext?.game_name || '').trim();
  const versionCode = String(versionContext?.code || '').trim();
  const defaultAnswerPolicy = [
    '回答策略优先级：1. 命中知识库或图谱事实时，优先基于这些内容回答；2. 有实时天气或联网搜索结果时，优先基于这些外部结果回答；3. 两者都不足时，直接根据通用知识正常回答用户问题。',
    '不要因为没命中知识库就让用户换个问法，也不要无故改成只追问不回答；除非缺少关键前提，否则先直接回答。',
    '不要假装命中了知识库，不要假装拿到了实时结果，也不要输出并不存在的引用或图片。',
    '不要直接照搬知识库原文、表格行、sheet字段、项目字段或多语言原始片段；必须先整理成和当前问题直接相关的自然回答。',
    '如果命中的知识内容和问题不直接相关，就不要硬答；宁可明确说当前无法根据已知信息下结论，也不要拿无关字段凑答案。',
    '当前会话已经绑定到一个具体版本/游戏，不要反问用户“你说的是哪款游戏”。除非用户明确在做跨游戏对比，否则直接按当前版本语境回答。',
    'When the knowledge base already contains the answer, answer from that text, keep the source sections when useful, and do not invent extra tips.',
  ].join('\n');
  const directnessPolicy = [
    '知道什么就直接说什么，先给结论，再补充必要说明。',
    '不要写这类废话开头：比如“这是个很核心的问题”“不过当前知识库还没完全收录”“我能确认的是”“我不敢给你乱讲”。',
    '不要解释你自己的检索过程、判断过程、知识边界来源；用户没问就别交代系统内部机制。',
    '如果信息不足，直接说缺哪一部分；如果已知一部分，就直接给已知部分，不要先来一段大而空的铺垫。',
    'When knowledge-base content is present, keep the answer close to that content. Do not turn it into a long article, polished tutorial, or expanded summary unless the user asked for that format.',
    'When knowledge-base content is present, write like a normal chat reply to the player, not like a document, wiki page, release note, or customer-service template.',
    'Prefer one direct lead sentence plus a short continuation. Only use a small bullet list when it clearly helps readability.',
    'Avoid decorative formatting. Do not use bold-only section labels or stacked mini-headings unless the user explicitly asked for structured output.',
    'Do not emit standalone topic-label lines such as "商城", "竞技场", or "VIP tip" followed by a separate explanation line. Fold the label into the sentence itself.',
    'Do not use inline markdown emphasis such as **Tip:**, **Note:**, or **VIP:** in normal answers.',
    'For broad beginner onboarding questions, answer the broad onboarding guidance that was retrieved. Do not switch to narrower topics such as arena, PVP, or other specific systems unless the user explicitly asked for them.',
    'Prefer plain sentences or short bullets. Do not add markdown headings like # or ## unless the user explicitly asked for formatted output.',
    'Do not end with generic follow-up prompts like "anything else" or "want me to expand" unless the user explicitly asks for more.',
  ].join('\n');
  const liveAnswerPolicy = liveBlock
    ? [
        '下面已经给了联网搜索或实时工具结果。',
        '若问题涉及最新、新闻、实时、天气等内容，必须直接基于这些结果回答，不要退回成百科介绍。',
        '不要说自己不能联网，不要说刚才是瞎编的。',
      ].join('\n')
    : '';
  const localePolicy = [
    `The user's message language is ${kbEntryLocales.normalizeLocale(preferredLocale) || 'zh-CN'}.`,
    getLocaleAnswerInstruction(preferredLocale),
    'If names or terms appear in multiple languages, keep only the form that matches the answer language.',
  ].join('\n');
  const versionPolicyLines = ['Current bound game/version context:'];
  if (shouldIncludeVersionLabelForLocale(versionDisplayName, preferredLocale)) {
    versionPolicyLines.push(`Display Name: ${versionDisplayName}`);
  }
  if (shouldIncludeVersionLabelForLocale(versionGameName, preferredLocale)) {
    versionPolicyLines.push(`Game Name: ${versionGameName}`);
  }
  if (versionPolicyLines.length === 1 && versionCode) {
    versionPolicyLines.push(`Version Code: ${versionCode}`);
  } else if (versionCode) {
    versionPolicyLines.push(`Version Code: ${versionCode}`);
  }
  const versionPolicy = versionPolicyLines.length > 1 ? versionPolicyLines.join('\n') : '';
  const generalDefaultAnswerPolicy = [
    'Answering priority: 1. Use live tools or web search results first when the question needs current information. 2. Otherwise answer naturally from general knowledge.',
    'If the current question is not about the game, do not force game-specific knowledge, heroes, skills, factions, versions, or roster details into the reply.',
    'Do not pretend the knowledge base matched when it did not. Do not fabricate references or images.',
  ].join('\n');
  const effectiveDefaultAnswerPolicy = domainMode === 'general'
    ? generalDefaultAnswerPolicy
    : defaultAnswerPolicy;
  const effectiveVersionPolicy = domainMode === 'general' ? '' : versionPolicy;

  const prioritizedBlocks = [
    localePolicy,
    effectiveVersionPolicy,
    globalConstraints,
    displayName ? `你的名称是“${displayName}”。` : '',
    persona ? `【当前版本具体设定】\n${persona}` : '',
    liveBlock,
    factBlock,
    contextBlock,
  ];

  prioritizedBlocks.unshift(liveAnswerPolicy);
  prioritizedBlocks.unshift(directnessPolicy);
  prioritizedBlocks.unshift(effectiveDefaultAnswerPolicy);
  prioritizedBlocks.splice(
    0,
    prioritizedBlocks.length,
    localePolicy,
    effectiveVersionPolicy,
    effectiveDefaultAnswerPolicy,
    directnessPolicy,
    liveAnswerPolicy,
    liveBlock,
    factBlock,
    contextBlock,
    globalConstraints,
    displayName ? `Name: ${displayName}` : '',
    persona ? `[Persona]\n${persona}` : ''
  );

  let systemContent = '';
  let usedBytes = 0;
  for (const block of prioritizedBlocks) {
    const appended = appendBlockWithBudget(systemContent, usedBytes, block, systemBudget);
    systemContent = appended.systemContent;
    usedBytes = appended.usedBytes;
    if (appended.exhausted) break;
  }

  const messages = [{ role: 'system', content: systemContent }];
  for (const item of history) {
    messages.push({ role: item.role, content: item.content });
  }
  messages.push({ role: 'user', content: userMessage });

  const totalBytes = () =>
    messages.reduce((sum, item) => sum + Buffer.byteLength(item.content, 'utf8'), 0);

  while (totalBytes() > budget && messages.length > 2) {
    messages.splice(1, 1);
  }

  return messages;
}

function buildBaseSystemPrompt(bot, userMessage, {
  contextBlock = '',
  factBlock = '',
  liveBlock = '',
  versionContext = null,
  domainMode = 'game',
} = {}) {
  const messages = buildMessages(
    bot,
    [],
    String(userMessage || '').trim() || 'User message',
    contextBlock,
    factBlock,
    liveBlock,
    versionContext,
    { domainMode }
  );
  return String(messages[0]?.content || '').trim();
}

function buildAugmentedSystemPrompt(basePrompt, extraRules = []) {
  return [
    String(basePrompt || '').trim(),
    ...(Array.isArray(extraRules) ? extraRules : [extraRules]),
  ]
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join('\n');
}

async function saveMessage(versionId, sessionId, role, content, refs) {
  const [ins] = await db.query(
    'INSERT INTO chat_messages (version_id, session_id, role, content, refs_json) VALUES (?,?,?,?,?)',
    [versionId, sessionId, role, content, refs ? JSON.stringify(refs) : null]
  );
  await db.query(
    'UPDATE chat_sessions SET message_count = message_count + 1, updated_at = NOW() WHERE id=?',
    [sessionId]
  );
  return ins.insertId;
}

async function deleteMessage(messageId, sessionId) {
  await db.query('DELETE FROM chat_messages WHERE id=?', [messageId]);
  await db.query(
    'UPDATE chat_sessions SET message_count = GREATEST(message_count - 1, 0) WHERE id=?',
    [sessionId]
  );
}

async function retrieveFacts(versionId, message) {
  try {
    const linked = await kgContext.linkEntities(versionId, message);
    if (linked.length === 0) return [];
    return await kgContext.getFacts(versionId, linked.map(item => item.entityId));
  } catch (err) {
    console.error('[chatService] retrieveFacts failed:', err.message);
    return [];
  }
}

function looksLikeWeatherReply(content) {
  const text = String(content || '').trim();
  return /(?:今天|明天|后天|大后天|周末|(?:下|本|这)?周[一二三四五六日])预计/u.test(text)
    && text.includes('当前实时');
}

function stripFollowupLead(text) {
  return String(text || '')
    .trim()
    .replace(/^(?:那(?:么)?|那就|那再|那如果|然后|再|还有|换成|改成|改查|再查|再看)\s*/u, '')
    .trim();
}

function stripTrailingParticles(text) {
  return String(text || '')
    .trim()
    .replace(/[，。！？,.!?]+$/gu, '')
    .replace(/[呢吗呀啊吧嘛哦噢哈]+$/gu, '')
    .trim();
}

function normalizeCarryoverFragment(text) {
  return stripTrailingParticles(stripFollowupLead(text));
}

function looksLikeStandaloneTopicShift(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (/(?:\u4ec0\u4e48|\u600e\u4e48|\u600e\u6837|\u5982\u4f55|\u4e3a\u4f55|\u4e3a\u4ec0\u4e48|\u591a\u5c11|\u51e0\u5c81|\u51e0\u53f7|\u51e0\u70b9|\u65b0\u95fb|\u6d88\u606f|\u4ecb\u7ecd|\u6280\u80fd|\u53f0\u8bcd|\u9635\u8425|\u804c\u4e1a|\u7a00\u6709\u5ea6|\u82f1\u96c4|\u89d2\u8272|\u56fe\u7247|\u5f15\u7528|\u8054\u7f51|\u641c\u7d22|\u66f4\u65b0|\u53d1\u5e03|OpenAI|weather|news|who|what|why|how)/iu.test(text)) return true;

  return /(?:谁|什么|咋|怎么|怎样|如何|为何|为什么|多少|几岁|几号|几点|新闻|消息|介绍|技能|台词|阵营|职业|稀有度|英雄|角色|图片|引用|联网|搜索|更新|发布|OpenAI|weather|news|who|what|why|how)/iu.test(text);
}

function isLikelyWeatherLocationReply(message) {
  const normalizedMessage = normalizeCarryoverFragment(message);
  if (!normalizedMessage || normalizedMessage.length > 20) return false;
  if (liveTools.isWeatherQuery(normalizedMessage)) return false;
  if (/^(?:帮我|请问|告诉我|我想|想问|查下|查一下|搜下|搜一下|介绍下|介绍一下)/u.test(normalizedMessage)) {
    return false;
  }
  if (looksLikeStandaloneTopicShift(normalizedMessage)) return false;
  if (/^[a-z]{1,3}$/iu.test(normalizedMessage)) return false;
  return true;
}

function shouldCarryWeatherFollowup(message) {
  const rawMessage = String(message || '').trim();
  if (!rawMessage || rawMessage.length > 24) return false;

  const normalizedMessage = normalizeCarryoverFragment(rawMessage);
  if (!normalizedMessage || normalizedMessage.length > 18) return false;
  if (!liveTools.getWeatherDayInfo(normalizedMessage).hasExplicitDay) return false;
  if (looksLikeStandaloneTopicShift(normalizedMessage)) return false;

  const hasFollowupLead = stripFollowupLead(rawMessage) !== rawMessage.trim();
  if (liveTools.isWeatherQuery(normalizedMessage)) return hasFollowupLead;

  return liveTools.isWeatherFollowupQuery(normalizedMessage);
}

function getRecentWeatherLocation(history) {
  const recentUserMessages = [...history].reverse().filter(item => item.role === 'user');

  for (const item of recentUserMessages) {
    const candidate = String(item.content || '').trim();
    if (!candidate || candidate.length > 40) continue;

    const location = liveTools.extractWeatherLocation(candidate)
      || liveTools.extractWeatherLocation(`${candidate}天气`);
    if (location) return location;
  }

  return '';
}

function getPendingWeatherQuery(message, history) {
  if (!Array.isArray(history) || history.length === 0) return '';

  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage || normalizedMessage.length > 40) return '';

  const lastTurn = history[history.length - 1];
  if (!lastTurn || lastTurn.role !== 'assistant') return '';

  if (String(lastTurn.content || '').trim() === WEATHER_LOCATION_PROMPT) {
    const previousWeatherUserMessage = [...history]
      .reverse()
      .find(item => item.role === 'user' && liveTools.isWeatherQuery(item.content));

    if (!previousWeatherUserMessage) return '';

    if (!isLikelyWeatherLocationReply(normalizedMessage)) return '';

    const locationReply = normalizeCarryoverFragment(normalizedMessage);
    const normalizedLocation = liveTools.extractWeatherLocation(`${locationReply}天气`) || locationReply;
    if (!normalizedLocation) return '';

    return `${normalizedLocation}${String(previousWeatherUserMessage.content || '').trim()}`;
  }

  if (!looksLikeWeatherReply(lastTurn.content) || !shouldCarryWeatherFollowup(normalizedMessage)) {
    return '';
  }

  const location = getRecentWeatherLocation(history);
  if (!location) return '';

  const normalizedFollowup = normalizeCarryoverFragment(normalizedMessage);
  if (!normalizedFollowup) return '';
  if (liveTools.isWeatherQuery(normalizedFollowup)) return `${location}${normalizedFollowup}`;
  return `${location}${normalizedFollowup}天气怎么样`;
}

function shouldSuppressRefsForReply(reply) {
  const text = String(reply || '').trim();
  if (!text || !/[?？]/.test(text)) return false;

  return /(?:哪款游戏|游戏名|游戏名称|卡在哪|哪一关|哪个角色|哪位角色|具体一点|补充一下|说一下|告诉我)/u.test(text);
}

function extractGenericSubjectCandidate(message) {
  const raw = String(message || '').trim();
  if (!raw || raw.length > 40) return '';

  let text = raw
    .replace(/[“”"'`]/gu, '')
    .replace(/[？?！!。.,，、；;:：]+$/gu, '')
    .trim();

  text = text
    .replace(/^(?:\u4f60\u77e5\u9053|\u77e5\u9053|\u4e86\u89e3|\u8ba4\u8bc6|\u542c\u8fc7|\u542c\u8bf4\u8fc7|\u4ecb\u7ecd\u4e00\u4e0b|\u4ecb\u7ecd\u4e2a|\u4ecb\u7ecd|\u8bf4\u8bf4|\u8bb2\u8bb2|\u804a\u804a|\u8bc4\u4ef7\u4e00\u4e0b|\u600e\u4e48\u770b|\u5e2e\u6211\u67e5\u4e00\u4e0b|\u5e2e\u6211\u67e5|\u67e5\u4e00\u4e0b|\u67e5\u4e0b|\u641c\u4e00\u4e0b|\u641c\u7d22\u4e00\u4e0b|\u641c\u7d22|\u8bf7\u95ee|\u6211\u60f3\u95ee\u4e00\u4e0b|\u6211\u60f3\u95ee|\u5173\u4e8e|\u7ed9\u6211\u63a8\u8350\u4e00\u4e0b|\u7ed9\u6211\u63a8\u8350|\u63a8\u8350\u4e00\u4e0b|\u63a8\u8350)\s*/u, '')
    .replace(/^(?:你知道|知道|了解|认识|听过|听说过|介绍一下|介绍下|介绍|说说|讲讲|聊聊|评价一下|怎么看|帮我查一下|帮我查|查一下|查下|搜一下|搜索一下|搜索|请问|我想问一下|我想问|关于)\s*/u, '')
    .replace(/^《(.+?)》$/u, '$1')
    .replace(/(?:吗|么|呢|呀|啊)$/u, '')
    .replace(/(?:是(?:什么|啥|谁|哪个|哪种|哪一类)|属于什么|怎么样|咋样|好用吗|好玩吗|是什么游戏|是几人的游戏).*$/u, '')
    .trim();

  if (!text || text.length < 2 || text.length > 24) return '';
  if (!/[\u4e00-\u9fffA-Za-z]/u.test(text)) return '';
  if (/^(?:他|她|它|这|那|这个|那个|其|该)/u.test(text)) return '';
  if (/(?:怎么|咋|如何|为什么|多少|几|哪里|哪儿|哪个|哪款|when|what|how|why|where|who)/iu.test(text)) return '';
  return text;
}

function looksLikeConstraintStyleFollowup(message) {
  const text = normalizeCarryoverFragment(message);
  if (!text || text.length > 40) return false;
  if (/(?:\u4ec0\u4e48|\u600e\u4e48|\u600e\u6837|\u5982\u4f55|\u4e3a\u4ec0\u4e48|\u4ecb\u7ecd|\u6559\u7a0b|\u653b\u7565|\u73a9\u6cd5|\u662f\u8c01|\u662f\u4ec0\u4e48|\u4ec0\u4e48\u610f\u601d|\u54ea\u4e2a|\u54ea\u6b3e|\u54ea\u4f4d)/u.test(text)) return false;

  if (
    /^(?:有没有|有吗|能不能|能否|可以吗|可不可以|是否|适合|支持|推荐|下雨天|雨天|周末|工作日|亲子|新手|入门|后期|前期|室内|室外|过夜|带狗|带宠物|洗手间|停车|空调|淋浴|独卫|帐篷|天幕|人均|预算|便宜|贵不贵|值不值|几人|几个人|多少人|多大|多久|几点|几天|几星|三星|二星|一星)/u.test(text)
  ) {
    return true;
  }

  if (/(?:\d+\s*人|[一二两三四五六七八九十]+\s*人|下雨天|雨天|周末|亲子|新手|入门|后期|前期|室内|室外|过夜|带狗|带宠物|洗手间|停车|人均|预算|三星|二星|一星)/u.test(text)) {
    return true;
  }

  return /^[^。！？!?]{1,32}(?:，|,|、)[^。！？!?]{1,32}$/u.test(text);
}

function shouldCarryGenericFollowup(message) {
  const text = normalizeCarryoverFragment(message);
  if (!text || text.length > 40) return false;
  if (looksLikeConstraintStyleFollowup(text)) return true;
  if (liveTools.isWeatherQuery(text) || shouldCarryWeatherFollowup(text)) return false;
  if (looksLikeStandaloneTopicShift(text)) return false;

  if (/^(?:(?:那|然后|再|继续|还有)?(?:他|她|它|他们|她们|它们|这个|那个|这款|那款|这个游戏|那个游戏|这个品牌|那个品牌|这个车|那个车|其|该))/u.test(text)) {
    return true;
  }

  return /^(?:那|然后|再|继续|还有).{0,12}(?:呢|怎么样|咋样|多少|多大|几人|几人的)/u.test(text);
}

function getRecentGenericSubjectFromHistory(history, limit = 6) {
  const recentUserMessages = [...(Array.isArray(history) ? history : [])]
    .reverse()
    .filter(item => item && item.role === 'user' && String(item.content || '').trim())
    .slice(0, limit);

  for (const item of recentUserMessages) {
    const subject = extractGenericSubjectCandidate(item.content);
    if (subject) return subject;
  }

  return '';
}

function resolveGenericFollowupMessage(message, subject) {
  const text = String(message || '').trim();
  const name = String(subject || '').trim();
  if (!text || !name) return text;

  const replaced = text.replace(
    /^(?:那|然后|再|继续|还有)?(?:他|她|它|他们|她们|它们|这个|那个|这款|那款|这个游戏|那个游戏|这个品牌|那个品牌|这个车|那个车|其|该)/u,
    name
  );

  if (replaced !== text) return replaced;
  return `${name} ${text}`;
}

function buildGenericContextAugmentedQuery(message, history) {
  const text = String(message || '').trim();
  if (!text || !shouldCarryGenericFollowup(text)) {
    return { retrievalQuery: text, followupContextBlock: '', subject: '' };
  }

  const subject = getRecentGenericSubjectFromHistory(history);
  if (!subject || text.includes(subject)) {
    return { retrievalQuery: text, followupContextBlock: '', subject };
  }

  const resolvedMessage = resolveGenericFollowupMessage(text, subject);

  return {
    retrievalQuery: resolvedMessage,
    followupContextBlock: [
      `当前追问对象：${subject}`,
      '本轮问题如果没有显式切换到新对象，默认仍然是在追问这个对象。',
    ].join('\n'),
    subject,
  };
}

function hasStrongAnswerRefAlignment(query, ref) {
  const text = getRefText(ref);
  if (!text) return false;

  const titleMatch = ragContext.hasTitleStyleMatch(query, text);
  const tokenOverlap = ragContext.hasTokenOverlap(query, text);
  const intentScore = Number(
    ref?.intentScore != null
      ? ref.intentScore
      : ragContext.scoreIntentAlignment(query, text)
  );

  if (titleMatch) return true;
  if (ragContext.isGenericBeginnerGuideQuery(query)) {
    return intentScore >= 12 || (intentScore >= 8 && tokenOverlap);
  }
  if (looksLikeConstraintStyleFollowup(query) || /[，,、]/u.test(String(query || ''))) {
    return intentScore >= 8 && tokenOverlap;
  }
  return intentScore >= 0 && tokenOverlap;
}

function buildHeroContextAugmentedQuery(message, heroContext) {
  const text = String(message || '').trim();
  if (!text || !heroContext || !heroContext.name) return text;
  if (text.includes(heroContext.name)) return text;
  return `${heroContext.name} ${text}`;
}

function buildHeroFollowupContextBlock(message, heroContext) {
  const text = String(message || '').trim();
  if (!text || !heroContext || !heroContext.name) return '';
  if (text.includes(heroContext.name)) return '';
  return [
    '当前追问对象：' + heroContext.name,
    '本轮问题如果没有显式提到新角色，默认仍然是在追问这个英雄。',
  ].join('\n');
}

// 主流程:一次对话。onStage(可选) 在真实进入某处理阶段时被调用一次,
// 供路由层(如 SSE)向前端推送真实进度;不传则行为与原来完全一致。
async function handleChat({ versionId, sessionKey, message, requestMeta = {}, onStage, skipPolish = false }) {
  const emit = stage => { if (onStage) onStage(stage); };

  const bot = await getBot(versionId);
  const versionContext = await getVersionContext(versionId);
  const { id: sessionId } = await findOrCreateSession(versionId, sessionKey, message);
  const preferredLocale = detectUserLocale(message);

  const history = await loadHistory(sessionId, bot.history_turns * 2);
  const userMsgId = await saveMessage(versionId, sessionId, 'user', message, null);
  const saveAssistantReply = async (reply, refs = []) => {
    const assistantMsgId = await saveMessage(versionId, sessionId, 'assistant', reply, refs);
    qualityScoring.enqueueScore({
      versionId,
      sessionId,
      messageId: assistantMsgId,
      userMessageId: userMsgId,
      userContent: message,
      assistantContent: reply,
      refs: Array.isArray(refs) ? refs : [],
    });
    return assistantMsgId;
  };
  const finalizeReply = async (draftReply, {
    query = message,
    refs: draftRefs = [],
    versionContext: replyVersionContext = null,
    domainMode = 'game',
  } = {}) => {
    const finalReply = skipPolish
      ? draftReply
      : await polishReplyThroughAi(bot, query, draftReply, {
          history,
          refs: draftRefs,
          preferredLocale,
          versionContext: replyVersionContext,
          domainMode,
        });
    const finalRefs = shouldSuppressRefsForReply(finalReply) ? [] : draftRefs;
    await saveAssistantReply(finalReply, finalRefs);
    return { reply: finalReply, refs: finalRefs };
  };

  try {
    emit('retrieving');
    // RAG 与 KG 并行(各自内部失败均退化为空,不影响对话)
    let refs = [];
    let contextBlock = '';
    let factBlock = '';
    let liveBlock = '';
    const pendingSearchRetryQuery = getPendingSearchRetryQuery(message, history);
    const effectiveMessage = pendingSearchRetryQuery || message;
    const pendingWeatherQuery = getPendingWeatherQuery(message, history);
    const weatherQuery = pendingWeatherQuery || message;
    const weatherLocationHint = liveTools.extractWeatherLocation(weatherQuery);
    let weatherResult = null;
    let shouldPromptWeatherLocation = false;

    const weatherIntent = cfg.liveTools.enabled
      && cfg.liveTools.weatherEnabled
      && (liveTools.isWeatherQuery(message) || !!pendingWeatherQuery);

    if (weatherIntent) {
      try {
        weatherResult = await liveTools.getWeatherResult(weatherQuery, requestMeta);
        if (weatherResult.ok) {
          return finalizeReply(weatherResult.reply, {
            query: weatherQuery,
            refs: [],
            domainMode: 'general',
          });
        }
        shouldPromptWeatherLocation = !!weatherResult.requiresLocation && !weatherLocationHint;
      } catch (err) {
        console.error('[chatService] weather lookup failed:', err.message);
      }
    }

    const heroCardResult = pendingSearchRetryQuery
      ? null
      : await heroCardService.findHeroCardReply(versionId, message, history);
    if (heroCardResult) {
      if (heroCardResult.replyMode === 'card' && heroCardResult.card) {
        const prose = await getHeroCardGroundedReply(
          bot,
          message,
          heroCardResult.card,
          history,
          preferredLocale,
          {
            versionContext,
            domainMode: 'game',
          }
        );
        const reply = `${prose || buildHeroCardFallbackReply(heroCardResult.card)}\n\n${buildHeroCardBlock(heroCardResult.card)}`;
        return finalizeReply(reply, {
          query: message,
          refs: [],
          versionContext,
          domainMode: 'game',
        });
      }

      return finalizeReply(heroCardResult.reply, {
        query: message,
        refs: [],
        versionContext,
        domainMode: 'game',
      });
    }

    const heroContext = pendingSearchRetryQuery
      ? null
      : await heroCardService.findHeroContextEntity(versionId, message, history);
    const genericFollowupContext = (pendingSearchRetryQuery || heroContext)
      ? { retrievalQuery: String(effectiveMessage || '').trim(), followupContextBlock: '', subject: '' }
      : buildGenericContextAugmentedQuery(message, history);
    const retrievalQuery = pendingSearchRetryQuery
      ? effectiveMessage
      : (heroContext
        ? buildHeroContextAugmentedQuery(message, heroContext)
        : genericFollowupContext.retrievalQuery);
    const promptMessage = pendingSearchRetryQuery
      ? effectiveMessage
      : (heroContext
        ? retrievalQuery
        : (genericFollowupContext.subject ? genericFollowupContext.retrievalQuery : message));
    const heroFollowupContextBlock = buildHeroFollowupContextBlock(message, heroContext);

    const [ragRefs, facts] = await Promise.all([
      bot.rag_enabled ? ragContext.retrieve(versionId, retrievalQuery, bot.rag_top_k) : Promise.resolve([]),
      bot.kg_enabled ? retrieveFacts(versionId, retrievalQuery) : Promise.resolve([]),
    ]);

    if (facts.length > 0) {
      factBlock = kgContext.toFactBlock(facts);
    }
    if (!factBlock && heroFollowupContextBlock) {
      factBlock = heroFollowupContextBlock;
    }
    if (!factBlock && genericFollowupContext.followupContextBlock) {
      factBlock = genericFollowupContext.followupContextBlock;
    }

    const aliasOnlyKnowledge = hasOnlyHeroAliasMappingRefs(effectiveMessage, ragRefs);
    const headerOnlyKnowledge = hasOnlyHeaderOnlyRefs(ragRefs);
    const catalogOnlyKnowledge = hasOnlyCatalogRefs(ragRefs);
    const candidateRefs = (!aliasOnlyKnowledge && !headerOnlyKnowledge && !catalogOnlyKnowledge && ragRefs.length > 0)
      ? filterRefsForAnswer(effectiveMessage, ragRefs)
      : [];
    const heroAliasReply = getHeroAliasReply(effectiveMessage, ragRefs);
    const directKnowledgeReply = getDirectKnowledgeReply(effectiveMessage, candidateRefs);
    const literalKnowledgeReply = getLiteralKnowledgeReply(effectiveMessage, candidateRefs);
    const gameDomain = !pendingSearchRetryQuery && isLikelyGameDomainQuery(effectiveMessage, {
      heroContext,
      facts,
      refs: candidateRefs,
      directKnowledgeReply,
      literalKnowledgeReply,
      heroAliasReply,
    });

    if (gameDomain && heroAliasReply) {
      return finalizeReply(heroAliasReply, {
        query: effectiveMessage,
        refs: [],
        versionContext,
        domainMode: 'game',
      });
    }

    if (gameDomain && candidateRefs.length > 0) {
      refs = candidateRefs;
      contextBlock = ragContext.toContextBlock(refs);
    } else {
      refs = [];
      contextBlock = '';
      if (!gameDomain && facts.length > 0) {
        factBlock = heroFollowupContextBlock || genericFollowupContext.followupContextBlock || '';
      }
    }

    if (gameDomain && directKnowledgeReply) {
      contextBlock = ragContext.toContextBlock(refs);
    }

    if (gameDomain && literalKnowledgeReply) {
      contextBlock = ragContext.toContextBlock(refs);
    }

    const weatherNeedsSearchFallback = weatherIntent
      && !!weatherLocationHint
      && (!weatherResult || !weatherResult.ok);

    const webSearchIntent = cfg.liveTools.enabled
      && cfg.liveTools.webSearchEnabled
      && (
        weatherNeedsSearchFallback
        || liveTools.shouldUseWebSearch(effectiveMessage, {
          ragRefs: gameDomain ? ((aliasOnlyKnowledge || headerOnlyKnowledge) ? [] : ragRefs) : [],
          facts: gameDomain ? facts : [],
        })
      );

    const eventRealtimeSearch = !weatherNeedsSearchFallback && liveTools.isEventRealtimeQuery(effectiveMessage);

    if (webSearchIntent) {
      try {
        const searchQueries = weatherNeedsSearchFallback
          ? `${weatherLocationHint} ${liveTools.getWeatherDayInfo(weatherQuery).dayLabel} 天气`
          : liveTools.buildWebSearchQueries(effectiveMessage);
        const searchResult = await liveTools.getWebSearchResult(searchQueries);
        const searchQuery = searchResult.queryUsed
          || (Array.isArray(searchQueries) ? searchQueries[0] : searchQueries);
        if (searchResult.ok) {
          if (weatherNeedsSearchFallback) {
            const weatherFallbackReply = liveTools.buildWeatherSearchFallbackReply(searchQuery, searchResult.results);
            if (weatherFallbackReply) {
              return finalizeReply(weatherFallbackReply, {
                query: weatherQuery,
                refs: [],
                domainMode: 'general',
              });
            }
          }

          if (!weatherNeedsSearchFallback) {
            const answerResults = eventRealtimeSearch
              ? liveTools.filterReliableEventResults(searchQuery, searchResult.results)
              : searchResult.results;
            if (eventRealtimeSearch && answerResults.length === 0) {
              const unavailableReply = buildSearchUnavailableReply(effectiveMessage);
              if (unavailableReply) {
                return finalizeReply(unavailableReply, {
                  query: effectiveMessage,
                  refs: [],
                  domainMode: 'general',
                });
              }
            }

            const searchReply = await getSearchGroundedReply(
              bot,
              effectiveMessage,
              answerResults,
              preferredLocale,
              {
                versionContext: gameDomain ? versionContext : null,
                domainMode: gameDomain ? 'game' : 'general',
              }
            );
            if (searchReply) {
              return finalizeReply(searchReply, {
                query: effectiveMessage,
                refs: [],
                versionContext: gameDomain ? versionContext : null,
                domainMode: gameDomain ? 'game' : 'general',
              });
            }
          }

          liveBlock = searchResult.promptBlock;
          refs = [];
        } else if (!weatherNeedsSearchFallback) {
          const unavailableReply = buildSearchUnavailableReply(effectiveMessage);
          if (unavailableReply) {
            return finalizeReply(unavailableReply, {
              query: effectiveMessage,
              refs: [],
              domainMode: 'general',
            });
          }
        }
      } catch (err) {
        console.error('[chatService] web search failed:', err.message);
        if (!weatherNeedsSearchFallback) {
          const unavailableReply = buildSearchUnavailableReply(effectiveMessage);
          if (unavailableReply) {
            return finalizeReply(unavailableReply, {
              query: effectiveMessage,
              refs: [],
              domainMode: 'general',
            });
          }
        }
      }
    }

    if (weatherIntent && shouldPromptWeatherLocation && !liveBlock) {
      const reply = WEATHER_LOCATION_PROMPT;
      return finalizeReply(reply, {
        query: weatherQuery,
        refs: [],
        domainMode: 'general',
      });
    }

    if (weatherIntent && weatherLocationHint && !liveBlock) {
      const dayLabel = liveTools.getWeatherDayInfo(weatherQuery).dayLabel;
      const reply = `${weatherLocationHint}${dayLabel}的可靠天气结果暂时没查到，我现在没法负责任地判断会不会下雨。你可以稍后再问我一次，或者换成更完整的地点，比如“深圳光明区周六会下雨吗”。`;
      return finalizeReply(reply, {
        query: weatherQuery,
        refs: [],
        domainMode: 'general',
      });
    }

    if (genericFollowupContext.subject && refs.length === 0 && (!gameDomain || facts.length === 0) && !liveBlock) {
      const reply = await getResolvedFollowupReply(bot, promptMessage, preferredLocale, {
        versionContext: gameDomain ? versionContext : null,
        domainMode: gameDomain ? 'game' : 'general',
      });
      if (reply) {
        return finalizeReply(reply, {
          query: promptMessage,
          refs: [],
          versionContext: gameDomain ? versionContext : null,
          domainMode: gameDomain ? 'game' : 'general',
        });
      }
    }

    if (gameDomain && shouldUseNoHitEntityFallback(message, refs, facts, liveBlock)) {
      const reply = await getNoHitEntityReply(bot, message, preferredLocale, {
        versionContext,
        domainMode: 'game',
      });
      if (reply) {
        return finalizeReply(reply, {
          query: message,
          refs: [],
          versionContext,
          domainMode: 'game',
        });
      }
    }

    const messages = buildMessages(
      bot,
      history,
      promptMessage,
      contextBlock,
      factBlock,
      liveBlock,
      gameDomain ? versionContext : null,
      { domainMode: gameDomain ? 'game' : 'general' }
    );
    emit('thinking');
    // 调 LLM
    const { content: rawReply } = await llm.chat(messages, { model: bot.model || undefined });
    const draftReply = postProcessAssistantReply(
      String(rawReply || '').trim(),
      promptMessage,
      refs,
      preferredLocale
    );
    return finalizeReply(draftReply, {
      query: promptMessage,
      refs,
      versionContext: gameDomain ? versionContext : null,
      domainMode: gameDomain ? 'game' : 'general',
    });
  } catch (err) {
    try {
      await deleteMessage(userMsgId, sessionId);
    } catch {
      // ignore rollback failure
    }
    throw err;
  }
}

module.exports = {
  handleChat,
  getBot,
  findOrCreateSession,
  loadHistory,
  saveMessage,
  deleteMessage,
  buildMessages,
  buildBaseSystemPrompt,
  buildAugmentedSystemPrompt,
  extractPromptRules,
  loadGlobalBotConstraints,
  getPendingWeatherQuery,
  isLikelyWeatherLocationReply,
  shouldCarryWeatherFollowup,
  shouldSuppressRefsForReply,
  extractGenericSubjectCandidate,
  shouldCarryGenericFollowup,
  buildGenericContextAugmentedQuery,
  shouldReturnSearchUnavailableFallback,
  buildSearchUnavailableReply,
  looksLikeSearchUnavailableReply,
  getPendingSearchRetryQuery,
  getDirectKnowledgeReply,
  hasOnlyHeroAliasMappingRefs,
  getHeroAliasReply,
  getLiteralKnowledgeReply,
  detectUserLocale,
  hasOnlyCatalogRefs,
  shouldUseNoHitEntityFallback,
  isLikelyGameDomainQuery,
  filterRefsForAnswer,
  getKnowledgeQueryIntent,
  isRefCompatibleWithQueryIntent,
  trimGenericTrailingFollowup,
  postProcessAssistantReply,
  extractTrailingHeroCardBlock,
  getSearchGroundedReply,
  getHeroCardGroundedReply,
  getNoHitEntityReply,
  getResolvedFollowupReply,
  polishReplyThroughAi,
};
