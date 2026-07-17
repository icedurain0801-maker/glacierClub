const router = require('express').Router();
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const qualityScoring = require('../services/qualityScoring');

router.use(version);

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function loadScoreDetail(versionId, messageId) {
  const [rows] = await db.query(
    `SELECT
        assistant.version_id,
        assistant.session_id,
        assistant.id AS message_id,
        assistant.content AS assistant_content,
        assistant.created_at,
        sess.title AS session_title,
        score.id AS score_id,
        score.user_message_id,
        score.score_status,
        score.score_source,
        score.total_score,
        score.accuracy_score,
        score.relevance_score,
        score.completeness_score,
        score.safety_score,
        score.tone_score,
        score.grade,
        score.risk_level,
        score.risk_tags_json,
        score.strengths_json,
        score.issues_json,
        score.summary,
        score.review_status,
        score.review_score,
        score.review_note,
        score.reviewed_by,
        reviewer.display_name AS reviewed_by_name,
        score.reviewed_at,
        score.updated_at,
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
      JOIN chat_sessions sess
        ON sess.id = assistant.session_id
       AND sess.version_id = assistant.version_id
 LEFT JOIN chat_message_scores score
        ON score.message_id = assistant.id
 LEFT JOIN users reviewer
        ON reviewer.id = score.reviewed_by
     WHERE assistant.version_id = ?
       AND assistant.id = ?
       AND assistant.role = 'assistant'
     LIMIT 1`,
    [versionId, messageId]
  );

  if (rows.length === 0) return null;
  return qualityScoring.mapScoreRow(rows[0]);
}

router.get('/', ah(async (req, res) => {
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const scoreStatus = String(req.query.scoreStatus || '').trim().toLowerCase();
  const reviewStatus = String(req.query.reviewStatus || '').trim().toLowerCase();
  const riskLevel = String(req.query.riskLevel || '').trim().toLowerCase();
  const keyword = String(req.query.keyword || '').trim();

  const filters = ['assistant.version_id = ?', `assistant.role = 'assistant'`];
  const params = [req.versionId];

  if (scoreStatus) {
    if (scoreStatus === 'unscored') {
      filters.push('score.id IS NULL');
    } else {
      filters.push('score.score_status = ?');
      params.push(scoreStatus);
    }
  }
  if (reviewStatus) {
    if (reviewStatus === 'unreviewed') {
      filters.push('(score.id IS NULL OR score.review_status = "pending")');
    } else {
      filters.push('score.review_status = ?');
      params.push(reviewStatus);
    }
  }
  if (riskLevel) {
    filters.push('COALESCE(score.risk_level, "low") = ?');
    params.push(riskLevel);
  }
  if (keyword) {
    filters.push('(assistant.content LIKE ? OR sess.title LIKE ? OR EXISTS (SELECT 1 FROM chat_messages user_msg WHERE user_msg.session_id = assistant.session_id AND user_msg.role = "user" AND user_msg.id < assistant.id AND user_msg.content LIKE ?))');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const whereSql = filters.join(' AND ');

  const [rows] = await db.query(
    `SELECT
        assistant.version_id,
        assistant.session_id,
        assistant.id AS message_id,
        assistant.content AS assistant_content,
        assistant.created_at,
        sess.title AS session_title,
        score.id AS score_id,
        score.user_message_id,
        COALESCE(score.score_status, 'pending') AS score_status,
        COALESCE(score.score_source, 'llm') AS score_source,
        score.total_score,
        score.accuracy_score,
        score.relevance_score,
        score.completeness_score,
        score.safety_score,
        score.tone_score,
        score.grade,
        COALESCE(score.risk_level, 'low') AS risk_level,
        score.risk_tags_json,
        score.strengths_json,
        score.issues_json,
        score.summary,
        COALESCE(score.review_status, 'pending') AS review_status,
        score.review_score,
        score.review_note,
        score.reviewed_by,
        reviewer.display_name AS reviewed_by_name,
        score.reviewed_at,
        score.updated_at,
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
      JOIN chat_sessions sess
        ON sess.id = assistant.session_id
       AND sess.version_id = assistant.version_id
 LEFT JOIN chat_message_scores score
        ON score.message_id = assistant.id
 LEFT JOIN users reviewer
        ON reviewer.id = score.reviewed_by
     WHERE ${whereSql}
     ORDER BY assistant.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [summaryRows] = await db.query(
    `SELECT
        COUNT(*) AS total_turns,
        SUM(CASE WHEN score.id IS NULL THEN 1 ELSE 0 END) AS unscored_turns,
        SUM(CASE WHEN score.score_status IN ('completed', 'fallback') THEN 1 ELSE 0 END) AS scored_turns,
        SUM(CASE WHEN score.risk_level = 'high' THEN 1 ELSE 0 END) AS high_risk_turns,
        AVG(score.total_score) AS avg_total_score
      FROM chat_messages assistant
      JOIN chat_sessions sess
        ON sess.id = assistant.session_id
       AND sess.version_id = assistant.version_id
 LEFT JOIN chat_message_scores score
        ON score.message_id = assistant.id
     WHERE ${whereSql}`,
    params
  );

  res.json({
    items: rows.map(qualityScoring.mapScoreRow),
    summary: {
      totalTurns: Number(summaryRows[0]?.total_turns || 0),
      unscoredTurns: Number(summaryRows[0]?.unscored_turns || 0),
      scoredTurns: Number(summaryRows[0]?.scored_turns || 0),
      highRiskTurns: Number(summaryRows[0]?.high_risk_turns || 0),
      avgTotalScore: summaryRows[0]?.avg_total_score == null ? null : Number(summaryRows[0].avg_total_score),
    },
  });
}));

router.get('/message/:messageId', ah(async (req, res) => {
  const messageId = parsePositiveInt(req.params.messageId, 0);
  if (!messageId) return fail(res, 400, 'messageId 无效');

  const detail = await loadScoreDetail(req.versionId, messageId);
  if (!detail) return fail(res, 404, '评分记录不存在');
  res.json(detail);
}));

router.post('/message/:messageId/rescore', ah(async (req, res) => {
  const messageId = parsePositiveInt(req.params.messageId, 0);
  if (!messageId) return fail(res, 400, 'messageId 无效');

  const [exists] = await db.query(
    'SELECT id FROM chat_messages WHERE id=? AND version_id=? AND role="assistant" LIMIT 1',
    [messageId, req.versionId]
  );
  if (exists.length === 0) return fail(res, 404, '消息不存在');

  await qualityScoring.scoreMessageById(messageId);
  const detail = await loadScoreDetail(req.versionId, messageId);
  res.json(detail);
}));

router.post('/:scoreId/review', ah(async (req, res) => {
  const scoreId = parsePositiveInt(req.params.scoreId, 0);
  if (!scoreId) return fail(res, 400, 'scoreId 无效');

  const [rows] = await db.query(
    'SELECT id, message_id FROM chat_message_scores WHERE id=? AND version_id=? LIMIT 1',
    [scoreId, req.versionId]
  );
  if (rows.length === 0) return fail(res, 404, '评分记录不存在');

  await qualityScoring.reviewScore(
    scoreId,
    {
      reviewScore: req.body?.reviewScore,
      reviewNote: req.body?.reviewNote,
      reviewStatus: req.body?.reviewStatus,
    },
    req.user?.id
  );

  const detail = await loadScoreDetail(req.versionId, rows[0].message_id);
  res.json(detail);
}));

module.exports = router;
