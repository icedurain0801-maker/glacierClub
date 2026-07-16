const db = require('../config/db');
const cfg = require('../config/kb');
const embedding = require('./embedding');
const vectorStore = require('./vectorStore');

const SNIPPET_MAX = 200;
const PROMPT_REF_MAX = 1400;
const PROMPT_TOTAL_MAX = 3200;
const LEXICAL_SEARCH_LIMIT = 120;
const LEXICAL_SEARCH_TOKEN_LIMIT = 16;

const QUERY_NOISE_TOKENS = new Set([
  '你好', '您好', '哈喽', 'hello', 'hi', 'hey',
  '在吗', '在么', '在不在', '吗', '么', '呢', '啊', '呀',
  '亲爱的', '亲', '谢谢', '好的', '行', '可以',
]);
const TERM_VARIANT_GROUPS = [
  ['联盟', '聯盟', '同盟'],
  ['成员', '成員'],
  ['容纳', '容納'],
  ['阶级', '階級'],
  ['阵营', '陣營'],
  ['职业', '職業'],
  ['台词', '臺詞'],
];

const GENERIC_GUIDE_QUERY_RE = /(?:攻略|推荐|玩法|怎么玩|怎么搭|阵容|搭配)/u;
const GENERIC_GUIDE_FILLER_RE = /(?:有什么|有啥|什么|哪个|哪款|这个|那个|游戏|手游|端游|网游|攻略|推荐|玩法|怎么玩|怎么搭|阵容|搭配|帮我|帮忙|看看|一下呢|呀|啊|呢|的|我想|要|说|讲|聊|可以|有没有)/gu;
const ALLIANCE_SCOPE_RE = /(?:联盟|聯盟|同盟|连盟|連盟|alliance)/iu;
const CITY_SCOPE_RE = /(?:城市|城池|city|cities)/iu;
const MEMBER_SCOPE_RE = /(?:成员|成員)/u;
const CAPACITY_SCOPE_RE = /(?:容纳|容納|可容纳|可容納|上限)/u;
const OFFICIAL_ROSTER_SCOPE_RE = /(?:正式成员|正式成員|替补|替補|候补|候補)/u;

function looksLikeAmbiguousGuideQuery(query) {
  const source = String(query || '').toLowerCase();
  if (!GENERIC_GUIDE_QUERY_RE.test(source)) return false;

  const remainder = source
    .replace(/[^\u4e00-\u9fa5a-z0-9_+\-]+/gu, '')
    .replace(GENERIC_GUIDE_FILLER_RE, '');

  return remainder.length < 2;
}

function extractQueryTokens(text) {
  const source = String(text || '').toLowerCase();
  const tokens = new Set();

  const cjkParts = source.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  for (const part of cjkParts) {
    if (!QUERY_NOISE_TOKENS.has(part)) tokens.add(part);
    if (part.length >= 4) {
      for (let i = 0; i < part.length - 1; i++) {
        const seg = part.slice(i, i + 2);
        if (!QUERY_NOISE_TOKENS.has(seg)) tokens.add(seg);
      }
    }
  }

  const latinParts = source.match(/[a-z0-9_+-]{2,}/g) || [];
  for (const part of latinParts) {
    if (!QUERY_NOISE_TOKENS.has(part)) tokens.add(part);
  }

  return [...tokens];
}

function hasTokenOverlap(query, text) {
  const source = String(text || '').toLowerCase();
  const tokens = extractQueryTokens(query);
  if (tokens.length === 0) return false;
  return tokens.some(token => source.includes(token));
}

function isNumericQuestion(query) {
  return /(?:多少|几|幾|多大|多少人|几人|幾人|多少名|几名|幾名|几个|幾個|上限|人数|人數|容纳|容納)/u.test(String(query || ''));
}

function hasBattleScope(query) {
  return /(?:战场|戰場|参赛|參賽|报名|報名|匹配|替补|替補|正式成员|正式成員|指挥官|指揮官|派出|指派|出战|出戰)/u.test(String(query || ''));
}

