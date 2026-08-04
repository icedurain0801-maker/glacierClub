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
  display_name: '\u966a\u4f34\u52a9\u624b',
  avatar_url: null,
  persona: '\u4f60\u662f\u4e00\u4e2a\u70ed\u60c5\u8010\u5fc3\u7684\u6e38\u620f\u966a\u73a9\u52a9\u624b\u3002',
  welcome: '\u4f60\u597d\uff0c\u6211\u662f\u4f60\u7684\u6e38\u620f\u966a\u73a9\u52a9\u624b\uff0c\u6709\u4ec0\u4e48\u60f3\u804a\u7684\uff1f',
  rag_enabled: 1,
  rag_top_k: 5,
  kg_enabled: 1,
  history_turns: 10,
  model: null,
};

const WEATHER_LOCATION_PROMPT = '\u4f60\u60f3\u67e5\u54ea\u4e2a\u57ce\u5e02\u7684\u5929\u6c14\uff1f\u76f4\u63a5\u53d1\u201c\u4e0a\u6d77\u5929\u6c14\u201d\u6216\u201c\u5317\u4eac\u660e\u5929\u4f1a\u4e0d\u4f1a\u4e0b\u96e8\u201d\u8fd9\u79cd\u5c31\u884c\u3002';

const DIRECT_KB_REPLY_MAX_LINES = 12;
const DIRECT_KB_REPLY_MAX_CHARS = 1200;
const GUIDE_KB_REPLY_MAX_LINES = 40;
const GUIDE_KB_REPLY_MAX_CHARS = 3600;
const EXPANDED_KB_REPLY_MAX_LINES = 48;
const EXPANDED_KB_REPLY_MAX_CHARS = 4200;
const KB_METADATA_LABEL_RE = /^(?:sheet|rows?|reference|context|guide title|status|publish time|asset path|category)\s*:/i;
const HERO_DETAIL_FIELD_RE = /(?:技能|台词|语音|阵营|职业|稀有度|定位|简介|介绍|背景|基础效果|一星|二星|三星|四星|五星)/u;
const GAME_QUERY_KEYWORDS = [
  /(?:hero|skill|skills|build|loadout|team comp|lineup|formation|quest|campaign|raid|gacha|character|rarity|faction|class|gear|boss)/iu,
  /(?:英雄|技能|台词|语音|阵营|职业|稀有度|定位|阵容|配队|体力|关卡|副本|主线|抽卡|角色|装备|boss|游戏)/u,
];

