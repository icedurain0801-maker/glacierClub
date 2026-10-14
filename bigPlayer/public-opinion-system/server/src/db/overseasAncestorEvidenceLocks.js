'use strict';
// Bounded discovery, globally sorted current row locks, then reference recheck.
const { assertRow } = require('../../../worker/src/overseasBigPlayerPageStore');
const { canonical } = require('../../../worker/src/overseasBigPlayerRunContractJournal');
const crypto=require('node:crypto');
const fail = () => { throw Object.assign(Error('Ancestor evidence conflict'), { code: 'OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT' }); };
async function inspectAncestorEvidence(conn, entries, { maxRows = 10000, maxDepth = 64, lock } = {}) {
  if (!Array.isArray(entries) || !Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10000 || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 64) fail();
  const discovered = new Map();
  async function discover(id, depth = 0) {
    if (depth > maxDepth || typeof id !== 'string' || !id || discovered.size >= maxRows && !discovered.has(id)) fail();
    if (discovered.has(id)) return;
    const [rows] = await conn.query('SELECT * FROM po_contents WHERE id=?', [id]);
    if (rows.length !== 1) fail();
    const row = rows[0]; discovered.set(id, row);
    for (const ref of [row.root_content_id, row.parent_content_id]) if (ref != null) await discover(ref, depth + 1);
  }
  for (const entry of entries) await discover(entry.contentId);
  const locked = new Map();
  for (const id of [...discovered.keys()].sort()) {
    const [rows] = await conn.query('SELECT * FROM po_contents WHERE id=?'+(lock?' FOR UPDATE':''), [id]);
    if (rows.length !== 1) fail();
    const row = rows[0], old = discovered.get(id);
    // No adaptive acquisition after locks: a changed reference fails closed.
    if (row.root_content_id !== old.root_content_id || row.parent_content_id !== old.parent_content_id || Number(row.content_depth) !== Number(old.content_depth)) fail();
    locked.set(id, row);
  }
  for (const { contentId, contract } of entries) {
    let row = locked.get(contentId); const seen = new Set();
    if (!row) fail();
    const rootId = Number(row.content_depth) === 0 ? row.id : row.root_content_id;
    let expectedDepth = Number(row.content_depth);
    if (!Number.isSafeInteger(expectedDepth) || expectedDepth < 0 || expectedDepth > maxDepth) fail();
    while (row) {
      if (seen.has(row.id) || seen.size > maxDepth || row.content_depth == null || row.is_deleted == null || Number(row.content_depth) !== expectedDepth || Number(row.is_deleted) !== 0) fail();
      seen.add(row.id); await assertRow(row, contract);
      if (expectedDepth === 0) {
        if (row.id !== rootId || row.content_type !== 'post' || row.parent_content_id !== null || row.root_content_id !== null) fail();
        break;
      }
      if (row.content_type !== 'comment' || row.root_content_id !== rootId || !row.parent_content_id) fail();
      row = locked.get(row.parent_content_id); expectedDepth--;
      if (!row) fail();
    }
  }
  const ids=[...locked.keys()].sort();
  return lock?{lockedIds:ids,currentReadVerified:true}:{readIds:ids,snapshotReadVerified:true,rowsSha256:crypto.createHash('sha256').update(canonical(ids.map(id=>locked.get(id)))).digest('hex')};
}
async function lockAncestorEvidence(conn,entries,options={}){return inspectAncestorEvidence(conn,entries,{...options,lock:true});}
async function readAncestorEvidence(conn,entries,options={}){return inspectAncestorEvidence(conn,entries,{...options,lock:false});}
module.exports = { lockAncestorEvidence,readAncestorEvidence };