function asksPeopleCount(query) {
  return /(?:多少人|几人|幾人|人数|人數|成员|成員|\bpeople\b)/iu.test(String(query || ''));
}

function hasCityScope(text) {
  return CITY_SCOPE_RE.test(String(text || ''));
}

function hasAllianceScope(text) {
  return ALLIANCE_SCOPE_RE.test(String(text || ''));
}

function hasMemberScope(text) {
  return MEMBER_SCOPE_RE.test(String(text || ''));
}

function hasCapacityScope(text) {
  return CAPACITY_SCOPE_RE.test(String(text || ''));
}

function hasOfficialRosterScope(text) {
  return OFFICIAL_ROSTER_SCOPE_RE.test(String(text || ''));
}

function extractLexicalTerms(query) {
  const source = String(query || '').trim().toLowerCase();
  if (!source) return [];

  const ordered = [];
  const seen = new Set();
  const pushTerm = (term) => {
    const value = String(term || '').trim();
    if (!value || value.length < 2 || seen.has(value) || QUERY_NOISE_TOKENS.has(value)) return;
    seen.add(value);
    ordered.push(value);
  };

  const cjkParts = source.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  for (const part of cjkParts) {
    const pieces = part
      .split(/(?:请问|帮我|告诉我|介绍一下|介绍|说说|讲讲|看下|看一下|查下|查一下|搜下|搜一下|怎么|怎样|如何|为啥|为什么|為什麼|是不是|是否|可以|能不能|可不可以|会不会|有多少|多少|几个|幾個|几名|幾名|几人|幾人|什么|什麼|一下|一下一|一下子|的|了|吗|嗎|么|呢|吧|呀|啊|人|名|个|個)/u)
      .filter(piece => piece.length >= 2);

    if (pieces.length === 0) pushTerm(part);
    for (const piece of pieces) {
      pushTerm(piece);
      if (piece.length >= 4) {
        for (let i = 0; i < piece.length - 1; i++) {
          pushTerm(piece.slice(i, i + 2));
        }
      }
    }
  }

  const latinParts = source.match(/[a-z0-9_+-]{2,}/g) || [];
  for (const part of latinParts) {
    pushTerm(part);
  }

  return ordered;
}

function expandTermVariants(term) {
  const variants = new Set([String(term || '').trim()]);
  if (!term) return [];

  for (const group of TERM_VARIANT_GROUPS) {
    const snapshot = [...variants];
    for (const current of snapshot) {
      for (const from of group) {
        if (!current.includes(from)) continue;
        for (const to of group) {
          variants.add(current.replaceAll(from, to));
        }
      }
    }
  }

  return [...variants].filter(Boolean);
}

function buildLexicalSearchTokens(query) {
  const expanded = [];
  const seen = new Set();

  for (const term of extractLexicalTerms(query)) {
    for (const variant of expandTermVariants(term)) {
      if (!variant || seen.has(variant) || QUERY_NOISE_TOKENS.has(variant)) continue;
      seen.add(variant);
      expanded.push(variant);
    }
  }

  return expanded
    .slice()
    .sort((a, b) => {
      const lenDiff = b.length - a.length;
      if (lenDiff !== 0) return lenDiff;
      return a.localeCompare(b);
    })
    .slice(0, LEXICAL_SEARCH_TOKEN_LIMIT);
}

