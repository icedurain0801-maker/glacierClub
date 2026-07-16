const cfg = require('../config/kb');

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const BING_RSS_SEARCH_URL = 'https://www.bing.com/search?format=rss&q=';

const WEATHER_CODE_TEXT = {
  0: '\u6674',
  1: '\u5927\u81f4\u6674\u6717',
  2: '\u5c11\u4e91',
  3: '\u591a\u4e91',
  45: '\u6709\u96fe',
  48: '\u96fe\u51c7',
  51: '\u6bdb\u6bdb\u96e8',
  53: '\u5c0f\u6bdb\u6bdb\u96e8',
  55: '\u5927\u6bdb\u6bdb\u96e8',
  56: '\u51bb\u6bdb\u6bdb\u96e8',
  57: '\u5f3a\u51bb\u6bdb\u6bdb\u96e8',
  61: '\u5c0f\u96e8',
  63: '\u4e2d\u96e8',
  65: '\u5927\u96e8',
  66: '\u51bb\u96e8',
  67: '\u5f3a\u51bb\u96e8',
  71: '\u5c0f\u96ea',
  73: '\u4e2d\u96ea',
  75: '\u5927\u96ea',
  77: '\u51b0\u7c92',
  80: '\u9635\u96e8',
  81: '\u8f83\u5f3a\u9635\u96e8',
  82: '\u5f3a\u9635\u96e8',
  85: '\u9635\u96ea',
  86: '\u5f3a\u9635\u96ea',
  95: '\u96f7\u9635\u96e8',
  96: '\u96f7\u66b4\u4f34\u5c0f\u51b0\u96f9',
  99: '\u96f7\u66b4\u4f34\u5f3a\u51b0\u96f9',
};

const WEATHER_KEYWORDS = [
  '\u5929\u6c14',
  '\u6c14\u6e29',
  '\u6e29\u5ea6',
  '\u4f53\u611f',
  '\u6e7f\u5ea6',
  '\u98ce\u529b',
  '\u98ce\u901f',
  '\u964d\u96e8',
  '\u4e0b\u96e8',
  '\u4e0b\u96ea',
  '\u5929\u6c14\u9884\u62a5',
  '\u51e0\u5ea6',
  '\u51b7\u4e0d\u51b7',
  '\u70ed\u4e0d\u70ed',
  'weather',
  'forecast',
  'temperature',
  'rain',
  'snow',
];

const LOCATION_SUFFIXES = [
  '\u7279\u522b\u884c\u653f\u533a',
  '\u81ea\u6cbb\u533a',
  '\u81ea\u6cbb\u5dde',
  '\u81ea\u6cbb\u53bf',
  '\u81ea\u6cbb\u65d7',
  '\u5f00\u53d1\u533a',
  '\u9ad8\u65b0\u533a',
  '\u4fdd\u7a0e\u533a',
  '\u5de5\u4e1a\u56ed\u533a',
  '\u98ce\u666f\u533a',
  '\u65b0\u533a',
  '\u666f\u533a',
  '\u77ff\u533a',
  '\u6797\u533a',
  '\u5730\u533a',
  '\u7701',
  '\u5e02',
  '\u533a',
  '\u53bf',
  '\u65d7',
  '\u5dde',
  '\u76df',
];

const DISTRICT_LEVEL_SUFFIXES = [
  '\u5f00\u53d1\u533a',
  '\u9ad8\u65b0\u533a',
  '\u4fdd\u7a0e\u533a',
  '\u5de5\u4e1a\u56ed\u533a',
  '\u98ce\u666f\u533a',
  '\u65b0\u533a',
  '\u666f\u533a',
  '\u77ff\u533a',
  '\u6797\u533a',
  '\u81ea\u6cbb\u53bf',
  '\u81ea\u6cbb\u65d7',
  '\u533a',
  '\u53bf',
  '\u65d7',
];

const EXPLICIT_SEARCH_KEYWORDS = [
  '\u8054\u7f51\u641c\u7d22',
  '\u4e0a\u7f51\u641c',
  '\u7f51\u4e0a\u641c',
  '\u641c\u7d22',
  '\u641c\u4e00\u4e0b',
  '\u641c\u4e00\u641c',
  '\u67e5\u4e00\u4e0b',
  '\u67e5\u67e5',
  '\u5e2e\u6211\u641c',
  '\u5e2e\u6211\u67e5',
  '\u6700\u65b0',
  '\u6700\u8fd1',
  '\u65b0\u95fb',
  '\u5b98\u7f51',
  '\u5b9e\u65f6',
  '\u70ed\u641c',
  'price',
  'latest',
  'news',
  'official',
  'current',
];

const WEB_TIMELY_KEYWORDS = [
  '\u4eca\u5929',
  '\u73b0\u5728',
  '\u76ee\u524d',
  '\u672c\u5468',
  '\u521a\u521a',
  '\u4eca\u65e5',
  '\u8fd1\u65e5',
  '\u8fd9\u4e00\u5468',
  'today',
  'now',
];

const EVENT_TOPIC_KEYWORDS = [
  '\u4e16\u754c\u676f',
  '\u6b27\u51a0',
  'nba',
  'cba',
  '\u8db3\u7403',
  '\u7bee\u7403',
  '\u7535\u7ade',
  '\u6bd4\u8d5b',
  '\u8d5b\u4e8b',
];

const EVENT_REALTIME_KEYWORDS = [
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
  'schedule',
  'score',
  'final',
  'when',
];

const EVENT_MATCHUP_KEYWORDS = [
  '\u5bf9\u9635',
  '\u8c01\u5bf9\u8c01',
  '\u662f\u8c01\u5bf9\u8c01',
  '\u8c01\u6253\u8c01',
  '\u54ea\u4e24\u961f',
  '\u4e24\u961f',
  '\u53cc\u65b9',
  '\u4f1a\u5e08',
  '\u53c2\u8d5b\u7403\u961f',
  'matchup',
  'finalists',
  'vs',
  'versus',
  'face',
];

const TRUSTED_EVENT_DOMAINS = [
  'fifa.com',
  'thepaper.cn',
  'xinhuanet.com',
  'people.com.cn',
  'cctv.com',
  'espn.com',
  'bbc.com',
  'reuters.com',
  'apnews.com',
];

const CHITCHAT_PATTERNS = [
  /^\u4f60\u597d[\u5417\u554a\u5462]?$/u,
  /^\u60a8\u597d[\u5417\u554a\u5462]?$/u,
  /^\u55e8$/u,
  /^\u54c8\u55bd$/u,
  /^hello$/iu,
  /^hi$/iu,
  /^hey$/iu,
  /^\u5728\u5417$/u,
  /^\u8c22\u8c22[\u4f60\u60a8]?$/u,
  /^\u4f60\u662f\u8c01$/u,
];

