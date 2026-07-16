const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const cfg = require('../config/kb');
const llm = require('./llm');
const ragContext = require('./ragContext');
const kgContext = require('./kgContext');
const liveTools = require('./liveTools');
const heroCardService = require('./heroCardService');

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
];

function shouldReturnSearchUnavailableFallback(query) {
  const text = String(query == null ? '' : query).trim().toLowerCase();
  if (!text) return false;
  return SEARCH_REQUIRED_KEYWORDS.some(keyword => text.includes(keyword));
}

function buildSearchUnavailableReply(query) {
  if (!shouldReturnSearchUnavailableFallback(query)) return '';
  return '\u8fd9\u4e2a\u95ee\u9898\u9700\u8981\u67e5\u5b9e\u65f6\u6216\u6700\u65b0\u4fe1\u606f\uff0c\u6211\u8fd9\u8fb9\u6682\u65f6\u6ca1\u62ff\u5230\u53ef\u9760\u641c\u7d22\u7ed3\u679c\uff0c\u4e0d\u80fd\u4e71\u62a5\u3002\u4f60\u53ef\u4ee5\u7a0d\u540e\u518d\u8bd5\u4e00\u6b21\uff0c\u6216\u76f4\u63a5\u67e5\u5b98\u65b9\u6e20\u9053\u786e\u8ba4\u3002';
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

function looksLikeStructuredKnowledgeLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (/^[一二三四五六七八九十]+[、.．]/u.test(text)) return true;
  if (/^\d+[.、．]/u.test(text)) return true;
  if (/^[^:\s][^:\n]{0,30}:\s*\S+/u.test(text)) return true;
  return text.length >= 16;
}

function looksLikeStructuredKnowledgeLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (/^[一二三四五六七八九十]+[、.]/u.test(text)) return true;
  if (/^\d+[.、]/u.test(text)) return true;
  if (/^[^:：\s][^:：\n]{0,30}[:：]\s*\S+/u.test(text)) return true;
  return /[\u4e00-\u9fa5]/u.test(text) && text.length >= 10;
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

function shouldUseHeroAliasReply(query) {
  const text = String(query || '').trim();
  if (!text) return false;

  return /(?:对照|对应|别名|另一个游戏|另一个版本|LastWar|灯塔|位面)/iu.test(text);
}

function getDirectKnowledgeReply(query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  if (hasOnlyHeaderOnlyRefs(refs)) return '';

  const candidates = refs.filter(ref => !ragContext.isMetadataHeavyContent(ref.matchText || ref.snippet || ''));
  const sourceRefs = (candidates.length > 0 ? candidates : refs).filter(ref => {
    const lines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isDirectKbMetadataLine(line))
      .map(normalizeDirectKnowledgeLine)
      .filter(Boolean);
    return !isHeaderOnlyKnowledgeLines(lines);
  });
  const matchedRefs = sourceRefs.filter(
    ref => ragContext.hasTitleStyleMatch(query, ref.matchText || ref.snippet || '')
  );
  const topRef = matchedRefs[0];
  if (!topRef) return '';

  const lines = splitDirectKnowledgeLines(topRef.matchText || topRef.snippet || '')
    .filter(line => !isDirectKbMetadataLine(line))
    .map(normalizeDirectKnowledgeLine)
    .filter(Boolean);

  if (lines.length < 2) return '';
  if (isHeroAliasMappingKnowledge(query, lines)) return '';

  const titleIndex = lines.findIndex(line => ragContext.hasTitleStyleMatch(query, line));
  const startIndex = titleIndex >= 0 ? titleIndex : 0;
  const picked = [];
  let usedChars = 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
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

  const collected = [];
  const seen = new Set();
  const sourceRefs = refs.filter(ref => String(ref.matchText || ref.snippet || '').trim());

  for (const ref of sourceRefs) {
    const lines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isDirectKbMetadataLine(line))
      .map(line => String(line || '').trim())
      .filter(Boolean);

    if (lines.length === 0) continue;
    if (isHeaderOnlyKnowledgeLines(lines)) continue;

    const matchedIndexes = lines
      .map((line, index) => (
        ragContext.hasTitleStyleMatch(query, line) || ragContext.hasTokenOverlap(query, line)
          ? index
          : -1
      ))
      .filter(index => index >= 0);

    if (matchedIndexes.length === 0) continue;

    const startIndex = Math.max(0, matchedIndexes[0] - 2);
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