function scoreLexicalMatch(query, content) {
  const text = String(content || '').toLowerCase();
  if (!text) return 0;

  const lexicalTerms = buildLexicalSearchTokens(query);
  const longTerms = lexicalTerms.filter(term => term.length >= 3);

  let score = 0;
  let matchedCount = 0;

  for (const term of longTerms) {
    if (!text.includes(term)) continue;
    matchedCount += 1;
    score += 8 + Math.min(term.length, 6);
  }

  for (const token of lexicalTerms.filter(term => term.length === 2)) {
    if (!text.includes(token)) continue;
    matchedCount += 1;
    score += 3;
  }

  if (matchedCount >= 2) score += Math.min(12, matchedCount);
  if (isNumericQuestion(query)) {
    if (/\d/.test(text)) score += 4;
    if (/(?:最多可容纳\d+名(?:成员|成員)|最多可容納\d+名(?:成员|成員)|可容纳\d+名(?:成员|成員)|可容納\d+名(?:成员|成員)|\d+名(?:成员|成員).*(?:阶级|階級)|分为\d+个阶级|分為\d+個階級)/u.test(text)) {
      score += 14;
    }
    if (!hasBattleScope(query) && /(?:战场|戰場|参赛|參賽|报名|報名|匹配|替补|替補|正式成员|正式成員|指挥官|指揮官|派出|指派|出战|出戰)/u.test(text)) {
      score -= 20;
    }
  }
  if (asksPeopleCount(query)) {
    if (/(?:成员|成員|盟友)/u.test(text)) score += 12;
    if (/(?:城市|城池|city|cities)/iu.test(text)) score -= 12;
  }

  return score;
}

function buildRelevantSnippet(content, query, maxLen = SNIPPET_MAX) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;

  const lower = text.toLowerCase();
  const searchTokens = buildLexicalSearchTokens(query);
  let matchIndex = -1;
  let matchLength = 0;

  for (const token of searchTokens) {
    const idx = lower.indexOf(token.toLowerCase());
    if (idx === -1) continue;
    matchIndex = idx;
    matchLength = token.length;
    break;
  }

  if (matchIndex === -1) {
    return `${text.slice(0, maxLen - 1).trim()}...`;
  }

  const usableLen = Math.max(40, maxLen - 1);
  let start = Math.max(0, matchIndex - Math.floor((usableLen - matchLength) / 2));
  let end = Math.min(text.length, start + usableLen);
  if (end - start < usableLen) start = Math.max(0, end - usableLen);

  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `...${snippet}`;
  if (end < text.length) snippet = `${snippet}...`;
  return snippet;
}

