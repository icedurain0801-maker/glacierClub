const db = require('../config/db');
const llm = require('./llm');

const SCORE_FIELDS = [
  'accuracy_score',
  'relevance_score',
  'completeness_score',
  'safety_score',
  'tone_score',
];

const RISK_LEVELS = new Set(['low', 'medium', 'high']);
const REVIEW_STATUSES = new Set(['pending', 'reviewed', 'ignored']);
const SCORE_STATUSES = new Set(['pending', 'processing', 'completed', 'fallback', 'failed']);
const RISK_TAGS = new Set(['accuracy', 'relevance', 'completeness', 'safety', 'tone']);
const SCORE_QUEUE = [];
let isQueueRunning = false;

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(1, Math.min(5, Math.round(score)));
}

function clampPercent(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

function toJsonArray(value, limit = 3, normalizer = item => normalizeText(item)) {
  if (!Array.isArray(value)) return JSON.stringify([]);
  return JSON.stringify(
    value
      .map(normalizer)
      .filter(Boolean)
      .slice(0, limit)
  );
}

function normalizeRiskTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(item => normalizeText(item).toLowerCase())
    .filter(item => RISK_TAGS.has(item) && !seen.has(item) && seen.add(item))
    .slice(0, 5);
}

function computeTotalScore(result) {
  const valid = SCORE_FIELDS
    .map(field => result[field])
    .filter(score => Number.isFinite(score));
  if (valid.length === 0) return null;
  return Math.round(((valid.reduce((sum, score) => sum + score, 0) / valid.length) * 20) * 10) / 10;
}

function gradeFromTotal(totalScore) {
  if (!Number.isFinite(totalScore)) return null;
  if (totalScore >= 90) return 'A';
  if (totalScore >= 80) return 'B';
  if (totalScore >= 70) return 'C';
  if (totalScore >= 60) return 'D';
  return 'E';
}

function getTokenSet(text) {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return new Set();
  const matches = normalized.match(/[\u4e00-\u9fff]{1,4}|[a-z0-9]{2,}/gu) || [];
  return new Set(matches);
}

function overlaps(userText, assistantText) {
  const userTokens = getTokenSet(userText);
  const assistantTokens = getTokenSet(assistantText);
  if (userTokens.size === 0 || assistantTokens.size === 0) return 0;
  let matched = 0;
  userTokens.forEach(token => {
    if (assistantTokens.has(token)) matched += 1;
  });
  return matched / userTokens.size;
}