const INFORMATIONAL_QUESTION_PATTERNS = [
  /(?:[?\uFF1F]|\u5417|\u5462)$/u,
  /(?:\u4ec0\u4e48|\u5565|\u600e\u6837|\u600e\u4e48\u6837|\u5982\u4f55|\u600e\u4e48|\u4e3a\u4f55|\u4e3a\u4ec0\u4e48|\u591a\u5c11|\u51e0\u4e2a|\u8c01|\u54ea\u4f4d|\u54ea\u4e2a|\u54ea\u4e9b|\u54ea\u79cd|\u54ea\u91cc|\u54ea\u513f|\u4f55\u65f6|\u6709\u6ca1\u6709|\u80fd\u4e0d\u80fd|\u53ef\u4e0d\u53ef\u4ee5|\u4f1a\u4e0d\u4f1a|\u662f\u5426|\u4ecb\u7ecd\u4e00\u4e0b|\u8bf4\u8bf4|\u8bb2\u8bb2|\u89e3\u91ca\u4e00\u4e0b|\u4ec0\u4e48\u610f\u601d)/u,
  /\b(?:what|why|how|when|where|who|which|is|are|do|does|can|could|should|would)\b/i,
];

const WEATHER_LOCATION_STOPWORDS = new Set([
  '\u4eca\u5929',
  '\u660e\u5929',
  '\u540e\u5929',
  '\u73b0\u5728',
  '\u5f53\u524d',
  '\u672c\u5468',
  '\u8fd9\u5468',
  '\u5468\u672b',
  '\u4e00\u4e0b',
  '\u4e00\u4e0b\u5b50',
  '\u5929\u6c14',
  '\u6c14\u6e29',
  '\u6e29\u5ea6',
  '\u6e7f\u5ea6',
  '\u98ce\u529b',
  '\u98ce\u901f',
  '\u964d\u96e8',
  '\u4e0b\u96e8',
  '\u4e0b\u96ea',
  '\u5929\u6c14\u9884\u62a5',
  '\u600e\u4e48\u6837',
  '\u54cb\u6837',
  '\u5982\u4f55',
  '\u591a\u5c11\u5ea6',
  '\u51e0\u5ea6',
  '\u4f1a\u4e0d\u4f1a',
  '\u6709\u6ca1\u6709',
  '\u5e2e\u6211',
  '\u8bf7\u95ee',
  '\u67e5\u4e00\u4e0b',
  '\u67e5\u67e5',
  '\u641c\u4e00\u4e0b',
  '\u641c\u4e00\u641c',
  '\u770b\u4e00\u4e0b',
  '\u95ee\u4e00\u4e0b',
  '\u90a3\u4f1a',
  '\u8fd9\u4f1a',
  '\u672c\u4f1a',
  'weather',
  'forecast',
  'temperature',
  'rain',
  'snow',
]);