// 游戏内具体玩法/系统/活动实体名词。命中任一即视为独立游戏问题，不应被误判为简短追问
// （looksLikeConstraintStyleFollowup 的"有没有/几天/几人/逗号短句"兜底会把"先锋任务有没有时间限制,几天做完"
//   这类完整独立问题误判成 followup，导致 filterRefsForAnswer 1707 清空全部召回 refs）。
const GAME_SYSTEM_ENTITY_KEYWORDS = [
  /(?:雷达任务|雷达特训|先锋任务|末日危城|巅峰竞技场|3v3竞技场|3v3|城市竞赛|城际货车|驯鹿货车|军备竞赛|同盟对决|科技中心|科技加速|科技树|经济类科技|经济产量类|主堡|车库|研究院|信号站|战地医院|庇护|医疗小组|能源储罐|保护盾|迁城|光荣勋章|特种部队|莫妮卡|新手活动|末日游荡者|丧尸|资源箭头|士气|士兵训练|训练设施)/u,
  /(?:希望工程|希望的灯火|黑市|活动日程|商店|研究|建筑|兵营|武器工坊|石油开采井|中心区|战场积分)/u,
];
const SEARCH_FAILURE_FOLLOWUP_RE = /^(?:\u8fd9\u4e5f\u4e0d\u77e5\u9053\u5417|\u8fd9\u90fd\u4e0d\u77e5\u9053\u5417|\u8fd9\u4e5f\u67e5\u4e0d\u5230\u5417|\u4e0d\u662f\u80fd\u8054\u7f51\u5417|\u4e0d\u662f\u80fd\u641c\u7d22\u5417|\u518d\u67e5(?:\u4e00\u4e0b)?|\u518d\u641c(?:\u4e00\u4e0b)?|\u91cd\u65b0\u67e5(?:\u4e00\u4e0b)?|\u91cd\u65b0\u641c(?:\u4e00\u4e0b)?|\u4f60\u518d\u67e5\u67e5|\u4f60\u518d\u641c\u641c|search again|try again|you don't know that\\??)$/iu;

const BOUND_GAME_REFERENCE_PATTERNS = [
  /(?:\u8fd9\u6b3e\u6e38\u620f|\u8fd9\u4e2a\u6e38\u620f|\u8fd9\u6e38\u620f|\u5f53\u524d\u7248\u672c|\u8fd9\u4e2a\u7248\u672c|\u8fd9\u7248\u672c)/u,
  /(?:\u56de\u5751|\u65b0\u624b\u5165\u95e8|\u65b0\u624b|\u5165\u95e8|\u600e\u4e48\u73a9|\u600e\u4e48\u5f00\u5c40|\u5f00\u5c40|\u53d1\u80b2|\u517b\u6210|\u63a8\u56fe|\u63a8\u5173|\u4e3b\u7ebf|\u9635\u5bb9|\u914d\u961f|\u8d44\u6e90|\u4f18\u5148\u517b|\u8be5\u505a\u4ec0\u4e48|\u6700\u503c\u5f97\u505a|\u503c\u5f97\u505a)/u,
];
const NON_GAME_CONTEXT_KEYWORDS = [
  /(?:\u4e16\u754c\u676f|nba|cba|\u8db3\u7403|\u7bee\u7403|\u51b3\u8d5b|\u534a\u51b3\u8d5b|\u5b63\u519b\u8d5b|\u8d5b\u7a0b|\u6bd4\u5206|\u51a0\u519b|\u4e9a\u519b)/iu,
  /(?:\u5929\u6c14|\u4e0b\u96e8|\u6c14\u6e29|\u98ce\u529b|\u53f0\u98ce|\u51b7\u7a7a\u6c14)/u,
  /(?:\u54c1\u724c|\u6c7d\u8f66|\u7279\u65af\u62c9|tesla|apple|openai|chatgpt|iphone)/iu,
  /(?:\u65b0\u80fd\u6e90|\u71c3\u6cb9\u8f66|\u7535\u52a8\u8f66)/u,
];
const ARTICLE_STYLE_GUIDE_QUERY_RE = /(?:\u653b\u7565|\u6307\u5357|\u73a9\u6cd5|\u89c4\u5219|\u673a\u5236|\u6559\u7a0b|\u4ecb\u7ecd|\u600e\u4e48\u73a9|\u600e\u4e48\u6253|guide|how to)/iu;

const ARTICLE_STYLE_GUIDE_QUERY_FALLBACK_RE = /(?:\u653b\u7565|\u6307\u5357|\u73a9\u6cd5|\u89c4\u5219|\u673a\u5236|\u6559\u7a0b|\u4ecb\u7ecd|\u600e\u4e48\u73a9|\u600e\u4e48\u6253)/u;
const PLANNING_OR_UI_NOISE_QUERY_RE = /(?:百科UI需求|基础攻略百科UI需求|产粮排期|攻略版式参考|攻略长图版式参考)/u;

function isArticleStyleGuideQuery(query) {
  return ARTICLE_STYLE_GUIDE_QUERY_FALLBACK_RE.test(String(query || '').trim());
}

function isPlanningOrUiNoiseQuery(query) {
  return PLANNING_OR_UI_NOISE_QUERY_RE.test(String(query || '').trim());
}

function isQuestionMarkCorrupted(value, minimumQuestionMarks = 3) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return false;

  const questionCount = (text.match(/[?\uFF1F]/g) || []).length;
  if (questionCount < minimumQuestionMarks) return false;

  const stripped = text.replace(/[\s?\uFF1F"'`\u201C\u201D\u2018\u2019()[\]{}<>.,，。；：!?+\-_=\\]+/gu, '');
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
    'SELECT role, content, refs_json FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT ?',
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
  return /^(?:guide title)\s*:/iu.test(String(line || '').trim());
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

const ZH_VARIANT_CHAR_PAIRS = [
  ['体', '體'], ['关', '關'], ['应', '應'], ['战', '戰'], ['伤', '傷'], ['输', '輸'],
  ['与', '與'], ['优', '優'], ['养', '養'], ['显', '顯'], ['装', '裝'], ['开', '開'],
  ['凑', '湊'], ['构', '構'], ['队', '隊'], ['点', '點'], ['斗', '鬥'], ['猎', '獵'],
  ['台', '臺'], ['为', '為'], ['于', '於'], ['围', '圍'], ['划', '劃'], ['压', '壓'],
  ['头', '頭'], ['盔', '盔'], ['阵', '陣'], ['发', '發'], ['会', '會'], ['个', '個'],
  ['种', '種'], ['达', '達'], ['获', '獲'], ['属', '屬'], ['数', '數'], ['类', '類'],
  ['后', '後'], ['负', '負'], ['责', '責'], ['专', '專'], ['总', '總'], ['绕', '繞'],
  ['规', '規'], ['适', '適'], ['补', '補'], ['选', '選'], ['强', '強'], ['满', '滿'],
  ['这', '這'], ['还', '還'], ['时', '時'], ['门', '門'], ['阶', '階'], ['气', '氣'],
  ['击', '擊'], ['灭', '滅'], ['术', '術'], ['备', '備'], ['转', '轉'], ['图', '圖'],
  ['网', '網'], ['讲', '講'], ['护', '護'], ['觉', '覺'], ['变', '變'], ['联', '聯'],
  ['杂', '雜'], ['经', '經'], ['级', '級'], ['练', '練'], ['荣', '榮'], ['营', '營'],
];

const ZH_SIMPLIFIED_ONLY_RE = new RegExp(`[${ZH_VARIANT_CHAR_PAIRS.map(pair => pair[0]).join('')}]`, 'gu');
const ZH_TRADITIONAL_ONLY_RE = new RegExp(`[${ZH_VARIANT_CHAR_PAIRS.map(pair => pair[1]).join('')}]`, 'gu');

function countRegexMatches(text, regex) {
  if (!regex) return 0;
  return (String(text || '').match(regex) || []).length;
}

function looksLikeJapaneseHanOnlyLine(text) {
  const line = String(text || '').trim();
  if (!line) return false;
  return /(?:同兵種\s*\d+\s*体|戦力\s*UP|編成バフ|最大限|引き出す|受け止める|後列|前列)/u.test(line);
}

function lineMatchesPreferredLocale(text, preferredLocale) {
  const line = String(text || '').trim();
  const locale = kbEntryLocales.normalizeLocale(preferredLocale);
  if (!line) return false;

  const hanCount = (line.match(/[\u4e00-\u9fff]/gu) || []).length;
  const kanaCount = (line.match(/[\u3040-\u30ff\u31f0-\u31ff]/gu) || []).length;
  const hangulCount = (line.match(/[\uac00-\ud7af]/gu) || []).length;
  const latinWordCount = (line.match(/[A-Za-z]+/g) || []).length;
  const traditionalOnlyCount = countRegexMatches(line, ZH_TRADITIONAL_ONLY_RE);
  const simplifiedOnlyCount = countRegexMatches(line, ZH_SIMPLIFIED_ONLY_RE);

  switch (locale) {
    case 'en-US':
      return latinWordCount >= 2 && hanCount === 0 && kanaCount === 0 && hangulCount === 0;
    case 'ja-JP':
      return kanaCount >= 1 || (hanCount >= 2 && hangulCount === 0);
    case 'ko-KR':
      return hangulCount >= 2;
    case 'zh-TW':
      return hanCount >= 2
        && kanaCount === 0
        && hangulCount === 0
        && !looksLikeJapaneseHanOnlyLine(line)
        && !(simplifiedOnlyCount >= 1 && simplifiedOnlyCount > traditionalOnlyCount)
        && simplifiedOnlyCount <= traditionalOnlyCount;
    case 'zh-CN':
    default:
      return hanCount >= 2
        && kanaCount === 0
        && hangulCount === 0
        && !looksLikeJapaneseHanOnlyLine(line)
        && !(traditionalOnlyCount >= 1 && traditionalOnlyCount > simplifiedOnlyCount)
        && traditionalOnlyCount <= simplifiedOnlyCount;
  }
}

function pickPreferredLocaleSegment(text, preferredLocale) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const segments = raw
    .split(/\s*\/\s*/u)
    .map(item => String(item || '').trim())
    .filter(Boolean);
  if (segments.length <= 1) return raw;

  const matchedSegments = segments.filter(segment => lineMatchesPreferredLocale(segment, preferredLocale));
  if (matchedSegments.length === 1 && matchedSegments.length < segments.length) {
    return matchedSegments[0];
  }

  return raw;
}

function trimMixedLocaleLead(text, preferredLocale) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (!/[\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/u.test(raw) || !/[A-Za-z]/.test(raw)) {
    return raw;
  }

  const latinIndex = raw.search(/[A-Za-z]/);
  if (latinIndex <= 0) return raw;

  const preferredLead = raw.slice(0, latinIndex).trim();
  if (preferredLead && lineMatchesPreferredLocale(preferredLead, preferredLocale)) {
    return preferredLead;
  }

  return raw;
}

function extractPrimaryKnowledgeLine(line, preferredLocale) {
  const text = normalizeDirectKnowledgeLine(line);
  if (!text) return '';

  const parsed = parseKnowledgeFieldLine(text);
  if (!parsed) {
    const preferredText = trimMixedLocaleLead(
      pickPreferredLocaleSegment(text, preferredLocale),
      preferredLocale
    );
    return lineMatchesPreferredLocale(preferredText, preferredLocale) ? preferredText : '';
  }

  if (isKnowledgeMetadataFieldLabel(parsed.label)) return '';

  const fieldLocale = getLocaleFieldLocale(parsed.label) || getSpreadsheetColumnLocale(parsed.label);
  if (fieldLocale && !isCompatibleLocale(preferredLocale, fieldLocale)) return '';

  const value = trimMixedLocaleLead(
    pickPreferredLocaleSegment(normalizeDirectKnowledgeLine(parsed.value), preferredLocale),
    preferredLocale
  );
  if (!value) return '';
  return lineMatchesPreferredLocale(value, preferredLocale) ? value : '';
}

function isAssetNoiseKnowledgeLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;

  if (/(?:icon的图标id|icon图标id|icon\s*id|图标id|图标编号|图标资源|资源id|asset\s*id)/iu.test(text)) {
    return true;
  }

  if (/(?:仅参考，不做材料|截图进行了标黄|截图查询地址|lang表地址|研发素材|素材网盘)/iu.test(text)) {
    return true;
  }

  return /^\*?(?:\u5982\u679c|\u82e5).{0,24}(?:icon|\u56fe\u6807).{0,24}(?:\u53ea\u5217|\u586b\u5199|\u63d0\u4f9b|\u4f7f\u7528)/iu.test(text);
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

const LOCALE_LABEL_TO_LOCALE = new Map([
  ['\u4e2d\u6587', 'zh-CN'],
  ['\u7b80\u4e2d', 'zh-CN'],
  ['\u7b80\u4f53', 'zh-CN'],
  ['\u7b80\u4f53\u4e2d\u6587', 'zh-CN'],
  ['simplified chinese', 'zh-CN'],
  ['chinese simplified', 'zh-CN'],
  ['chinese (simplified)', 'zh-CN'],
  ['zh', 'zh-CN'],
  ['zh-cn', 'zh-CN'],
  ['zh-hans', 'zh-CN'],
  ['cn', 'zh-CN'],
  ['\u82f1\u6587', 'en-US'],
  ['\u82f1\u8bed', 'en-US'],
  ['english', 'en-US'],
  ['en', 'en-US'],
  ['en-us', 'en-US'],
  ['en-gb', 'en-US'],
  ['\u7e41\u4e2d', 'zh-TW'],
  ['\u7e41\u4f53', 'zh-TW'],
  ['\u7e41\u9ad4', 'zh-TW'],
  ['\u7e41\u4f53\u4e2d\u6587', 'zh-TW'],
  ['\u7e41\u9ad4\u4e2d\u6587', 'zh-TW'],
  ['traditional chinese', 'zh-TW'],
  ['chinese traditional', 'zh-TW'],
  ['chinese (traditional)', 'zh-TW'],
  ['zh-tw', 'zh-TW'],
  ['zh-hant', 'zh-TW'],
  ['tw', 'zh-TW'],
  ['\u65e5\u8bed', 'ja-JP'],
  ['\u65e5\u6587', 'ja-JP'],
  ['\u65e5\u672c\u8a9e', 'ja-JP'],
  ['japanese', 'ja-JP'],
  ['ja', 'ja-JP'],
  ['ja-jp', 'ja-JP'],
  ['jp', 'ja-JP'],
  ['\u97e9\u8bed', 'ko-KR'],
  ['\u97e9\u6587', 'ko-KR'],
  ['\ud55c\uad6d\uc5b4', 'ko-KR'],
  ['korean', 'ko-KR'],
  ['ko', 'ko-KR'],
  ['ko-kr', 'ko-KR'],
  ['kr', 'ko-KR'],
]);

function normalizeLocaleLabelKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[\-\u2022*#\[\]\u3010\u3011()\uFF08\uFF09\s]+/u, '')
    .replace(/[:\uFF1A\s]+$/u, '')
    .replace(/[_\-\s]?\d+$/u, '')
    .trim();
}

function resolveLocaleLabel(value) {
  const normalized = normalizeLocaleLabelKey(value);
  if (!normalized) return '';
  return LOCALE_LABEL_TO_LOCALE.get(normalized) || '';
}

function getLocaleFieldLocale(label) {
  return resolveLocaleLabel(label);
}

function getSpreadsheetColumnLocale(label) {
  const normalized = String(label || '').trim().toUpperCase();
  switch (normalized) {
    case 'D':
      return 'en-US';
    case 'E':
      return 'zh-TW';
    case 'F':
      return 'ja-JP';
    case 'G':
      return 'ko-KR';
    default:
      return '';
  }
}

function getStandaloneLocaleLineLocale(line) {
  return resolveLocaleLabel(line);
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

  return /^(?:sheet|rows?|reference|context|guide title|status|publish time|asset path|category|row|module|project|notes?|remark|remarks|项目|模块|备注|分类|参考|素材地址|成图地址|百科链接|lang表地址|灯塔lang表地址|截图查询地址)$/iu.test(normalized);
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

function buildPrimaryKnowledgeLines(lines, preferredLocale) {
  return dedupeLines(
    (Array.isArray(lines) ? lines : [])
      .map(line => extractPrimaryKnowledgeLine(line, preferredLocale))
      .filter(Boolean)
  );
}

function extractStructuredRawKnowledgeLines(lines, preferredLocale) {
  return dedupeLines(
    (Array.isArray(lines) ? lines : [])
      .map((line) => {
        const normalized = normalizeDirectKnowledgeLine(line);
        if (!normalized) return '';
        if (isReplySkippedKnowledgeLine(line) || isReplySkippedKnowledgeLine(normalized)) return '';

        const parsed = parseKnowledgeFieldLine(normalized);
        if (parsed && isKnowledgeMetadataFieldLabel(parsed.label)) return '';

        const candidate = parsed
          ? (lineMatchesPreferredLocale(normalized, preferredLocale)
            ? normalized
            : pickPreferredLocaleSegment(normalizeDirectKnowledgeLine(parsed.value), preferredLocale))
          : normalized;
        if (!candidate || !lineMatchesPreferredLocale(candidate, preferredLocale)) return '';
        return looksLikeStructuredKnowledgeLine(candidate) ? candidate : '';
      })
      .filter(Boolean)
  );
}

function looksLikeStructuredKnowledgeLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (/^[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+[.\u3001]/u.test(text)) return true;
  if (/^\d+[.\u3001]/u.test(text)) return true;
  if (/^[^:\uFF1A\s][^:\uFF1A\n]{0,30}[:\uFF1A]\s*\S+/u.test(text)) return true;
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

  const aliasFieldLabels = new Set([
    'lastwar',
    '\u4f4d\u97622\u540d',
    '\u4f4d\u97622',
    '\u706f\u5854\u540d',
    '\u706f\u5854',
    '\u7a00\u6709\u7b49\u7ea7',
    '\u8bc4\u7ea7',
  ]);
  let aliasFieldCount = 0;
  let detailFieldCount = 0;
  let descriptiveSignalCount = 0;

  for (const line of lines) {
    const normalizedLine = normalizeDirectKnowledgeLine(line);
    if (!normalizedLine) continue;

    const parsed = parseKnowledgeFieldLine(line);
    if (!parsed) {
      if (/ \| /u.test(String(line || ''))) aliasFieldCount += 1;
      if (looksLikeStructuredKnowledgeLine(normalizedLine) && normalizedLine.length > 16) {
        descriptiveSignalCount += 1;
      }
      continue;
    }

    const normalizedLabel = parsed.label.toLowerCase();
    if (aliasFieldLabels.has(normalizedLabel)) {
      aliasFieldCount += 1;
      continue;
    }

    if (/(?:技能|台词|语音|阵营|职业|稀有度|定位|简介|介绍|背景)/u.test(parsed.label)) {
      detailFieldCount += 1;
      continue;
    }

    const normalizedValue = normalizeDirectKnowledgeLine(parsed.value);
    if (looksLikeStructuredKnowledgeLine(normalizedValue) && normalizedValue.length > 16) {
      descriptiveSignalCount += 1;
    }
  }

  return aliasFieldCount >= 2 && detailFieldCount === 0 && descriptiveSignalCount === 0;
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
      if (/(?:lastwar|位面2名称|位面2|灯塔名称|灯塔|别名|对照|映射|稀有等级|评级)/u.test(label)) {
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
  return /^(?:项目|中文|英文|日语|韩语|泰语|繁中|繁体|繁體|备注|附注|basic effects)$/iu.test(text);
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
  if (values.some(value => /[\d，。！？!?]/u.test(value))) return false;

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

// 从目录索引行里提取活动/系统名（如 "Sheet: 目录 Row: 33 新手活动: 军备竞赛 Arms Race" → "军备竞赛"），
// 用于 catalogOnlyKnowledge 时做二次 titleAnchor 搜索，定位到该活动的正文 sheet。
// 只取 query 里也出现的词，避免无意义发散。
function extractCatalogEntityNames(query, refs) {
  const queryText = String(query || '');
  if (!queryText) return [];
  const seen = new Set();
  const names = [];
  for (const ref of (Array.isArray(refs) ? refs : [])) {
    const text = getRefText(ref);
    if (!text || !/(?:^|\n)\s*sheet\s*:\s*目录/iu.test(text)) continue;
    // 匹配 "活动名: xxx" 或行内独立中文活动名
    const lines = splitDirectKnowledgeLines(text);
    for (const line of lines) {
      const clean = normalizeDirectKnowledgeLine(line).trim();
      if (!clean || isDirectKbMetadataLine(clean)) continue;
      // 提取冒号后的中文活动名，或行内出现的2-6字中文词
      const afterColon = /[:：]\s*([\u4e00-\u9fa5]{2,8})/u.exec(clean);
      if (afterColon && afterColon[1] && queryText.includes(afterColon[1])) {
        if (!seen.has(afterColon[1])) { seen.add(afterColon[1]); names.push(afterColon[1]); }
      }
      // 行内直接出现的活动名（query 子串）
      const inline = clean.match(/[\u4e00-\u9fa5]{2,8}/gu) || [];
      for (const word of inline) {
        if (word.length >= 3 && queryText.includes(word) && !seen.has(word)) {
          seen.add(word); names.push(word);
        }
      }
    }
  }
  return names.slice(0, 4);
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

function normalizeTitleMatchText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasLiteralTitleContainment(query, text) {
  const normalizedQuery = normalizeTitleMatchText(query);
  const normalizedText = normalizeTitleMatchText(text);
  if (!normalizedQuery || !normalizedText) return false;
  if (normalizedText.includes(normalizedQuery)) return true;
  if (/[\u4e00-\u9fff]/u.test(normalizedQuery) && normalizedQuery.length >= 4) {
    return normalizedQuery.includes(normalizedText);
  }
  return false;
}

function matchesKnowledgeTitle(query, text) {
  return ragContext.hasTitleStyleMatch(query, text) || hasLiteralTitleContainment(query, text);
}

function getRefMetadataPenalty(ref) {
  const explicitPenalty = Number(ref?.metadataPenalty);
  if (Number.isFinite(explicitPenalty) && explicitPenalty >= 0) return explicitPenalty;
  return ragContext.scoreMetadataPenalty(getRefText(ref));
}

function hasSubstantiveKnowledgeBody(ref) {
  const lines = splitDirectKnowledgeLines(getRefText(ref))
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isDirectKbMetadataLine(line))
    .filter(line => !isAssetNoiseKnowledgeLine(line))
    .filter(Boolean);
  if (lines.length === 0) return false;

  const proseCount = lines.filter(
    line => looksLikeStructuredKnowledgeLine(line) && /[，。；！？.!?]/u.test(line)
  ).length;
  const enumeratedCount = lines.filter(
    line => /^(?:[一二三四五六七八九十]+[、.]|\d+[.、]|[-*])\s*/u.test(line)
  ).length;
  const titleLikeCount = lines.filter(
    line => line.length >= 6 && line.length <= 48 && !/[:：]/u.test(line)
  ).length;

  return proseCount >= 2
    || enumeratedCount >= 2
    || (proseCount >= 1 && lines.length >= 4)
    || (titleLikeCount >= 1 && lines.length >= 5);
}

function isKnownPlanningOrUiNoiseRef(ref) {
  const text = getRefText(ref);
  if (!text) return false;

  const hardPlanningNoise = /(?:产出排期|百科UI需求|基础攻略百科UI需求|UI需求|攻略长图版式参考|攻略版式参考|长图版式参考|版式参考|预计产出时间|关联文档|资料网盘|贴文内容参考|期望带有的元素和设计方向|百科分类|攻略信息|内容主题|已做模板)/u.test(text)
    || /(?:\bschedule\b|ui\s*requirement|reference\s+doc|asset\s*path|publish\s*time|layout\s*reference)/iu.test(text)
    || (/\bUI\b/i.test(text) && /Context:/i.test(text))
    || (/\bUI\b/i.test(text) && /https?:\/\//i.test(text));
  if (hardPlanningNoise) return true;

  // 目录 sheet 的纯索引行（如 "Sheet: 目录 Row: 95 新手活动: 商店兌換建議 新秀挑战赛: 商店購買建議"）
  // 这类条目只是攻略目录的标题索引，没有正文内容，命中后会让 LLM 无素材可答导致输出崩坏，识别为噪声。
  if (/(?:^|\n)\s*sheet\s*:\s*目录(?![\u4e00-\u9fa5])/iu.test(text)) {
    // 如果除了元信息索引行，还有成段中文陈述句（含句号/分号），就保留；否则视为纯目录噪声。
    const prose = text.replace(/(?:^|\n)\s*sheet\s*:\s*目录[^\n]*\n?/iu, '')
      .replace(/\n+/g, ' ')
      .replace(/^\s*rows?\s*:\s*\d+(?:-\d+)?\s*/i, '');
    const hasProse = /[。；！？.!?]/u.test(prose);
    if (!hasProse) return true;
  }


  const softAssetNoise = /(?:icon的图标id|icon图标id|icon\s*id|图标id|图标编号|图标资源|素材网盘|id查询网盘|研发素材|ui素材)/iu.test(text);
  if (!softAssetNoise) return false;

  return !hasSubstantiveKnowledgeBody(ref);
}

function isAnswerableTitleBodyRef(query, ref) {
  return matchesKnowledgeTitle(query, getRefText(ref)) && scoreBodyStyleKnowledgeRef(ref) > 0;
}

function scoreBodyStyleKnowledgeRef(ref) {
  const lines = splitDirectKnowledgeLines(getRefText(ref))
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isDirectKbMetadataLine(line))
    .filter(Boolean);
  if (lines.length === 0) return -6;

  const proseCount = lines.filter(line => /[，。；！？.!?]/u.test(line) && looksLikeStructuredKnowledgeLine(line)).length;
  const enumeratedCount = lines.filter(line => /^(?:[一二三四五六七八九十]+[、.]|\d+[.、]|[-*])\s*/u.test(line)).length;
  const sectionCount = lines.filter(line => /^(?:【[^】\n]{1,24}】|\[[^\]\n]{1,24}\])$/u.test(line)).length;
  const metadataLikeCount = lines.filter(line => /^[^:\uFF1A]{1,20}[:\uFF1A]\s*\S+/u.test(line)).length;

  let score = 0;
  score += proseCount * 4;
  score += enumeratedCount * 3;
  score += sectionCount * 2;
  if (metadataLikeCount >= 3 && proseCount === 0 && enumeratedCount === 0) score -= 8;
  if (isKnownPlanningOrUiNoiseRef(ref)) score -= 24;
  if (isKnownJunkKnowledgeRef(ref)) score -= 18;
  return score;
}

function getRefIdentity(ref) {
  if (ref?.entryId != null) return `entry:${ref.entryId}`;
  if (ref?.id != null) return `id:${ref.id}`;
  return `text:${getRefText(ref)}`;
}

function prioritizeTitleMatchedRefs(query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return [];

  const titleMatched = refs.filter(ref => matchesKnowledgeTitle(query, getRefText(ref)));
  if (titleMatched.length === 0) return refs;

  const orderedTitleMatched = titleMatched
    .slice()
    .sort((left, right) => {
      const leftNoise = isKnownPlanningOrUiNoiseRef(left);
      const rightNoise = isKnownPlanningOrUiNoiseRef(right);
      if (leftNoise !== rightNoise) return leftNoise ? 1 : -1;

      const leftBody = scoreBodyStyleKnowledgeRef(left);
      const rightBody = scoreBodyStyleKnowledgeRef(right);
      if (leftBody !== rightBody) return rightBody - leftBody;

      const leftPenalty = getRefMetadataPenalty(left);
      const rightPenalty = getRefMetadataPenalty(right);
      if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;

      return Number(right?.lexicalScore || 0) - Number(left?.lexicalScore || 0);
    });

  const titleMatchedIds = new Set(orderedTitleMatched.map(getRefIdentity));
  return [
    ...orderedTitleMatched,
    ...refs.filter(ref => !titleMatchedIds.has(getRefIdentity(ref))),
  ];
}

function extractKnowledgeRefLocator(ref) {
  const lines = splitDirectKnowledgeLines(getRefText(ref));
  if (lines.length === 0) return null;

  let sheet = '';
  let row = null;
  for (const line of lines) {
    const text = String(line || '').trim();
    if (!text) continue;

    const sheetMatch = /^sheet\s*:\s*(.+)$/iu.exec(text);
    if (sheetMatch && !sheet) {
      sheet = String(sheetMatch[1] || '').trim().toLowerCase();
      continue;
    }

    const rowMatch = /^row(?:s)?\s*:\s*(\d+)/iu.exec(text);
    if (rowMatch && row == null) {
      row = Number(rowMatch[1]);
    }
  }

  if (!sheet && row == null) return null;
  return { sheet, row };
}

function isSameKnowledgeArticleNeighborhood(ref, anchorRef, maxDistance = 24) {
  const refDocumentId = Number(ref?.documentId);
  const anchorDocumentId = Number(anchorRef?.documentId);
  const refRowIndex = Number(ref?.rowIndex);
  const anchorRowIndex = Number(anchorRef?.rowIndex);
  if (
    Number.isFinite(refDocumentId)
    && Number.isFinite(anchorDocumentId)
    && refDocumentId === anchorDocumentId
    && Number.isFinite(refRowIndex)
    && Number.isFinite(anchorRowIndex)
  ) {
    return Math.abs(refRowIndex - anchorRowIndex) <= maxDistance;
  }

  const locator = extractKnowledgeRefLocator(ref);
  const anchorLocator = extractKnowledgeRefLocator(anchorRef);
  if (!locator || !anchorLocator) return false;
  if (!locator.sheet || !anchorLocator.sheet || locator.sheet !== anchorLocator.sheet) return false;
  if (locator.row == null || anchorLocator.row == null) return false;
  return Math.abs(locator.row - anchorLocator.row) <= maxDistance;
}

function preferForwardKnowledgeArticleRefs(refs, anchorRef) {
  if (!Array.isArray(refs) || refs.length === 0 || !anchorRef) return Array.isArray(refs) ? refs : [];

  const anchorIdentity = getRefIdentity(anchorRef);
  const anchorDocumentId = Number(anchorRef?.documentId);
  const anchorRowIndex = Number(anchorRef?.rowIndex);

  const forwardRefs = refs.filter((ref) => {
    if (getRefIdentity(ref) === anchorIdentity) return true;

    const refDocumentId = Number(ref?.documentId);
    const refRowIndex = Number(ref?.rowIndex);
    if (
      Number.isFinite(anchorDocumentId)
      && Number.isFinite(refDocumentId)
      && anchorDocumentId === refDocumentId
      && Number.isFinite(anchorRowIndex)
      && Number.isFinite(refRowIndex)
    ) {
      return refRowIndex >= anchorRowIndex;
    }

    return true;
  });

  return forwardRefs.length > 0 ? forwardRefs : refs;
}

function pickTitleAnchorRef(query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return null;

  const titleMatched = refs.filter(ref => matchesKnowledgeTitle(query, getRefText(ref)));
  if (titleMatched.length === 0) return null;

  const preferredTitleMatched = titleMatched.filter(
    ref => !isKnownPlanningOrUiNoiseRef(ref) || scoreBodyStyleKnowledgeRef(ref) > 0
  );
  const candidates = preferredTitleMatched.length > 0 ? preferredTitleMatched : titleMatched;

  const ragAnchor = typeof ragContext.pickTitleAnchorRef === 'function'
    ? ragContext.pickTitleAnchorRef(query, candidates)
    : null;

  return candidates
    .slice()
    .sort((left, right) => {
      const leftIsRagAnchor = ragAnchor && getRefIdentity(left) === getRefIdentity(ragAnchor);
      const rightIsRagAnchor = ragAnchor && getRefIdentity(right) === getRefIdentity(ragAnchor);
      if (leftIsRagAnchor !== rightIsRagAnchor) return leftIsRagAnchor ? -1 : 1;

      const leftNoise = isKnownPlanningOrUiNoiseRef(left);
      const rightNoise = isKnownPlanningOrUiNoiseRef(right);
      if (leftNoise !== rightNoise) return leftNoise ? 1 : -1;

      const leftBody = scoreBodyStyleKnowledgeRef(left);
      const rightBody = scoreBodyStyleKnowledgeRef(right);
      if (leftBody !== rightBody) return rightBody - leftBody;

      const leftPenalty = getRefMetadataPenalty(left);
      const rightPenalty = getRefMetadataPenalty(right);
      if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;

      const leftLexical = Number(left?.lexicalScore || 0);
      const rightLexical = Number(right?.lexicalScore || 0);
      if (leftLexical !== rightLexical) return rightLexical - leftLexical;

      return Number(right?.score || 0) - Number(left?.score || 0);
    })[0];
}

function looksLikeTranslationGlossaryKnowledgeLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return false;

  const normalizedLines = lines
    .map(line => normalizeDirectKnowledgeLine(line))
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean);
  if (normalizedLines.length < 2) return false;

  const parsedLines = normalizedLines
    .map(parseKnowledgeFieldLine)
    .filter(Boolean);
  const localeFieldCount = parsedLines.filter(item => isLocaleFieldLabel(item.label)).length;
  const itemFieldCount = parsedLines.filter(item => /^(?:项目|item|term)$/iu.test(String(item.label || '').trim())).length;
  const glossaryPairCount = normalizedLines.filter(
    line => /^[^:\uFF1A]{1,40}\s*-\s*[A-Za-z][^:\uFF1A]{1,40}\s*[:\uFF1A]\s*\S+/u.test(line)
  ).length;
  const proseCount = normalizedLines.filter(
    line => looksLikeStructuredKnowledgeLine(line) && /[，。；！？.!?]/u.test(line)
  ).length;

  if (proseCount > 0) return false;
  if (localeFieldCount >= 3) return true;
  if (itemFieldCount > 0 && localeFieldCount >= 2) return true;
  return glossaryPairCount >= 2;
}

function isTranslationGlossaryKnowledgeRef(ref) {
  const lines = splitDirectKnowledgeLines(getRefText(ref));
  return looksLikeTranslationGlossaryKnowledgeLines(lines);
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
  const gameplayScope = /(?:\u7ade\u6280\u573a|\u89d2\u6597\u573a|\u73a9\u6cd5|\u6a21\u5f0f|\u6d3b\u52a8|\u7cfb\u7edf|\u526f\u672c|\u5173\u5361|\u4e3b\u7ebf|\u8d5b\u5b63|\u6311\u6218|\u8054\u76df|\u8425\u5730|\u57fa\u5730|\u73a9\u6cd5\u4ecb\u7ecd|\u73a9\u6cd5\u8bf4\u660e)/u.test(text);

  if (/(?:\u53f0\u8bcd|\u8bed\u97f3|\u914d\u97f3|\u8bf4\u4e86\u4ec0\u4e48|\u539f\u8bdd)/u.test(text)) return 'quote';
  if (/(?:\u9635\u8425|\u6240\u5c5e\u9635\u8425)/u.test(text)) return 'faction';
  if (/(?:\u804c\u4e1a|\u5b9a\u4f4d|\u804c\u9636)/u.test(text)) return 'career';
  if (/(?:\u7a00\u6709\u5ea6|\u54c1\u7ea7|\u54c1\u8d28|\u8bc4\u7ea7)/u.test(text)) return 'rarity';
  if (/(?:\u6280\u80fd|\u57fa\u7840\u6548\u679c|\u4e00\u661f|\u4e8c\u661f|\u4e09\u661f|\u56db\u661f|\u4e94\u661f|\u5927\u62db|\u88ab\u52a8)/u.test(text)) return 'skill';
  if (/(?:\u7b80\u4ecb|\u4ecb\u7ecd|\u80cc\u666f|\u6545\u4e8b|\u8bbe\u5b9a|\u4eba\u8bbe)/u.test(text) && !gameplayScope) return 'profile';
  if (/(?:\u9635\u5bb9|\u914d\u961f|\u642d\u914d)/u.test(text)) return 'team';
  if (
    /(?:\u600e\u4e48\u6837|\u5982\u4f55|\u5389\u5bb3|\u5f3a\u4e0d\u5f3a|\u503c\u4e0d\u503c\u5f97|\u597d\u4e0d\u597d\u7528|\u80fd\u4e0d\u80fd\u7528|\u63a8\u8350\u5417)/u.test(text)
    && /(?:\u82f1\u96c4|\u89d2\u8272|\u8fd9\u4e2a\u82f1\u96c4|\u8fd9\u4e2a\u89d2\u8272)/u.test(text)
  ) {
    return 'hero_overview';
  }

  return 'general';
}

function extractKnowledgeQueryFocusTerms(query) {
  const text = String(query || '').trim();
  if (!text) return [];

  const terms = [];
  const push = (value) => {
    const normalized = String(value || '').trim();
    if (normalized && !terms.includes(normalized)) terms.push(normalized);
  };

  const explicitMatches = text.match(
    /(?:基础效果|技能详细|技能名称|技能[1-4]|[一二三四五]星效果|[一二三四五]星|[1-5]星效果|[1-5]星|阵营|职业|定位|稀有度|台词|语音|名称|简介|介绍|背景)/gu
  ) || [];
  explicitMatches.forEach(push);

  const itemMatch = /项目\s*[:：]?\s*([^\s，。！？!?]{1,16})/u.exec(text);
  if (itemMatch) push(itemMatch[1]);

  return terms;
}

function scoreRefFocusTermAlignment(ref, focusTerms = []) {
  if (!ref || !Array.isArray(focusTerms) || focusTerms.length === 0) return 0;

  const lines = splitDirectKnowledgeLines(getRefText(ref))
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean);
  if (lines.length === 0) return 0;

  let score = 0;
  for (const term of focusTerms) {
    const normalizedTerm = String(term || '').trim();
    if (!normalizedTerm) continue;

    for (const line of lines) {
      const parsed = parseKnowledgeFieldLine(line);
      const label = String(parsed?.label || '').trim();
      const value = String(parsed?.value || '').trim();
      const source = `${label} ${value} ${line}`.trim();

      if (!source.includes(normalizedTerm)) continue;

      score += 2;
      if (line.startsWith(`${normalizedTerm}：`) || line.startsWith(`${normalizedTerm}:`)) score += 8;
      if (value === normalizedTerm) score += 10;
      if (value.includes(normalizedTerm)) score += 6;
      if (/(?:项目|item)/iu.test(label) && value.includes(normalizedTerm)) score += 12;
      if (/(?:中文|basic effects|备注|note)/iu.test(label) && value) score += 3;
      if (/\d{2,}(?:\.\d+)?%?/u.test(source)) score += 2;
    }
  }

  return score;
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

    if (/(?:\u53f0\u8bcd|\u8bed\u97f3|\u914d\u97f3)/u.test(source)) signals.quote = true;
    if (/(?:\u9635\u8425|\u6240\u5c5e\u9635\u8425)/u.test(source)) signals.faction = true;
    if (/(?:\u804c\u4e1a|\u5b9a\u4f4d|\u804c\u9636)/u.test(source)) signals.career = true;
    if (/(?:\u7a00\u6709\u5ea6|\u54c1\u7ea7|\u54c1\u8d28|\u8bc4\u7ea7)/u.test(source)) signals.rarity = true;
    if (/(?:\u6280\u80fd|\u57fa\u7840\u6548\u679c|\u4e00\u661f|\u4e8c\u661f|\u4e09\u661f|\u56db\u661f|\u4e94\u661f|\u5927\u62db|\u88ab\u52a8)/u.test(source)) signals.skill = true;
    if (/(?:\u7b80\u4ecb|\u4ecb\u7ecd|\u80cc\u666f|\u6545\u4e8b|\u8bbe\u5b9a|\u4eba\u8bbe)/u.test(source)) signals.profile = true;
    if (/(?:\u9635\u5bb9|\u914d\u961f|\u642d\u914d|\u63a8\u8350\u9635\u5bb9)/u.test(source)) signals.team = true;
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

  filtered = filtered.filter((ref) => {
    const text = getRefText(ref);
    if (!text) return false;
    if (matchesKnowledgeTitle(query, text)) {
      return !isKnownPlanningOrUiNoiseRef(ref) || scoreBodyStyleKnowledgeRef(ref) > 0;
    }
    return !isKnownPlanningOrUiNoiseRef(ref) && !isKnownJunkKnowledgeRef(ref);
  });
  if (filtered.length === 0) return [];

  filtered = prioritizeTitleMatchedRefs(query, filtered);
  const earlyTitleAnchorRef = pickTitleAnchorRef(query, filtered);
  if (earlyTitleAnchorRef && isAnswerableTitleBodyRef(query, earlyTitleAnchorRef)) {
    const titleAnchoredRefs = filtered.filter(ref => (
      getRefIdentity(ref) === getRefIdentity(earlyTitleAnchorRef)
      || matchesKnowledgeTitle(query, getRefText(ref))
      || isSameKnowledgeArticleNeighborhood(ref, earlyTitleAnchorRef)
    ));
    if (titleAnchoredRefs.length > 0) {
      filtered = titleAnchoredRefs;
    }
  }

  const nonPlanningRefs = filtered.filter(ref => !isKnownPlanningOrUiNoiseRef(ref));
  if (nonPlanningRefs.length > 0) {
    filtered = nonPlanningRefs;
  }

  const bodyStyleRefs = filtered.filter(ref => scoreBodyStyleKnowledgeRef(ref) > 0);
  if (bodyStyleRefs.length > 0) {
    filtered = bodyStyleRefs;
  }

  const intent = getKnowledgeQueryIntent(query);
  const intentCompatible = filtered.filter(ref => isRefCompatibleWithQueryIntent(query, ref));
  if (intentCompatible.length > 0) {
    filtered = intentCompatible;
  } else if (intent === 'profile') {
    const strongAligned = filtered.filter(ref => hasStrongAnswerRefAlignment(query, ref));
    if (strongAligned.length > 0) filtered = strongAligned;
    else return [];
  } else if (intent !== 'general') {
    const titleFallbackRef = pickTitleAnchorRef(query, filtered);
    if (titleFallbackRef && isAnswerableTitleBodyRef(query, titleFallbackRef)) {
      filtered = [titleFallbackRef];
    } else {
      return [];
    }
  }

  const titleAnchorRef = pickTitleAnchorRef(query, filtered);
  const focusTerms = extractKnowledgeQueryFocusTerms(query);
  if (titleAnchorRef) {
    const anchoredRefs = preferForwardKnowledgeArticleRefs(filtered.filter(ref => (
      getRefIdentity(ref) === getRefIdentity(titleAnchorRef)
      || matchesKnowledgeTitle(query, getRefText(ref))
      || isSameKnowledgeArticleNeighborhood(ref, titleAnchorRef)
    )), titleAnchorRef);
    const nonGlossaryAnchoredRefs = anchoredRefs.filter(ref => !isTranslationGlossaryKnowledgeRef(ref));
    if (nonGlossaryAnchoredRefs.length > 0) filtered = nonGlossaryAnchoredRefs;
    else if (anchoredRefs.length > 0) filtered = anchoredRefs;

    const articleAnchoredRefs = filtered.filter(ref => (
      getRefIdentity(ref) === getRefIdentity(titleAnchorRef)
      || isSameKnowledgeArticleNeighborhood(ref, titleAnchorRef)
    ));
    if (articleAnchoredRefs.length >= 2) {
      const forwardArticleAnchoredRefs = preferForwardKnowledgeArticleRefs(articleAnchoredRefs, titleAnchorRef);
      const preferredArticleAnchoredRefs = forwardArticleAnchoredRefs.filter(
        ref => !isKnownPlanningOrUiNoiseRef(ref) || scoreBodyStyleKnowledgeRef(ref) > 0
      );
      const orderedArticleRefs = (preferredArticleAnchoredRefs.length > 0 ? preferredArticleAnchoredRefs : forwardArticleAnchoredRefs)
        .slice()
        .sort((left, right) => {
          const leftIsAnchor = getRefIdentity(left) === getRefIdentity(titleAnchorRef);
          const rightIsAnchor = getRefIdentity(right) === getRefIdentity(titleAnchorRef);
          if (leftIsAnchor !== rightIsAnchor) return leftIsAnchor ? -1 : 1;

          const leftBody = scoreBodyStyleKnowledgeRef(left);
          const rightBody = scoreBodyStyleKnowledgeRef(right);
          if (leftBody !== rightBody) return rightBody - leftBody;

          const leftRow = Number(left?.rowIndex);
          const rightRow = Number(right?.rowIndex);
          if (Number.isFinite(leftRow) && Number.isFinite(rightRow) && leftRow !== rightRow) {
            return leftRow - rightRow;
          }

          const leftPenalty = getRefMetadataPenalty(left);
          const rightPenalty = getRefMetadataPenalty(right);
          if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;
          return Number(right?.score || 0) - Number(left?.score || 0);
        })
        .slice(0, 12);

      if (intent === 'skill' && /(?:基础效果|[一二三四五1-5]星)/u.test(String(query || ''))) {
        const itemScopedRefs = orderedArticleRefs.filter(ref => /(?:^|\n)\s*项目\s*[:：]/iu.test(getRefText(ref)));
        if (itemScopedRefs.length > 0) {
          const itemScopedIds = new Set(itemScopedRefs.map(getRefIdentity));
          return [
            ...itemScopedRefs,
            ...orderedArticleRefs.filter(ref => !itemScopedIds.has(getRefIdentity(ref))),
          ];
        }
      }

      if (focusTerms.length > 0) {
        const exactFocusedRefs = orderedArticleRefs.filter(ref => (
          focusTerms.some(term => getRefText(ref).includes(term))
        ));
        if (exactFocusedRefs.length > 0) {
          const exactFocusedIds = new Set(exactFocusedRefs.map(getRefIdentity));
          return [
            ...exactFocusedRefs,
            ...orderedArticleRefs.filter(ref => !exactFocusedIds.has(getRefIdentity(ref))),
          ];
        }

        const focusedOrderedArticleRefs = orderedArticleRefs
          .map(ref => ({ ref, score: scoreRefFocusTermAlignment(ref, focusTerms) }))
          .sort((left, right) => {
            if (left.score !== right.score) return right.score - left.score;
            return Number(right.ref?.score || 0) - Number(left.ref?.score || 0);
          })
          .map(item => item.ref);
        return focusedOrderedArticleRefs;
      }

      return orderedArticleRefs;
    }
  }

  if (focusTerms.length > 0) {
    const scoredRefs = filtered
      .map(ref => ({ ref, score: scoreRefFocusTermAlignment(ref, focusTerms) }))
      .filter(item => item.score > 0);

    if (scoredRefs.length > 0) {
      const bestScore = Math.max(...scoredRefs.map(item => item.score));
      const focusedRefs = scoredRefs
        .filter(item => item.score === bestScore)
        .map(item => item.ref);
      const focusedIds = new Set(focusedRefs.map(getRefIdentity));
      const orderedFocusedRefs = focusedRefs
        .slice()
        .sort((left, right) => {
          const leftPenalty = getRefMetadataPenalty(left);
          const rightPenalty = getRefMetadataPenalty(right);
          if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;
          return Number(right?.score || 0) - Number(left?.score || 0);
        });

      if (titleAnchorRef) {
        const anchorId = getRefIdentity(titleAnchorRef);
        const sameArticleRefs = filtered.filter(ref => (
          getRefIdentity(ref) === anchorId
          || focusedIds.has(getRefIdentity(ref))
          || isSameKnowledgeArticleNeighborhood(ref, titleAnchorRef)
        ));
        if (sameArticleRefs.length > 0) {
          const seen = new Set();
          filtered = [
            ...orderedFocusedRefs,
            ...sameArticleRefs.filter(ref => !focusedIds.has(getRefIdentity(ref))),
          ].filter((ref) => {
            const identity = getRefIdentity(ref);
            if (seen.has(identity)) return false;
            seen.add(identity);
            return true;
          });
        } else {
          filtered = orderedFocusedRefs;
        }
      } else {
        filtered = orderedFocusedRefs;
      }
    }
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

  narrow(ref => (
    getRefMetadataPenalty(ref) < 12
    || matchesKnowledgeTitle(query, getRefText(ref))
  ));
  narrow((ref) => {
    const intentScore = Number(
      ref?.intentScore != null
        ? ref.intentScore
        : ragContext.scoreIntentAlignment(query, getRefText(ref))
    );
    return intentScore >= 0;
  });
  const nonGlossaryFiltered = filtered.filter(ref => !isTranslationGlossaryKnowledgeRef(ref));
  if (nonGlossaryFiltered.length > 0) filtered = nonGlossaryFiltered;

  const stronglyAligned = filtered.filter(ref => hasStrongAnswerRefAlignment(query, ref, { titleAnchorRef }));
  if (stronglyAligned.length > 0) {
    filtered = stronglyAligned;
  } else if (looksLikeConstraintStyleFollowup(query) || /[\uFF1F\u3002\u3001]/u.test(String(query || ''))) {
    filtered = [];
  }

  return filtered;
}

function shouldUseHeroAliasReply(query) {
  const text = String(query || '').trim();
  if (!text) return false;

  return /(?:瀵圭収|瀵瑰簲|鍒悕|鍙︿竴涓父鎴弢鍙︿竴涓増鏈瑋LastWar|鐏|浣嶉潰)/iu.test(text);
}

function getDirectKnowledgeReply(query, refs, preferredLocale = detectUserLocale(query)) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  if (hasOnlyHeaderOnlyRefs(refs)) return '';
  if (hasOnlyCatalogRefs(refs)) return '';

  const preferredRefs = refs.filter(isPreferredKnowledgeReplyRef);
  if (preferredRefs.length === 0) return '';

  const candidates = preferredRefs
    .filter(ref => !ragContext.isMetadataHeavyContent(ref.matchText || ref.snippet || ''))
    .filter(ref => !isKnownPlanningOrUiNoiseRef(ref) || isAnswerableTitleBodyRef(query, ref))
    .filter(ref => !isKnownJunkKnowledgeRef(ref));
  const baseRefs = (candidates.length > 0 ? candidates : preferredRefs)
    .filter(ref => !isKnownPlanningOrUiNoiseRef(ref) || isAnswerableTitleBodyRef(query, ref))
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

  const titleIndex = localizedLines.findIndex(line => matchesKnowledgeTitle(query, line));
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

function buildTitleAnchoredLiteralFallback(query, refs, preferredLocale = detectUserLocale(query)) {
  if (!Array.isArray(refs) || refs.length === 0) return '';

  const titleAnchorRef = pickTitleAnchorRef(query, refs);
  if (!titleAnchorRef) return '';

  const scopedRefs = refs
    .filter(ref => (
      getRefIdentity(ref) === getRefIdentity(titleAnchorRef)
      || isSameKnowledgeArticleNeighborhood(ref, titleAnchorRef)
    ))
    .slice()
    .sort((left, right) => {
      const leftRow = Number(left?.rowIndex);
      const rightRow = Number(right?.rowIndex);
      if (Number.isFinite(leftRow) && Number.isFinite(rightRow) && leftRow !== rightRow) {
        return leftRow - rightRow;
      }
      return Number(right?.score || 0) - Number(left?.score || 0);
    });

  const sourceRefs = preferForwardKnowledgeArticleRefs(
    scopedRefs.length > 0 ? scopedRefs : [titleAnchorRef],
    titleAnchorRef
  );
  const collected = [];
  const seen = new Set();

  for (const ref of sourceRefs) {
    const rawLines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(Boolean);
    const fallbackLines = extractStructuredRawKnowledgeLines(rawLines, preferredLocale);
    for (const line of fallbackLines) {
      const text = String(line || '').trim();
      if (!text || seen.has(text)) continue;
      if (matchesKnowledgeTitle(query, text) && text.length <= 48) continue;
      seen.add(text);
      collected.push(text);
      if (collected.length >= 8) break;
    }
    if (collected.length >= 8) break;
  }

  if (collected.length < 2) return '';
  return collected.join('\n');
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
    .filter(ref => (
      isPreferredKnowledgeReplyRef(ref)
      || matchesKnowledgeTitle(query, getRefText(ref))
    ))
    .filter(ref => !isKnownPlanningOrUiNoiseRef(ref) || isAnswerableTitleBodyRef(query, ref))
    .filter(ref => !isKnownJunkKnowledgeRef(ref));
  if (preferredRefs.length === 0) return '';

  const sourceRefs = preferredRefs.filter(ref => String(ref.matchText || ref.snippet || '').trim());
  const nonGlossarySourceRefs = sourceRefs.filter(ref => !isTranslationGlossaryKnowledgeRef(ref));
  const orderedSourceRefs = nonGlossarySourceRefs.length > 0 ? nonGlossarySourceRefs : sourceRefs;

  for (const ref of orderedSourceRefs) {
    const rawLines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isReplySkippedKnowledgeLine(line))
      .filter(Boolean);
    let lines = buildPrimaryKnowledgeLines(
      filterKnowledgeLinesByLocale(rawLines, preferredLocale),
      preferredLocale
    );
    const refTitleMatched = matchesKnowledgeTitle(query, getRefText(ref));
    const hasTitleMatchedLine = lines.some(line => matchesKnowledgeTitle(query, line));

    if (refTitleMatched && lines.filter(looksLikeStructuredKnowledgeLine).length < 2) {
      const fallbackLines = extractStructuredRawKnowledgeLines(rawLines, preferredLocale);
      if (fallbackLines.length > lines.length) lines = fallbackLines;
    }

    if (lines.length === 0) continue;
    if ((isHeaderOnlyKnowledgeLines(lines) || isCatalogOnlyKnowledgeLines(lines)) && !hasTitleMatchedLine) continue;
    if (!hasPreferredLocaleContent(lines, preferredLocale)) continue;

    const matchedIndexes = lines
      .map((line, index) => (
        matchesKnowledgeTitle(query, line) || ragContext.hasTokenOverlap(query, line)
          ? index
          : -1
      ))
      .filter(index => index >= 0);

    if (matchedIndexes.length === 0) {
      const structuredLineCount = lines.filter(looksLikeStructuredKnowledgeLine).length;
      if (!(refTitleMatched && structuredLineCount >= 2) && (!isGenericBeginnerGuide || !looksLikeGuideKnowledgeLines(lines))) continue;
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
      && /[:\uFF1A]/u.test(String(other || ''))
      && String(other || '').includes(text)
    ));
  });

  if (compacted.length < 2) {
    return buildTitleAnchoredLiteralFallback(query, orderedSourceRefs, preferredLocale);
  }
  return compacted.join('\n');
}

function isGuideSectionHeaderLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  return /^(?:\u3010[^\u3011\n]{1,24}\u3011|\[[^\]\n]{1,24}\])$/u.test(text);
}

function isGuideBodyLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (isGuideSectionHeaderLine(text)) return false;
  if (ragContext.isVisualAssetLikeContent(text)) return false;
  if (isReplySkippedKnowledgeLine(text)) return false;
  if (/^(?:sheet|rows?|reference|context|guide title|status|publish time|asset path|category)\s*:/iu.test(text)) {
    return false;
  }
  return looksLikeStructuredKnowledgeLine(text) || text.length >= 8;
}

function extractGuideReplyLine(line, preferredLocale, {
  preserveFieldLabel = false,
} = {}) {
  const text = normalizeDirectKnowledgeLine(line);
  if (!text) return '';

  const parsed = parseKnowledgeFieldLine(text);
  const label = String(parsed?.label || '').trim();
  const labelLooksEnumerated = /^[\d\u4e00-\u5341]+[.\u3001]/u.test(label) || /^\d+\s*$/u.test(label);
  if (parsed && !labelLooksEnumerated && !isKnowledgeMetadataFieldLabel(label)) {
    const fieldLocale = getLocaleFieldLocale(label) || getSpreadsheetColumnLocale(label);
    if (fieldLocale && !isCompatibleLocale(preferredLocale, fieldLocale)) {
      return '';
    }

    const value = pickPreferredLocaleSegment(normalizeDirectKnowledgeLine(parsed.value), preferredLocale);
    if (value && lineMatchesPreferredLocale(value, preferredLocale)) {
      return preserveFieldLabel ? `${label}：${value}` : value;
    }
  }

  const preferredText = pickPreferredLocaleSegment(text, preferredLocale);
  return lineMatchesPreferredLocale(preferredText, preferredLocale) ? preferredText : '';
}

function isGuideTitleBoundaryLine(line, query) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (isGuideSectionHeaderLine(text)) return false;
  const normalized = text
    .replace(/\s*[（(][^（）()\n]{0,24}[）)]\s*$/u, '')
    .trim();
  if (!normalized) return false;
  if (/^[\d\u4e00-\u5341]+[.\u3001]/u.test(normalized)) return false;
  if (matchesKnowledgeTitle(query, normalized)) return false;
  if (normalized.length > 36) return false;
  if (/\d/u.test(normalized)) return false;
  if (/(?:在|会|可|先|后|把|于|是|有|能|用|打|升|带|解锁|开启|挑战)/u.test(normalized)) return false;
  if (/[\uFF0C\u3002\uFF1B\uFF1A\uFF1F\uFF01!]/u.test(normalized)) return false;
  if (/(?:\u653b\u7565|\u6307\u5357|\u6559\u7a0b|\u73a9\u6cd5|\u89c4\u5219|\u673a\u5236|\u4ecb\u7ecd)$/u.test(normalized)) return true;
  if (/(?:\u7ade\u6280\u573a|\u6218\u573a|\u8054\u8d5b|\u9526\u6807\u8d5b|\u6d3b\u52a8|\u6a21\u5f0f|arena)/iu.test(normalized)) return true;
  if (/(?:arena|guide)$/iu.test(normalized)) return true;
  return false;
}

function isMajorKnowledgeSectionLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (isGuideSectionHeaderLine(text)) return true;
  return /^(?:\d+|[\u4e00-\u5341]+)[.\u3001]/u.test(text);
}

function isExpandedKnowledgeClosingLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  return /^(?:祝各位|祝大家|愿各位|希望这能帮到你|May all Commanders|Enjoy the battlefield|Let me know if you want)/iu.test(text);
}

function isExpandedKnowledgeBodyLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (isExpandedKnowledgeClosingLine(text)) return false;
  if (isGuideSectionHeaderLine(text) || isGuideBodyLine(text) || looksLikeStructuredKnowledgeLine(text)) return true;

  const parsed = parseKnowledgeFieldLine(text);
  if (parsed && !isKnowledgeMetadataFieldLabel(parsed.label)) return true;

  return text.length >= 12 && /[\u4e00-\u9fa5]/u.test(text);
}

function extractExpandedKnowledgeSectionKey(line) {
  const text = String(line || '').trim();
  if (!text) return '';

  const match = /^((?:\d+|[\u4e00-\u5341]+)[.\u3001])\s*([^：:\n]{1,20})/u.exec(text);
  if (!match) return '';

  const prefix = String(match[1] || '').trim();
  const title = String(match[2] || '')
    .replace(/\s+/gu, '')
    .replace(/[（(][^（）()\n]{0,20}[）)]/gu, '')
    .replace(/[+＋&＆=＝\-—]/gu, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/gu, '')
    .slice(0, 8)
    .trim();
  if (!title) return '';
  return `${prefix}|${title}`;
}

function countExpandedKnowledgeSectionSupport(lines, index) {
  const source = Array.isArray(lines) ? lines : [];
  let count = 0;

  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    const current = String(source[cursor] || '').trim();
    if (!current) continue;
    if (extractExpandedKnowledgeSectionKey(current)) break;
    if (isMajorKnowledgeSectionLine(current)) break;
    if (isExpandedKnowledgeBodyLine(current)) count += 1;
  }

  return count;
}

function scoreExpandedKnowledgeSectionLine(line, preferredLocale, supportCount = 0) {
  const text = String(line || '').trim();
  if (!text) return Number.NEGATIVE_INFINITY;

  let score = text.length;
  score += supportCount * 120;
  if (lineMatchesPreferredLocale(text, preferredLocale)) score += 200;
  if (/[，。；！？.!?]/u.test(text)) score += 20;
  if (/:|：/u.test(text)) score += 8;
  return score;
}

function pruneExpandedKnowledgeBodyLines(lines, preferredLocale) {
  const source = Array.isArray(lines) ? lines.map(line => String(line || '').trim()).filter(Boolean) : [];
  if (source.length === 0) return [];

  const selectedIndexByKey = new Map();
  source.forEach((line, index) => {
    const sectionKey = extractExpandedKnowledgeSectionKey(line);
    if (!sectionKey) return;

    const previousIndex = selectedIndexByKey.get(sectionKey);
    if (previousIndex == null) {
      selectedIndexByKey.set(sectionKey, index);
      return;
    }

    const previousScore = scoreExpandedKnowledgeSectionLine(
      source[previousIndex],
      preferredLocale,
      countExpandedKnowledgeSectionSupport(source, previousIndex)
    );
    const currentScore = scoreExpandedKnowledgeSectionLine(
      line,
      preferredLocale,
      countExpandedKnowledgeSectionSupport(source, index)
    );
    if (currentScore >= previousScore) {
      selectedIndexByKey.set(sectionKey, index);
    }
  });

  return source.filter((line, index) => {
    const sectionKey = extractExpandedKnowledgeSectionKey(line);
    if (!sectionKey) return true;
    return selectedIndexByKey.get(sectionKey) === index;
  });
}