function buildHeuristicScore({ userContent, assistantContent, refs = [] }) {
  const userText = normalizeText(userContent);
  const answerText = normalizeText(assistantContent);
  const answerLength = answerText.length;
  const overlapRatio = overlaps(userText, answerText);
  const lowerAnswer = answerText.toLowerCase();

  let accuracyScore = refs.length > 0 ? 4 : 3;
  if (/(不确定|无法确认|建议以官方|暂时没查到|i do not know|not sure|cannot confirm)/iu.test(answerText)) {
    accuracyScore = Math.max(accuracyScore, 4);
  }
  if (/(瞎猜|胡说|随便)/iu.test(answerText)) {
    accuracyScore = 1;
  }

  let relevanceScore = 2;
  if (overlapRatio >= 0.55) relevanceScore = 5;
  else if (overlapRatio >= 0.35) relevanceScore = 4;
  else if (overlapRatio >= 0.18) relevanceScore = 3;

  let completenessScore = 2;
  if (answerLength >= 180) completenessScore = 5;
  else if (answerLength >= 100) completenessScore = 4;
  else if (answerLength >= 40) completenessScore = 3;
  if (/(不知道|不清楚|稍后再试|try again later)/iu.test(answerText)) {
    completenessScore = Math.max(2, completenessScore - 1);
  }

  let safetyScore = 5;
  if (/(杀|死|暴力|仇恨|歧视|赌博|色情|诈骗|自杀|kill|suicide|hate|porn|fraud)/iu.test(answerText)) {
    safetyScore = 2;
  } else if (/(危险|谨慎|官方)/iu.test(answerText)) {
    safetyScore = 4;
  }

  let toneScore = 4;
  if (/(笨|滚|废物|傻|蠢|垃圾|idiot|stupid)/iu.test(answerText)) toneScore = 1;
  else if (/(请|建议|可以|方便的话|thank|please)/iu.test(answerText)) toneScore = 5;

  const result = {
    score_source: 'heuristic',
    score_status: 'fallback',
    accuracy_score: accuracyScore,
    relevance_score: relevanceScore,
    completeness_score: completenessScore,
    safety_score: safetyScore,
    tone_score: toneScore,
    summary: refs.length > 0 ? '命中了知识参考，评分使用回退规则生成。' : '未命中模型评分，评分使用回退规则生成。',
    strengths_json: JSON.stringify(
      refs.length > 0
        ? ['回答携带参考依据', '基础礼貌语气']
        : ['已生成可用回答']
    ),
    issues_json: JSON.stringify(
      [
        relevanceScore < 4 ? '相关性需要人工复核' : '',
        completenessScore < 4 ? '回答完整度偏弱' : '',
      ].filter(Boolean)
    ),
    risk_level: (accuracyScore <= 2 || safetyScore <= 2) ? 'high' : (relevanceScore <= 2 ? 'medium' : 'low'),
    risk_tags_json: JSON.stringify([
      accuracyScore <= 2 ? 'accuracy' : '',
      relevanceScore <= 2 ? 'relevance' : '',
      completenessScore <= 2 ? 'completeness' : '',
      safetyScore <= 2 ? 'safety' : '',
      toneScore <= 2 ? 'tone' : '',
    ].filter(Boolean)),
    raw_result_json: JSON.stringify({ type: 'heuristic', overlapRatio, refsCount: refs.length }),
  };

  result.total_score = computeTotalScore(result);
  result.grade = gradeFromTotal(result.total_score);
  return result;
}

function extractJsonObject(raw) {
  const text = normalizeText(raw);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // noop
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeLlmResult(raw) {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid score payload');
  }

  const normalized = {
    score_source: 'llm',
    score_status: 'completed',
    accuracy_score: clampScore(parsed.accuracy),
    relevance_score: clampScore(parsed.relevance),
    completeness_score: clampScore(parsed.completeness),
    safety_score: clampScore(parsed.safety),
    tone_score: clampScore(parsed.tone),
    summary: normalizeText(parsed.summary).slice(0, 512) || '模型已完成自动评分。',
    strengths_json: toJsonArray(parsed.strengths),
    issues_json: toJsonArray(parsed.issues),
    risk_level: RISK_LEVELS.has(normalizeText(parsed.riskLevel).toLowerCase())
      ? normalizeText(parsed.riskLevel).toLowerCase()
      : 'low',
    risk_tags_json: JSON.stringify(normalizeRiskTags(parsed.riskTags)),
    raw_result_json: JSON.stringify(parsed),
  };

  normalized.total_score = computeTotalScore(normalized);
  normalized.grade = gradeFromTotal(normalized.total_score);
  if (!normalized.total_score) throw new Error('invalid score payload');
  return normalized;
}

function buildScoringPrompt({ userContent, assistantContent, refs = [] }) {
  const refSummary = refs.length > 0
    ? refs.slice(0, 5).map((item, index) => `- #${index + 1}: ${normalizeText(item.title || item.entryId || item.matchText || '')}`.trim()).join('\n')
    : '无';

  return [
    '你是机器人后台的对话质量评分器。',
    '请只输出 JSON，不要附带解释、代码块或额外文字。',
    '评分维度为 accuracy、relevance、completeness、safety、tone，分值范围 1-5，5 为最好。',
    'riskLevel 只能是 low、medium、high。',
    'riskTags 只能从 accuracy、relevance、completeness、safety、tone 中选择。',
    'summary 用中文，控制在 80 字内。',
    'strengths 和 issues 各最多 3 条短句。',
    '',
    '返回格式：',
    JSON.stringify({
      accuracy: 4,
      relevance: 4,
      completeness: 4,
      safety: 5,
      tone: 4,
      riskLevel: 'low',
      riskTags: ['relevance'],
      summary: '回答基本准确，覆盖了用户问题，风险较低。',
      strengths: ['结合了上下文', '语气自然'],
      issues: ['可以更具体'],
    }),
    '',
    `用户问题：${normalizeText(userContent) || '无'}`,
    `机器人回复：${normalizeText(assistantContent) || '无'}`,
    `可见参考：\n${refSummary}`,
  ].join('\n');
}