const STANDALONE_TOPIC_STOPWORDS = new Set([
  '',
  '这个',
  '那个',
  '这个呢',
  '那个呢',
  '继续',
  '然后',
  '还有',
  '还有呢',
  '在吗',
  '在么',
  '你好',
  '您好',
  '谢谢',
  '好的',
  '好',
  '嗯',
  '哦',
  'ok',
  'okay',
  'yes',
  'no',
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return htmlDecode(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function weatherCodeToText(code) {
  return WEATHER_CODE_TEXT[Number(code)] || '\u5929\u6c14\u672a\u77e5';
}

function isWeatherQuery(query) {
  const normalized = normalizeText(query);
  const lower = normalized.toLowerCase();
  if (!lower) return false;
  if (WEATHER_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()))) return true;
  return /(\u4f1a\u4e0d\u4f1a\u4e0b\u96e8|\u4f1a\u4e0d\u4f1a\u4e0b\u96ea|\u4f1a\u4e0b\u96e8\u5417|\u4f1a\u4e0b\u96ea\u5417|\u4e0b\u4e0d\u4e0b\u96e8|\u4e0b\u4e0d\u4e0b\u96ea|\u6709\u6ca1\u6709\u96e8|\u6709\u6ca1\u6709\u96ea|\u6709\u96e8\u5417|\u6709\u96ea\u5417|\u51e0\u5ea6|\u51b7\u4e0d\u51b7|\u70ed\u4e0d\u70ed)/u.test(normalized);
}

function getWeekdayIndex(token) {
  const map = {
    '\u65e5': 0,
    '\u5929': 0,
    '\u4e00': 1,
    '\u4e8c': 2,
    '\u4e09': 3,
    '\u56db': 4,
    '\u4e94': 5,
    '\u516d': 6,
  };
  return Object.prototype.hasOwnProperty.call(map, token) ? map[token] : null;
}

function getUpcomingWeekdayOffset(targetDay, now = new Date(), forceNextWeek = false) {
  const currentDay = now.getDay();
  let offset = (targetDay - currentDay + 7) % 7;
  if (forceNextWeek) {
    offset += offset === 0 ? 7 : 7;
  }
  return offset;
}

function getWeatherDayInfo(query, now = new Date()) {
  const text = normalizeText(query);
  if (text.includes('\u5927\u540e\u5929')) return { dayOffset: 3, dayLabel: '\u5927\u540e\u5929', hasExplicitDay: true };
  if (text.includes('\u540e\u5929')) return { dayOffset: 2, dayLabel: '\u540e\u5929', hasExplicitDay: true };
  if (text.includes('\u660e\u5929')) return { dayOffset: 1, dayLabel: '\u660e\u5929', hasExplicitDay: true };
  if (/(\u4eca\u5929|\u73b0\u5728|\u5f53\u524d|\u4eca\u665a)/u.test(text)) {
    return { dayOffset: 0, dayLabel: '\u4eca\u5929', hasExplicitDay: true };
  }

  const weekendMatch = text.match(/(\u4e0b\u5468\u672b|\u4e0b\u661f\u671f\u672b|\u4e0b\u793c\u62dc\u672b|\u672c\u5468\u672b|\u8fd9\u5468\u672b|\u5468\u672b)/u);
  if (weekendMatch) {
    const forceNextWeek = /^\u4e0b/.test(weekendMatch[1]);
    return {
      dayOffset: getUpcomingWeekdayOffset(6, now, forceNextWeek),
      dayLabel: weekendMatch[1].startsWith('\u4e0b') ? '\u4e0b\u5468\u672b' : '\u5468\u672b',
      hasExplicitDay: true,
    };
  }

  const weekdayMatch = text.match(/(\u4e0b\u5468|\u4e0b\u661f\u671f|\u4e0b\u793c\u62dc|\u672c\u5468|\u8fd9\u5468)?(?:\u5468|\u661f\u671f|\u793c\u62dc)([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])/u);
  if (weekdayMatch) {
    const targetDay = getWeekdayIndex(weekdayMatch[2]);
    if (targetDay != null) {
      const prefix = weekdayMatch[1] || '';
      const forceNextWeek = /^\u4e0b/.test(prefix);
      return {
        dayOffset: getUpcomingWeekdayOffset(targetDay, now, forceNextWeek),
        dayLabel: `${prefix}\u5468${weekdayMatch[2] === '\u5929' ? '\u65e5' : weekdayMatch[2]}`,
        hasExplicitDay: true,
      };
    }
  }

  return { dayOffset: 0, dayLabel: '\u4eca\u5929', hasExplicitDay: false };
}

function detectWeatherDayOffset(query, now = new Date()) {
  return getWeatherDayInfo(query, now).dayOffset;
}

function isWeatherFollowupQuery(query) {
  const text = normalizeText(query).replace(/[\s,，。！？?!]/g, '');
  if (!text || text.length > 24) return false;
  if (isWeatherQuery(text)) return false;
  return getWeatherDayInfo(text).hasExplicitDay;
}

function isCasualChitChat(query) {
  const text = normalizeText(query);
  return CHITCHAT_PATTERNS.some(pattern => pattern.test(text));
}

function isInformationalQuery(query) {
  const text = normalizeText(query);
  if (!text || isCasualChitChat(text)) return false;
  return INFORMATIONAL_QUESTION_PATTERNS.some(pattern => pattern.test(text));
}

function isStandaloneSearchTopic(query) {
  const text = normalizeText(query);
  if (!text) return false;
  if (isCasualChitChat(text) || isWeatherQuery(text)) return false;
  if (isInformationalQuery(text)) return false;

  const compact = text.replace(/\s+/g, '');
  const compactLower = compact.toLowerCase();
  if (!compact || compact.length > 24) return false;
  if (STANDALONE_TOPIC_STOPWORDS.has(compactLower)) return false;
  if (/^(?:这|那|它|他|她|继续|然后|还有|更多|再来|下一个|上一个|这个人|这个角色|那个角色)$/u.test(compact)) return false;

  const hasChineseTopic = /^[\u4e00-\u9fa5]{2,12}$/u.test(compact);
  const hasAsciiTopic = /^[A-Za-z0-9][A-Za-z0-9 .:+_\-]{1,31}$/u.test(text) && /[A-Za-z]/.test(text);
  if (!hasChineseTopic && !hasAsciiTopic) return false;

  return true;
}

function isEventMatchupQuery(query) {
  const lower = normalizeText(query).toLowerCase();
  if (!lower) return false;
  return EVENT_MATCHUP_KEYWORDS.some(keyword => lower.includes(keyword));
}

function isEventRealtimeQuery(query) {
  const lower = normalizeText(query).toLowerCase();
  if (!lower) return false;
  const hasEventTopic = EVENT_TOPIC_KEYWORDS.some(keyword => lower.includes(keyword));
  const hasRealtimeNeed = EVENT_REALTIME_KEYWORDS.some(keyword => lower.includes(keyword));
  return hasEventTopic && (hasRealtimeNeed || isEventMatchupQuery(lower));
}

function extractExplicitYear(query) {
  const match = String(query || '').match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildWebSearchQuery(query, now = new Date()) {
  const normalized = normalizeText(query);
  if (!isEventRealtimeQuery(normalized) || extractExplicitYear(normalized)) return normalized;
  return `${now.getFullYear()} ${normalized}`;
}

function buildWebSearchQueries(query, now = new Date()) {
  const baseQuery = buildWebSearchQuery(query, now);
  const normalized = normalizeText(baseQuery);
  const year = extractExplicitYear(baseQuery) || now.getFullYear();
  const queries = [baseQuery];

  if (isEventMatchupQuery(normalized) && /(\u4e16\u754c\u676f|fifa world cup)/iu.test(normalized)) {
    queries.unshift(`${year} FIFA World Cup finalists`);
    queries.push(`${year} \u4e16\u754c\u676f\u51b3\u8d5b \u5bf9\u9635`);
  }

  return [...new Set(queries.map(item => normalizeText(item)).filter(Boolean))];
}

function getEventSearchAliases(query) {
  const lower = normalizeText(query).toLowerCase();
  if (!lower) return [];

  if (lower.includes('\u4e16\u754c\u676f') || lower.includes('fifa world cup')) {
    return ['\u4e16\u754c\u676f', 'fifa world cup', 'world cup'];
  }

  if (lower.includes('\u6b27\u51a0') || lower.includes('champions league')) {
    return ['\u6b27\u51a0', 'champions league', 'uefa'];
  }

  if (lower.includes('nba')) {
    return ['nba', 'finals'];
  }

  if (lower.includes('cba')) {
    return ['cba', '\u603b\u51b3\u8d5b'];
  }

  return [];
}

function filterReliableEventResults(query, results = [], now = new Date()) {
  if (!isEventRealtimeQuery(query) || !Array.isArray(results)) return results;

  const explicitYear = extractExplicitYear(query);
  const years = explicitYear ? [explicitYear] : [now.getFullYear(), now.getFullYear() + 1];
  const aliases = getEventSearchAliases(query);
  const matchupIntent = isEventMatchupQuery(query);

  return results.filter((item) => {
    const text = [
      item.title || '',
      item.source || '',
      item.url || '',
      item.snippet || '',
    ].join(' ').toLowerCase();

    const hasAlias = aliases.length === 0 || aliases.some(alias => text.includes(alias.toLowerCase()));
    if (!hasAlias) return false;

    const hasTrustedDomain = TRUSTED_EVENT_DOMAINS.some(domain => text.includes(domain));
    const hasYear = years.some(year => text.includes(String(year)));
    if (!hasYear) return false;

    const hasRealtimeSignal = EVENT_REALTIME_KEYWORDS.some(keyword => text.includes(String(keyword).toLowerCase()));
    const hasMatchupSignal = EVENT_MATCHUP_KEYWORDS.some(keyword => text.includes(String(keyword).toLowerCase()))
      || /\bvs\b|\bversus\b|\bface\b|\bfaces\b|\bfinalists?\b/u.test(text);

    if (matchupIntent) {
      return hasTrustedDomain || hasMatchupSignal;
    }

    return hasTrustedDomain && (hasRealtimeSignal || hasMatchupSignal || hasAlias);
  });
}

function shouldUseWebSearch(query, { ragRefs = [], facts = [] } = {}) {
  const normalized = normalizeText(query);
  const lower = normalized.toLowerCase();
  if (!lower || isWeatherQuery(normalized) || isCasualChitChat(normalized)) return false;
  if (EXPLICIT_SEARCH_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()))) return true;
  if (isEventRealtimeQuery(normalized)) return true;
  if (ragRefs.length > 0 || facts.length > 0) return false;
  if (WEB_TIMELY_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()))) return true;
  if (isStandaloneSearchTopic(normalized)) return true;
  return isInformationalQuery(normalized);
}

