const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const root = process.env.PO_ISOLATED_CANDIDATE_ROOT;
if (!root) throw new Error('PO_ISOLATED_CANDIDATE_ROOT required');
const { Repository } = require(path.join(root, 'server/src/db/repository'));
const optional = ['community_id','board_id','board_name','run_scope','site_url_snapshot','last_request_at'];
function fixture(columns) {
  const repo = new Repository({ DB_PORT: 1, DB_NAME: 'never_connects' });
  repo.pool = { query() { throw new Error('database I/O prohibited'); } };
  const calls = [];
  repo.query = async (sql, params) => {
    calls.push({sql,params});
    if (sql.includes('information_schema.COLUMNS')) return columns.map(column_name => ({column_name}));
    if (sql.startsWith('SELECT COUNT(*)')) return [{total:4105}];
    return [{id:'fixture-run'}];
  };
  return {repo,calls};
}
test('candidate matches every manifest entry and only two baseline API files differ', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'package-release-manifest.json')));
  const baseline = JSON.parse(fs.readFileSync(path.join(manifest.baseline,'package-release-manifest.json')));
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const changed = [];
  for (const entry of manifest.files) {
    assert.equal(hash(path.join(root,entry.path)),entry.sha256);
    if (baseline.files.find(item => item.path===entry.path).sha256.toLowerCase()!==entry.sha256) changed.push(entry.path);
  }
  assert.equal(manifest.files.length,395);
  assert.deepEqual(changed.sort(),['server/src/app.js','server/src/db/repository.js']);
  const baselineRepo=fs.readFileSync(path.join(manifest.baseline,'server/src/db/repository.js'),'utf8');
  const candidateRepo=fs.readFileSync(path.join(root,'server/src/db/repository.js'),'utf8');
  const method=(text,name)=>{const start=text.indexOf(`  async ${name}(`);const end=text.indexOf('\n  async ',start+1);return text.slice(start,end);};
  for(const name of ['getSyncStatus','getSyncCheckpoint','resetSyncCheckpoint','pauseSyncCheckpoint']) assert.equal(method(candidateRepo,name),method(baselineRepo,name),`${name} remains exact baseline`);
});
for (const columns of [[],optional,['board_id','last_request_at']]) test(`candidate read contract with ${columns.length} optional columns`,async()=>{
  const {repo,calls}=fixture(columns);
  const result=await repo.listSyncRuns({regionCode:'domestic',communityId:'community',status:'failed',page:2,pageSize:20});
  assert.equal(result.total,4105); assert.equal(result.page,2);
  const count=calls.find(call=>call.sql.startsWith('SELECT COUNT(*)'));
  const items=calls.find(call=>call.sql.startsWith('SELECT r.id,'));
  assert.deepEqual(count.params,['community','failed','domestic']);
  assert.deepEqual(items.params,['community','failed','domestic',20,20]);
  assert.match(items.sql,/FROM \(SELECT r\.id[\s\S]*ORDER BY r\.created_at DESC,r\.id DESC LIMIT \? OFFSET \?\) page_runs/);
  for(const column of optional) if(!columns.includes(column)) assert.doesNotMatch(items.sql,new RegExp(`r\\.${column}\\b`));
  calls.length=0;
  await repo.getLatestSyncRunForSource('source',{accountId:'account'});
  assert.match(calls[0].sql,/^SELECT r\.id FROM/);
  assert.doesNotMatch(calls[0].sql,/run_contents|site_progress|site_terminal/);
  assert.deepEqual(calls[0].params,['source','account']);
  assert.match(calls.at(-1).sql,/r\.id=\?/);
  assert.deepEqual(calls.at(-1).params,['fixture-run','account','source']);
});
test('source list summary is opt-in and detail keeps complete checkpoint contract',()=>{
  const app=fs.readFileSync(path.join(root,'server/src/app.js'),'utf8');
  assert.match(app,/sourceWithAccount\(source, \{ summary = false \} = \{\}\)/);
  assert.match(app,/summary && source\.platform === 'bigplayer_h5' && source\.region_code === 'domestic'/);
  assert.match(app,/sources\.map\(source => sourceWithAccount\(source, \{ summary: true \}\)\)/);
});