async function ensureScoreRow({ versionId, sessionId, messageId, userMessageId, scoreSource = 'llm' }) {
  await db.query(
    `INSERT INTO chat_message_scores (version_id, session_id, message_id, user_message_id, score_status, score_source)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       version_id=VALUES(version_id),
       session_id=VALUES(session_id),
       user_message_id=VALUES(user_message_id),
       score_source=VALUES(score_source)`,
    [versionId, sessionId, messageId, userMessageId || null, 'pending', scoreSource]
  );
}

async function updateScoreStatus(messageId, status) {
  await db.query(
    'UPDATE chat_message_scores SET score_status=?, updated_at=NOW() WHERE message_id=?',
    [status, messageId]
  );
}

async function persistScoreResult(messageId, result) {
  await db.query(
    `UPDATE chat_message_scores
        SET score_status=?,
            score_source=?,
            total_score=?,
            accuracy_score=?,
            relevance_score=?,
            completeness_score=?,
            safety_score=?,
            tone_score=?,
            grade=?,
            risk_level=?,
            risk_tags_json=?,
            strengths_json=?,
            issues_json=?,
            summary=?,
            raw_result_json=?,
            updated_at=NOW()
      WHERE message_id=?`,
    [
      result.score_status,
      result.score_source,
      result.total_score,
      result.accuracy_score,
      result.relevance_score,
      result.completeness_score,
      result.safety_score,
      result.tone_score,
      result.grade,
      result.risk_level,
      result.risk_tags_json,
      result.strengths_json,
      result.issues_json,
      result.summary,
      result.raw_result_json,
      messageId,
    ]
  );
}

async function failScore(messageId, reason) {
  await db.query(
    `UPDATE chat_message_scores
        SET score_status='failed',
            score_source='heuristic',
            summary=?,
            updated_at=NOW()
      WHERE message_id=?`,
    [normalizeText(reason).slice(0, 512) || '评分失败', messageId]
  );
}

async function scoreTurn({ versionId, sessionId, messageId, userMessageId, userContent, assistantContent, refs = [] }) {
  await ensureScoreRow({ versionId, sessionId, messageId, userMessageId });
  await updateScoreStatus(messageId, 'processing');

  try {
    const { content } = await llm.chat([
      {
        role: 'system',
        content: buildScoringPrompt({ userContent, assistantContent, refs }),
      },
    ]);
    const result = normalizeLlmResult(content);
    await persistScoreResult(messageId, result);
    return result;
  } catch (err) {
    const fallback = buildHeuristicScore({ userContent, assistantContent, refs });
    try {
      await persistScoreResult(messageId, fallback);
      return fallback;
    } catch (persistErr) {
      await failScore(messageId, persistErr.message || err.message);
      throw persistErr;
    }
  }
}