function getTitleAnchoredKnowledgeReplyFromRefs(query, refs, {
  maxLines = EXPANDED_KB_REPLY_MAX_LINES,
  maxChars = EXPANDED_KB_REPLY_MAX_CHARS,
} = {}) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  if (hasOnlyHeroAliasMappingRefs(query, refs)) return '';
  if (hasOnlyHeaderOnlyRefs(refs)) return '';
  if (hasOnlyCatalogRefs(refs)) return '';

  const preferredLocale = detectUserLocale(query);
  const titleAnchorRef = pickTitleAnchorRef(query, refs);
  if (!titleAnchorRef) return '';

  const sameArticleRefs = refs
    .filter(ref => (
      getRefIdentity(ref) === getRefIdentity(titleAnchorRef)
      || isSameKnowledgeArticleNeighborhood(ref, titleAnchorRef)
    ))
    .filter(ref => !isKnownPlanningOrUiNoiseRef(ref) || getRefIdentity(ref) === getRefIdentity(titleAnchorRef))
    .filter(ref => !isTranslationGlossaryKnowledgeRef(ref))
    .slice()
    .sort((left, right) => {
      const leftIsAnchor = getRefIdentity(left) === getRefIdentity(titleAnchorRef);
      const rightIsAnchor = getRefIdentity(right) === getRefIdentity(titleAnchorRef);
      if (leftIsAnchor !== rightIsAnchor) return leftIsAnchor ? -1 : 1;

      const leftRow = Number(left?.rowIndex);
      const rightRow = Number(right?.rowIndex);
      if (Number.isFinite(leftRow) && Number.isFinite(rightRow) && leftRow !== rightRow) {
        return leftRow - rightRow;
      }

      return Number(right?.score || 0) - Number(left?.score || 0);
    });
  const forwardSameArticleRefs = preferForwardKnowledgeArticleRefs(sameArticleRefs, titleAnchorRef);
  if (forwardSameArticleRefs.length < 2) return '';

  const anchorLines = dedupeLines(
    filterKnowledgeLinesByLocale(
      splitDirectKnowledgeLines(titleAnchorRef.matchText || titleAnchorRef.snippet || ''),
      preferredLocale
    )
      .map(line => extractGuideReplyLine(line, preferredLocale, { preserveFieldLabel: true }))
      .filter(Boolean)
  );

  let titleLine = anchorLines.find(line => matchesKnowledgeTitle(query, line)) || '';
  titleLine = trimMixedLocaleLead(titleLine, preferredLocale);
  const bodyLines = [];
  const seen = new Set();
  let reachedNextGuide = false;

  for (const ref of forwardSameArticleRefs) {
    if (reachedNextGuide) break;
    const rawLines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isReplySkippedKnowledgeLine(line))
      .filter(Boolean);
    const lines = dedupeLines(
      filterKnowledgeLinesByLocale(rawLines, preferredLocale)
        .map(line => extractGuideReplyLine(line, preferredLocale, { preserveFieldLabel: true }))
        .filter(Boolean)
    );

    for (const rawLine of lines) {
      const line = String(rawLine || '').trim();
      if (!line) continue;
      if (!titleLine && matchesKnowledgeTitle(query, line)) titleLine = line;
      if (titleLine && line === titleLine) continue;
      if (matchesKnowledgeTitle(query, line)) continue;
      if (titleLine && isGuideTitleBoundaryLine(line, query)) {
        reachedNextGuide = true;
        break;
      }
      if (!isExpandedKnowledgeBodyLine(line)) continue;
      if (seen.has(line)) continue;
      seen.add(line);
      bodyLines.push(line);
    }
  }

  const refinedBodyLines = pruneExpandedKnowledgeBodyLines(bodyLines, preferredLocale);

  if (!titleLine) {
    titleLine = String(query || '').trim();
  }

  const sectionCount = refinedBodyLines.filter(isGuideSectionHeaderLine).length;
  const structuredCount = refinedBodyLines.filter(line => (
    isGuideSectionHeaderLine(line)
    || looksLikeStructuredKnowledgeLine(line)
    || /^[^:\uFF1A\s][^:\uFF1A\n]{0,30}[:\uFF1A]\s*\S+/u.test(String(line || '').trim())
  )).length;
  if (refinedBodyLines.length < 4) return '';
  if (sectionCount === 0 && structuredCount < 4) return '';

  const formatted = [titleLine];
  let usedChars = titleLine.length;
  let usedLines = 1;

  for (const line of refinedBodyLines) {
    const needsSpacer = isMajorKnowledgeSectionLine(line) && formatted[formatted.length - 1] !== '';
    const extraChars = line.length + 1 + (needsSpacer ? 1 : 0);
    const extraLines = 1 + (needsSpacer ? 1 : 0);
    if (usedLines + extraLines > maxLines && formatted.length > 1) break;
    if (usedChars + extraChars > maxChars && formatted.length > 1) break;
    if (needsSpacer) {
      formatted.push('');
      usedChars += 1;
      usedLines += 1;
    }
    formatted.push(line);
    usedChars += line.length + 1;
    usedLines += 1;
  }

  const compact = [];
  for (const line of formatted) {
    if (!line && compact[compact.length - 1] === '') continue;
    compact.push(line);
  }

  const reply = compact.join('\n').trim();
  return reply.split('\n').length >= 5 ? reply : '';
}

function buildDetailedGuideKnowledgeReplyFromRefs(query, refs) {
  if (!isArticleStyleGuideQuery(query)) return '';
  return getTitleAnchoredKnowledgeReplyFromRefs(query, refs, {
    maxLines: GUIDE_KB_REPLY_MAX_LINES,
    maxChars: GUIDE_KB_REPLY_MAX_CHARS,
  });
}

async function loadTitleAnchorNeighborhoodRefs(versionId, titleAnchorRef) {
  const normalizedVersionId = Number(versionId);
  const documentId = Number(titleAnchorRef?.documentId);
  const rowIndex = Number(titleAnchorRef?.rowIndex);
  if (!Number.isFinite(normalizedVersionId) || !Number.isFinite(documentId) || !Number.isFinite(rowIndex)) {
    return [];
  }

  const [rows] = await db.query(
    `SELECT id, document_id, row_index, content
       FROM knowledge_entries
      WHERE version_id=? AND document_id=? AND row_index BETWEEN ? AND ?
      ORDER BY row_index ASC`,
    [normalizedVersionId, documentId, Math.max(0, rowIndex - 24), rowIndex + 28]
  );

  return (Array.isArray(rows) ? rows : []).map(row => ({
    entryId: row.id,
    documentId: row.document_id,
    rowIndex: row.row_index,
    matchText: String(row.content || ''),
    snippet: String(row.content || ''),
    lexicalScore: 0,
    semanticScore: 0,
    score: 0,
  }));
}

async function loadDetailScopedKnowledgeRefs(versionId, query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return [];

  const titleAnchorRef = pickTitleAnchorRef(query, refs);
  if (!titleAnchorRef || !Number.isFinite(Number(versionId))) {
    return refs;
  }

  try {
    const neighborhoodRefs = await loadTitleAnchorNeighborhoodRefs(versionId, titleAnchorRef);
    if (neighborhoodRefs.length > 0) {
      return neighborhoodRefs;
    }
  } catch (err) {
    console.error('[chatService] load detail-scoped neighborhood failed:', err.message);
  }

  return refs;
}

async function getExpandedKnowledgeReply(versionIdOrQuery, queryOrRefs, maybeRefs) {
  const hasVersionId = typeof maybeRefs !== 'undefined';
  const versionId = hasVersionId ? versionIdOrQuery : null;
  const query = hasVersionId ? queryOrRefs : versionIdOrQuery;
  const refs = hasVersionId ? maybeRefs : queryOrRefs;

  if (!Array.isArray(refs) || refs.length === 0) return '';

  const titleAnchorRef = pickTitleAnchorRef(query, refs);
  if (!hasVersionId || !titleAnchorRef) {
    return getTitleAnchoredKnowledgeReplyFromRefs(query, refs);
  }

  try {
    const neighborhoodRefs = await loadTitleAnchorNeighborhoodRefs(versionId, titleAnchorRef);
    if (neighborhoodRefs.length > 0) {
      return getTitleAnchoredKnowledgeReplyFromRefs(query, neighborhoodRefs);
    }
  } catch (err) {
    console.error('[chatService] load title-anchor neighborhood failed:', err.message);
  }

  return getTitleAnchoredKnowledgeReplyFromRefs(query, refs);
}

async function getFocusedExpandedKnowledgeReply(versionId, query, refs, focusFragment) {
  const focus = String(focusFragment || '').trim();
  if (!focus || !Array.isArray(refs) || refs.length === 0) return '';

  const preferredLocale = detectUserLocale(query);
  const titleAnchorRef = pickTitleAnchorRef(query, refs);
  let sourceRefs = Array.isArray(refs) ? refs.slice() : [];

  if (titleAnchorRef && Number.isFinite(Number(versionId))) {
    try {
      const neighborhoodRefs = await loadTitleAnchorNeighborhoodRefs(versionId, titleAnchorRef);
      if (neighborhoodRefs.length > 0) {
        sourceRefs = neighborhoodRefs;
      }
    } catch (err) {
      console.error('[chatService] load focused title-anchor neighborhood failed:', err.message);
    }
  }

  if (titleAnchorRef) {
    sourceRefs = preferForwardKnowledgeArticleRefs(sourceRefs.filter(ref => (
      getRefIdentity(ref) === getRefIdentity(titleAnchorRef)
      || isSameKnowledgeArticleNeighborhood(ref, titleAnchorRef)
    )), titleAnchorRef);
  }

  const orderedRefs = sourceRefs
    .slice()
    .sort((left, right) => {
      const leftRow = Number(left?.rowIndex);
      const rightRow = Number(right?.rowIndex);
      if (Number.isFinite(leftRow) && Number.isFinite(rightRow) && leftRow !== rightRow) {
        return leftRow - rightRow;
      }
      return Number(right?.score || 0) - Number(left?.score || 0);
    });

  const normalizeRefLines = (ref) => {
    const rawLines = splitDirectKnowledgeLines(ref.matchText || ref.snippet || '')
      .filter(line => !isReplySkippedKnowledgeLine(line))
      .filter(Boolean);
    const localizedLines = filterKnowledgeLinesByLocale(rawLines, preferredLocale);
    return localizedLines
      .map(normalizeDirectKnowledgeLine)
      .filter(Boolean);
  };

  const titleLines = titleAnchorRef ? normalizeRefLines(titleAnchorRef) : [];
  const titleLine = titleLines.find(line => (
    !looksLikeStructuredKnowledgeLine(line)
    && line.length <= 32
    && !/[\u3002\uFF01\uFF1F!?]/u.test(line)
  )) || '';

  const picked = [];
  const seen = new Set();
  const addLine = (line) => {
    const text = String(line || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    picked.push(text);
  };

  if (titleLine) addLine(titleLine);

  const matchCandidates = [];
  orderedRefs.forEach((ref) => {
    const lines = normalizeRefLines(ref);
    if (lines.length === 0) return;

    lines.forEach((line, index) => {
      if (!line.includes(focus) && !ragContext.hasTokenOverlap(focus, line)) return;
      let score = 0;
      if (line.includes(focus)) score += 6;
      if (parseKnowledgeFieldLine(line)) score += 4;
      if (/\d{2,}(?:\.\d+)?%?/u.test(line)) score += 4;
      if (/阵容|技能|台词|稀有度|职业|阵营|基础效果|一星|二星|三星|四星|五星/u.test(line)) score += 2;
      matchCandidates.push({ ref, lines, matchIndex: index, score });
    });
  });

  if (matchCandidates.length === 0) {
    return picked.length >= 2 ? picked.join('\n') : '';
  }

  const bestScore = Math.max(...matchCandidates.map(item => item.score));
  matchCandidates
    .filter(item => item.score === bestScore)
    .forEach(({ lines, matchIndex }) => {
      for (let index = matchIndex - 1; index >= 0; index -= 1) {
        if (isMajorKnowledgeSectionLine(lines[index])) {
          addLine(lines[index]);
          break;
        }
      }

      for (let index = matchIndex - 1; index >= 0; index -= 1) {
        if (/^[\d\u4e00-\u5341]+[）).、]/u.test(lines[index])) {
          addLine(lines[index]);
          break;
        }
      }

      addLine(lines[matchIndex]);

      for (let index = matchIndex + 1; index < lines.length && index <= matchIndex + 2; index += 1) {
        const line = lines[index];
        if (isMajorKnowledgeSectionLine(line) || /^[\d\u4e00-\u5341]+[）).、]/u.test(line) || parseKnowledgeFieldLine(line)) {
          break;
        }
        addLine(line);
      }
    });

  return picked.length >= 2 ? picked.join('\n') : '';
}

async function getDetailedGuideKnowledgeReply(versionIdOrQuery, queryOrRefs, maybeRefs) {
  const hasVersionId = typeof maybeRefs !== 'undefined';
  const query = hasVersionId ? queryOrRefs : versionIdOrQuery;
  if (!isArticleStyleGuideQuery(query)) return '';
  return getExpandedKnowledgeReply(versionIdOrQuery, queryOrRefs, maybeRefs);
}

function parseKnowledgeFieldLine(line) {
  const match = /^\s*([^:\uFF1A]{1,30})\s*[:\uFF1A]\s*(.+?)\s*$/u.exec(String(line || '').trim());
  if (!match) return null;
  return {
    label: match[1].trim(),
    value: match[2].trim(),
  };
}

function getHeroAliasReply(query, refs) {
  if (!shouldUseHeroAliasReply(query)) return '';
  if (!Array.isArray(refs) || refs.length === 0) return '';

  const preferredOrder = ['\u7a00\u6709\u5ea6', '\u8bc4\u7ea7', 'LastWar', '\u4f4d\u97622\u540d\u79f0', '\u4f4d\u97622', '\u706f\u5854\u540d\u79f0', '\u706f\u5854'];
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
    .map(label => (fields.has(label) ? `${label}\uff1a${fields.get(label)}` : ''))
    .filter(Boolean);

  const aliasCount = orderedLines.filter(line => /(?:LastWar|\u4f4d\u97622|\u706f\u5854)/u.test(line)).length;
  if (aliasCount < 2) return '';

  return `\u53ea\u547d\u4e2d\u5230\u540d\u79f0\u5bf9\u7167\uff1a\n${orderedLines.join('\n')}`;
}

function isGenericTrailingFollowupLine(line, locale) {
  const text = String(line || '').trim();
  if (!text) return false;
  const compactText = text.replace(/\s+/gu, '');

  if (
    /(?:\u5982\u679c\u60f3\u4e86\u89e3|还想了解|\u60f3\u8fdb\u4e00\u6b65\u4e86\u89e3).*(?:\u7ee7\u7eed\u95ee|\u518d\u95ee)/u.test(compactText)
    || /(?:\u5177\u4f53\u7cfb\u7edf|\u67d0\u4e2a\u7cfb\u7edf|\u4e0d\u61c2).*(?:\u7ee7\u7eed\u95ee|\u518d\u95ee)/u.test(compactText)
    || /(?:\u4e86\u89e3|\u4e0d\u61c2).*(?:\u7ee7\u7eed\u95ee|\u518d\u95ee)/u.test(compactText)
    || /(?:\u54ea\u4e2a|\u54ea\u5757|\u54ea\u90e8\u5206).*(?:\u4e0d\u6e05\u695a|\u4e0d\u660e\u767d).*(?:\u7ee7\u7eed\u95ee|\u518d\u95ee)/u.test(compactText)
    || /\u9700\u8981\u7684\u8bdd\u6211\u53ef\u4ee5.*(?:\u7ee7\u7eed)?.*(?:\u8865\u5145|\u8be6\u7ec6\u8bf4\u660e)/u.test(compactText)
  ) {
    return true;
  }

  switch (kbEntryLocales.normalizeLocale(locale)) {
    case 'en-US':
      return /^(?:would you like\b.*|if you want\b.*i can\b.*|let me know if you want\b.*|want details on any specific part\b.*|feel free to ask\b.*|ask about any specific .*you want to dig into\b.*)$/iu.test(text);
    case 'ja-JP':
      return /^(?:\u3082\u3063\u3068\u77e5\u308a\u305f\u3044\u70b9\u306f\u3042\u308a\u307e\u3059\u304b|必要なら.*補足できます|必要であれば.*補足できます)$/u.test(text);
    case 'ko-KR':
      return /^(?:\ub354 \uc54c\uace0 \uc2f6\uc740 \ub0b4\uc6a9\uc774 \uc788\uc73c\uc2e0\uac00\uc694|필요하면.*보충해 드릴게요|원하시면.*더 자세히 설명해 드릴게요)$/u.test(text);
    case 'zh-TW':
      return /^(?:還想了解什麼|想進一步了解.*|如果你還想了解.*|需要的話我可以再補充.*)$/u.test(text);
    case 'zh-CN':
    default:
      return /^(?:还想了解什么|想进一步了解.*|如果你还想了解.*|需要的话我可以再补充.*)$/u.test(text);
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
  if (/[:：。！？，；;.!?]$/u.test(text)) return false;
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

function shouldCollapseKbSectionBlocks(reply, query, locale) {
  const lines = String(reply || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => String(line || '').trim())
    .filter(Boolean);
  if (lines.length <= 2) return true;

  const titleMatchedFirstLine = lines[0] && matchesKnowledgeTitle(query, lines[0]);
  const majorSectionCount = lines.filter(isMajorKnowledgeSectionLine).length;
  const guideHeaderCount = lines.filter(isGuideSectionHeaderLine).length;
  const numberedSubpointCount = lines.filter(line => /^(?:\d+|[\u4e00-\u5341]+)[)）]/u.test(line)).length;
  const bulletCount = lines.filter(line => /^[-*+]\s+/u.test(line)).length;

  if (titleMatchedFirstLine && lines.length >= 4) return false;
  if (guideHeaderCount >= 1) return false;
  if (majorSectionCount >= 2) return false;
  if (numberedSubpointCount >= 2) return false;
  if (bulletCount >= 3) return false;
  if (lines.length >= 8) return false;

  return true;
}

function collapseKbSectionBlocks(reply, locale) {
  const lines = String(reply || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const collapsed = [];

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = String(lines[index] || '');
    const currentText = currentLine.trim();

    if (
      !isLikelyKbSectionLabel(currentText, locale)
      || /[:：]/u.test(currentText)
    ) {
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
      if (
        isGuideSectionHeaderLine(bodyText)
        || isMajorKnowledgeSectionLine(bodyText)
        || /^(?:\d+|[\u4e00-\u5341]+)[)）]/u.test(bodyText)
      ) {
        break;
      }
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
  // 剥离从知识库 contextBlock 泄漏到回答里的独立元信息行，如 "Sheet: 末日危城"、"Row: 125"、"Rows: 4-22"。
  // 只删独立成行的元信息标签，行内自然出现的不动，避免误伤正文。
  const stripped = String(reply || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => String(line || '').trim())
    .filter(line => line && !/^(?:sheet|rows?|reference|context|guide\s+title|status|publish\s*time|asset\s*path|category)\s*:/i.test(line))
    .join('\n');
  return stripped
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function isFieldScopedKnowledgeReply(reply) {
  const lines = splitDirectKnowledgeLines(reply)
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean);
  if (lines.length < 2) return false;

  const parsedLines = lines
    .map(parseKnowledgeFieldLine)
    .filter(Boolean);

  if (parsedLines.length < 2) return false;

  return parsedLines.some(({ label }) => (
    /(?:项目|item|中文|英文|日语|韩语|泰语|繁中|繁体|繁體|备注|附注|note|阵营|职业|定位|稀有度|台词|语音|基础效果|技能[1-4])/iu.test(String(label || '').trim())
  ));
}

function humanizeFieldScopedKnowledgeReply(query, draftReply, preferredLocale = detectUserLocale(query)) {
  const lines = splitDirectKnowledgeLines(draftReply)
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean);
  if (lines.length === 0) return '';

  const fields = lines
    .map(parseKnowledgeFieldLine)
    .filter(Boolean);
  if (fields.length < 2) return '';

  const subjectTitle = extractGenericSubjectCandidate(query);
  const skillScopedSubjectTitle = (
    getKnowledgeQueryIntent(query) === 'skill'
    && subjectTitle.includes(' ')
  )
    ? subjectTitle.split(/\s+/).filter(Boolean).slice(-1)[0]
    : '';
  const itemField = fields.find(({ label }) => /(?:项目|item)/iu.test(String(label || '').trim()));
  const itemValue = sanitizeKnowledgeBodyLine(itemField?.value || '');
  const prefersItemScopedTitle = (
    itemValue
    && subjectTitle
    && subjectTitle !== itemValue
    && subjectTitle.includes(itemValue)
    && getKnowledgeQueryIntent(query) === 'skill'
  );
  const titleLine = (prefersItemScopedTitle ? itemValue : (skillScopedSubjectTitle || subjectTitle)) || lines.find(line => (
    !parseKnowledgeFieldLine(line)
    && !looksLikeStructuredKnowledgeLine(line)
    && line.length <= 24
    && !isPlainLatinNoiseLine(line, preferredLocale)
  )) || '';

  const normalizedLocale = kbEntryLocales.normalizeLocale(preferredLocale);
  const localeFieldMatchers = {
    'zh-CN': /^(?:中文|简中|简体|基础效果|basic effects)$/iu,
    'zh-TW': /^(?:繁中|繁体|繁體|中文|基础效果|basic effects)$/iu,
    'en-US': /^(?:英文|english|basic effects)$/iu,
    'ja-JP': /^(?:日语|日文|japanese)$/iu,
    'ko-KR': /^(?:韩语|韩文|korean)$/iu,
    'th-TH': /^(?:泰语|泰文|thai)$/iu,
  };
  const localeMatcher = localeFieldMatchers[normalizedLocale] || localeFieldMatchers['zh-CN'];
  const metaFieldMatcher = /(?:项目|item|备注|附注|note|对应位置|sheet|row)/iu;
  const directAnswerFieldMatcher = /(?:阵营|职业|定位|稀有度|台词|语音|技能[1-4]|技能一|技能二|技能三|技能四|基础效果)/u;

  const localizedField = fields.find(({ label }) => localeMatcher.test(String(label || '').trim()));
  const directField = fields.find(({ label }) => directAnswerFieldMatcher.test(String(label || '').trim()));
  const fallbackField = fields.find(({ label, value }) => {
    const normalizedLabel = String(label || '').trim();
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue || metaFieldMatcher.test(normalizedLabel)) return false;
    return true;
  });

  const primaryField = localizedField || directField || fallbackField;
  if (!primaryField) return '';

  const bodyLabel = String(primaryField.label || '').trim();
  const bodyValue = sanitizeKnowledgeBodyLine(primaryField.value);
  if (!bodyValue) return '';

  if (/^(?:中文|简中|简体|繁中|繁体|繁體|英文|english|日语|日文|韩语|韩文|泰语|泰文|basic effects|基础效果)$/iu.test(bodyLabel)) {
    if (titleLine && itemValue) return `${titleLine}的${itemValue}是：${bodyValue}`;
    if (itemValue) return `${itemValue}是：${bodyValue}`;
    if (titleLine) return `${titleLine}：${bodyValue}`;
    return bodyValue;
  }

  if (titleLine) {
    return `${titleLine}的${bodyLabel}是：${bodyValue}`;
  }

  if (itemValue) {
    return `${itemValue}的${bodyLabel}是：${bodyValue}`;
  }

  return `${bodyLabel}：${bodyValue}`;
}

