'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const project = path.resolve(__dirname, '../../..'), root = path.resolve(project, '../..');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const read = (name, expected) => {
  const p = path.join(root, name), b = fs.readFileSync(p), h = hash(b);
  if (expected) assert.equal(h, expected);
  return { path: p, sha256: h, value: JSON.parse(b) };
};
const first = read('.temp/overseas-real-sample-import-1791602247059.json', '74ea03253954be84796995095509a96a831806a14f362dab29350971897752b1');
const replay = read('.temp/overseas-real-sample-import-1791602263429.json', 'b71ef8279b34fd1ff4e3f4c486d960e6b78c0aa8aad1d7103f87a3ce760c9790');
const before = read('.temp/overseas-sample-inventory-20261010.json');
const after = read('.temp/overseas-sample-inventory-after-20261010.json');
const items = read('bigPlayer/.temp/overseas-real-small-batch-items-1791599835385.json', 'b2f84e03b7c675b05843aa4bd8fe127730d58ca4ba7655c07ba7bb5aaba8acca');
const source = first.value.sourceId, ids = items.value.sites[0].items.map(x => String(x.externalId));
assert.equal(first.value.status, 'SAMPLE_IMPORT_COMMITTED');
assert.equal(replay.value.status, 'SAMPLE_IMPORT_COMMITTED');
assert.equal(first.value.insertedContents, 9); assert.equal(first.value.preservedContents, 11);
assert.equal(first.value.membershipsInserted, 60); assert.equal(first.value.associationsInserted, 60);
assert.equal(replay.value.insertedContents, 0); assert.equal(replay.value.membershipsInserted, 0); assert.equal(replay.value.associationsInserted, 0);
assert.deepEqual(replay.value.runIds, first.value.runIds);
assert.equal(first.value.implementationSha256, hash(fs.readFileSync(path.join(project, 'worker/src/overseasSampleImport.js'))));
assert.equal(replay.value.implementationSha256, first.value.implementationSha256);
assert.equal(before.value.contents.length, 11); assert.equal(after.value.contents.length, 20);
const contentFields = ['id','source_id','account_id','game_id','community_id','external_id','fingerprint','body_sha256','raw_sha256'];
function unchanged(oldRows, newRows, fields) {
  for (const old of oldRows) {
    const row = newRows.find(r => r.id === old.id); assert.ok(row, 'old row missing');
    for (const field of fields) assert.deepEqual(row[field], old[field], `preserved ${field}`);
  }
}
unchanged(before.value.contents, after.value.contents, contentFields);
const jobFields = ['id','content_id','content_fingerprint','status','lease_owner','lease_until','error_code'];
unchanged(before.value.analysis, after.value.analysis, jobFields);
unchanged(before.value.translations, after.value.translations, jobFields);
for (const r of first.value.records.filter(r => r.change === 'inserted')) {
  for (const j of [...r.analysisJobs, ...r.translationJobs]) {
    assert.equal(j.status, 'retryable'); assert.equal(j.error_code, 'OVERSEAS_BOUNDED_VERIFICATION_HOLD');
    assert.ok(String(j.next_retry_at).startsWith('2099-01-01'));
  }
}
const output = { capturedAt: new Date().toISOString(), artifacts: [first,replay,before,after,items].map(({path,sha256}) => ({path,sha256})),
  offline: { originalHashMatched: true, implementationHashMatched: true, inserted: 9, preserved: 11,
    replayInserted: 0, replayMembershipsInserted: 0, replayAssociationsInserted: 0,
    previousContentHashesPreserved: true, previousJobSelectedFieldsPreserved: true,
    beforeMemberships: before.value.memberships.length, afterMemberships: after.value.memberships.length },
  live: null, realHttpExecutedByQa: false, realAiExecutedByQa: false };