async function getSearchGroundedReply(bot, query, results) {
  if (!Array.isArray(results) || results.length === 0) return '';

  const messages = [
    {
      role: 'system',
      content: [
        'You are answering a Chinese end user.',
        'When web search results are provided, answer directly from those results first.',
        'If the user asks about latest, current, recent, today, or news, summarize the latest developments instead of giving generic background.',
        'For ambiguous time or schedule questions about recurring sports events, infer the user wants the current or upcoming edition. Lead with the current/upcoming event, and mention past editions only if needed as secondary context.',
        'Do not say you cannot browse. Do not mention the knowledge base. Do not output URLs, citations, or images.',
        'If the search results are still insufficient, say the search did not return enough reliable information, then only add clearly labeled general background if it helps.',
        'If the search results show an official confirmed event schedule, match date, kickoff time, or organizer-announced arrangement, state it as confirmed and do not soften it into words like "预计", "可能", or "大概" unless the results themselves are explicitly uncertain.',
        'Keep the answer concise. Lead with the conclusion. Answer in Chinese.',
      ].join('\n'),
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
  return String(content || '').trim();
}

function shouldUseNoHitEntityFallback(message, refs, facts, liveBlock = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  if (String(liveBlock || '').trim()) return false;
  if (Array.isArray(refs) && refs.length > 0) return false;
  if (Array.isArray(facts) && facts.length > 0) return false;
  return !!heroCardService.looksLikeHeroDetailQuery(text);
}

async function getNoHitEntityReply(bot, query) {
  const text = String(query || '').trim();
  if (!text) return '';

  const messages = [
    {
      role: 'system',
      content: [
        'You are answering a Chinese end user.',
        'The game knowledge path did not return a matching in-game role or entity record for this query.',
        'Do not invent any game hero profile, rarity, camp, career, skill, quote, strength tier, or collection status.',
        'Do not mention the knowledge base, retrieval, references, images, or internal process.',
        'If the term has a common real-world meaning, answer that meaning directly and concisely.',
        'If the term is ambiguous, briefly state the likely meanings and ask one short clarification question.',
        'If you are unsure, say the term alone is ambiguous. Never fabricate.',
        'Answer in Chinese. Keep it concise.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: text,
    },
  ];

  const { content } = await llm.chat(messages, { model: bot.model || undefined });
  return String(content || '').trim();
}

function buildMessages(bot, history, userMessage, contextBlock, factBlock = '', liveBlock = '') {
  const budget = cfg.llm.maxPromptBytes;
  const userBytes = Buffer.byteLength(userMessage, 'utf8');
  const systemBudget = Math.max(200, budget - userBytes - 200);

  const globalConstraints = loadGlobalBotConstraints();
  const displayName = String(bot.display_name || '').trim();
  const persona = String(bot.persona || '').trim();
  const defaultAnswerPolicy = [
    '回答策略优先级：1. 命中知识库或图谱事实时，优先基于这些内容回答；2. 有实时天气或联网搜索结果时，优先基于这些外部结果回答；3. 两者都不足时，直接根据通用知识正常回答用户问题。',
    '不要因为没命中知识库就让用户换个问法，也不要无故改成只追问不回答；除非缺少关键前提，否则先直接回答。',
    '不要假装命中了知识库，不要假装拿到了实时结果，也不要输出并不存在的引用或图片。',
    'When the knowledge base already contains the answer, answer from that text, keep the source sections when useful, and do not invent extra tips.',
  ].join('\n');
  const directnessPolicy = [
    '知道什么就直接说什么，先给结论，再补充必要说明。',
    '不要写这类废话开头：比如“这是个很核心的问题”“不过当前知识库还没完全收录”“我能确认的是”“我不敢给你乱讲”。',
    '不要解释你自己的检索过程、判断过程、知识边界来源；用户没问就别交代系统内部机制。',
    '如果信息不足，直接说缺哪一部分；如果已知一部分，就直接给已知部分，不要先来一段大而空的铺垫。',
  ].join('\n');
  const liveAnswerPolicy = liveBlock
    ? [
        '下面已经给了联网搜索或实时工具结果。',
        '若问题涉及最新、新闻、实时、天气等内容，必须直接基于这些结果回答，不要退回成百科介绍。',
        '不要说自己不能联网，不要说刚才是瞎编的。',
      ].join('\n')
    : '';

  const prioritizedBlocks = [
    globalConstraints,
    displayName ? `你的名称是“${displayName}”。` : '',
    persona ? `【当前版本具体设定】\n${persona}` : '',
    liveBlock,
    factBlock,
    contextBlock,
  ];

  prioritizedBlocks.unshift(liveAnswerPolicy);
  prioritizedBlocks.unshift(directnessPolicy);
  prioritizedBlocks.unshift(defaultAnswerPolicy);
  prioritizedBlocks.splice(
    0,
    prioritizedBlocks.length,
    defaultAnswerPolicy,
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
async function handleChat({ versionId, sessionKey, message, requestMeta = {}, onStage }) {
  const emit = stage => { if (onStage) onStage(stage); };

  const bot = await getBot(versionId);
  const { id: sessionId } = await findOrCreateSession(versionId, sessionKey, message);

  const history = await loadHistory(sessionId, bot.history_turns * 2);
  const userMsgId = await saveMessage(versionId, sessionId, 'user', message, null);

  try {
    emit('retrieving');
    // RAG 与 KG 并行(各自内部失败均退化为空,不影响对话)
    let refs = [];
    let contextBlock = '';
    let factBlock = '';
    let liveBlock = '';
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
          await saveMessage(versionId, sessionId, 'assistant', weatherResult.reply, []);
          return { reply: weatherResult.reply, refs: [] };
        }
        shouldPromptWeatherLocation = !!weatherResult.requiresLocation && !weatherLocationHint;
      } catch (err) {
        console.error('[chatService] weather lookup failed:', err.message);
      }
    }

    const heroCardResult = await heroCardService.findHeroCardReply(versionId, message, history);
    if (heroCardResult) {
      await saveMessage(versionId, sessionId, 'assistant', heroCardResult.reply, []);
      return { reply: heroCardResult.reply, refs: [] };
    }

    const heroContext = await heroCardService.findHeroContextEntity(versionId, message, history);
    const retrievalQuery = buildHeroContextAugmentedQuery(message, heroContext);
    const heroFollowupContextBlock = buildHeroFollowupContextBlock(message, heroContext);

    const [ragRefs, facts] = await Promise.all([
      bot.rag_enabled ? ragContext.retrieve(versionId, retrievalQuery, bot.rag_top_k) : Promise.resolve([]),
      bot.kg_enabled ? retrieveFacts(versionId, retrievalQuery) : Promise.resolve([]),
    ]);

    if (ragRefs.length > 0) {
      refs = ragRefs;
      contextBlock = ragContext.toContextBlock(ragRefs);
    }

    if (facts.length > 0) {
      factBlock = kgContext.toFactBlock(facts);
    }
    if (!factBlock && heroFollowupContextBlock) {
      factBlock = heroFollowupContextBlock;
    }

    const aliasOnlyKnowledge = hasOnlyHeroAliasMappingRefs(message, refs);
    const headerOnlyKnowledge = hasOnlyHeaderOnlyRefs(refs);
    if (aliasOnlyKnowledge || headerOnlyKnowledge) {
      refs = [];
      contextBlock = '';
    }

    const directKnowledgeReply = getDirectKnowledgeReply(message, refs);
    if (directKnowledgeReply) {
      await saveMessage(versionId, sessionId, 'assistant', directKnowledgeReply, refs);
      return { reply: directKnowledgeReply, refs };
    }

    const heroAliasReply = getHeroAliasReply(message, refs);
    if (heroAliasReply) {
      await saveMessage(versionId, sessionId, 'assistant', heroAliasReply, refs);
      return { reply: heroAliasReply, refs };
    }

    const literalKnowledgeReply = getLiteralKnowledgeReply(message, refs);
    if (literalKnowledgeReply) {
      await saveMessage(versionId, sessionId, 'assistant', literalKnowledgeReply, refs);
      return { reply: literalKnowledgeReply, refs };
    }

    const weatherNeedsSearchFallback = weatherIntent
      && !!weatherLocationHint
      && (!weatherResult || !weatherResult.ok);

    const webSearchIntent = cfg.liveTools.enabled
      && cfg.liveTools.webSearchEnabled
      && (
        weatherNeedsSearchFallback
        || liveTools.shouldUseWebSearch(message, {
          ragRefs: (aliasOnlyKnowledge || headerOnlyKnowledge) ? [] : ragRefs,
          facts,
        })
      );

    const eventRealtimeSearch = !weatherNeedsSearchFallback && liveTools.isEventRealtimeQuery(message);

    if (webSearchIntent) {
      try {
        const searchQueries = weatherNeedsSearchFallback
          ? `${weatherLocationHint} ${liveTools.getWeatherDayInfo(weatherQuery).dayLabel} 天气`
          : liveTools.buildWebSearchQueries(message);
        const searchResult = await liveTools.getWebSearchResult(searchQueries);
        const searchQuery = searchResult.queryUsed
          || (Array.isArray(searchQueries) ? searchQueries[0] : searchQueries);
        if (searchResult.ok) {
          if (weatherNeedsSearchFallback) {
            const weatherFallbackReply = liveTools.buildWeatherSearchFallbackReply(searchQuery, searchResult.results);
            if (weatherFallbackReply) {
              await saveMessage(versionId, sessionId, 'assistant', weatherFallbackReply, []);
              return { reply: weatherFallbackReply, refs: [] };
            }
          }

          if (!weatherNeedsSearchFallback) {
            const answerResults = eventRealtimeSearch
              ? liveTools.filterReliableEventResults(searchQuery, searchResult.results)
              : searchResult.results;
            if (eventRealtimeSearch && answerResults.length === 0) {
              const unavailableReply = buildSearchUnavailableReply(message);
              if (unavailableReply) {
                await saveMessage(versionId, sessionId, 'assistant', unavailableReply, []);
                return { reply: unavailableReply, refs: [] };
              }
            }

            const searchReply = await getSearchGroundedReply(bot, message, answerResults);
            if (searchReply) {
              await saveMessage(versionId, sessionId, 'assistant', searchReply, []);
              return { reply: searchReply, refs: [] };
            }
          }

          liveBlock = searchResult.promptBlock;
          refs = [];
        } else if (!weatherNeedsSearchFallback) {
          const unavailableReply = buildSearchUnavailableReply(message);
          if (unavailableReply) {
            await saveMessage(versionId, sessionId, 'assistant', unavailableReply, []);
            return { reply: unavailableReply, refs: [] };
          }
        }
      } catch (err) {
        console.error('[chatService] web search failed:', err.message);
        if (!weatherNeedsSearchFallback) {
          const unavailableReply = buildSearchUnavailableReply(message);
          if (unavailableReply) {
            await saveMessage(versionId, sessionId, 'assistant', unavailableReply, []);
            return { reply: unavailableReply, refs: [] };
          }
        }
      }
    }

    if (weatherIntent && shouldPromptWeatherLocation && !liveBlock) {
      const reply = WEATHER_LOCATION_PROMPT;
      await saveMessage(versionId, sessionId, 'assistant', reply, []);
      return { reply, refs: [] };
    }

    if (weatherIntent && weatherLocationHint && !liveBlock) {
      const dayLabel = liveTools.getWeatherDayInfo(weatherQuery).dayLabel;
      const reply = `${weatherLocationHint}${dayLabel}的可靠天气结果暂时没查到，我现在没法负责任地判断会不会下雨。你可以稍后再问我一次，或者换成更完整的地点，比如“深圳光明区周六会下雨吗”。`;
      await saveMessage(versionId, sessionId, 'assistant', reply, []);
      return { reply, refs: [] };
    }

    if (shouldUseNoHitEntityFallback(message, refs, facts, liveBlock)) {
      const reply = await getNoHitEntityReply(bot, message);
      if (reply) {
        await saveMessage(versionId, sessionId, 'assistant', reply, []);
        return { reply, refs: [] };
      }
    }

    const messages = buildMessages(bot, history, message, contextBlock, factBlock, liveBlock);
    emit('thinking');
    // 调 LLM
    const { content: reply } = await llm.chat(messages, { model: bot.model || undefined });
    const replyRefs = shouldSuppressRefsForReply(reply) ? [] : refs;

    await saveMessage(versionId, sessionId, 'assistant', reply, replyRefs);
    return { reply, refs: replyRefs };
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
  extractPromptRules,
  loadGlobalBotConstraints,
  getPendingWeatherQuery,
  isLikelyWeatherLocationReply,
  shouldCarryWeatherFollowup,
  shouldSuppressRefsForReply,
  shouldReturnSearchUnavailableFallback,
  buildSearchUnavailableReply,
  getDirectKnowledgeReply,
  hasOnlyHeroAliasMappingRefs,
  getHeroAliasReply,
  getLiteralKnowledgeReply,
  shouldUseNoHitEntityFallback,
};