async function scoreMessageById(messageId) {
  const [rows] = await db.query(
    `SELECT
        assistant.version_id,
        assistant.session_id,
        assistant.id AS message_id,
        assistant.content AS assistant_content,
        assistant.refs_json,
        (
          SELECT user_msg.id
            FROM chat_messages user_msg
           WHERE user_msg.session_id = assistant.session_id
             AND user_msg.role = 'user'
             AND user_msg.id < assistant.id
           ORDER BY user_msg.id DESC
           LIMIT 1
        ) AS user_message_id,
        (
          SELECT user_msg.content
            FROM chat_messages user_msg
           WHERE user_msg.session_id = assistant.session_id
             AND user_msg.role = 'user'
             AND user_msg.id < assistant.id
           ORDER BY user_msg.id DESC
           LIMIT 1
        ) AS user_content
      FROM chat_messages assistant
     WHERE assistant.id = ?
       AND assistant.role = 'assistant'
     LIMIT 1`,
    [messageId]
  );

  if (rows.length === 0) throw new Error('assistant message not found');
  const row = rows[0];
  let refs = [];
  try {
    refs = row.refs_json ? JSON.parse(row.refs_json) : [];
  } catch {
    refs = [];
  }

  return scoreTurn({
    versionId: row.version_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    userMessageId: row.user_message_id,
    userContent: row.user_content,
    assistantContent: row.assistant_content,
    refs,
  });
}

function runQueue() {
  if (isQueueRunning) return;
  isQueueRunning = true;

  const next = async () => {
    const job = SCORE_QUEUE.shift();
    if (!job) {
      isQueueRunning = false;
      return;
    }

    try {
      await scoreTurn(job);
    } catch (err) {
      console.error('[qualityScoring] scoreTurn failed:', err.message);
    }
    setImmediate(next);
  };

  setImmediate(next);
}

function enqueueScore(job) {
  SCORE_QUEUE.push(job);
  runQueue();
}

async function reviewScore(scoreId, { reviewScore, reviewNote, reviewStatus }, reviewerId) {
  const normalizedStatus = REVIEW_STATUSES.has(normalizeText(reviewStatus).toLowerCase())
    ? normalizeText(reviewStatus).toLowerCase()
    : 'reviewed';
  const normalizedScore = reviewScore === '' || reviewScore == null ? null : clampPercent(reviewScore);

  await db.query(
    `UPDATE chat_message_scores
        SET review_status=?,
            review_score=?,
            review_note=?,
            reviewed_by=?,
            reviewed_at=NOW(),
            updated_at=NOW()
      WHERE id=?`,
    [normalizedStatus, normalizedScore, normalizeText(reviewNote) || null, reviewerId || null, scoreId]
  );
}

function parseJsonField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function mapScoreRow(row) {
  if (!row) return null;
  return {
    id: row.score_id || null,
    messageId: row.message_id,
    sessionId: row.session_id,
    versionId: row.version_id,
    userMessageId: row.user_message_id || null,
    title: row.session_title || '',
    assistantContent: row.assistant_content || '',
    userContent: row.user_content || '',
    scoreStatus: SCORE_STATUSES.has(row.score_status) ? row.score_status : 'pending',
    scoreSource: row.score_source || 'llm',
    totalScore: row.total_score == null ? null : Number(row.total_score),
    accuracyScore: row.accuracy_score == null ? null : Number(row.accuracy_score),
    relevanceScore: row.relevance_score == null ? null : Number(row.relevance_score),
    completenessScore: row.completeness_score == null ? null : Number(row.completeness_score),
    safetyScore: row.safety_score == null ? null : Number(row.safety_score),
    toneScore: row.tone_score == null ? null : Number(row.tone_score),
    grade: row.grade || null,
    riskLevel: RISK_LEVELS.has(row.risk_level) ? row.risk_level : 'low',
    riskTags: parseJsonField(row.risk_tags_json),
    strengths: parseJsonField(row.strengths_json),
    issues: parseJsonField(row.issues_json),
    summary: row.summary || '',
    reviewStatus: REVIEW_STATUSES.has(row.review_status) ? row.review_status : 'pending',
    reviewScore: row.review_score == null ? null : Number(row.review_score),
    reviewNote: row.review_note || '',
    reviewedBy: row.reviewed_by || null,
    reviewedByName: row.reviewed_by_name || '',
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  enqueueScore,
  scoreMessageById,
  reviewScore,
  mapScoreRow,
  buildHeuristicScore,
  normalizeLlmResult,
  computeTotalScore,
  gradeFromTotal,
};
