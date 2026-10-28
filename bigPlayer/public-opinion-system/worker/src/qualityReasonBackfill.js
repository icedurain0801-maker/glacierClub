const { TypeSafeQualityExplanation } = require('../../server/src/integrations/typeSafeQualityExplanation');
const { analysisText } = require('../../server/src/services/urgentValidation');
const { isChineseExplanation } = require('../../server/src/integrations/chineseExplanation');
const crypto = require('node:crypto');

function needsQualityReason(value) {
  return !value || !isChineseExplanation(value) || /TypeSafe\s*结构化|推荐理由待生成|暂无.*推荐|推荐理由.*生成中/.test(value);
}

// Explain existing decisions only. Never rejudge quality, risk or review status.
async function saveReason(repo, row, reason) {
  const conn = await repo.pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT q.*,c.fingerprint FROM po_quality_candidates q
      JOIN po_contents c ON c.id=q.content_id WHERE q.id=? AND c.is_deleted=0 FOR UPDATE`, [row.id]);
    const current = rows[0];
    if (!current || current.fingerprint !== row.fingerprint || current.content_fingerprint !== row.fingerprint
      || current.quality_reason !== row.quality_reason
      || ['recommend_home','recommend_pin','recommend_feature'].some(key => Number(current[key]) !== Number(row[key]))) {
      await conn.rollback(); return false;
    }
    await conn.query('UPDATE po_quality_candidates SET quality_reason=?,updated_at=NOW() WHERE id=?', [reason,row.id]);
    // Updating this watermark lets the existing minute BaaS writer notice the repair.
    await conn.query('UPDATE po_analyses SET quality_reason=?,analyzed_at=NOW() WHERE content_id=? AND content_fingerprint=?', [reason,row.content_id,row.fingerprint]);
    await conn.query('INSERT INTO po_audit_events (id,game_id,source_id,actor_type,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?)',
      [crypto.randomUUID(),row.game_id,row.source_id,'system','quality_reason_backfill','success',JSON.stringify({contentId:row.content_id,candidateId:row.id})]);
    await conn.commit(); return true;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}

function createQualityReasonBackfill({ repo, explain = new TypeSafeQualityExplanation(), now = () => Date.now(), save = saveReason }) {
  const retryAt = new Map();
  let nextAt = 0, running = false;
  return async function tick({ force = false } = {}) {
    const result = { generated: 0, failed: 0, skipped: 0 };
    if (running || (!force && now() < nextAt)) return result;
    running = true; nextAt = now() + 60000;
    let locked = false;
    try {
      locked = await repo.acquireAdvisoryLock('po-quality-reason-backfill',0);
      if (!locked) return result;
      const { clauses, values } = repo.qualityContentFilter();
      const rows = await repo.query(`SELECT q.*,c.fingerprint,c.title,c.body,c.game_id,c.source_id FROM po_quality_candidates q
        JOIN po_contents c ON c.id=q.content_id LEFT JOIN po_analyses a ON a.content_id=c.id
        WHERE ${clauses.join(' AND ')} AND q.content_fingerprint=c.fingerprint
        AND (q.quality_reason IS NULL OR q.quality_reason='' OR q.quality_reason LIKE '%TypeSafe%结构化%'
          OR q.quality_reason LIKE '%推荐理由待生成%' OR q.quality_reason LIKE '%推荐理由%生成中%')
        ORDER BY c.published_at DESC,q.id LIMIT 100`,values);
      let attempted = 0;
      for (const row of rows) {
        const key = row.id + ':' + row.fingerprint;
        if (!needsQualityReason(row.quality_reason) || now() < (retryAt.get(key) || 0)) continue;
        if (attempted++ >= 5) break;
        try {
          const explanation = await explain.explain(analysisText(row), {
            recommendHome: Boolean(Number(row.recommend_home)), recommendPin: Boolean(Number(row.recommend_pin)),
            recommendFeature: Boolean(Number(row.recommend_feature)), qualityScore: Number(row.quality_score)
          });
          if (explanation.status !== 'generated' || needsQualityReason(explanation.reason)) throw new Error('QUALITY_REASON_REQUIRED');
          if (await save(repo,row,explanation.reason)) { result.generated++; retryAt.delete(key); }
          else { result.skipped++; retryAt.set(key,now()+60000); }
        } catch (_) { result.failed++; retryAt.set(key,now()+300000); }
      }
      // Bound retained cooldown state in this long-lived process.
      for (const [key,time] of retryAt) if (time < now()-300000) retryAt.delete(key);
      return result;
    } finally {
      try { if (locked) await repo.releaseAdvisoryLock('po-quality-reason-backfill'); }
      finally { running = false; }
    }
  };
}
module.exports = { createQualityReasonBackfill, needsQualityReason, saveReason };