function looksLikeMechanicalKnowledgeDump(reply) {
  const lines = splitDirectKnowledgeLines(reply).filter(Boolean);
  if (lines.length < 3) return false;

  const parsedCount = lines.filter(line => !!parseKnowledgeFieldLine(line)).length;
  const structuredCount = lines.filter(looksLikeStructuredKnowledgeLine).length;
  const titleishCount = lines.filter(line => !/[，。！？.!?]/u.test(String(line || '').trim())).length;
  const pipeSignal = lines.filter(line => String(line || '').includes(' | ')).length;

  return (
    structuredCount >= 3
    && (parsedCount >= 2 || pipeSignal > 0 || titleishCount >= 2)
  );
}

function sanitizeKnowledgeBodyLine(line) {
  return String(line || '')
    .replace(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/u, '$1')
    .replace(/\*\*/gu, '')
    .replace(/__/gu, '')
    .replace(/^[-*+]+(?:\s*[-*+]+)*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildKnowledgeLeadFromQuery(query, titleLine) {
  const normalizedQuery = String(query || '')
    .replace(/[?!.,\u3002\uFF1F\uFF01]+$/u, '')
    .trim();

  if (normalizedQuery && normalizedQuery.length <= 26 && !/[,:;\uFF1A]/u.test(normalizedQuery)) {
    return `${normalizedQuery}\u4e3b\u8981\u770b\u8fd9\u51e0\u70b9\uff1a`;
  }

  const normalizedTitle = sanitizeKnowledgeBodyLine(titleLine)
    .replace(/[,:\uFF1A]+$/u, '')
    .trim();
  if (normalizedTitle && normalizedTitle.length <= 24) {
    return `${normalizedTitle}\u53ef\u4ee5\u5148\u6293\u8fd9\u51e0\u70b9\uff1a`;
  }

  return '\u53ef\u4ee5\u5148\u6293\u8fd9\u51e0\u70b9\uff1a';
}

function humanizeKnowledgeDraftReply(query, draftReply, preferredLocale = detectUserLocale(query)) {
  const normalizedDraft = normalizeKbGroundedReply(trimGenericTrailingFollowup(draftReply, preferredLocale));
  if (!normalizedDraft) return '';

  if (isFieldScopedKnowledgeReply(normalizedDraft)) {
    const fieldScopedReply = humanizeFieldScopedKnowledgeReply(query, normalizedDraft, preferredLocale);
    if (fieldScopedReply) return fieldScopedReply;
  }

  const normalizedQuery = String(query || '').replace(/[?!.,\u3002\uFF1F\uFF01]+$/u, '').trim();

  const rawLines = splitDirectKnowledgeLines(normalizedDraft)
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean);
  if (rawLines.length === 0) return normalizedDraft;

  const localizedLines = filterKnowledgeLinesByLocale(rawLines, preferredLocale);
  const primaryLines = buildPrimaryKnowledgeLines(localizedLines, preferredLocale);
  const sourceLines = primaryLines.length >= 2 ? primaryLines : localizedLines;
  const lines = dedupeLines(sourceLines).filter(Boolean);
  if (lines.length === 0) return normalizedDraft;

  let titleLine = '';
  const bodyLines = [];
  for (const rawLine of lines) {
    const line = sanitizeKnowledgeBodyLine(rawLine);
    if (!line) continue;

    if (
      !titleLine
      && (
        matchesKnowledgeTitle(query, line)
        || (
          !looksLikeStructuredKnowledgeLine(line)
          && line.length <= 28
          && !/[\u3002\uFF01\uFF1F!?]/u.test(line)
        )
      )
    ) {
      titleLine = line;
      continue;
    }

    const parsed = parseKnowledgeFieldLine(line);
    if (parsed && !isKnowledgeMetadataFieldLabel(parsed.label)) {
      const label = String(parsed.label || '').trim();
      const value = sanitizeKnowledgeBodyLine(parsed.value);
      if (!value) continue;
      if (/^[\d\u4e00-\u5341]+[.\u3001]?$/u.test(label)) {
        bodyLines.push(value);
      } else if (/^[\d\u4e00-\u5341]+[.\u3001]/u.test(label)) {
        bodyLines.push(`${label} ${value}`.trim());
      } else {
        bodyLines.push(`${label}: ${value}`);
      }
      continue;
    }

    bodyLines.push(line);
  }

  const compactBody = dedupeLines(
    bodyLines
      .map(line => sanitizeKnowledgeBodyLine(line))
      .filter(Boolean)
      .filter(line => !titleLine || line !== titleLine)
      .filter(line => !isLikelyKbSectionLabel(line, preferredLocale))
  );
  if (compactBody.length === 0) return titleLine || normalizedDraft;

  const intro = buildKnowledgeLeadFromQuery(query, titleLine);
  const heading = normalizedQuery && normalizedQuery.length <= 32 ? normalizedQuery : '';
  const summaryLines = compactBody.slice(0, 4);

  if (summaryLines.length === 1) {
    const body = intro ? `${intro}${summaryLines[0]}` : summaryLines[0];
    return heading && !body.includes(heading) ? `${heading}\n${body}` : body;
  }

  if (summaryLines.length <= 3) {
    const body = summaryLines
      .map(line => line.replace(/[\u3002\uff1b;]+$/u, '').trim())
      .filter(Boolean)
      .join('\uFF1B');
    const prose = body ? `${intro}${body}\u3002` : intro;
    return heading && prose && !prose.includes(heading) ? `${heading}\n${prose}` : prose;
  }

  const bullets = summaryLines.map(line => `- ${line}`).join('\n');
  const body = intro ? `${intro}\n${bullets}` : bullets;
  return heading && !body.includes(heading) ? `${heading}\n${body}` : body;
}

function shouldPreserveExpandedKnowledgeDraft(draftReply) {
  const draft = String(draftReply || '').trim();
  if (!draft) return false;

  const lines = splitDirectKnowledgeLines(draft).filter(Boolean);
  if (lines.length === 0) return false;

  const structuredCount = lines.filter(
    line => looksLikeStructuredKnowledgeLine(line) || isGuideSectionHeaderLine(line)
  ).length;

  return (
    lines.length >= 8
    || draft.length >= 500
    || structuredCount >= 5
  );
}

function shouldKeepExpandedKnowledgeRewrite(draftReply, rewrittenReply) {
  const draft = String(draftReply || '').trim();
  const rewritten = String(rewrittenReply || '').trim();
  if (!draft || !rewritten) return false;

  const draftLines = splitDirectKnowledgeLines(draft).filter(Boolean);
  const rewrittenLines = splitDirectKnowledgeLines(rewritten).filter(Boolean);
  const draftMajorCount = draftLines.filter(isMajorKnowledgeSectionLine).length;
  const rewrittenStructuredCount = rewrittenLines.filter(
    line => isMajorKnowledgeSectionLine(line) || /^[-*]\s+/u.test(String(line || '').trim())
  ).length;

  if (draft.length >= 450 && rewritten.length < Math.min(280, Math.round(draft.length * 0.45))) {
    return false;
  }
  if (draftLines.length >= 10 && rewrittenLines.length < 6) {
    return false;
  }
  if (draftMajorCount >= 3 && rewrittenStructuredCount < 3) {
    return false;
  }

  return true;
}

function shouldKeepFocusedFollowupRewrite(draftReply, rewrittenReply, focusFragment) {
  const draft = String(draftReply || '').trim();
  const rewritten = String(rewrittenReply || '').trim();
  const focus = String(focusFragment || '').trim();
  if (!draft || !rewritten || !focus) return true;

  const draftLines = splitDirectKnowledgeLines(draft)
    .map(normalizeDirectKnowledgeLine)
    .filter(Boolean);
  const focusLines = draftLines.filter(line => (
    line.includes(focus) || ragContext.hasTokenOverlap(focus, line)
  ));
  if (focusLines.length === 0) return true;

  if (!rewritten.includes(focus) && !ragContext.hasTokenOverlap(focus, rewritten)) {
    return false;
  }

  const numericTokens = [...new Set(
    focusLines.flatMap(line => String(line).match(/\d{2,}(?:\.\d+)?%?/g) || [])
  )];
  if (numericTokens.length > 0 && !numericTokens.some(token => rewritten.includes(token))) {
    return false;
  }

  return true;
}

function isPlainLatinNoiseLine(text, preferredLocale) {
  const line = String(text || '').trim();
  const locale = kbEntryLocales.normalizeLocale(preferredLocale);
  if (!line || locale === 'en-US') return false;
  if (!/[A-Za-z]/.test(line)) return false;
  if (/[\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/u.test(line)) return false;
  if (/^\d+(?:[.)、]|%|x)?$/u.test(line)) return false;
  if (/^(?:S\+|S|A|B|C|SSR|SR|R)$/iu.test(line)) return false;
  return true;
}

function pruneReplyLocaleNoise(reply, query, locale) {
  const source = String(reply || '').replace(/\r\n/g, '\n');
  if (!source.trim()) return '';

  const preferredLocale = kbEntryLocales.normalizeLocale(locale || detectUserLocale(query));
  const rawLines = source.split('\n');
  const kept = [];

  rawLines.forEach((rawLine, index) => {
    const line = String(rawLine || '').trimEnd();
    const text = line.trim();
    if (!text) {
      if (kept.length > 0 && kept[kept.length - 1] !== '') kept.push('');
      return;
    }

    if (
      index === 0
      || matchesKnowledgeTitle(query, trimMixedLocaleLead(text, preferredLocale))
      || (
        !/[\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/u.test(text)
        && !isPlainLatinNoiseLine(text, preferredLocale)
      )
    ) {
      kept.push(text);
      return;
    }

    const parsed = parseKnowledgeFieldLine(text);
    const value = parsed && !isKnowledgeMetadataFieldLabel(parsed.label)
      ? String(parsed.value || '').trim()
      : '';
    if (
      lineMatchesPreferredLocale(text, preferredLocale)
      || (value && lineMatchesPreferredLocale(value, preferredLocale))
    ) {
      kept.push(text);
    }
  });

  while (kept.length > 0 && !kept[kept.length - 1]) {
    kept.pop();
  }

  const pruned = kept.join('\n').trim();
  return pruned || source.trim();
}

function postProcessAssistantReply(reply, query, refs, locale) {
  let output = trimGenericTrailingFollowup(reply, locale);
  const articleStyleGuideQuery = isArticleStyleGuideQuery(query);

  if (Array.isArray(refs) && refs.length > 0) {
    output = stripStandaloneMarkdownEmphasis(output);
    output = stripInlineMarkdownEmphasis(output);
    if (!articleStyleGuideQuery && shouldCollapseKbSectionBlocks(output, query, locale)) {
      output = collapseKbSectionBlocks(output, locale);
    }
    output = normalizeKbGroundedReply(output);
    output = pruneReplyLocaleNoise(output, query, locale);
  }

  if (ragContext.isGenericBeginnerGuideQuery(query) && Array.isArray(refs) && refs.length > 0) {
    output = stripSimpleMarkdownScaffold(output);
    output = normalizeKbGroundedReply(output);
    output = pruneReplyLocaleNoise(output, query, locale);
  }

  // 兜底去重:整段只允许保留一个 ```herocard``` 块(由调用方拼接)。
  // 若 LLM 或其它路径让 prose 里混入了 herocard 块,多余的剥掉,
  // 只保留最后一个(通常是调用方手动拼接的那块,内容更完整)。
  const herocardBlocks = [...output.matchAll(/```herocard\s*[\s\S]*?```/gi)];
  if (herocardBlocks.length > 1) {
    let kept = herocardBlocks[herocardBlocks.length - 1][0];
    output = output.replace(/```herocard\s*[\s\S]*?```/gi, '').trim();
    output = `${output}\n\n${kept}`.trim();
  }

  return output;
}

function getAnswerTypeFromRefs(refs = [], options = {}) {
  if (options && options.forceKnowledge) return 'knowledge_polished';
  return Array.isArray(refs) && refs.length > 0 ? 'knowledge_polished' : 'free';
}

function getAnswerTypeLabel(answerType) {
  return answerType === 'knowledge_polished' ? '知识库润色回答' : '自由回答';
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

function sanitizeHeroCardVisibleReply(reply, card, locale, options = {}) {
  const text = trimGenericTrailingFollowup(reply, locale)
    .replace(/\r\n/g, '\n')
    .trim();
  if (!text) return '';

  // LLM 偶尔会把整张 hero card 代码块(```herocard ... ```)也吐进 prose,
  // 调用方(L4817)稍后会再手动拼一个 buildHeroCardBlock,这里若不剥掉
  // 就会出现两块卡片。对整段文本(而不只是前两行)剥除任何 herocard 块,
  // 以及其它反引号围栏代码块(prose 不应出现任何代码块)。
  const stripped = text
    .replace(/```herocard\s*[\s\S]*?```\s*/gi, '')
    .replace(/```[a-z0-9]*\s*[\s\S]*?```\s*/gi, '')
    .trim();
  if (!stripped) return '';

  const compact = stripped
    .split('\n')
    .map(line => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';

  // 评价类问题（值不值得练/怎么样/强吗）允许 prose 自然提及“技能/阵营/职业”等字段词来给出判断，
  // 只有当 prose 本身就是字段罗列（如“阵营：守护者 职业是xxx”）且不含任何评价性语句时才判空。
  const isEvaluation = !!(options && options.isEvaluation);
  if (!isEvaluation && /```|基础效果|技能详情|一星|二星|三星|四星|五星|满星|技能|阵营|职业|台词|语音|稀有度|头像|立绘/u.test(compact)) {
    return '';
  }
  if (isEvaluation && /```|基础效果|技能详情|一星|二星|三星|四星|五星|满星|头像|立绘/u.test(compact)) {
    return '';
  }

  const clipped = compact.length > 60 ? compact.slice(0, 60).trim() : compact;
  return /[。\uFF01\uFF1F!?]$/u.test(clipped) ? clipped : `${clipped}。`;
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

function shouldBlockUngroundedGameFreeAnswer(query, {
  refs = [],
  facts = [],
  liveBlock = '',
  directKnowledgeReply = '',
  literalKnowledgeReply = '',
  detailedGuideKnowledgeReply = '',
  heroAliasReply = '',
} = {}) {
  const text = String(query || '').trim();
  if (!text) return false;
  if (String(liveBlock || '').trim()) return false;
  if (Array.isArray(facts) && facts.length > 0) return false;
  if (directKnowledgeReply || literalKnowledgeReply || detailedGuideKnowledgeReply || heroAliasReply) return false;

  const intent = getKnowledgeQueryIntent(text);
  const knowledgeLikeQuestion = (
    isArticleStyleGuideQuery(text)
    || intent !== 'general'
    || /(?:怎么玩|怎么打|如何|介绍一下|讲讲|攻略|指南|规则|机制|阵容|配队|搭配)/u.test(text)
  );
  if (!knowledgeLikeQuestion) return false;

  const reliableRefs = Array.isArray(refs)
    ? refs.filter(ref => (
      !isKnownPlanningOrUiNoiseRef(ref)
      && !isKnownJunkKnowledgeRef(ref)
      && scoreBodyStyleKnowledgeRef(ref) > 0
    ))
    : [];

  return reliableRefs.length === 0;
}

function buildNoReliableKnowledgeHitReply(query) {
  const text = String(query || '').trim();
  if (!text) return '我这边暂时没命中到可靠的知识内容，先不乱答。';
  if (isArticleStyleGuideQuery(text)) {
    return '我这边暂时没命中到能直接支撑这道题的可靠知识内容，先不乱答。';
  }
  return '我这边暂时没命中到可靠的知识内容，没法直接下结论。';
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

function isHeroCardTeamQuery(query) {
  return /(?:\u9635\u5bb9|\u9663\u5bb9|\u914d\u961f|\u914d\u968a|\u642d\u914d|\u63a8\u8350\u9635\u5bb9|\u63a8\u85a6\u9663\u5bb9)/u.test(String(query || '').trim());
}

function isHeroCardEvaluationQuery(query) {
  return /(?:\u600e\u4e48\u6837|\u5982\u4f55|\u5389\u5bb3|\u5f3a\u5417|\u5f3a\u4e0d\u5f3a|\u597d\u4e0d\u597d\u7528|\u503c\u4e0d\u503c\u5f97(?:\u7ec3|\u517b)?|\u80fd\u4e0d\u80fd\u7ec3|\u63a8\u8350\u5417)/u.test(String(query || '').trim());
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

  const deterministicLead = buildHeroCardLeadReply(text, card);
  if (deterministicLead) return deterministicLead;

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
      'Return only one short natural sentence. Use at most two short sentences only when the user explicitly asked for an evaluation.',
      'Do not repeat the attached card fields, including title, faction, career, rarity, quote, avatar, skill names, or skill effects.',
      'Do not describe skill details, star upgrades, or copy text that already belongs in the card.',
      'For plain profile or introduction requests, prefer a short handoff line and let the attached card carry the details.',
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
    return sanitizeHeroCardVisibleReply(String(content || '').trim(), card, preferredLocale, {
      isEvaluation: isHeroCardEvaluationQuery(text),
    })
      || buildHeroCardFallbackReply(card);
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
  focusFragment = '',
} = {}) {
  const raw = String(draftReply || '').trim();
  if (!raw) return '';

  const { prose, heroCardBlock } = extractTrailingHeroCardBlock(raw);
  const visibleDraft = prose || raw;
  if (!visibleDraft) return raw;
  if (heroCardBlock) return raw;

  const recentAssistantSamples = getRecentAssistantSamples(history)
    .map((item, index) => `- Recent reply ${index + 1}: ${item.slice(0, 200)}`)
    .join('\n');
  const articleStyleGuideQuery = isArticleStyleGuideQuery(query);
  const draftLines = splitDirectKnowledgeLines(visibleDraft).filter(Boolean);
  const expandedKnowledgeDraft = Array.isArray(refs)
    && refs.length > 0
    && shouldPreserveExpandedKnowledgeDraft(visibleDraft);

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
        ? (expandedKnowledgeDraft
            ? 'This draft is grounded by retrieved content. Keep it faithful to the grounded facts, preserve every top-level numbered section already present in the draft, and keep the key sections, numbered points, dates, percentages, thresholds, and lineup names instead of shrinking it to a short summary.'
            : (articleStyleGuideQuery
                ? 'This draft is grounded by retrieved content. Keep it faithful to the grounded facts, and keep enough detail to answer a guide-style question properly.'
                : 'This draft is grounded by retrieved content. Keep it concise and faithful to the grounded facts.'))
        : (articleStyleGuideQuery ? 'Keep it direct and sufficiently detailed.' : 'Keep it concise and direct.'),
      Array.isArray(refs) && refs.length > 0
        ? 'If the current question is a follow-up about one branch, tier, hero, lineup, star level, or subsection, answer that asked branch first and keep the exact dates, numbers, percentages, unlock timings, and thresholds tied to that branch.'
        : 'Stay focused on the exact object the user is asking about.',
      (articleStyleGuideQuery || expandedKnowledgeDraft)
        ? 'For guide, rules, and tutorial queries, preserve the main sections, key details, and multi-part structure from the draft. Do not compress a long guide into one or two bullets. When the draft already has 1/2/3 style structure, keep that structure in the final answer.'
        : 'If the draft is a structured guide, rules summary, or article digest, preserve the major points from the draft. Do not collapse it into a single sub-point.',
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
    if (expandedKnowledgeDraft && !shouldKeepExpandedKnowledgeRewrite(visibleDraft, rewritten)) {
      const fallback = visibleDraft;
      return heroCardBlock ? `${fallback}\n\n${heroCardBlock}` : fallback;
    }
    if (
      Array.isArray(refs)
      && refs.length > 0
      && focusFragment
      && !shouldKeepFocusedFollowupRewrite(visibleDraft, rewritten, focusFragment)
    ) {
      return heroCardBlock ? `${visibleDraft}\n\n${heroCardBlock}` : visibleDraft;
    }
    if (!rewritten) {
      return expandedKnowledgeDraft
        ? (heroCardBlock ? `${visibleDraft}\n\n${heroCardBlock}` : visibleDraft)
        : (Array.isArray(refs) && refs.length > 0 && !articleStyleGuideQuery
        ? humanizeKnowledgeDraftReply(query, visibleDraft, preferredLocale) || raw
        : raw);
    }
    if (expandedKnowledgeDraft && looksLikeMechanicalKnowledgeDump(rewritten)) {
      return heroCardBlock ? `${visibleDraft}\n\n${heroCardBlock}` : visibleDraft;
    }
    if (Array.isArray(refs) && refs.length > 0 && !articleStyleGuideQuery && looksLikeMechanicalKnowledgeDump(rewritten)) {
      const humanized = humanizeKnowledgeDraftReply(query, rewritten, preferredLocale);
      if (humanized) return heroCardBlock ? `${humanized}\n\n${heroCardBlock}` : humanized;
    }
    return heroCardBlock ? `${rewritten}\n\n${heroCardBlock}` : rewritten;
  } catch (err) {
    console.error('[chatService] polishReplyThroughAi failed:', err.message);
    if (expandedKnowledgeDraft) {
      return heroCardBlock ? `${visibleDraft}\n\n${heroCardBlock}` : visibleDraft;
    }
    const fallback = Array.isArray(refs) && refs.length > 0 && !articleStyleGuideQuery
      ? humanizeKnowledgeDraftReply(query, visibleDraft, preferredLocale)
      : '';
    if (fallback) return heroCardBlock ? `${fallback}\n\n${heroCardBlock}` : fallback;
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

function normalizeMediaText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildMediaContextBlock(mediaContext = null) {
  if (!mediaContext || typeof mediaContext !== 'object') return '';

  const kind = normalizeMediaText(mediaContext.kind);
  const summary = normalizeMediaText(mediaContext.summary);
  const mimeType = normalizeMediaText(mediaContext.mimeType);
  const originalName = normalizeMediaText(mediaContext.originalName);
  const tags = Array.isArray(mediaContext.tags)
    ? mediaContext.tags.map(normalizeMediaText).filter(Boolean).slice(0, 6)
    : [];
  // 有内联图(真多模态)时,LLM 能直接"看到"原图,文字 summary 只作辅助
  const hasInlineImage = !!(mediaContext.inlineDataUrl);

  if (!kind && !summary && tags.length === 0 && !hasInlineImage) return '';

  const headLine = hasInlineImage
    ? '本轮消息带有用户附件,你已直接收到原图(以 image_url 形式附在用户消息里),请基于你看到的图片像素、附带的文字概括和用户文字一起作答。'
    : '本轮消息带有用户附件，请把附件识别结果和用户文字一起理解后再回答。';

  return [
    headLine,
    kind ? `附件类型：${kind === 'video' ? '视频' : '图片'}` : '',
    summary ? `附件内容概括：${summary}` : '',
    tags.length ? `附件关键标签：${tags.join('、')}` : '',
    mimeType ? `附件 MIME：${mimeType}` : '',
    originalName ? `附件文件名：${originalName}` : '',
    hasInlineImage
      ? '你现在能直接看到原图,可以描述图中文字、数值、布局等细节,不需要局限于上面的概括。'
      : '不要假装看到了识别结果之外的细节，只能基于这些可见信息和用户当前文字作答。',
  ].filter(Boolean).join('\n');
}

function buildMediaAugmentedQuery(message, mediaContext = null) {
  const text = String(message || '').trim();
  const mediaContextBlock = buildMediaContextBlock(mediaContext);
  if (!mediaContextBlock) return text;
  return [
    text,
    '',
    '[用户附件信息]',
    mediaContextBlock,
  ].filter(Boolean).join('\n');
}

function buildMessages(bot, history, userMessage, contextBlock, factBlock = '', liveBlock = '', versionContext = null, options = {}) {
  const budget = cfg.llm.maxPromptBytes;
  const userBytes = Buffer.byteLength(userMessage, 'utf8');
  const systemBudget = Math.max(200, budget - userBytes - 200);
  const preferredLocale = detectUserLocale(userMessage);
  const domainMode = options && options.domainMode === 'general' ? 'general' : 'game';
  const mediaContextBlock = String(options?.mediaContextBlock || '').trim();
  const articleStyleGuideQuery = isArticleStyleGuideQuery(userMessage);

  const globalConstraints = loadGlobalBotConstraints();
  const displayName = String(bot.display_name || '').trim();
  const persona = String(bot.persona || '').trim();
  const versionDisplayName = String(versionContext?.display_name || '').trim();
  const versionGameName = String(versionContext?.game_name || '').trim();
  const versionCode = String(versionContext?.code || '').trim();
  const defaultAnswerPolicy = [
    '回答策略优先级：1. 命中知识库或图谱事实时，优先基于这些内容回答。2. 有实时天气或联网搜索结果时，优先基于这些外部结果回答。3. 两者都不足时，再根据通用知识正常回答用户问题。',
    '不要因为没命中知识库就让用户换个问法，也不要无故只追问不回答。除非缺少关键前提，否则先直接回答。',
    '不要假装命中了知识库，不要假装拿到了实时结果，也不要输出并不存在的引用或图片。',
    '不要直接照搬知识库原文、表格行、sheet 字段或多语言原始片段，先整理成与当前问题直接相关的自然回答。',
    '如果命中的知识内容和问题不直接相关，就不要硬答。宁可明确说当前无法根据已有信息下结论，也不要拿无关字段拼答案。',
    '如果当前是游戏内知识型问题，但知识库命中不可靠或只命中到排期、UI、版式参考之类的材料，不要外推成泛攻略，直接说明当前没有可靠命中。',
    '当前会话已经绑定到具体游戏版本，不要反问用户“你说的是哪个游戏”。除非用户明确在做跨游戏对比，否则直接按当前版本语境回答。',
    'When the knowledge base already contains the answer, answer from that text, keep the source sections when useful, and do not invent extra tips.',
  ].join('\n');
  const directnessPolicy = [
    '知道什么就直接说什么，先给结论，再补充必要说明。',
    '不要写空话开头，比如“这是个很核心的问题”“我能确认的是”“我不敢乱讲”。',
    '不要解释你自己的检索过程、判断过程或系统内部机制，用户没问就不要交代。',
    '如果信息不足，直接说明缺哪一部分；如果已知一部分，就先把已知部分说清楚。',
    articleStyleGuideQuery
      ? 'When knowledge-base content is present for a guide-style question, keep the answer close to that content and preserve the main sections and details instead of compressing it into a brief summary.'
      : 'When knowledge-base content is present, keep the answer close to that content. Do not turn it into a long article, polished tutorial, or expanded summary unless the user asked for that format.',
    articleStyleGuideQuery
      ? 'For guide-style questions, write like a clear player-facing guide. Short section labels and grouped bullet points are allowed when they help readability.'
      : 'When knowledge-base content is present, write like a normal chat reply to the player, not like a document, wiki page, release note, or customer-service template.',
    articleStyleGuideQuery
      ? 'For guide-style questions, lead with the direct answer, then keep the important grounded sections such as opening time, participation requirements, rules, rewards, and other retrieved mechanics when available.'
      : 'Prefer one direct lead sentence plus a short continuation. Only use a small bullet list when it clearly helps readability.',
    articleStyleGuideQuery
      ? 'For guide-style questions, do not collapse a multi-section answer into one or two bullets.'
      : 'Avoid decorative formatting. Do not use bold-only section labels or stacked mini-headings unless the user explicitly asked for structured output.',
    'Do not emit standalone topic-label lines such as "商城", "竞技场", or "VIP tip" followed by a separate explanation line. Fold the label into the sentence itself.',
    'Do not use inline markdown emphasis such as **Tip:**, **Note:**, or **VIP:** in normal answers.',
    'For broad beginner onboarding questions, answer the broad onboarding guidance that was retrieved. Do not switch to narrower topics such as arena, PVP, or other specific systems unless the user explicitly asked for them.',
    articleStyleGuideQuery
      ? 'Prefer plain sentences, short bullets, or lightweight section labels. Do not add markdown headings like # or ##.'
      : 'Prefer plain sentences or short bullets. Do not add markdown headings like # or ## unless the user explicitly asked for formatted output.',
    'Do not end with generic follow-up prompts like "anything else" or "want me to expand" unless the user explicitly asks for more.',
  ].join('\n');
  const liveAnswerPolicy = liveBlock
    ? [
        '下面已经给了联网搜索或实时工具结果。',
        '如果问题涉及最新、新闻、实时、天气等内容，必须直接基于这些结果回答，不要退回成百科式介绍。',
        '不要说自己不能联网，也不要说刚才是瞎编的。',
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
    mediaContextBlock,
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
  // 主对话真多模态:有内联图时,最后一条 user message 改成 OpenAI 兼容的 content 数组,
  // 让 LLM 直接"看到"原图像素,而不只是 system 里的文字 summary。
  const imageUrl = String(options?.imageUrl || '').trim();
  const userContent = imageUrl
    ? [
        { type: 'text', text: String(userMessage || '') },
        { type: 'image_url', image_url: { url: imageUrl } },
      ]
    : userMessage;
  for (const item of history) {
    messages.push({ role: item.role, content: item.content });
  }
  messages.push({ role: 'user', content: userContent });

  // 兼容 content 为数组(多模态)的字节估算:文本项按 utf8 算,图片项按 dataUrl 字符串算。
  const totalBytes = () =>
    messages.reduce((sum, item) => {
      if (Array.isArray(item.content)) {
        return sum + item.content.reduce((s, part) => {
          if (!part || typeof part !== 'object') return s;
          if (part.type === 'text') return s + Buffer.byteLength(String(part.text || ''), 'utf8');
          if (part.type === 'image_url') return s + Buffer.byteLength(String(part.image_url?.url || ''), 'utf8');
          return s;
        }, 0);
      }
      return sum + Buffer.byteLength(String(item.content || ''), 'utf8');
    }, 0);

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
  return /(?:今天|明天|后天|大后天|周末|周[一二三四五六日天])(?:天气|气温|降雨|预报)?/u.test(text)
    && text.includes('当前实时');
}

function stripFollowupLead(text) {
  return String(text || '')
    .trim()
    .replace(/^(?:那什么|那就|那再|那如果|然后|还有|换成|改成|改查|再查|再看)\s*/u, '')
    .trim();
}

function stripTrailingParticles(text) {
  return String(text || '')
    .trim()
    .replace(/[，。、；：!?！？.]+$/gu, '')
    .replace(/[吗么呢呀啊吧啦哈哦噢]+$/gu, '')
    .trim();
}

function normalizeCarryoverFragment(text) {
  return stripTrailingParticles(stripFollowupLead(text));
}

function looksLikeStandaloneTopicShift(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (/(?:\u4ec0\u4e48|\u600e\u4e48|\u600e\u6837|\u5982\u4f55|\u4e3a\u4f55|\u4e3a\u4ec0\u4e48|\u591a\u5c11|\u51e0\u5c81|\u51e0\u53f7|\u51e0\u70b9|\u65b0\u95fb|\u6d88\u606f|\u4ecb\u7ecd|\u6280\u80fd|\u53f0\u8bcd|\u9635\u8425|\u804c\u4e1a|\u7a00\u6709\u5ea6|\u82f1\u96c4|\u89d2\u8272|\u56fe\u7247|\u5f15\u7528|\u8054\u7f51|\u641c\u7d22|\u66f4\u65b0|\u53d1\u5e03|OpenAI|weather|news|who|what|why|how)/iu.test(text)) return true;

  return /(?:什么|怎么|怎样|如何|为何|为什么|多少|几岁|几号|几点|新闻|消息|介绍|技能|台词|阵营|职业|稀有度|英雄|角色|图片|引用|联网|搜索|更新|发布|OpenAI|weather|news|who|what|why|how)/iu.test(text);
}

function isLikelyWeatherLocationReply(message) {
  const normalizedMessage = normalizeCarryoverFragment(message);
  if (!normalizedMessage || normalizedMessage.length > 20) return false;
  if (liveTools.isWeatherQuery(normalizedMessage)) return false;
  if (/^(?:帮我|请问|告诉我|我想|想问|查下|查一个|搜下|搜一个|介绍下|介绍一个)/u.test(normalizedMessage)) {
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
  if (!text || !/[?？]/u.test(text)) return false;

  return /(?:哪款游戏|游戏名|卡在哪|哪一个区|哪个角色|哪位角色|具体一点|补充一下|说一下|告诉我)/u.test(text);
}

function isGenericKnowledgeFieldFragment(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return /^(?:技能[1-4]|阵营|职业|定位|稀有度|台词|语音|基础|基础效果|效果|[一二三四五1-5]星|[一二三四五1-5]星效果)$/u.test(value);
}

function extractGenericSubjectCandidate(message) {
  const raw = String(message || '').trim();
  if (!raw || raw.length > 80) return '';
  if (hasExplicitBroadScopedObject(raw)) return '';

  let text = raw
    .replace(/["'`\u201C\u201D\u2018\u2019]/gu, '')
    .replace(/[，。,.、；;:：!?？]+$/gu, '')
    .trim();

  text = text
    .replace(/^(?:\u4f60\u77e5\u9053|\u77e5\u9053|\u4e86\u89e3|\u8ba4\u8bc6|\u542c\u8fc7|\u542c\u8bf4\u8fc7|\u4ecb\u7ecd\u4e00\u4e0b|\u4ecb\u7ecd\u4e2a|\u4ecb\u7ecd|\u8bf4\u8bf4|\u8bb2\u8bb2|\u804a\u804a|\u8bc4\u4ef7\u4e00\u4e0b|\u600e\u4e48\u770b|\u5e2e\u6211\u67e5\u4e00\u4e0b|\u5e2e\u6211\u67e5|\u67e5\u4e00\u4e0b|\u67e5\u4e0b|\u641c\u4e00\u4e0b|\u641c\u7d22\u4e00\u4e0b|\u641c\u7d22|\u8bf7\u95ee|\u6211\u60f3\u95ee\u4e00\u4e0b|\u6211\u60f3\u95ee|\u5173\u4e8e|\u7ed9\u6211\u63a8\u8350\u4e00\u4e0b|\u7ed9\u6211\u63a8\u8350|\u63a8\u8350\u4e00\u4e0b|\u63a8\u8350)\s*/u, '')
    .replace(/^《?(.+?)》?$/u, '$1')
    .replace(/(?:吗|么|呢|呀|啊|吧)?$/u, '')
    .trim();

  const anchoredSubject = text.match(
    /^(.{2,24}?)(?:这个|这位|该|本)?(?:英雄|角色|技能|玩法|流派|阵容)?(?:的)?(?:一星|二星|三星|四星|五星|满星|技能|基础效果|效果|强度|定位|台词|语音|阵营|职业|稀有度|攻略|玩法|介绍|详情|专武|专属|适合|怎么配|怎么搭|怎么打|怎么玩|先做什么|第一天|第二天|第三天|是什么|怎么样|如何|是谁|几星|值不值得|好不好用).*$/
  );
  if (anchoredSubject && anchoredSubject[1]) {
    text = anchoredSubject[1].trim();
  }

  text = text
    .replace(/(?:这个|那个|这位|那位|该|本)$/u, '')
    // 末尾"英雄/角色/技能/玩法"这类通用词只在前面没有具体定语时才剥离；
    // "冰系阵容""刺客流派"等完整术语的"阵容/流派"是名字的一部分，保留。
    .replace(/(?:这个|那个|这位|那位|该|本)?(?:英雄|角色|技能|玩法)$/u, '')
    .trim();

  if (!text || text.length < 2 || text.length > 24) return '';
  if (!/[\u4e00-\u9fffA-Za-z]/u.test(text)) return '';
  if (isGenericKnowledgeFieldFragment(text)) return '';
  if (/^(?:什么|这个|那个|具体说)/u.test(text)) return '';
  if (
    /(?:怎么|如何|为什么|多少|几点|哪里|哪儿|哪个|哪款|when|what|how|why|where|who)/iu.test(text)
    && !/(?:新手入门|新手开局|前期发育|极速奇袭|巅峰竞技场)/u.test(text)
  ) return '';
  return text;
}

function looksLikeConstraintStyleFollowup(message) {
  const text = normalizeCarryoverFragment(message);
  if (!text || text.length > 40) return false;
  // 独立游戏问题命中具体玩法/系统实体名词时，即使句式像"有没有X,几天Y"也不算追问短句，
  // 否则 filterRefsForAnswer 的 1707 分支会因 stronglyAligned=0 把全部召回 refs 清空。
  if (GAME_SYSTEM_ENTITY_KEYWORDS.some(pattern => pattern.test(String(message || '')))) return false;
  if (/(?:\u4ec0\u4e48|\u600e\u4e48|\u600e\u6837|\u5982\u4f55|\u4e3a\u4ec0\u4e48|\u4ecb\u7ecd|\u6559\u7a0b|\u653b\u7565|\u73a9\u6cd5|\u662f\u8c01|\u662f\u4ec0\u4e48|\u4ec0\u4e48\u610f\u601d|\u54ea\u4e2a|\u54ea\u6b3e|\u54ea\u4f4d)/u.test(text)) return false;

  if (
    /^(?:有没有|能不能|是否|适合|支持|推荐|下雨吗|雨天|周末|工作日|亲子|新手|入门|后期|前期|室内|室外|过夜|带狗|带宠物|洗手间|停车|空调|淋浴|独卫|帐篷|天幕|人均|预算|便宜|贵不贵|值不值|几人|几个人|多少人|多大|多久|几点|几天|几星|三星|二星|一星)/u.test(text)
  ) {
    return true;
  }

  if (/(?:\d+\s*人|[一二两三四五六七八九十]+\s*人|下雨吗|雨天|周末|亲子|新手|入门|后期|前期|室内|室外|过夜|带狗|带宠物|洗手间|停车|人均|预算|三星|二星|一星)/u.test(text)) {
    return true;
  }

  return /^[^。\uFF01\uFF1F?]{1,32}(?:，[^。\uFF01\uFF1F?]{1,32})?$/u.test(text);
}

function shouldCarryGenericFollowup(message) {
  const text = normalizeCarryoverFragment(message);
  if (!text || text.length > 40) return false;
  if (/^(?:那|那就|那再|再问|再说|继续|然后)\s*(?:[一二三四五1-5]星|第[一二三四五六七八九十0-9]+天|决赛|季军赛|技能[1-4]|阵营|职业|稀有度|台词|语音|主打什么车型|有没有\d+个人?|几个人|多少人).*/u.test(text)) {
    return true;
  }
  if (/^(?:它|他|她|这|那)(?:的)?(?:主打什么车型|决赛|季军赛|第二天|第三天|三星|四星|技能|技能名称|阵营|职业|稀有度|台词).*/u.test(text)) {
    return true;
  }
  if (/^(?:再说下|再说|说下|说说|再讲下|再讲)\s*(?:[一二三四五1-5]星|技能|技能名称|效果|台词|阵营|职业|稀有度).*/u.test(text)) {
    return true;
  }
  if (looksLikeConstraintStyleFollowup(text)) return true;
  if (liveTools.isWeatherQuery(text) || shouldCarryWeatherFollowup(text)) return false;
  if (looksLikeStandaloneTopicShift(text)) return false;

  if (/^(?:(?:那|那就|那再|那然后|再继续|还有|再说|再讲|继续)?(?:它|他|她|他们|她们|这个|那个|这款|那款|这个游戏|那个游戏|这个品牌|那个品牌|这个车|那个车|具体说))/u.test(text)) {
    return true;
  }

  return /^(?:那然后|再继续|还有).{0,12}(?:吗|怎么样|咋样|多少|多大|几人|几个人)/u.test(text);
}

function hasExplicitBroadScopedObject(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  return /(?:这款游戏|这个游戏|该游戏|这游戏)(?:的)?(?:活动|玩法|系统|阵容|角色|英雄)?/u.test(text);
}

function extractAssistantLeadSubjectCandidate(content) {
  const firstLine = String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => String(line || '').trim())
    .find(Boolean) || '';
  if (!firstLine) return '';
  if (firstLine.length < 2 || firstLine.length > 24) return '';
  if (/[:：。！？!?]/u.test(firstLine)) return '';
  if (/^(?:-|\*|\d+[.\u3001)]|[\u4e00-\u5341]+[.\u3001)）])/u.test(firstLine)) return '';
  if (!/[\u4e00-\u9fffA-Za-z]/u.test(firstLine)) return '';
  if (/(?:可以先抓这几点|主要看这几点|核心要点|重点如下|总结一下)/u.test(firstLine)) return '';
  return firstLine;
}

function getRecentGenericSubjectFromHistory(history, limit = 6) {
  const recentItems = [...(Array.isArray(history) ? history : [])]
    .reverse()
    .filter(item => item && String(item.content || '').trim())
    .slice(0, limit * 2);

  const recentUserMessages = recentItems
    .filter(item => item.role === 'user')
    .slice(0, limit);

  for (const item of recentUserMessages) {
    const subject = extractGenericSubjectCandidate(item.content);
    if (subject) return subject;
  }

  const recentAssistantMessages = recentItems
    .filter(item => item.role === 'assistant')
    .slice(0, limit);

  for (const item of recentAssistantMessages) {
    const subject = extractAssistantLeadSubjectCandidate(item.content);
    if (subject) return subject;
  }

  return '';
}

function resolveGenericFollowupMessage(message, subject) {
  const text = String(message || '').trim();
  const name = String(subject || '').trim();
  if (!text || !name) return text;

  const replaced = text.replace(
    /^(?:那|那就|那再|那然后|再继续|还有|再说|再讲|继续)?(?:它|他|她|他们|她们|这个|那个|这款|那款|这个游戏|那个游戏|这个品牌|那个品牌|这个车|那个车|具体说)/u,
    name
  );

  if (replaced !== text) return replaced;
  return `${name} ${text}`;
}

function normalizeKnowledgeFollowupFragment(message, subject = '') {
  const raw = normalizeCarryoverFragment(message);
  const normalizedSubject = String(subject || '').trim();
  if (!raw || !normalizedSubject) return '';
  const shortKnowledgeFieldFollowup = /^(?:技能[1-4]|阵营|职业|定位|稀有度|台词|语音|基础|基础效果|效果|[一二三四五1-5]星)$/u.test(raw);
  if (looksLikeStandaloneTopicShift(raw) && !shortKnowledgeFieldFollowup) return '';
  if (/[?？]/u.test(raw) && !/^(?:[一二三四五1-5]星|基础|效果|阵营|职业|定位|稀有度|台词|语音|技能[1-4])/u.test(raw)) {
    return '';
  }

  const rawFieldMatch = /^(?:那|那就|那再|那然后|再继续|还有|再说下|再说|说下|说说|再讲下|再讲)?\s*(技能[1-4]|技能名称|阵营|职业|定位|稀有度|台词|语音)(?:[呢吗呀啊吧]+)?$/u.exec(raw);
  if (rawFieldMatch) return rawFieldMatch[1];
  const rawStarMatch = /^(?:那|那就|那再|那然后|再继续|还有|再说下|再说|说下|说说|再讲下|再讲)?\s*([一二三四五1-5]星)(?:[呢吗呀啊吧]+)?$/u.exec(raw);
  if (rawStarMatch) return `${rawStarMatch[1]}效果`;
  const rawBaseMatch = /^(?:那|那就|那再|那然后|再继续|还有|再说下|再说|说下|说说|再讲下|再讲)?\s*(基础|基础效果)(?:[呢吗呀啊吧]+)?$/u.exec(raw);
  if (rawBaseMatch) return '基础效果';

  const compact = raw
    .replace(/^(?:那|那就|那再|那然后|再继续|还有|再说下|再说|说下|说说|再讲下|再讲)?/u, '')
    .replace(/[呢吗呀啊吧]+$/u, '')
    .trim();
  if (!compact || compact.includes(normalizedSubject)) return '';
  if (/(?:怎么|如何|为什么|多少|哪里|哪儿|哪个|哪款|是谁|介绍|攻略|玩法|推荐)/u.test(normalizedSubject)) {
    return '';
  }

  const fieldMatch = /^(技能[1-4]|技能名称|阵营|职业|定位|稀有度|台词|语音)$/u.exec(compact);
  if (fieldMatch) return fieldMatch[1];
  if (/^(?:[一二三四五1-5]星)$/u.test(compact)) return `${compact}效果`;
  if (/^(?:基础|基础效果)$/u.test(compact)) return '基础效果';
  if (/^(?:效果)$/u.test(compact)) return '技能效果';
  return '';
}

function answerMatchesQuestionIntent(question, answer) {
  const normalizedQuestion = String(question || '').trim();
  const normalizedAnswer = String(answer || '').trim();
  if (!normalizedQuestion || !normalizedAnswer) return false;

  if (
    /(?:新手|萌新).*(?:老玩家|老手)|(?:老玩家|老手).*(?:新手|萌新)/u.test(normalizedQuestion)
    && (!/(?:新手|萌新)/u.test(normalizedAnswer) || !/(?:老玩家|老手)/u.test(normalizedAnswer))
  ) {
    return false;
  }

  if (hasExplicitBroadScopedObject(normalizedQuestion) && /活动/u.test(normalizedQuestion)) {
    const specificActivityMentioned = /(?:同盟对决|竞技场|角斗场|公会战|军团战|世界BOSS|限时副本|跨服战)/u.test(normalizedAnswer);
    const questionHasSpecificActivity = /(?:同盟对决|竞技场|角斗场|公会战|军团战|世界BOSS|限时副本|跨服战)/u.test(normalizedQuestion);
    if (specificActivityMentioned && !questionHasSpecificActivity) {
      return false;
    }
  }

  return true;
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

  const normalizedKnowledgeFragment = normalizeKnowledgeFollowupFragment(text, subject);
  const resolvedMessage = normalizedKnowledgeFragment
    ? `${subject} ${normalizedKnowledgeFragment}`
    : resolveGenericFollowupMessage(text, subject);

  return {
    retrievalQuery: resolvedMessage,
    followupContextBlock: [
      `当前追问对象：${subject}`,
      '本轮问题如果没有显式切换到新对象，默认仍然是在追问这个对象。',
    ].join('\n'),
    subject,
  };
}

function parseHistoryRefs(refsJson) {
  if (!refsJson) return [];
  try {
    const parsed = typeof refsJson === 'string' ? JSON.parse(refsJson) : refsJson;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getRecentAssistantKnowledgeRefs(history = []) {
  return [...(Array.isArray(history) ? history : [])]
    .reverse()
    .filter(item => item && item.role === 'assistant')
    .flatMap(item => parseHistoryRefs(item.refs_json))
    .filter(ref => ref && typeof ref === 'object');
}

function mergeUniqueRefs(primaryRefs = [], secondaryRefs = []) {
  const merged = [];
  const seen = new Set();

  [...(Array.isArray(primaryRefs) ? primaryRefs : []), ...(Array.isArray(secondaryRefs) ? secondaryRefs : [])]
    .forEach((ref) => {
      const identity = getRefIdentity(ref)
        || `${Number(ref?.documentId || ref?.document_id || 0)}:${Number(ref?.rowIndex || ref?.row_index || 0)}:${String(ref?.snippet || '').slice(0, 40)}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      merged.push(ref);
    });

  return merged;
}

function getFocusedFollowupFragment(message, subject = '') {
  const raw = normalizeCarryoverFragment(message);
  if (!raw || raw.length > 40) return '';
  if (subject && raw.includes(subject)) return '';
  if (looksLikeStandaloneTopicShift(raw)) return '';
  return raw;
}

function getKnowledgeDetailFocusFragment(query) {
  const text = String(query || '').trim();
  if (!text) return '';

  const match = /(?:基础效果|[一二三四五1-5]星效果|[一二三四五1-5]星|技能[1-4]|阵营|职业|定位|稀有度|台词|语音)/u.exec(text);
  return match ? String(match[0] || '').trim() : '';
}

function shouldBypassHeroCardDirectReply(message) {
  const intent = getKnowledgeQueryIntent(message);
  if (['quote', 'faction', 'career', 'rarity', 'skill', 'team'].includes(intent)) {
    return true;
  }
  return !!getKnowledgeDetailFocusFragment(message);
}

function shouldPreferHeroCardDirectReply(message, heroContext = null) {
  if (!heroContext || !String(heroContext.name || '').trim()) {
    return !shouldBypassHeroCardDirectReply(message);
  }
  return true;
}

function lineMatchesFocusFragment(line, focus) {
  const text = String(line || '').trim();
  const normalizedFocus = String(focus || '').trim();
  if (!text || !normalizedFocus) return false;
  if (text.includes(normalizedFocus)) return true;
  if (normalizedFocus.length >= 2) return false;
  return ragContext.hasTokenOverlap(normalizedFocus, text);
}

function focusKnowledgeDraftOnFollowup(draftReply, followupFragment, preferredLocale = detectUserLocale(followupFragment)) {
  const draft = String(draftReply || '').trim();
  const focus = String(followupFragment || '').trim();
  if (!draft || !focus) return draft;
  if (isFieldScopedKnowledgeReply(draft)) return draft;

  const lines = splitDirectKnowledgeLines(draft)
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean);
  if (lines.length < 3) return draft;

  const localizedLines = filterKnowledgeLinesByLocale(lines, preferredLocale);
  const sourceLines = localizedLines.length >= 3 ? localizedLines : lines;
  const matchedIndexes = sourceLines
    .map((line, index) => (
      lineMatchesFocusFragment(line, focus)
        ? index
        : -1
    ))
    .filter(index => index >= 0);
  if (matchedIndexes.length === 0) return draft;

  const pickedIndexes = new Set();
  const titleIndex = sourceLines.findIndex(line => (
    !looksLikeStructuredKnowledgeLine(line)
    && line.length <= 32
    && !/[\u3002\uFF01\uFF1F!?]/u.test(line)
  ));
  if (titleIndex >= 0) pickedIndexes.add(titleIndex);

  matchedIndexes.forEach((matchIndex) => {
    for (let index = matchIndex - 1; index >= 0; index -= 1) {
      const line = sourceLines[index];
      if (isMajorKnowledgeSectionLine(line)) {
        pickedIndexes.add(index);
        break;
      }
    }

    for (let index = matchIndex - 1; index >= 0 && index >= matchIndex - 2; index -= 1) {
      const line = sourceLines[index];
      if (/^[\d\u4e00-\u5341]+[）).、]/u.test(line)) {
        pickedIndexes.add(index);
        break;
      }
    }

    pickedIndexes.add(matchIndex);

    const currentParsed = parseKnowledgeFieldLine(sourceLines[matchIndex]);
    if (currentParsed) {
      return;
    }

    for (let index = matchIndex + 1; index < sourceLines.length && index <= matchIndex + 2; index += 1) {
      const line = sourceLines[index];
      if (isMajorKnowledgeSectionLine(line) || /^[\d\u4e00-\u5341]+[）).、]/u.test(line) || parseKnowledgeFieldLine(line)) break;
      pickedIndexes.add(index);
    }
  });

  const focusedLines = [...pickedIndexes]
    .sort((left, right) => left - right)
    .map(index => sourceLines[index])
    .filter(Boolean);

  return focusedLines.length >= 2 ? focusedLines.join('\n') : draft;
}

function buildFocusedRefFollowupReply(refs = [], followupFragment = '', preferredLocale = detectUserLocale(followupFragment)) {
  const focus = String(followupFragment || '').trim();
  if (!focus || !Array.isArray(refs) || refs.length === 0) return '';

  for (const ref of refs) {
    const rawLines = splitDirectKnowledgeLines(getRefText(ref))
      .map(normalizeDirectKnowledgeLine)
      .filter(line => !isReplySkippedKnowledgeLine(line))
      .filter(Boolean);
    if (rawLines.length < 3) continue;

    const localizedLines = filterKnowledgeLinesByLocale(rawLines, preferredLocale);
    const sourceLines = localizedLines.length >= 3 ? localizedLines : rawLines;
    const matchedIndexes = sourceLines
      .map((line, index) => {
        const text = String(line || '').trim();
        if (!text || !lineMatchesFocusFragment(text, focus)) {
          return { index: -1, score: Number.NEGATIVE_INFINITY };
        }

        let score = 0;
        if (text.startsWith(focus)) score += 10;
        if (
          text.includes(`${focus}阵容`)
          || text.includes(`${focus}效果`)
          || text.includes(`${focus}技能`)
          || text.includes(`${focus}台词`)
          || text.includes(`${focus}职业`)
          || text.includes(`${focus}阵营`)
          || text.includes(`${focus}稀有度`)
        ) score += 8;
        if (/[:：]/u.test(text)) score += 4;
        if (/\d{2,}(?:\.\d+)?%?/u.test(text)) score += 4;
        if (/[>＞/]/u.test(text)) score -= 6;
        if (isMajorKnowledgeSectionLine(text)) score -= 2;
        return { index, score };
      })
      .filter(item => item.index >= 0);

    if (matchedIndexes.length === 0) continue;

    const bestScore = Math.max(...matchedIndexes.map(item => item.score));
    const strongestMatches = matchedIndexes
      .filter(item => item.score === bestScore)
      .map(item => item.index);

    const pickedIndexes = new Set();
    const titleIndex = sourceLines.findIndex(line => (
      !looksLikeStructuredKnowledgeLine(line)
      && line.length <= 32
      && !/[\u3002\uFF01\uFF1F!?]/u.test(line)
    ));
    if (titleIndex >= 0) pickedIndexes.add(titleIndex);

    strongestMatches.forEach((matchIndex) => {
      for (let index = matchIndex - 1; index >= 0; index -= 1) {
        const line = sourceLines[index];
        if (isMajorKnowledgeSectionLine(line)) {
          pickedIndexes.add(index);
          break;
        }
      }

      for (let index = matchIndex - 1; index >= 0 && index >= matchIndex - 2; index -= 1) {
        const line = sourceLines[index];
        if (/^[\d\u4e00-\u5341]+[）).、]/u.test(line)) {
          pickedIndexes.add(index);
          break;
        }
      }

      pickedIndexes.add(matchIndex);

      const currentParsed = parseKnowledgeFieldLine(sourceLines[matchIndex]);
      if (currentParsed) {
        for (let index = matchIndex + 1; index < sourceLines.length && index <= matchIndex + 4; index += 1) {
          const line = sourceLines[index];
          const parsed = parseKnowledgeFieldLine(line);
          if (!parsed) break;
          if (/(?:项目|item)/iu.test(parsed.label)) break;
          if (!/(?:中文|英文|日语|韩语|泰语|繁中|繁体|繁體|basic effects|备注|附注|note)/iu.test(parsed.label)) {
            break;
          }
          pickedIndexes.add(index);
        }
        return;
      }

      for (let index = matchIndex + 1; index < sourceLines.length && index <= matchIndex + 3; index += 1) {
        const line = sourceLines[index];
        if (
          isMajorKnowledgeSectionLine(line)
          || /^[\d\u4e00-\u5341]+[）).、]/u.test(line)
          || parseKnowledgeFieldLine(line)
        ) {
          break;
        }
        pickedIndexes.add(index);
      }
    });

    const focusedLines = [...pickedIndexes]
      .sort((left, right) => left - right)
      .map(index => sourceLines[index])
      .filter(Boolean);

    if (focusedLines.length >= 2) {
      return dedupeLines(focusedLines)
        .filter(line => !isPlainLatinNoiseLine(line, preferredLocale))
        .join('\n');
    }
  }

  return '';
}

function buildFieldScopedKnowledgeReply(refs = [], focusFragment = '', preferredLocale = detectUserLocale(focusFragment)) {
  const focus = String(focusFragment || '').trim();
  if (!focus || !Array.isArray(refs) || refs.length === 0) return '';

  const titleLine = refs
    .flatMap(ref => splitDirectKnowledgeLines(getRefText(ref)))
    .map(normalizeDirectKnowledgeLine)
    .filter(line => !isReplySkippedKnowledgeLine(line))
    .filter(Boolean)
    .find(line => (
      !parseKnowledgeFieldLine(line)
      && !looksLikeStructuredKnowledgeLine(line)
      && line.length <= 24
      && !isPlainLatinNoiseLine(line, preferredLocale)
    )) || '';

  for (const ref of refs) {
    const rawLines = splitDirectKnowledgeLines(getRefText(ref))
      .map(normalizeDirectKnowledgeLine)
      .filter(line => !isReplySkippedKnowledgeLine(line))
      .filter(Boolean);
    if (rawLines.length === 0) continue;

    for (let index = 0; index < rawLines.length; index += 1) {
      const line = rawLines[index];
      const parsed = parseKnowledgeFieldLine(line);
      const label = String(parsed?.label || '').trim();
      const value = String(parsed?.value || '').trim();
      const matched = (
        value.includes(focus)
        || line.includes(focus)
        || (
          /(?:项目|item)/iu.test(label)
          && lineMatchesFocusFragment(value, focus)
        )
      );
      if (!matched) continue;

      const picked = [];
      const seen = new Set();
      const add = (text) => {
        const normalized = String(text || '').trim();
        if (!normalized || seen.has(normalized) || isPlainLatinNoiseLine(normalized, preferredLocale)) return;
        seen.add(normalized);
        picked.push(normalized);
      };

      if (titleLine) add(titleLine);
      add(line);

      for (let cursor = index + 1; cursor < rawLines.length && cursor <= index + 5; cursor += 1) {
        const nextLine = rawLines[cursor];
        const nextParsed = parseKnowledgeFieldLine(nextLine);
        if (!nextParsed) break;
        if (/(?:项目|item|对应位置)/iu.test(nextParsed.label)) break;
        if (
          /(?:备注|附注|note|中文|英文|日语|韩语|泰语|繁中|繁体|繁體|basic effects)/iu.test(nextParsed.label)
          || lineMatchesPreferredLocale(nextParsed.value, preferredLocale)
        ) {
          add(nextLine);
          continue;
        }
        break;
      }

      if (picked.length >= 2) {
        return picked.join('\n');
      }
    }
  }

  return '';
}

function hasStrongAnswerRefAlignment(query, ref, options = {}) {
  const text = getRefText(ref);
  if (!text) return false;

  const titleAnchorRef = options && options.titleAnchorRef ? options.titleAnchorRef : null;
  const titleMatch = matchesKnowledgeTitle(query, text);
  const tokenOverlap = ragContext.hasTokenOverlap(query, text);
  const intentScore = Number(
    ref?.intentScore != null
      ? ref.intentScore
      : ragContext.scoreIntentAlignment(query, text)
  );

  if (titleMatch) return true;
  if (titleAnchorRef && isSameKnowledgeArticleNeighborhood(ref, titleAnchorRef)) return true;
  if (ragContext.isGenericBeginnerGuideQuery(query)) {
    return intentScore >= 12 || (intentScore >= 8 && tokenOverlap);
  }
  if (looksLikeConstraintStyleFollowup(query) || /[，。]/u.test(String(query || ''))) {
    return intentScore >= 8 && tokenOverlap;
  }
  return intentScore >= 0 && tokenOverlap;
}

function shouldPreferLiteralKnowledgeDraft(query, refs, literalKnowledgeReply) {
  const draft = String(literalKnowledgeReply || '').trim();
  if (!draft) return false;

  const articleStyleQuery = isArticleStyleGuideQuery(query);
  const lines = splitDirectKnowledgeLines(draft).filter(Boolean);
  if (lines.length < 3) return false;

  const titleAnchorRef = pickTitleAnchorRef(query, refs);
  if (!titleAnchorRef) return false;

  const sameArticleRefs = Array.isArray(refs)
    ? refs.filter(ref => (
      getRefIdentity(ref) === getRefIdentity(titleAnchorRef)
      || isSameKnowledgeArticleNeighborhood(ref, titleAnchorRef)
    ))
    : [];
  const isArticleStyleQuery = /(?:攻略|指南|介绍|玩法|规则|机制|教程|怎么玩|怎么打)/u.test(String(query || ''));

  if (isArticleStyleQuery && sameArticleRefs.length >= 3 && lines.length >= 4) {
    return true;
  }

  if (!articleStyleQuery && sameArticleRefs.length >= 1 && lines.filter(looksLikeStructuredKnowledgeLine).length >= 3) {
    return true;
  }

  return lines.some(line => matchesKnowledgeTitle(query, line));
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
    `当前追问英雄：${heroContext.name}`,
    '本轮问题如果没有显式提到新角色，默认仍然是在追问这个英雄。',
  ].join('\n');
}

// 主流程：一次对话。onStage 可选，用于在进入某个处理阶段时发出进度事件。
// 供路由层（如 SSE）向前端推送真实进度；不传则行为与原来保持一致。
async function handleChat({ versionId, sessionKey, message, requestMeta = {}, mediaContext = null, onStage, skipPolish = false }) {
  const emit = stage => { if (onStage) onStage(stage); };

  const bot = await getBot(versionId);
  const versionContext = await getVersionContext(versionId);
  const { id: sessionId } = await findOrCreateSession(versionId, sessionKey, message);
  const preferredLocale = detectUserLocale(message);
  const mediaContextBlock = buildMediaContextBlock(mediaContext);

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
    skipReplyPolish = false,
    focusFragment = '',
    forceKnowledge = false,
  } = {}) => {
    const draftedReply = (skipPolish || skipReplyPolish)
      ? draftReply
      : await polishReplyThroughAi(bot, query, draftReply, {
          history,
          refs: draftRefs,
          preferredLocale,
          versionContext: replyVersionContext,
          domainMode,
          focusFragment,
        });
    const finalReply = postProcessAssistantReply(draftedReply, query, draftRefs, preferredLocale);
    const finalRefs = shouldSuppressRefsForReply(finalReply) ? [] : draftRefs;
    const answerType = getAnswerTypeFromRefs(draftRefs, { forceKnowledge });
    await saveAssistantReply(finalReply, finalRefs);
    return {
      reply: finalReply,
      refs: finalRefs,
      answerType,
      answerTypeLabel: getAnswerTypeLabel(answerType),
    };
  };

  try {
    emit('retrieving');
    // RAG 与 KG 并行，各自内部失败时都退化为空，不影响整体对话。
    let refs = [];
    let contextBlock = '';
    let factBlock = '';
    let liveBlock = '';
    const pendingSearchRetryQuery = getPendingSearchRetryQuery(message, history);
    const effectiveMessage = buildMediaAugmentedQuery(pendingSearchRetryQuery || message, mediaContext);
    // 有内联图(真多模态)时不走"无可靠知识兜底"——让 LLM 直接看图回答,而非提前 return 短答
    const hasInlineImage = !!(mediaContext && mediaContext.inlineDataUrl);
    if (!hasInlineImage && isPlanningOrUiNoiseQuery(effectiveMessage)) {
      return finalizeReply(buildNoReliableKnowledgeHitReply(effectiveMessage), {
        query: effectiveMessage,
        refs: [],
        domainMode: 'general',
        skipReplyPolish: true,
      });
    }
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

    const genericFollowupContext = pendingSearchRetryQuery
      ? { retrievalQuery: String(effectiveMessage || '').trim(), followupContextBlock: '', subject: '' }
      : buildGenericContextAugmentedQuery(message, history);
    const heroContextProbeMessage = (
      !pendingSearchRetryQuery && genericFollowupContext.subject
    )
      ? genericFollowupContext.subject
      : message;
    const heroContext = pendingSearchRetryQuery
      ? null
      : await heroCardService.findHeroContextEntity(versionId, heroContextProbeMessage, history);
    const heroCardProbeMessage = (
      !pendingSearchRetryQuery && genericFollowupContext.subject
    )
      ? genericFollowupContext.retrievalQuery
      : message;
    const heroCardResult = (!pendingSearchRetryQuery && !hasInlineImage
      && (shouldPreferHeroCardDirectReply(message, heroContext) || !!genericFollowupContext.subject))
      ? await heroCardService.findHeroCardReply(versionId, heroCardProbeMessage, history)
      : null;
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
          forceKnowledge: true,
        });
      }

      return finalizeReply(heroCardResult.reply, {
        query: message,
        refs: [],
        versionContext,
        domainMode: 'game',
        forceKnowledge: true,
      });
    }

    const preferGenericKnowledgeFollowup = !!(
      genericFollowupContext.subject
      && getKnowledgeDetailFocusFragment(genericFollowupContext.retrievalQuery)
    );
    const retrievalQuery = pendingSearchRetryQuery
      ? effectiveMessage
      : (preferGenericKnowledgeFollowup
        ? genericFollowupContext.retrievalQuery
        : (heroContext
        ? buildHeroContextAugmentedQuery(message, heroContext)
        : genericFollowupContext.retrievalQuery));
    const resolvedKnowledgeQuery = String(retrievalQuery || effectiveMessage || message || '').trim();
    const promptMessage = pendingSearchRetryQuery
      ? effectiveMessage
      : ((heroContext && !preferGenericKnowledgeFollowup)
        ? retrievalQuery
        : (genericFollowupContext.subject ? genericFollowupContext.retrievalQuery : message));
    const followupFocusFragment = genericFollowupContext.subject
      ? getFocusedFollowupFragment(message, genericFollowupContext.subject)
      : '';
    const knowledgeDetailFocusFragment = getKnowledgeDetailFocusFragment(resolvedKnowledgeQuery);
    const knowledgeFocusFragment = followupFocusFragment || knowledgeDetailFocusFragment;
    const heroFollowupContextBlock = buildHeroFollowupContextBlock(message, heroContext);

    const historyKnowledgeRefs = genericFollowupContext.subject
      ? getRecentAssistantKnowledgeRefs(history)
      : [];

    const [retrievedRagRefs, facts] = await Promise.all([
      bot.rag_enabled
        ? ragContext.retrieve(versionId, resolvedKnowledgeQuery, Math.max(Number(bot.rag_top_k || 5) * 3, 12))
        : Promise.resolve([]),
      bot.kg_enabled ? retrieveFacts(versionId, resolvedKnowledgeQuery) : Promise.resolve([]),
    ]);
    const followupSubjectFallbackRefs = (
      bot.rag_enabled
      && !pendingSearchRetryQuery
      && genericFollowupContext.subject
      && retrievedRagRefs.length === 0
    )
      ? await ragContext.retrieve(
        versionId,
        genericFollowupContext.subject,
        Math.max(Number(bot.rag_top_k || 5) * 2, 8)
      )
      : [];

    const mergedRetrievedRefs = mergeUniqueRefs(retrievedRagRefs, followupSubjectFallbackRefs);
    const ragRefs = historyKnowledgeRefs.length > 0
      ? mergeUniqueRefs(historyKnowledgeRefs, mergedRetrievedRefs)
      : mergedRetrievedRefs;

    if (facts.length > 0) {
      factBlock = kgContext.toFactBlock(facts);
    }
    if (!factBlock && heroFollowupContextBlock) {
      factBlock = heroFollowupContextBlock;
    }
    if (!factBlock && genericFollowupContext.followupContextBlock) {
      factBlock = genericFollowupContext.followupContextBlock;
    }

    const aliasOnlyKnowledge = hasOnlyHeroAliasMappingRefs(resolvedKnowledgeQuery, ragRefs);
    const headerOnlyKnowledge = hasOnlyHeaderOnlyRefs(ragRefs);
    const catalogOnlyKnowledge = hasOnlyCatalogRefs(ragRefs);
    let candidateRefs = (!aliasOnlyKnowledge && !headerOnlyKnowledge && !catalogOnlyKnowledge && ragRefs.length > 0)
      ? filterRefsForAnswer(resolvedKnowledgeQuery, ragRefs)
      : [];
    // 当 filterRefsForAnswer 把召回全删光时，从目录行里提取活动/系统名做二次 titleAnchor 搜索，
    // 定位到该活动的正文 sheet（如"军备竞赛"目录行被噪声过滤删光 → 用"军备竞赛"二次搜索找到正文段落）。
    if (candidateRefs.length === 0 && ragRefs.length > 0 && bot.rag_enabled) {
      const catalogEntityNames = extractCatalogEntityNames(resolvedKnowledgeQuery, ragRefs);
      if (catalogEntityNames.length > 0) {
        const secondaryRefs = await ragContext.retrieve(
          versionId,
          catalogEntityNames.join(' '),
          Math.max(Number(bot.rag_top_k || 5) * 3, 12)
        );
        if (secondaryRefs.length > 0) {
          const filteredSecondary = filterRefsForAnswer(resolvedKnowledgeQuery, secondaryRefs);
          if (filteredSecondary.length > 0) {
            candidateRefs = filteredSecondary;
          }
        }
      }
    }
    if (candidateRefs.length === 0 && genericFollowupContext.subject && historyKnowledgeRefs.length > 0) {
      candidateRefs = filterRefsForAnswer(resolvedKnowledgeQuery, historyKnowledgeRefs);
      if (candidateRefs.length === 0) {
        candidateRefs = historyKnowledgeRefs.slice(0, 8);
      }
    }
    const heroAliasReply = getHeroAliasReply(resolvedKnowledgeQuery, ragRefs);
    const directKnowledgeReply = getDirectKnowledgeReply(resolvedKnowledgeQuery, candidateRefs);
    const literalKnowledgeReply = getLiteralKnowledgeReply(resolvedKnowledgeQuery, candidateRefs);
    const detailCandidateRefs = knowledgeDetailFocusFragment
      ? await loadDetailScopedKnowledgeRefs(versionId, resolvedKnowledgeQuery, candidateRefs)
      : candidateRefs;
    const detailFocusedKnowledgeReplyRaw = knowledgeDetailFocusFragment
      ? buildFieldScopedKnowledgeReply(detailCandidateRefs, knowledgeDetailFocusFragment, preferredLocale)
      : '';
    const detailFocusedKnowledgeReply = detailFocusedKnowledgeReplyRaw
      ? (humanizeKnowledgeDraftReply(
          resolvedKnowledgeQuery,
          detailFocusedKnowledgeReplyRaw,
          preferredLocale
        ) || detailFocusedKnowledgeReplyRaw)
      : '';
    const focusedExpandedKnowledgeReply = knowledgeFocusFragment && !knowledgeDetailFocusFragment
      ? await getFocusedExpandedKnowledgeReply(
          versionId,
          resolvedKnowledgeQuery,
          candidateRefs,
          knowledgeFocusFragment
        )
      : '';
    const expandedKnowledgeReplyRaw = focusedExpandedKnowledgeReply
      || await getExpandedKnowledgeReply(versionId, resolvedKnowledgeQuery, candidateRefs);
    const focusedRefKnowledgeReply = knowledgeFocusFragment
      ? buildFocusedRefFollowupReply(candidateRefs, knowledgeFocusFragment, preferredLocale)
      : '';
    const focusedKnowledgeSource = knowledgeDetailFocusFragment
      ? (focusedRefKnowledgeReply || expandedKnowledgeReplyRaw)
      : (focusedExpandedKnowledgeReply || expandedKnowledgeReplyRaw || focusedRefKnowledgeReply);
    const expandedKnowledgeReplyBase = knowledgeFocusFragment
      ? focusKnowledgeDraftOnFollowup(
          focusedKnowledgeSource,
          knowledgeFocusFragment,
          preferredLocale
        )
      : expandedKnowledgeReplyRaw;
    const expandedKnowledgeReply = expandedKnowledgeReplyBase
      && !isArticleStyleGuideQuery(resolvedKnowledgeQuery)
      && !shouldPreserveExpandedKnowledgeDraft(expandedKnowledgeReplyBase)
      ? (humanizeKnowledgeDraftReply(
          resolvedKnowledgeQuery,
          expandedKnowledgeReplyBase,
          preferredLocale
        ) || expandedKnowledgeReplyBase)
      : expandedKnowledgeReplyBase;
    const gameDomain = !pendingSearchRetryQuery && isLikelyGameDomainQuery(resolvedKnowledgeQuery, {
      heroContext,
      facts,
      refs: candidateRefs.length > 0 ? candidateRefs : ragRefs,
      directKnowledgeReply,
      literalKnowledgeReply,
      heroAliasReply,
    });

    if (gameDomain && heroAliasReply) {
      return finalizeReply(heroAliasReply, {
        query: resolvedKnowledgeQuery,
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

    if (gameDomain && detailFocusedKnowledgeReply) {
      return finalizeReply(detailFocusedKnowledgeReply, {
        query: resolvedKnowledgeQuery,
        refs,
        versionContext,
        domainMode: 'game',
        focusFragment: knowledgeFocusFragment,
      });
    }

    if (gameDomain && expandedKnowledgeReply) {
      return finalizeReply(expandedKnowledgeReply, {
        query: resolvedKnowledgeQuery,
        refs,
        versionContext,
        domainMode: 'game',
        focusFragment: knowledgeFocusFragment,
      });
    }

    const weatherNeedsSearchFallback = weatherIntent
      && !!weatherLocationHint
      && (!weatherResult || !weatherResult.ok);

    const webSearchIntent = !hasInlineImage && cfg.liveTools.enabled
      && cfg.liveTools.webSearchEnabled
      && (
        weatherNeedsSearchFallback
        || liveTools.shouldUseWebSearch(promptMessage, {
          ragRefs: gameDomain ? ((aliasOnlyKnowledge || headerOnlyKnowledge) ? [] : ragRefs) : [],
          facts: gameDomain ? facts : [],
        })
      );

    const eventRealtimeSearch = !weatherNeedsSearchFallback && liveTools.isEventRealtimeQuery(promptMessage);

    if (webSearchIntent) {
      try {
        const searchQueries = weatherNeedsSearchFallback
          ? `${weatherLocationHint} ${liveTools.getWeatherDayInfo(weatherQuery).dayLabel} 天气`
          : liveTools.buildWebSearchQueries(promptMessage);
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
                  query: promptMessage,
                  refs: [],
                  domainMode: 'general',
                });
              }
            }

            const searchReply = await getSearchGroundedReply(
              bot,
              promptMessage,
              answerResults,
              preferredLocale,
              {
                versionContext: gameDomain ? versionContext : null,
                domainMode: gameDomain ? 'game' : 'general',
              }
            );
            if (searchReply) {
              return finalizeReply(searchReply, {
                query: promptMessage,
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
              query: promptMessage,
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
              query: promptMessage,
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
      const reply = `${weatherLocationHint}${dayLabel} 的可靠天气结果暂时没查到，我现在没法负责任地下结论会不会下雨。你可以稍后再问一次，或者换成更完整的地点，比如“深圳光明区周六会下雨吗”。`;
      return finalizeReply(reply, {
        query: weatherQuery,
        refs: [],
        domainMode: 'general',
      });
    }

    if (!hasInlineImage && gameDomain && shouldBlockUngroundedGameFreeAnswer(resolvedKnowledgeQuery, {
      refs,
      facts,
      liveBlock,
      directKnowledgeReply,
      literalKnowledgeReply,
      detailedGuideKnowledgeReply: expandedKnowledgeReply,
      heroAliasReply,
    })) {
      return finalizeReply(buildNoReliableKnowledgeHitReply(effectiveMessage), {
        query: effectiveMessage,
        refs: [],
        versionContext,
        domainMode: 'game',
        skipReplyPolish: true,
      });
    }

    if (!hasInlineImage && genericFollowupContext.subject && refs.length === 0 && (!gameDomain || facts.length === 0) && !liveBlock) {
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

    if (!hasInlineImage && gameDomain && shouldUseNoHitEntityFallback(message, refs, facts, liveBlock)) {
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

    if (!hasInlineImage && gameDomain && shouldPreferLiteralKnowledgeDraft(resolvedKnowledgeQuery, refs, literalKnowledgeReply)) {
      const groundedLiteralReply = humanizeKnowledgeDraftReply(
        resolvedKnowledgeQuery,
        literalKnowledgeReply,
        preferredLocale
      ) || literalKnowledgeReply;
      return finalizeReply(groundedLiteralReply, {
        query: resolvedKnowledgeQuery,
        refs,
        versionContext,
        domainMode: 'game',
        skipReplyPolish: true,
      });
    }

    if (!hasInlineImage && !gameDomain && isPlanningOrUiNoiseQuery(effectiveMessage) && refs.length === 0 && facts.length === 0 && !liveBlock) {
      return finalizeReply(buildNoReliableKnowledgeHitReply(effectiveMessage), {
        query: effectiveMessage,
        refs: [],
        domainMode: 'general',
        skipReplyPolish: true,
      });
    }

    const messages = buildMessages(
      bot,
      history,
      promptMessage,
      contextBlock,
      factBlock,
      liveBlock,
      gameDomain ? versionContext : null,
      {
        domainMode: gameDomain ? 'game' : 'general',
        mediaContextBlock,
        imageUrl: mediaContext?.inlineDataUrl || '',
      }
    );
    emit('thinking');
    // 璋?LLM
    // 有内联图时必须用 visionModel:本网关对 claude-sonnet-* 会剽除 image_url,
    // 只有 gemini-3.6-flash 等真正支持 image_url 的模型才能看到图。
    const mainChatModel = hasInlineImage
      ? (cfg.llm.visionModel || bot.model || undefined)
      : (bot.model || undefined);
    const { content: rawReply } = await llm.chat(messages, { model: mainChatModel });
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

function buildHeroCardFallbackReply(card) {
  const heroName = String(card && card.name || '').trim() || '\u8fd9\u4e2a\u82f1\u96c4';
  return `${heroName} 这张卡我先给你挂出来，关键信息都在里面。`;
}

function buildHeroCardLeadReply(query, card) {
  const heroName = String(card && card.name || '').trim() || '\u8fd9\u4e2a\u82f1\u96c4';
  const text = String(query || '').trim();
  const intent = getKnowledgeQueryIntent(text);
  const skills = Array.isArray(card && card.skills) ? card.skills : [];
  const coreSkill = skills.find(skill => skill && skill.isCore && skill.name);
  const firstSkill = skills.find(skill => skill && skill.name);
  const skillName = String((coreSkill || firstSkill || {}).name || '').trim();
  const faction = String(card && card.faction || '').trim();
  const career = String(card && card.career || '').trim();
  const rarity = String(card && card.rarity || '').trim();

  if (isHeroCardTeamQuery(text) || isHeroCardEvaluationQuery(text) || intent === 'team' || intent === 'hero_overview') {
    return '';
  }

  switch (intent) {
    case 'quote':
      return card && card.quote
        ? `${heroName} 这句台词直接看卡片就行。`
        : buildHeroCardFallbackReply(card);
    case 'faction':
      return card && card.faction
        ? `${heroName} 是 ${faction} 阵营，卡片上已经标清楚了。`
        : buildHeroCardFallbackReply(card);
    case 'career':
      return card && card.career
        ? `${heroName} 走的是 ${career} 路线，卡片里一眼能看明白。`
        : buildHeroCardFallbackReply(card);
    case 'rarity':
      return card && card.rarity
        ? `${heroName} 是 ${rarity} 稀有度，这里直接给你挂出来了。`
        : buildHeroCardFallbackReply(card);
    case 'skill':
      return skills.length > 0
        ? `${heroName}${skillName ? ` 先看 ${skillName}` : ' 的技能组'}，关键信息我已经放进卡片了。`
        : buildHeroCardFallbackReply(card);
    case 'profile':
      return `${heroName} 的核心信息我先帮你摊开，直接看这张卡就行。`;
    default:
      if (faction && career) {
        return `${heroName} 是 ${faction} 阵营里偏 ${career} 的英雄，先看卡会更直观。`;
      }
      return buildHeroCardFallbackReply(card);
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
  getRecentGenericSubjectFromHistory,
  shouldCarryGenericFollowup,
  hasExplicitBroadScopedObject,
  answerMatchesQuestionIntent,
  shouldPreferHeroCardDirectReply,
  buildGenericContextAugmentedQuery,
  getFocusedFollowupFragment,
  getKnowledgeDetailFocusFragment,
  focusKnowledgeDraftOnFollowup,
  preferForwardKnowledgeArticleRefs,
  buildFocusedRefFollowupReply,
  buildFieldScopedKnowledgeReply,
  shouldReturnSearchUnavailableFallback,
  buildSearchUnavailableReply,
  looksLikeSearchUnavailableReply,
  getPendingSearchRetryQuery,
  getDirectKnowledgeReply,
  hasOnlyHeroAliasMappingRefs,
  getHeroAliasReply,
  getLiteralKnowledgeReply,
  getExpandedKnowledgeReply,
  getDetailedGuideKnowledgeReply,
  shouldPreferLiteralKnowledgeDraft,
  isArticleStyleGuideQuery,
  isPlanningOrUiNoiseQuery,
  detectUserLocale,
  hasOnlyCatalogRefs,
  shouldUseNoHitEntityFallback,
  shouldBlockUngroundedGameFreeAnswer,
  buildNoReliableKnowledgeHitReply,
  isLikelyGameDomainQuery,
  extractKnowledgeQueryFocusTerms,
  buildMediaContextBlock,
  buildMediaAugmentedQuery,
  filterRefsForAnswer,
  getKnowledgeQueryIntent,
  isRefCompatibleWithQueryIntent,
  trimGenericTrailingFollowup,
  sanitizeHeroCardVisibleReply,
  buildHeroCardFallbackReply,
  buildHeroCardLeadReply,
  postProcessAssistantReply,
  isFieldScopedKnowledgeReply,
  humanizeFieldScopedKnowledgeReply,
  humanizeKnowledgeDraftReply,
  shouldPreserveExpandedKnowledgeDraft,
  extractTrailingHeroCardBlock,
  getSearchGroundedReply,
  getHeroCardGroundedReply,
  getNoHitEntityReply,
  getResolvedFollowupReply,
  polishReplyThroughAi,
};