function cleanLocationCandidate(rawValue) {
  let value = normalizeText(rawValue)
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(/\s+/g, ' ');

  const removable = [
    '\u5e2e\u6211\u67e5\u4e00\u4e0b',
    '\u5e2e\u6211\u67e5\u4e0b',
    '\u5e2e\u6211\u67e5',
    '\u5e2e\u6211\u770b\u4e00\u4e0b',
    '\u5e2e\u6211\u770b\u4e0b',
    '\u5e2e\u6211\u770b',
    '\u5e2e\u6211\u641c\u4e00\u4e0b',
    '\u5e2e\u6211\u641c',
    '\u8bf7\u95ee\u4e00\u4e0b',
    '\u8bf7\u95ee',
    '\u67e5\u4e00\u4e0b',
    '\u67e5\u4e0b',
    '\u67e5\u67e5',
    '\u641c\u4e00\u4e0b',
    '\u641c\u4e00\u641c',
    '\u770b\u4e00\u4e0b',
    '\u95ee\u4e00\u4e0b',
    '\u4eca\u5929',
    '\u660e\u5929',
    '\u540e\u5929',
    '\u73b0\u5728',
    '\u5f53\u524d',
    '\u672c\u5468',
    '\u8fd9\u5468',
    '\u5468\u672b',
    '\u7684',
    '\u5929\u6c14\u600e\u4e48\u6837',
    '\u5929\u6c14',
    '\u6c14\u6e29',
    '\u6e29\u5ea6',
    '\u4f53\u611f',
    '\u6e7f\u5ea6',
    '\u98ce\u529b',
    '\u98ce\u901f',
    '\u964d\u96e8',
    '\u4e0b\u96e8',
    '\u4e0b\u96ea',
    'weather in',
    'weather for',
    'weather',
    'forecast for',
    'forecast',
    'temperature',
    '\u600e\u4e48\u6837',
    '\u54cb\u6837',
    '\u5982\u4f55',
    '\u591a\u5c11\u5ea6',
    '\u51e0\u5ea6',
    '\u4f1a\u4e0d\u4f1a',
    '\u4f1a\u4e0b\u96e8\u5417',
    '\u4f1a\u4e0b\u96ea\u5417',
    '\u4e0b\u4e0d\u4e0b\u96e8',
    '\u4e0b\u4e0d\u4e0b\u96ea',
    '\u6709\u96e8\u5417',
    '\u6709\u96ea\u5417',
    '\u6709\u6ca1\u6709',
    '\u5417',
    '\u5462',
    '\u554a',
    '\u5440',
    '\u5427',
  ];

  for (const token of removable) {
    value = value.replace(new RegExp(token, 'igu'), ' ');
  }

  value = value
    .replace(/(?:\u4e0b\u5468|\u672c\u5468|\u8fd9\u5468)?\u5468[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929]/gu, ' ')
    .replace(/(?:\u4e0b\u661f\u671f|\u672c\u661f\u671f|\u8fd9\u661f\u671f)?\u661f\u671f[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929]/gu, ' ')
    .replace(/(?:\u4e0b\u793c\u62dc|\u672c\u793c\u62dc|\u8fd9\u793c\u62dc)?\u793c\u62dc[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929]/gu, ' ')
    .replace(/(?:\u4e0b\u5468\u672b|\u672c\u5468\u672b|\u8fd9\u5468\u672b|\u5468\u672b)/gu, ' ');

  value = value
    .replace(/(?:\u4f1a\u6709|\u4f1a)$/u, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/[\u4e00-\u9fa5]/u.test(value) && !/[a-z]/iu.test(value)) {
    value = value.replace(/\s+/g, '');
  }
  if (!value) return '';
  if (value.length < 2) return '';
  if (/(?:谁|什么|咋|怎么|怎样|如何|为何|为什么|多少|几岁|几号|几点|新闻|消息|介绍|技能|台词|阵营|职业|稀有度|英雄|角色)/u.test(value)) {
    return '';
  }
  if (WEATHER_LOCATION_STOPWORDS.has(value.toLowerCase())) return '';
  return value;
}

function extractWeatherLocation(query) {
  const text = normalizeText(query);
  if (!text) return '';

  const englishPatterns = [
    /\b(?:weather|forecast|temperature)\s+(?:in|for)\s+([a-z][a-z\s.-]{1,40})\b/iu,
    /\b([a-z][a-z\s.-]{1,40})\s+(?:weather|forecast|temperature)\b/iu,
  ];

  for (const pattern of englishPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return cleanLocationCandidate(match[1]);
    }
  }

  const chinesePatterns = [
    /(?:\u4eca\u5929|\u660e\u5929|\u540e\u5929|\u73b0\u5728|\u5f53\u524d)?\s*([^\s,?????]{2,20}?)(?:\u5929\u6c14\u600e\u4e48\u6837|\u5929\u6c14\u54cb\u6837|\u4f1a\u4e0d\u4f1a\u4e0b\u96e8|\u4f1a\u4e0d\u4f1a\u4e0b\u96ea|\u4f1a\u4e0b\u96e8\u5417|\u4f1a\u4e0b\u96ea\u5417|\u4e0b\u4e0d\u4e0b\u96e8|\u4e0b\u4e0d\u4e0b\u96ea|\u6709\u6ca1\u6709\u96e8|\u6709\u6ca1\u6709\u96ea|\u6709\u96e8\u5417|\u6709\u96ea\u5417|\u70ed\u4e0d\u70ed|\u51b7\u4e0d\u51b7|\u51e0\u5ea6)/u,
    /^([^\s,?????]{2,20}?)(?:\u4eca\u5929|\u660e\u5929|\u540e\u5929|\u73b0\u5728|\u5f53\u524d|\u672c\u5468|\u8fd9\u5468|\u5468\u672b|(?:\u4e0b\u5468|\u672c\u5468|\u8fd9\u5468)?\u5468[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])(?:\u5929\u6c14\u600e\u4e48\u6837|\u5929\u6c14\u54cb\u6837|\u4f1a\u4e0d\u4f1a\u4e0b\u96e8|\u4f1a\u4e0d\u4f1a\u4e0b\u96ea|\u4f1a\u4e0b\u96e8\u5417|\u4f1a\u4e0b\u96ea\u5417|\u4e0b\u4e0d\u4e0b\u96e8|\u4e0b\u4e0d\u4e0b\u96ea|\u6709\u6ca1\u6709\u96e8|\u6709\u6ca1\u6709\u96ea|\u6709\u96e8\u5417|\u6709\u96ea\u5417|\u70ed\u4e0d\u70ed|\u51b7\u4e0d\u51b7|\u51e0\u5ea6)/u,
    /(?:\u5e2e\u6211|\u8bf7\u95ee|\u6211\u60f3|\u60f3)?(?:\u67e5\u4e00\u4e0b|\u67e5\u4e0b|\u67e5\u67e5|\u641c\u4e00\u4e0b|\u641c\u4e00\u641c|\u770b\u4e00\u4e0b|\u95ee\u4e00\u4e0b)?\s*([^\s,?????]{2,20}?)(?:\u4eca\u5929|\u660e\u5929|\u540e\u5929|\u73b0\u5728|\u5f53\u524d|\u672c\u5468|\u8fd9\u5468|\u5468\u672b)?(?:\u5929\u6c14|\u6c14\u6e29|\u6e29\u5ea6|\u4f53\u611f|\u6e7f\u5ea6|\u98ce\u529b|\u98ce\u901f|\u964d\u96e8|\u4e0b\u96e8|\u4e0b\u96ea)/u,
  ];

  for (const pattern of chinesePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const cleaned = cleanLocationCandidate(match[1]);
      if (cleaned) return cleaned;
    }
  }

  const cleanedText = cleanLocationCandidate(text);
  if (cleanedText) return cleanedText;

  return '';
}