function splitNormalizedLines(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function isLikelyFieldLine(line) {
  return /^[^:\s][^:\n]{0,30}:\s*/u.test(String(line || ''));
}

function isLikelyAssetLine(line) {
  return /(?:https?:\/\/|\\\\|\/kb-images\/)/iu.test(String(line || ''));
}

function isLikelyProseLine(line) {
  const text = String(line || '').trim();
  if (text.length < 16) return false;
  return /[，。；：,.!?]/u.test(text);
}

function scoreGuideBodySignals(lines) {
  const normalizedLines = Array.isArray(lines) ? lines : splitNormalizedLines(lines);
  const sectionLines = normalizedLines.filter(line => /(?:^[一二三四五六七八九十]+、|^\d+[.、]|^[-*•])/u.test(line)).length;
  const sentenceLines = normalizedLines.filter(line => isLikelyProseLine(line) && !isLikelyFieldLine(line)).length;
  const translatedGuideLines = normalizedLines.filter(
    line => line.includes(' | ') && /[\u4e00-\u9fa5]/u.test(line) && line.length >= 24
  ).length;
  return sectionLines + sentenceLines + translatedGuideLines;
}

function scoreMetadataPenalty(content) {
  const lines = splitNormalizedLines(content);
  if (lines.length === 0) return 0;

  const fieldLines = lines.filter(isLikelyFieldLine).length;
  const assetLines = lines.filter(isLikelyAssetLine).length;
  const proseLines = lines.filter(isLikelyProseLine).length;
  const guideSignals = scoreGuideBodySignals(lines);

  let penalty = 0;
  if (fieldLines >= 4) penalty += fieldLines;
  if (assetLines >= 2) penalty += assetLines * 2;
  if (proseLines === 0 && fieldLines >= 3) penalty += 8;
  else if (proseLines <= 3 && fieldLines >= 4) penalty += 8;
  else if (proseLines <= 2 && fieldLines >= 6) penalty += 4;
  if (guideSignals >= 3) penalty = Math.max(0, penalty - 12);
  if (guideSignals >= 5) penalty = 0;

  return penalty;
}

function isMetadataHeavyContent(content) {
  return scoreMetadataPenalty(content) >= 12;
}

function scoreLineAgainstQuery(line, query) {
  const source = String(line || '').toLowerCase();
  if (!source) return Number.NEGATIVE_INFINITY;

  let score = 0;
  const exactQuery = String(query || '').trim().toLowerCase();
  if (exactQuery && source.includes(exactQuery)) score += 100;

  for (const token of buildLexicalSearchTokens(query)) {
    if (!source.includes(String(token || '').toLowerCase())) continue;
    score += token.length >= 3 ? 12 + Math.min(token.length, 6) : 4;
  }

  if (isLikelyFieldLine(source)) score -= 6;
  if (isLikelyAssetLine(source)) score -= 10;
  if (isLikelyProseLine(source)) score += 8;
  return score;
}

function buildPromptExcerpt(content, query, maxLen = PROMPT_REF_MAX) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  if (isMetadataHeavyContent(text)) {
    return buildRelevantSnippet(text, query, Math.min(maxLen, 400));
  }

  const lines = splitNormalizedLines(text);
  if (lines.length === 0) return '';

  while (lines.length > 1 && /^(?:Sheet|Rows?|Reference)\s*:/i.test(lines[0])) {
    lines.shift();
  }

  const joined = lines.join('\n');
  if (joined.length <= maxLen) return joined;

  let startIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  lines.forEach((line, index) => {
    const lineScore = scoreLineAgainstQuery(line, query);
    if (lineScore > bestScore) {
      bestScore = lineScore;
      startIndex = index;
    }
  });

  if (startIndex > 0 && !isLikelyFieldLine(lines[startIndex - 1]) && !isLikelyAssetLine(lines[startIndex - 1])) {
    startIndex -= 1;
  }

  const parts = [];
  let used = 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const candidateLen = used + line.length + (parts.length > 0 ? 1 : 0);
    if (candidateLen > maxLen && parts.length > 0) break;
    parts.push(line);
    used = candidateLen;
  }

  let excerpt = parts.join('\n').trim();
  if (!excerpt) return buildRelevantSnippet(text, query, Math.min(maxLen, SNIPPET_MAX));
  if (startIndex > 0) excerpt = `...${excerpt}`;
  if (startIndex + parts.length < lines.length) excerpt = `${excerpt}...`;
  return excerpt;
}

function extractTitleNeedles(query) {
  const raw = String(query || '').trim().toLowerCase();
  const normalized = raw
    .replace(/^(?:介绍一下|介绍|说说|讲讲|讲下|问下|问一下|请问|帮我|我想问|想问|聊聊)/u, '')
    .replace(/[?？!！。,.，\s]+/gu, '');
  const tokens = buildLexicalSearchTokens(query)
    .map(token => String(token || '').trim().toLowerCase())
    .filter(token => token.length >= 4);
  return [...new Set([raw, normalized, ...tokens].filter(Boolean))];
}

function hasTitleStyleMatch(query, content) {
  const needles = extractTitleNeedles(query);
  if (needles.length === 0) return false;

  const lines = splitNormalizedLines(content).map(line => line.toLowerCase());
  return needles.some((needle) => lines.some((line) => {
    if (!line.includes(needle)) return false;
    if (line === needle) return true;
    if (isLikelyFieldLine(line)) {
      const fieldValue = line.replace(/^[^:]+:\s*/u, '').trim();
      return fieldValue === needle;
    }
    return false;
  }));
}

function scoreIntentAlignment(query, content) {
  const text = String(content || '');
  if (!text) return 0;

  let score = 0;
  const peopleCountQuery = asksPeopleCount(query);
  const numericQuery = isNumericQuestion(query);
  const battleScopedQuery = hasBattleScope(query);

  if (peopleCountQuery) {
    if (hasAllianceScope(text)) score += 8;
    else score -= 8;
    if (hasMemberScope(text)) score += 14;
    if (hasCapacityScope(text)) score += 12;
    if (hasCityScope(text)) score -= 18;
    if (!battleScopedQuery && hasBattleScope(text)) score -= 30;
    if (!battleScopedQuery && hasOfficialRosterScope(text)) score -= 12;
  }

  if (numericQuery && /\d/.test(text)) {
    score += 4;
  }

  return score;
}

