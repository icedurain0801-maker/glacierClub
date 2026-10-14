const crypto = require('node:crypto');
const METHODS = new Set(['notified', 'handled', 'false_positive']);
const ACTIONABLE_SEVERITIES = new Set(['attention', 'negative', 'urgent']);
const isHandlingEligible = item => ACTIONABLE_SEVERITIES.has(item.severity);
function addHandlingStatusFilter(clauses, status, analysisAlias) {
  if (!status) return;
  if (!['pending', 'processed', 'not_required'].includes(status)) throw invalid('处理状态无效');
  const eligible = `${analysisAlias}.severity IN ('attention','negative','urgent')`;
  const handled = 'EXISTS (SELECT 1 FROM po_content_handlings ch WHERE ch.content_id=c.id)';
  clauses.push(status === 'not_required' ? `COALESCE(${eligible},0)=0` : `(${eligible} AND ${status === 'pending' ? 'NOT ' : ''}${handled})`);
}
function invalid(message) { const error = new Error(message); error.code = 'INVALID_INPUT'; return error; }
function parseBatchHandling(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('批量处理参数无效');
  const allowed = new Set(['contentIds', 'handlingMethod', 'handlingNote']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw invalid('包含不支持的处理字段');
  if (!Array.isArray(body.contentIds) || !body.contentIds.length || body.contentIds.length > 100) throw invalid('每次请选择 1 至 100 条内容');
  if (body.contentIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw invalid('内容 ID 无效');
  if (!METHODS.has(body.handlingMethod)) throw invalid('请选择有效的处理方式');
  if (body.handlingNote != null && typeof body.handlingNote !== 'string') throw invalid('处理备注必须为文字');
  const note = body.handlingNote || '';
  if ([...note].length > 200) throw invalid('处理备注最多 200 字符');
  return { contentIds: [...new Set(body.contentIds)].sort(), handlingMethod: body.handlingMethod, handlingNote: note.trim() };
}
async function withContentHandling(repo, items) {
  if (!items.length) return items;
  const ids = [...new Set(items.map(item => item.id))];
  const records = await repo.query(`SELECT content_id, handling_method, handling_note, handled_at FROM po_content_handlings WHERE content_id IN (${ids.map(() => '?').join(',')})`, ids);
  const byId = new Map(records.map(record => [record.content_id, record]));
  return items.map(item => {
    const record = byId.get(item.id);
    const eligible = isHandlingEligible(item);
    return { ...item, handling_eligible: eligible, handling_status: eligible ? (record ? 'processed' : 'pending') : 'not_required', handling_method: record?.handling_method || null, handling_note: record?.handling_note || '', handled_at: record?.handled_at || null };
  });
}
async function handleContents(repo, input, scope = {}) {
  const { contentIds, handlingMethod, handlingNote } = parseBatchHandling(input);
  const conn = await repo.pool.getConnection();
  try {
    await conn.beginTransaction();
    const clauses = [`c.id IN (${contentIds.map(() => '?').join(',')})`, 'COALESCE(c.is_deleted,0)=0'];
    const values = [...contentIds];
    for (const [value, column] of [[scope.regionCode, 'g.region_code'], [scope.gameId, 'c.game_id'], [scope.communityId, 'c.community_id'], [scope.sourceId, 'c.source_id'], [scope.platform, 's.platform']]) {
      if (value) { clauses.push(`${column}=?`); values.push(value); }
    }
    const [rows] = await conn.query(`SELECT c.id, c.game_id, c.source_id, c.account_id, a.severity FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analyses a ON a.content_id=c.id WHERE ${clauses.join(' AND ')} ORDER BY c.id FOR UPDATE`, values);
    if (rows.length !== contentIds.length) {
      const error = new Error('选中内容已删除、不存在或不属于当前筛选范围，请刷新后重试');
      error.code = 'CONTENT_SCOPE_MISMATCH'; error.status = 409; throw error;
    }
    if (rows.some(row => !isHandlingEligible(row))) {
      const error = new Error('仅关注级、负面待处理、紧急级内容可处理，选中内容风险等级已变化或无需处理，请刷新后重试');
      error.code = 'CONTENT_NOT_ACTIONABLE'; error.status = 409; throw error;
    }
    await conn.query(`INSERT INTO po_content_handlings (content_id,handling_method,handling_note,handled_at) VALUES ${rows.map(() => '(?,?,?,UTC_TIMESTAMP(3))').join(',')} ON DUPLICATE KEY UPDATE handling_method=VALUES(handling_method),handling_note=VALUES(handling_note),handled_at=VALUES(handled_at)`, rows.flatMap(row => [row.id, handlingMethod, handlingNote]));
    const batchId = crypto.randomUUID();
    await conn.query(`INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,actor_id,event_type,outcome,detail) VALUES ${rows.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')}`, rows.flatMap(row => [crypto.randomUUID(), row.game_id, row.source_id, row.account_id || null, 'operator', scope.actorId || null, 'content_handled', 'success', JSON.stringify({ batchId, contentId: row.id, handlingMethod, handlingNote })]));
    await conn.commit();
    return { processedCount: rows.length, contentIds: rows.map(row => row.id), handlingStatus: 'processed', handlingMethod, handlingNote };
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
module.exports = { parseBatchHandling, withContentHandling, handleContents, isHandlingEligible, addHandlingStatusFilter };