function buildGeocodeCandidates(name) {
  const raw = normalizeText(name);
  const compact = raw.replace(/\s+/g, '');
  const candidates = [];
  const seen = new Set();

  const addCandidate = value => {
    const cleaned = normalizeText(value);
    if (!cleaned || cleaned.length < 2 || seen.has(cleaned)) return;
    seen.add(cleaned);
    candidates.push(cleaned);
  };

  addCandidate(compact);
  addCandidate(raw);

  if (!/[\u4e00-\u9fa5]/u.test(compact)) {
    return candidates;
  }

  const districtTokens = buildDistrictTailTokens(compact);
  districtTokens.forEach(addCandidate);

  if (districtTokens.length > 0) {
    const primaryDistrictToken = districtTokens[0];
    const districtBase = stripTrailingLocationSuffix(primaryDistrictToken);
    const prefix = compact.slice(0, compact.length - primaryDistrictToken.length);

    addCandidate(districtBase);
    addCandidate(prefix);
    if (prefix && !/[\u7701\u5e02]$/u.test(prefix)) {
      addCandidate(`${prefix}\u5e02`);
    }
  }

  const trimmedCompact = stripTrailingLocationSuffix(compact);
  if (trimmedCompact && trimmedCompact !== compact) {
    addCandidate(trimmedCompact);
  }

  if (/[\u7701\u5e02]$/u.test(compact)) {
    addCandidate(compact.slice(0, -1));
  }

  return candidates;
}

function normalizeLocationText(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function stripTrailingLocationSuffix(value) {
  const normalized = normalizeLocationText(value);
  for (const suffix of LOCATION_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
      return normalized.slice(0, -suffix.length);
    }
  }
  return normalized;
}