async function live() {
  // Explicitly permitted, one pinned read-only snapshot; never invoke business write methods.
  require(path.join(project, 'server/src/runtimeEnv')).loadRuntimeEnv();
  const { Repository } = require(path.join(project, 'server/src/db/repository'));
  const repo = new Repository({ ...process.env, DB_POOL_SIZE: '1' });
  let conn;
  const sqlTrace = [];
  const q = async (sql, params = []) => {
    assert.ok(/^SELECT\b/i.test(sql)); assert.ok(!/FOR UPDATE|INTO OUTFILE|INTO DUMPFILE/i.test(sql));
    sqlTrace.push({ sql, parameterCount: params.length });
    return (await conn.query({ sql, timeout: 15000 }, params))[0];
  };
  try {
    conn = await repo.pool.getConnection();
    await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const marks = ids.map(() => '?').join(',');
    const contents = await q(`SELECT id,source_id,account_id,game_id,community_id,external_id,fingerprint,SHA2(COALESCE(body,''),256) AS body_sha256,SHA2(COALESCE(raw_payload,''),256) AS raw_sha256 FROM po_contents WHERE source_id=? AND external_id IN (${marks}) ORDER BY external_id,id`, [source,...ids]);
    assert.equal(contents.length,20); assert.equal(new Set(contents.map(c => c.external_id)).size,20);
    unchanged(after.value.contents,contents,contentFields);
    const cids = contents.map(c => c.id), cm = cids.map(() => '?').join(',');
    const memberships = await q(`SELECT account_id,content_id,feed_key,feed_metadata FROM po_content_feed_memberships WHERE content_id IN (${cm}) ORDER BY content_id,feed_key`,cids);
    const sampleMemberships = memberships.filter(m => String(m.feed_key).startsWith('overseas:'));
    assert.equal(sampleMemberships.length,60);
    for (const site of items.value.sites) for (const item of site.items) {
      const c = contents.find(c => c.external_id === String(item.externalId));
      const ms = sampleMemberships.filter(m => m.content_id === c.id && m.feed_key === `overseas:${site.siteId}:100017:home:merged`);
      assert.equal(ms.length,1); const m = typeof ms[0].feed_metadata === 'string' ? JSON.parse(ms[0].feed_metadata) : ms[0].feed_metadata;
      assert.equal(m.siteId,site.siteId); assert.equal(m.artifactSha256,items.sha256);
      assert.equal(m.observationSha256,hash(JSON.stringify(item)));
    }
    const rm = first.value.runIds.map(() => '?').join(',');
    const runs = await q(`SELECT id,source_id,account_id,site_id,status,trigger_type,error_code,error_message,lease_owner,lease_until FROM po_sync_runs WHERE id IN (${rm}) ORDER BY id`,first.value.runIds);
    assert.equal(runs.length,3);
    for (const run of runs) {
      assert.equal(run.source_id,source); assert.equal(run.status,'partial'); assert.equal(run.trigger_type,'manual');
      assert.equal(run.lease_owner,null); assert.equal(run.lease_until,null);
      const receipt = JSON.parse(run.error_message);
      assert.equal(receipt.operation,'sample_import'); assert.equal(receipt.artifactSha256,items.sha256); assert.equal(receipt.fullCollection,false);
    }
    const associations = await q(`SELECT rc.run_id,rc.content_id,rc.sync_scope,rc.change_type,c.external_id,c.source_id FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id IN (${rm}) ORDER BY rc.run_id,rc.content_id`,first.value.runIds);
    assert.equal(associations.length,60);
    for (const rid of first.value.runIds) {
      const rs = associations.filter(r=>r.run_id===rid); assert.equal(rs.length,20);
      assert.equal(new Set(rs.map(r=>r.external_id)).size,20);
      for (const r of rs) { assert.equal(r.source_id,source); assert.equal(r.sync_scope,'posts'); assert.ok(ids.includes(r.external_id)); }
    }
    const jobColumns = "id,content_id,content_fingerprint,status,lease_owner,lease_until,error_code,next_retry_at,(status='pending' OR (status='retryable' AND (next_retry_at IS NULL OR next_retry_at<=NOW())) OR (status='running' AND lease_until<NOW())) AS time_claimable";
    const analysis = await q(`SELECT ${jobColumns},analysis_profile,analysis_version FROM po_analysis_jobs WHERE content_id IN (${cm}) ORDER BY id`,cids);
    const translations = await q(`SELECT ${jobColumns},target_language,translation_version FROM po_translation_jobs WHERE content_id IN (${cm}) ORDER BY id`,cids);
    const inserted = first.value.records.filter(r=>r.change==='inserted');
    assert.equal(inserted.length,9);
    const newJobs = inserted.flatMap(r=>[...r.analysisJobs,...r.translationJobs]).map(j=>j.id);
    const currentJobs = [...analysis,...translations].filter(j=>newJobs.includes(j.id));
    assert.equal(currentJobs.length,18);
    output.live = { contents, sampleMembershipCount:sampleMemberships.length, totalMembershipCount:memberships.length,
      runs, associations, analysis, translations, newJobStates:currentJobs.map(j=>({id:j.id,status:j.status,time_claimable:j.time_claimable,error_code:j.error_code,next_retry_at:j.next_retry_at})),
      sqlTrace, snapshotReadOnly:true };
    await conn.rollback(); output.live.closedWithRollback=true;
  } finally { if(conn) conn.release(); await repo.pool.end(); }
}
(async()=>{
  if(process.argv[2]==='--read-only') await live();
  else assert.equal(process.argv[2],undefined);
  output.result='INDEPENDENT_SAMPLE_IMPORT_AUDIT_COMPLETED';
  const target=path.join(root,'.temp',`qa-v045-sample-import-${Date.now()}.json`);
  fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({result:output.result,evidencePath:target,sha256:hash(fs.readFileSync(target)),offline:output.offline,
    live:output.live?{contents:output.live.contents.length,memberships:output.live.sampleMembershipCount,runs:output.live.runs.length,associations:output.live.associations.length,newJobStates:output.live.newJobStates,readOnly:output.live.snapshotReadOnly,closed:output.live.closedWithRollback}:null},null,2));
})().catch(e=>{console.error(JSON.stringify({result:'QA_FAILED',code:e.code||'AUDIT_FAILED',assertion:e.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;});