function rerankRefsByIntent(query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return [];

  const rescored = refs
    .map((ref) => {
      const intentText = String(ref.matchText || ref.snippet || '');
      const intentScore = scoreIntentAlignment(query, intentText);
      const metadataPenalty = scoreMetadataPenalty(intentText);
      const blendedScore = (Number(ref.lexicalScore || 0) * 3)
        + (Number(ref.semanticScore || ref.score || 0) * 100)
        + (intentScore * 5)
        - (metadataPenalty * 5);

      return {
        ...ref,
        intentScore,
        metadataPenalty,
        blendedScore,
      };
    })
    .sort((a, b) => {
      if (b.blendedScore !== a.blendedScore) return b.blendedScore - a.blendedScore;
      if (b.lexicalScore !== a.lexicalScore) return b.lexicalScore - a.lexicalScore;
      return b.semanticScore - a.semanticScore;
    });

  const top = rescored[0];
  if (!top) return rescored;

  if (
    asksPeopleCount(query)
    && !hasBattleScope(query)
    && top.intentScore >= 28
    && hasAllianceScope(top.snippet || top.matchText)
    && hasMemberScope(top.snippet || top.matchText)
    && hasCapacityScope(top.snippet || top.matchText)
  ) {
    return rescored.filter((ref) => {
      const intentText = ref.snippet || ref.matchText;
      if (ref.entryId === top.entryId) return true;
      if (ref.intentScore < 0) return false;
      if (!hasAllianceScope(intentText)) return false;
      if (!hasMemberScope(intentText)) return false;
      if (!hasCapacityScope(intentText)) return false;
      if (hasCityScope(intentText)) return false;
      if (hasBattleScope(intentText)) return false;
      return true;
    });
  }

  return rescored;
}

function filterRelevantRefs(query, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  if (looksLikeAmbiguousGuideQuery(query)) return [];

  return refs.filter((ref) => {
    const lexicalScore = Number(ref.lexicalScore || 0);
    const intentText = ref.snippet || ref.matchText;
    const intentScore = Number(
      ref.intentScore != null
        ? ref.intentScore
        : scoreIntentAlignment(query, intentText)
    );
    if (intentScore <= -12) return false;
    if (lexicalScore >= 10) return true;
    const matchText = ref.matchText || ref.snippet;
    if (ref.score >= cfg.ragMinRefScore) return true;
    return ref.score >= cfg.ragWeakRefScore && hasTokenOverlap(query, matchText);
  });
}

async function loadEntryContents(versionId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return new Map();
  const [rows] = await db.query(
    `SELECT id, content FROM knowledge_entries WHERE version_id=? AND id IN (${ids.map(() => '?').join(',')})`,
    [versionId, ...ids]
  );
  return new Map(rows.map(row => [row.id, row.content]));
}

async function lexicalSearch(versionId, query, limit = LEXICAL_SEARCH_LIMIT) {
  const tokens = buildLexicalSearchTokens(query);
  if (tokens.length === 0) return [];

  const [rows] = await db.query(
    'SELECT id, content FROM knowledge_entries WHERE version_id=?',
    [versionId]
  );

  return rows
    .filter((row) => {
      const content = String(row.content || '').toLowerCase();
      return tokens.some(token => content.includes(String(token || '').toLowerCase()));
    })
    .map(row => ({
      entryId: row.id,
      lexicalScore: scoreLexicalMatch(query, row.content),
      content: row.content,
    }))
    .filter(row => row.lexicalScore > 0)
    .sort((a, b) => b.lexicalScore - a.lexicalScore)
    .slice(0, limit);
}