function buildDistrictTailTokens(value) {
  const normalized = normalizeLocationText(value);
  if (!normalized) return [];

  const tokens = [];
  const seen = new Set();
  const maxTokenLength = Math.min(6, normalized.length);

  for (const suffix of DISTRICT_LEVEL_SUFFIXES) {
    if (!normalized.endsWith(suffix)) continue;

    for (let len = suffix.length + 2; len <= maxTokenLength; len += 1) {
      const token = normalized.slice(-len);
      if (!token.endsWith(suffix) || seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens.sort((a, b) => a.length - b.length);
}

function getDistrictContext(requestedName) {
  const requested = normalizeLocationText(requestedName);
  const districtTokens = buildDistrictTailTokens(requested);
  const primaryDistrictToken = districtTokens[0] || '';
  const prefix = primaryDistrictToken
    ? requested.slice(0, requested.length - primaryDistrictToken.length)
    : '';

  return {
    requested,
    primaryDistrictToken,
    prefix,
  };
}

function includesLocationToken(fields, token) {
  if (!token) return false;
  return fields.some(field => field === token || field.includes(token));
}

function isTrustedGeocodeResult(requestedName, candidate, item) {
  const { requested, primaryDistrictToken, prefix } = getDistrictContext(requestedName);
  const requestedBase = stripTrailingLocationSuffix(requested);
  const candidateText = normalizeLocationText(candidate);
  const candidateBase = stripTrailingLocationSuffix(candidateText);
  const fields = [
    item.name,
    item.admin1,
    item.admin2,
    item.admin3,
    item.admin4,
    item.country,
  ]
    .map(normalizeLocationText)
    .filter(Boolean);

  if (fields.length === 0) return false;

  if (primaryDistrictToken) {
    if (!includesLocationToken(fields, primaryDistrictToken)) {
      return false;
    }

    if (!prefix) return true;

    const prefixCandidates = [
      prefix,
      stripTrailingLocationSuffix(prefix),
      /[\u7701\u5e02]$/u.test(prefix) ? prefix : `${prefix}\u5e02`,
    ].filter(Boolean);

    return prefixCandidates.some(token => includesLocationToken(fields, token));
  }

  if (includesLocationToken(fields, requested) || includesLocationToken(fields, candidateText)) {
    return true;
  }

  const relaxedTokens = [requestedBase, candidateBase]
    .filter(token => token && token.length >= 2);
  return relaxedTokens.some(token => includesLocationToken(fields, token));
}

function isApproximateParentGeocodeResult(requestedName, candidate, item) {
  const { primaryDistrictToken, prefix } = getDistrictContext(requestedName);
  if (!primaryDistrictToken || !prefix) return false;

  const candidateText = normalizeLocationText(candidate);
  const fields = [
    item.name,
    item.admin1,
    item.admin2,
    item.admin3,
    item.admin4,
    item.country,
  ]
    .map(normalizeLocationText)
    .filter(Boolean);

  const prefixCandidates = [
    prefix,
    stripTrailingLocationSuffix(prefix),
    /[\u7701\u5e02]$/u.test(prefix) ? prefix : `${prefix}\u5e02`,
  ].filter(Boolean);

  const candidateMatchesPrefix = prefixCandidates.some(token => candidateText === token);
  if (!candidateMatchesPrefix) return false;

  return prefixCandidates.some(token => includesLocationToken(fields, token));
}

async function fetchWithTimeout(url, { method = 'GET', headers = {}, body, timeoutMs, redirect = 'follow' } = {}) {
  const mergedHeaders = { ...DEFAULT_HEADERS, ...headers };
  const response = await fetch(url, {
    method,
    headers: mergedHeaders,
    body,
    signal: AbortSignal.timeout(timeoutMs || cfg.liveTools.requestTimeoutMs),
    redirect,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  return response;
}

async function fetchJson(url, options) {
  const res = await fetchWithTimeout(url, options);
  return res.json();
}

async function fetchText(url, options) {
  const res = await fetchWithTimeout(url, options);
  return res.text();
}

function formatLocationName(location) {
  const parts = [location.name];
  if (location.region && location.region !== location.name) parts.push(location.region);
  if (location.country && !parts.includes(location.country)) parts.push(location.country);
  return parts.filter(Boolean).join(' / ');
}

function formatMetric(value, suffix = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  const display = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
  return `${display}${suffix}`;
}

async function geocodeLocation(name) {
  const candidates = buildGeocodeCandidates(name);

  for (const candidate of candidates) {
    const url = `${cfg.liveTools.weatherGeocodeUrl}?name=${encodeURIComponent(candidate)}&count=5&language=zh&format=json`;
    const data = await fetchJson(url);
    if (!data || !Array.isArray(data.results) || data.results.length === 0) continue;

    const item = data.results.find(result => isTrustedGeocodeResult(name, candidate, result));
    if (item) {
      return {
        name: item.name || candidate,
        latitude: item.latitude,
        longitude: item.longitude,
        timezone: item.timezone || '',
        region: item.admin1 || item.admin2 || '',
        country: item.country || '',
        approximate: false,
      };
    }

    const approximateItem = data.results.find(result => isApproximateParentGeocodeResult(name, candidate, result));
    if (!approximateItem) continue;

    return {
      name: approximateItem.name || candidate,
      latitude: approximateItem.latitude,
      longitude: approximateItem.longitude,
      timezone: approximateItem.timezone || '',
      region: approximateItem.admin1 || approximateItem.admin2 || '',
      country: approximateItem.country || '',
      approximate: true,
    };
  }

  return null;
}

function toWeatherPromptBlock(result, dayLabel) {
  const current = result.current || {};
  const today = result.daily && result.daily[0] ? result.daily[0] : {};

  return [
    '\u4ee5\u4e0b\u662f\u5b9e\u65f6\u5929\u6c14\u5de5\u5177\u8fd4\u56de\u7ed3\u679c\u3002\u82e5\u7528\u6237\u5728\u95ee\u5929\u6c14\uff0c\u5fc5\u987b\u4ec5\u57fa\u4e8e\u8fd9\u4e9b\u5b9e\u65f6\u7ed3\u679c\u56de\u7b54\uff0c\u4e0d\u8981\u8bf4\u77e5\u8bc6\u5e93\u672a\u6536\u5f55\uff0c\u4e5f\u4e0d\u8981\u8f93\u51fa\u5f15\u7528\u6216\u56fe\u7247\u3002',
    `\u67e5\u8be2\u5730\u70b9: ${result.locationName}`,
    `\u67e5\u8be2\u76ee\u6807: ${dayLabel}`,
    `\u5f53\u524d\u5929\u6c14: ${weatherCodeToText(current.weather_code)}\uff0c${formatMetric(current.temperature_2m, '\u00b0C')}\uff0c\u4f53\u611f${formatMetric(current.apparent_temperature, '\u00b0C')}\uff0c\u6e7f\u5ea6${formatMetric(current.relative_humidity_2m, '%')}\uff0c\u98ce\u901f${formatMetric(current.wind_speed_10m, ' km/h')}`,
    `\u4eca\u65e5\u6982\u89c8: ${weatherCodeToText(today.weather_code)}\uff0c\u6700\u9ad8${formatMetric(today.temperature_2m_max, '\u00b0C')}\uff0c\u6700\u4f4e${formatMetric(today.temperature_2m_min, '\u00b0C')}\uff0c\u964d\u6c34\u6982\u7387${formatMetric(today.precipitation_probability_max, '%')}`,
  ].join('\n');
}

function buildWeatherReply(result, dayOffset, dayLabel = '\u4eca\u5929') {
  const current = result.current || {};
  const target = result.daily && result.daily[dayOffset] ? result.daily[dayOffset] : result.daily[0];

  if (!target) {
    return `${result.locationName}\u7684\u5b9e\u65f6\u5929\u6c14\u6682\u65f6\u6ca1\u62ff\u5230\u5b8c\u6574\u7ed3\u679c\uff0c\u4f60\u53ef\u4ee5\u7a0d\u540e\u518d\u8bd5\u4e00\u6b21\u3002`;
  }

  const forecastLine = `${result.locationName}${dayLabel}\u9884\u8ba1${weatherCodeToText(target.weather_code)}\uff0c\u6700\u9ad8${formatMetric(target.temperature_2m_max, '\u00b0C')}\uff0c\u6700\u4f4e${formatMetric(target.temperature_2m_min, '\u00b0C')}\uff0c\u964d\u6c34\u6982\u7387${formatMetric(target.precipitation_probability_max, '%')}`;
  const currentLine = `\u5f53\u524d\u5b9e\u65f6${weatherCodeToText(current.weather_code)}\uff0c${formatMetric(current.temperature_2m, '\u00b0C')}\uff0c\u4f53\u611f${formatMetric(current.apparent_temperature, '\u00b0C')}\uff0c\u6e7f\u5ea6${formatMetric(current.relative_humidity_2m, '%')}\uff0c\u98ce\u901f${formatMetric(current.wind_speed_10m, ' km/h')}\u3002`;
  return `${forecastLine}\u3002\n${currentLine}`;
}

async function getWeatherResult(query) {
  const requestedLocation = extractWeatherLocation(query);
  if (!requestedLocation) {
    return { ok: false, requiresLocation: true };
  }

  const location = await geocodeLocation(requestedLocation);
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return { ok: false, requiresLocation: true };
  }

  const dayInfo = getWeatherDayInfo(query);
  const dayOffset = dayInfo.dayOffset;
  const forecastDays = Math.max(3, Math.min(16, dayOffset + 1));
  const url = `${cfg.liveTools.weatherApiUrl}?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=${forecastDays}&timezone=auto`;
  const data = await fetchJson(url);

  const daily = Array.isArray(data.daily && data.daily.time)
    ? data.daily.time.map((time, index) => ({
        time,
        weather_code: data.daily.weather_code[index],
        temperature_2m_max: data.daily.temperature_2m_max[index],
        temperature_2m_min: data.daily.temperature_2m_min[index],
        precipitation_probability_max: data.daily.precipitation_probability_max[index],
      }))
    : [];

  const result = {
    ok: true,
    locationName: location.approximate
      ? `${requestedLocation}\uff08\u6309${location.name}\u5929\u6c14\u8fd1\u4f3c\uff09`
      : formatLocationName(location),
    dayOffset,
    current: data.current || {},
    daily,
  };

  return {
    ...result,
    reply: buildWeatherReply(result, dayOffset, dayInfo.dayLabel),
    promptBlock: toWeatherPromptBlock(result, dayInfo.dayLabel),
  };
}

function parseSogouSearchResults(html, limit = cfg.liveTools.webSearchTopK) {
  const source = String(html || '');
  const regex = /<h3 class="vr-title">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>([\s\S]*?)(?=<h3 class="vr-title">|$)/gi;
  const results = [];
  const seen = new Set();
  let match;

  while ((match = regex.exec(source)) && results.length < limit) {
    const href = match[1];
    const title = stripTags(match[2]);
    const body = match[3];
    const snippetMatch = body.match(/<div class="fz-mid[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const spans = [...body.matchAll(/<span>([\s\S]*?)<\/span>/gi)]
      .map(item => stripTags(item[1]))
      .filter(Boolean);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : '';
    const sourceLabel = spans.find(item => /^https?:\/\//i.test(item) || item.includes('.')) || '';
    const publishTime = spans.find(item => /(\u521a\u521a|\u4eca\u5929|\u6628\u5929|\d+\s*(\u5206\u949f|\u5c0f\u65f6|\u5929|\u5468|\u6708|\u5e74)\u524d)/.test(item)) || '';
    const key = `${title}|${sourceLabel}|${snippet}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    results.push({
      title,
      url: href.startsWith('http') ? href : `https://www.sogou.com${href}`,
      source: sourceLabel,
      time: publishTime,
      snippet,
    });
  }

  return results;
}

function parseBingRssResults(xml, limit = cfg.liveTools.webSearchTopK) {
  const source = String(xml || '');
  const results = [];
  const seen = new Set();
  let match;
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;

  while ((match = itemRegex.exec(source)) && results.length < limit) {
    const item = match[1];
    const title = stripTags((item.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const url = stripTags((item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
    const snippet = stripTags((item.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '');
    const publishTime = stripTags((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '');
    let sourceLabel = '';

    try {
      sourceLabel = new URL(url).hostname.replace(/^www\./i, '');
    } catch {
      sourceLabel = '';
    }

    const key = `${title}|${url}|${snippet}`;
    if (!title || !url || seen.has(key)) continue;
    seen.add(key);
    results.push({
      title,
      url,
      source: sourceLabel,
      time: publishTime,
      snippet,
    });
  }

  return results;
}

function decodeBingTrackingUrl(value) {
  const raw = htmlDecode(value);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const encoded = parsed.searchParams.get('u');
    if (!encoded || !encoded.startsWith('a1')) return raw;

    let base64 = encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return Buffer.from(base64, 'base64').toString('utf8');
  } catch {
    return raw;
  }
}

function parseBingHtmlResults(html, limit = cfg.liveTools.webSearchTopK) {
  const source = String(html || '');
  if (!source.includes('b_algo')) return [];

  const results = [];
  const seen = new Set();
  const blocks = source.split('<li class="b_algo"').slice(1);

  for (const block of blocks) {
    const hrefMatch = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"/i);
    const titleMatch = block.match(/<h2[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h2>/i);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const citeMatch = block.match(/<cite>([\s\S]*?)<\/cite>/i);

    const title = stripTags(titleMatch ? titleMatch[1] : '');
    const url = decodeBingTrackingUrl(hrefMatch ? hrefMatch[1] : '');
    const sourceLabel = stripTags(citeMatch ? citeMatch[1] : '');
    const snippet = stripTags(snippetMatch ? snippetMatch[1] : '');
    const key = `${title}|${url}|${snippet}`;

    if (!title || !url || seen.has(key)) continue;
    seen.add(key);
    results.push({
      title,
      url,
      source: sourceLabel,
      time: '',
      snippet,
    });
    if (results.length >= limit) break;
  }

  return results;
}

function extractSearchTerms(query) {
  const normalized = normalizeText(query)
    .toLowerCase()
    .replace(/(?:\u6700\u65b0|\u6700\u8fd1|\u8fd1\u51b5|\u65b0\u95fb|\u6d88\u606f|\u8bf7\u95ee|\u5e2e\u6211|\u67e5\u4e00\u4e0b|\u67e5\u67e5|\u641c\u4e00\u4e0b|\u641c\u4e00\u641c|\u4ecb\u7ecd\u4e00\u4e0b|\u4ecb\u7ecd|\u8bf4\u8bf4|\u8bb2\u8bb2|\u600e\u4e48|\u600e\u4e48\u6837|\u4ec0\u4e48|\u4e3a\u4ec0\u4e48|\u4e3a\u4f55|\u591a\u5c11|\u51e0\u4e2a|\u54ea\u4e2a|\u54ea\u4e9b|\u662f\u4ec0\u4e48|\u6709\u54ea\u4e9b|latest|news|current|today|now)/gu, ' ')
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/gu, ' ');

  return [...new Set(normalized
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2))];
}

function hasWeatherSignal(text) {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return false;

  const weatherSignals = [
    '\u5929\u6c14',
    '\u964d\u96e8',
    '\u4e0b\u96e8',
    '\u4e0b\u96ea',
    '\u9635\u96e8',
    '\u5c0f\u96e8',
    '\u4e2d\u96e8',
    '\u5927\u96e8',
    '\u66b4\u96e8',
    '\u591a\u4e91',
    '\u9634',
    '\u6674',
    '\u9884\u62a5',
    'weather',
    'forecast',
    'rain',
    'snow',
  ];

  return weatherSignals.some(signal => normalized.includes(signal.toLowerCase()));
}

function filterRelevantSearchResults(query, results) {
  if (!Array.isArray(results) || results.length === 0) return [];

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  if (isWeatherQuery(normalizedQuery)) {
    const location = extractWeatherLocation(normalizedQuery);
    const locationCandidates = location ? buildGeocodeCandidates(location) : [];
    const dayInfo = getWeatherDayInfo(normalizedQuery);
    const dayAliases = dayInfo.hasExplicitDay
      ? [...new Set([
          dayInfo.dayLabel,
          dayInfo.dayLabel.replace(/^\u5468/u, '\u661f\u671f'),
          dayInfo.dayLabel.replace(/^\u5468/u, '\u793c\u62dc'),
        ])]
      : [];

    return results.filter(item => {
      const haystack = `${item.title || ''} ${item.snippet || ''}`;
      if (!hasWeatherSignal(haystack)) return false;

      const matchesLocation = locationCandidates.length === 0
        || locationCandidates.some(candidate => candidate && haystack.includes(candidate));
      if (!matchesLocation) return false;

      if (!dayInfo.hasExplicitDay) return true;
      return dayAliases.some(alias => alias && haystack.includes(alias));
    });
  }

  const searchTerms = extractSearchTerms(normalizedQuery);
  if (searchTerms.length === 0) return results;

  return results.filter(item => {
    const haystack = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
    return searchTerms.some(term => haystack.includes(term));
  });
}

function buildWeatherSearchFallbackReply(query, results) {
  if (!isWeatherQuery(query) || !Array.isArray(results) || results.length === 0) return '';

  const dayLabel = getWeatherDayInfo(query).dayLabel;
  const location = extractWeatherLocation(query) || '\u5f53\u5730';
  const texts = results
    .slice(0, 5)
    .map(item => `${item.title || ''} ${item.snippet || ''}`);

  const rainSignals = ['\u96e8', '\u9635\u96e8', '\u96f7\u9635\u96e8', '\u5c0f\u96e8', '\u4e2d\u96e8', '\u5927\u96e8', '\u66b4\u96e8', '\u9677\u6c34'];
  const drySignals = ['\u6674', '\u9634', '\u591a\u4e91', '\u5c11\u4e91'];
  const rainVotes = texts.filter(text => rainSignals.some(signal => text.includes(signal))).length;
  const dryVotes = texts.filter(text => drySignals.some(signal => text.includes(signal))).length;

  if (rainVotes > 0 && dryVotes > 0) {
    return `${location}${dayLabel}\u7684\u5929\u6c14\u641c\u7d22\u7ed3\u679c\u4e0d\u5b8c\u5168\u4e00\u81f4\uff0c\u4f46\u5df2\u7ecf\u51fa\u73b0\u4e86\u964d\u96e8/\u9635\u96e8\u4fe1\u606f\uff0c\u503e\u5411\u4e8e\u6709\u4e0b\u96e8\u53ef\u80fd\uff0c\u51fa\u95e8\u5efa\u8bae\u5e26\u4f1e\u3002`;
  }

  if (rainVotes > 0) {
    return `${location}${dayLabel}\u503e\u5411\u4e8e\u6709\u96e8\uff0c\u51fa\u95e8\u5efa\u8bae\u5e26\u4f1e\u3002`;
  }

  if (dryVotes > 0) {
    return `${location}${dayLabel}\u76ee\u524d\u641c\u7d22\u7ed3\u679c\u91cc\u6ca1\u770b\u5230\u660e\u786e\u964d\u96e8\u4fe1\u53f7\uff0c\u503e\u5411\u4e8e\u4e0d\u4e0b\u96e8\uff0c\u4f46\u51fa\u53d1\u524d\u518d\u770b\u4e00\u6b21\u5b9e\u65f6\u5929\u6c14\u66f4\u7a33\u3002`;
  }

  return `${location}${dayLabel}\u7684\u5929\u6c14\u641c\u7d22\u7ed3\u679c\u4fe1\u606f\u4e0d\u591f\u7a33\u5b9a\uff0c\u6682\u65f6\u53ea\u80fd\u8bf4\u6709\u53d8\u5929\u53ef\u80fd\uff0c\u51fa\u95e8\u524d\u5efa\u8bae\u518d\u786e\u8ba4\u4e00\u6b21\u5b9e\u65f6\u5929\u6c14\u3002`;
}

function toWebSearchPromptBlock(query, results) {
  const items = results
    .map((item, index) => [
      '[' + (index + 1) + '] \u6807\u9898: ' + item.title,
      item.source ? '\u6765\u6e90: ' + item.source : '',
      item.time ? '\u65f6\u95f4: ' + item.time : '',
      item.snippet ? '\u6458\u8981: ' + item.snippet : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n');
  const weatherCaution = isWeatherQuery(query)
    ? '\u82e5\u641c\u7d22\u7ed3\u679c\u662f\u5929\u6c14\u7ad9\u6458\u8981\u6216\u65f6\u95f4\u4fe1\u606f\u4e0d\u4e00\u81f4\uff0c\u53ea\u7ed9\u51fa\u662f\u5426\u4e0b\u96e8/\u5927\u81f4\u5929\u6c14\u8d8b\u52bf\u8fd9\u79cd\u4fdd\u5b88\u7ed3\u8bba\uff0c\u4e0d\u8981\u81ea\u884c\u7f16\u9020\u5177\u4f53\u65e5\u671f\u3001\u6e29\u5ea6\u6216\u65f6\u95f4\u3002'
    : '';

  return [
    '\u4ee5\u4e0b\u662f\u8054\u7f51\u641c\u7d22\u5de5\u5177\u8fd4\u56de\u7ed3\u679c\u3002\u82e5\u7528\u6237\u7684\u95ee\u9898\u5c5e\u4e8e\u8054\u7f51\u641c\u7d22\u6216\u5b9e\u65f6\u4fe1\u606f\uff0c\u8bf7\u4f18\u5148\u57fa\u4e8e\u8fd9\u4e9b\u7ed3\u679c\u56de\u7b54\u3002',
    '\u4e0d\u8981\u7f16\u9020\u672a\u51fa\u73b0\u5728\u641c\u7d22\u7ed3\u679c\u4e2d\u7684\u4e8b\u5b9e\uff1b\u9664\u975e\u7528\u6237\u660e\u786e\u8981\u6c42\u6765\u6e90\u94fe\u63a5\uff0c\u5426\u5219\u4e0d\u8981\u5728\u56de\u7b54\u4e2d\u76f4\u63a5\u5217 URL\uff0c\u4e5f\u4e0d\u8981\u8f93\u51fa\u56fe\u7247\u3002',
    weatherCaution,
    '\u641c\u7d22\u8bcd: ' + query,
    items,
  ].filter(Boolean).join('\n');
}

async function getWebSearchResult(query) {
  const queries = Array.isArray(query) ? query : [query];

  for (const currentQuery of queries) {
    const searchStrategies = [
      async () => {
        const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(currentQuery)}&setlang=en-US&cc=US`, {
          redirect: 'manual',
        });
        return parseBingHtmlResults(html);
      },
      async () => {
        const url = `${cfg.liveTools.webSearchUrl}?query=${encodeURIComponent(currentQuery)}`;
        const html = await fetchText(url);
        return parseSogouSearchResults(html);
      },
      async () => {
        const xml = await fetchText(`${BING_RSS_SEARCH_URL}${encodeURIComponent(currentQuery)}`);
        return parseBingRssResults(xml);
      },
    ];

    for (const runSearch of searchStrategies) {
      try {
        const results = filterRelevantSearchResults(currentQuery, await runSearch());
        if (results.length === 0) continue;
        return {
          ok: true,
          queryUsed: currentQuery,
          results,
          promptBlock: toWebSearchPromptBlock(currentQuery, results),
        };
      } catch (err) {
        console.error('[liveTools] web search strategy failed:', err.message);
      }
    }
  }

  return { ok: false, reason: 'no_results' };
}

module.exports = {
  isWeatherQuery,
  detectWeatherDayOffset,
  getWeatherDayInfo,
  isWeatherFollowupQuery,
  extractWeatherLocation,
  isInformationalQuery,
  isStandaloneSearchTopic,
  isEventRealtimeQuery,
  isEventMatchupQuery,
  buildWebSearchQuery,
  buildWebSearchQueries,
  shouldUseWebSearch,
  weatherCodeToText,
  parseSogouSearchResults,
  parseBingRssResults,
  parseBingHtmlResults,
  filterRelevantSearchResults,
  filterReliableEventResults,
  buildWeatherSearchFallbackReply,
  getWeatherResult,
  getWebSearchResult,
};
