'use strict';
// BaaS only. MySQL is read-only; checkpoints/backups live on E:.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { cutoffAt, selectTargets } = require('./baas-retention-policy.cjs');
async function main() {
  const dir = process.env.PO_MAINTENANCE_RUN_DIR;
  assert(dir && path.isAbsolute(dir), 'Run directory required');
  const dry = process.argv.includes('--dry-run');
  process.env.PUBLIC_OPINION_SERVICE_MODE = '1';
  process.env.PUBLIC_OPINION_ENV_FILE = 'E:/CodexData/public-opinion/config/public-opinion.env';
  const root = 'E:/CodexData/public-opinion/releases/api-release-20261014-baas-auth-recovery-r1';
  require(root + '/server/src/runtimeEnv').loadRuntimeEnv();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  const { Repository } = require(root + '/server/src/db/repository');
  const { BaasClient, readToken } = require(root + '/server/src/services/baasDataClient');
  const { metadataChunks } = require(root + '/server/src/services/baasReadMetadata');
  const repo = new Repository(), c = new BaasClient(readToken('C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi'));
  const base = name => 'v1/collections/' + name;
  const meta = base('po_read_metadata_v1'), live = base('po_live_contents_v1'), query = base('po_query_contents_v1');
  const file = name => path.join(dir, name);
  const read = name => JSON.parse(fs.readFileSync(name, 'utf8'));
  const save = (name, data) => { fs.writeFileSync(name + '.tmp', JSON.stringify(data)); fs.renameSync(name + '.tmp', name); };
  const backup = (name, data) => fs.writeFileSync(file(name + '.json.gz'), zlib.gzipSync(Buffer.from(JSON.stringify(data))));
  const request = (method, endpoint, data) => c.request(method, endpoint, data, { timeoutMs: 60000 });
  const get = async (collection, id) => { try { return await request('GET', collection + '/docs/' + encodeURIComponent(id)); } catch (e) { if (e.status === 404) return null; throw e; } };
  const remove = async (collection, id) => { try { await request('DELETE', collection + '/docs/' + encodeURIComponent(id)); } catch (e) { if (e.status !== 404) throw e; } };
  const checkpoint = 'E:/CodexData/public-opinion/data/baas-live/state.json';
  const buildFile = 'E:/CodexData/public-opinion/data/baas-query/build-state.json';
  const hash = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  let conn, builder = false, writer = false;
  try {
    await c.verify(); conn = await repo.pool.getConnection();
    // Waiting lets any in-flight sync finish; never kill a publisher mid-commit.
    let [r] = await conn.query("SELECT GET_LOCK('po_baas_live_writer',300) acquired");
    assert.equal(Number(r[0].acquired), 1, 'Writer busy'); writer = true;
    [r] = await conn.query("SELECT GET_LOCK('po_baas_query_builder',30) acquired");
    assert.equal(Number(r[0].acquired), 1, 'Query builder busy'); builder = true;
    const localRows = await repo.query(`SELECT c.id,c.parent_content_id,c.root_content_id,DATE_FORMAT(c.published_at,'%Y-%m-%d %H:%i:%s') published_at,
      EXISTS(SELECT 1 FROM po_analyses a WHERE a.content_id=c.id AND (a.severity IN ('negative','urgent') OR a.recommend_home=1 OR a.recommend_pin=1 OR a.recommend_feature=1)) analysis_protected,
      EXISTS(SELECT 1 FROM po_quality_candidates q WHERE q.content_id=c.id) quality_protected,
      EXISTS(SELECT 1 FROM po_alert_contents ac WHERE ac.content_id=c.id) alert_protected FROM po_contents c`);
    const manifest = (await get(meta, 'current')).data, qm = (await get(meta, 'query-current')).data;
    assert.equal(qm.status, 'ready');
    const chunks = [], metadata = {};
    for (const ch of manifest.chunks) {
      const d = await get(meta, ch.id); assert(d && d.data.table === ch.table && Array.isArray(d.data.rows));
      chunks.push({ id: ch.id, data: d.data }); (metadata[ch.table] ||= []).push(...d.data.rows);
    }
    const planFile = file('retention-plan.json');
    const previous = fs.existsSync(planFile) ? read(planFile) : null;
    const cutoff = previous?.cutoff || cutoffAt();
    const documents = [];
    // Enumerate before deleting so offsets never skip documents.
    for (let offset = 0;;) {
      const page = await request('POST', query + '/query', { where: { published_at: { $lt: cutoff } }, limit: 10, offset, order_by: 'published_at', desc: false, with_total: true });
      assert(Array.isArray(page.docs));
      for (const d of page.docs) documents.push({ id: d.id, query: d.data, snapshot: (await get(live, d.id))?.data });
      offset += page.docs.length; if (offset >= page.total) break; assert(page.docs.length, 'Enumeration stalled');
    }
    // Resume includes documents whose query copy was deleted before a crash.
    for (const id of previous?.targets || []) if (!documents.some(d => d.id === id)) {
      const snap = await get(live, id);
      if (snap) documents.push({ id, query: { published_at: snap.data.content?.published_at }, snapshot: snap.data });
    }
    const selection = selectTargets({ documents, localRows, metadata, cutoff });
    const targets = [...new Set([...selection.targets, ...(previous?.targets || []).filter(id => !selection.protectedIds.includes(id) && !documents.some(d => d.id === id))])];
    const plan = { cutoff, targets, protectedIds: selection.protectedIds, dryRun: dry, expiredExamined: documents.length };
    save(file(dry ? 'retention-dry-run.json' : 'retention-plan.json'), plan);
    console.log(JSON.stringify({ phase: 'retention-plan', cutoff, candidates: targets.length, dryRun: dry }));
    if (dry) return;
    if (!fs.existsSync(file('retention-before.json.gz'))) backup('retention-before', { chunks, manifest, qm, state: read(checkpoint), build: read(buildFile) });
    const backupGeneration = Date.now();
    for (let i = 0; i < documents.length; i += 25) backup('content-' + backupGeneration + '-' + String(i).padStart(6, '0'), documents.slice(i, i + 25));
    const ids = new Set(targets), state = read(checkpoint), build = read(buildFile);
    // Recover newly protected, still-present records from a previously interrupted plan.
    const original = JSON.parse(zlib.gunzipSync(fs.readFileSync(file('retention-before.json.gz'))));
    for (const d of documents.filter(d => selection.protectedIds.includes(d.id))) {
      if (original.state.hashes[d.id] && d.snapshot) state.hashes[d.id] = original.state.hashes[d.id];
      if (original.build.ids.includes(d.id) && !build.ids.includes(d.id)) build.ids.push(d.id);
      if (original.build.revisions[d.id]) build.revisions[d.id] = original.build.revisions[d.id];
    }
    assert.equal(build.status, 'ready'); assert(Array.isArray(build.ids) && state.hashes);
    state.retentionPublishedFrom = cutoff;
    // Persist exceptions only for expired protected documents; recent ordinary content must age out.
    state.retentionProtectedIds = [...new Set([...(state.retentionProtectedIds || []), ...documents.filter(d => selection.protectedIds.includes(d.id)).map(d => d.id)])].filter(id => !ids.has(id));
    for (const id of targets) delete state.hashes[id];
    if (state.trackedIds) state.trackedIds = state.trackedIds.filter(id => !ids.has(id));
    delete state.metadataHash; save(checkpoint, state);
    build.ids = build.ids.filter(id => !ids.has(id));
    for (const id of targets) delete build.revisions[id];
    build.position = build.ids.length; build.idsDigest = crypto.createHash('sha256').update([...build.ids].sort().join('\n')).digest('hex'); save(buildFile, build);
    for (let i = 0; i < targets.length; i += 5) {
      const batch = targets.slice(i, i + 5), slots = batch.map(() => '?').join(',');
      // Hold content and classification locks across each delete batch. FKs block new protection rows.
      await conn.beginTransaction();
      try {
        await conn.query(`SELECT id FROM po_contents WHERE id IN (${slots}) ORDER BY id FOR UPDATE`, batch);
        for (const table of ['po_analyses', 'po_quality_candidates', 'po_alert_contents']) await conn.query(`SELECT content_id FROM ${table} WHERE content_id IN (${slots}) FOR UPDATE`, batch);
        const [newlyProtected] = await conn.query(`SELECT c.id FROM po_contents c WHERE c.id IN (${slots}) AND (EXISTS(SELECT 1 FROM po_analyses a WHERE a.content_id=c.id AND (a.severity IN ('negative','urgent') OR a.recommend_home=1 OR a.recommend_pin=1 OR a.recommend_feature=1)) OR EXISTS(SELECT 1 FROM po_quality_candidates q WHERE q.content_id=c.id) OR EXISTS(SELECT 1 FROM po_alert_contents ac WHERE ac.content_id=c.id))`, batch);
        assert.equal(newlyProtected.length, 0, 'Classification changed: stop and replan');
        for (const id of batch) { await remove(query, id); await remove(live, id); fs.appendFileSync(file('retention-deleted.jsonl'), JSON.stringify({ id, at: new Date().toISOString() }) + '\n'); }
      } finally { await conn.rollback(); }
      // Actual online health checks after each content batch, just as for shards.
      await runHealth(dir);
    }
    const next = [];
    for (const old of chunks) {
      const rows = old.data.rows.filter(row => !ids.has(String(row.content_id || '')));
      if (rows.length === old.data.rows.length) { next.push({ id: old.id, table: old.data.table }); continue; }
      for (const ch of metadataChunks({ [old.data.table]: rows })) {
        if (!await get(meta, ch.id)) await request('POST', meta + '/docs', { id: ch.id, data: ch.data });
        const verified = await get(meta, ch.id); assert.deepEqual(verified.data, ch.data);
        next.push({ id: ch.id, table: ch.data.table });
      }
    }
    assert.equal(hash((await get(meta, 'current')).data), hash(manifest), 'Manifest changed under lock');
    const updated = { ...manifest, chunks: next, trackedContents: Object.keys(state.hashes).length, retentionPublishedFrom: cutoff };
    await request('PATCH', meta + '/docs/current', { data: updated, merge: false, reason: 'Daily 15-day retention; protected contents retained' });
    await request('PATCH', meta + '/docs/query-current', { data: { ...qm, expectedCount: build.ids.length, idsDigest: build.idsDigest, verifiedAt: new Date().toISOString(), retentionPublishedFrom: cutoff }, merge: false, reason: 'Daily retention query count' });
    // Do not delete old chunks here: GC protects cached readers and rechecks current references.
    for (const id of targets) { assert.equal(await get(query, id), null); assert.equal(await get(live, id), null); }
    for (const d of documents.filter(d => selection.protectedIds.includes(d.id))) {
      assert.deepEqual((await get(query, d.id))?.data, d.query, 'Protected query changed');
      if (d.snapshot) assert.deepEqual((await get(live, d.id))?.data, d.snapshot, 'Protected snapshot changed');
    }
    save(file('retention-result.json'), { status: 'completed', cutoff, deleted: targets.length, protectedExpired: documents.filter(d => selection.protectedIds.includes(d.id)).length, localDataDeleted: 0, at: new Date().toISOString() });
  } finally {
    if (conn) {
      try { if (builder) await conn.query("SELECT RELEASE_LOCK('po_baas_query_builder')"); if (writer) await conn.query("SELECT RELEASE_LOCK('po_baas_live_writer')"); } finally { conn.release(); }
    }
    await repo.pool.end();
  }
}
function runHealth(dir) {
  return new Promise((resolve, reject) => {
    const child = require('node:child_process').spawn(process.execPath, [path.join(__dirname, 'baas-maintenance-health.cjs')], { windowsHide: true, env: { ...process.env, PO_MAINTENANCE_RUN_DIR: dir }, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error('Online health failed')));
  });
}
if (require.main === module) main().catch(e => { console.error(JSON.stringify({ status: 'failed', code: e.code || e.name })); process.exitCode = 1; });