async function loadImagesByEntry(ids) {
  try {
    const [imgRows] = await db.query(
      `SELECT entry_id, url FROM kb_entry_images WHERE entry_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const map = new Map();
    for (const img of imgRows) {
      if (!map.has(img.entry_id)) map.set(img.entry_id, []);
      map.get(img.entry_id).push(img.url);
    }
    return map;
  } catch (err) {
    console.error('[ragContext] loadImagesByEntry failed:', err.message);
    return new Map();
  }
}

async function retrieve(versionId, query, topK = 5) {
  try {
    let vectorHits = [];
    try {
      const [qvec] = await embedding.embedBatch([query]);
      if (qvec) {
        vectorHits = vectorStore.search(versionId, qvec, Math.max(topK * 3, 12));
      }
    } catch (err) {
      console.error('[ragContext] embed/search failed, fallback to lexical only:', err.message);
    }

    const lexicalHits = await lexicalSearch(versionId, query);
    const ids = [...new Set([
      ...vectorHits.map(hit => hit.entryId),
      ...lexicalHits.map(hit => hit.entryId),
    ])];
    if (ids.length === 0) return [];

    const contentById = await loadEntryContents(versionId, ids);
    const imagesByEntry = await loadImagesByEntry(ids);
    const vectorById = new Map(vectorHits.map(hit => [hit.entryId, hit]));
    const lexicalById = new Map(lexicalHits.map(hit => [hit.entryId, hit]));

    const refs = ids
      .filter(id => contentById.has(id))
      .map((id) => {
        const content = String(contentById.get(id) || '');
        const semanticScore = Number(vectorById.get(id)?.score || 0);
        const lexicalScore = Number(lexicalById.get(id)?.lexicalScore || scoreLexicalMatch(query, content));
        return {
          entryId: id,
          query,
          score: Math.max(semanticScore, lexicalScore / 100),
          semanticScore,
          lexicalScore,
          snippet: buildRelevantSnippet(content, query),
          matchText: content,
          images: imagesByEntry.get(id) || [],
        };
      });

    return filterRelevantRefs(query, rerankRefsByIntent(query, refs)).slice(0, topK);
  } catch (err) {
    console.error('[ragContext] retrieve failed:', err.message);
    return [];
  }
}

function toContextBlock(refs) {
  if (!refs || refs.length === 0) return '';
  const preferredRefs = refs.filter(
    ref => !isMetadataHeavyContent(ref.matchText || ref.snippet || '')
  );
  const sourceRefs = preferredRefs.length > 0 ? preferredRefs : refs;
  const titleMatchedRefs = sourceRefs.filter(
    ref => hasTitleStyleMatch(ref.query || '', ref.matchText || ref.snippet || '')
  );
  const finalRefs = titleMatchedRefs.length > 0 ? titleMatchedRefs : sourceRefs;
  let items = '';
  let used = 0;

  for (let index = 0; index < finalRefs.length; index += 1) {
    const ref = finalRefs[index];
    const excerpt = buildPromptExcerpt(ref.matchText || ref.snippet || '', ref.query || '', PROMPT_REF_MAX);
    if (!excerpt) continue;
    const item = `[${index + 1}] ${excerpt}`;
    const nextUsed = used + item.length + (items ? 1 : 0);
    if (nextUsed > PROMPT_TOTAL_MAX) break;
    items = items ? `${items}\n${item}` : item;
    used = nextUsed;
  }

  if (items.length === 0) return '';
  return `\n\n以下是从知识库检索到的相关资料，若有相关内容请优先参考回答：\n${items}`;
}

module.exports = {
  retrieve,
  toContextBlock,
  SNIPPET_MAX,
  extractQueryTokens,
  hasTokenOverlap,
  buildLexicalSearchTokens,
  scoreLexicalMatch,
  buildRelevantSnippet,
  buildPromptExcerpt,
  hasTitleStyleMatch,
  scoreMetadataPenalty,
  isMetadataHeavyContent,
  scoreIntentAlignment,
  rerankRefsByIntent,
  filterRelevantRefs,
  looksLikeAmbiguousGuideQuery,
};
