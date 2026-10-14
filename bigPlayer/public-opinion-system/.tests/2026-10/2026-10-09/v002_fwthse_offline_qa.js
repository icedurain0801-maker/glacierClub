'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const candidate = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/v019-read-compat-FwThse';
const baseline = 'C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008';
const frontend = path.resolve(__dirname, '../../../../admin/PublicOpinion/assets/sources.js');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const repositoryFile = path.join(candidate, 'server/src/db/repository.js');
const manifestFile = path.join(candidate, 'package-release-manifest.json');
assert.equal(sha(repositoryFile), '2db28588fd32c3e75acf536cee61562508ced820c650ed25ef550197fa81460e');
assert.equal(sha(manifestFile), '57c642bf35ba2e68611252a9826a40cc079f3f1a22b91f1b1469852d5b680295');

const { Repository } = require(repositoryFile);
const { Repository: BaselineRepository } = require(path.join(baseline, 'server/src/db/repository.js'));
assert.equal(Repository.prototype.getSyncStatus.toString(), BaselineRepository.prototype.getSyncStatus.toString());

const optional = ['community_id', 'board_id', 'board_name', 'run_scope', 'site_url_snapshot', 'last_request_at'];
const groups = [
  { sync_scope: 'posts', status: 'idle', checkpoint_count: 20000, items_fetched: 0 },
  { sync_scope: 'posts', status: 'running', checkpoint_count: 1, items_fetched: 5 },
  { sync_scope: 'posts', status: 'completed', checkpoint_count: 10000, items_fetched: 30000 },
  { sync_scope: 'posts', status: 'failed', checkpoint_count: 2, items_fetched: 3 },
  { sync_scope: 'comments', status: 'idle', checkpoint_count: 40000, items_fetched: 0 },
  { sync_scope: 'comments', status: 'completed', checkpoint_count: 4709, items_fetched: 10000 },
  { sync_scope: 'comments', status: 'partial', checkpoint_count: 1, items_fetched: 2 },
  { sync_scope: 'comments', status: 'paused', checkpoint_count: 1, items_fetched: 0 }
];
assert.equal(groups.reduce((sum, row) => sum + row.checkpoint_count, 0), 74714);

async function checkRepository(present) {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_PORT: 1, DB_NAME: 'qa_never_connect' });
  const pool = repo.pool;
  let poolCalls = 0;
  repo.pool = {
    async query() { poolCalls += 1; throw new Error('network I/O forbidden'); },
    async getConnection() { poolCalls += 1; throw new Error('network I/O forbidden'); }
  };
  const calls = [];
  repo.query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('information_schema.COLUMNS')) return present.map(column_name => ({ column_name }));
    if (sql.includes('GROUP BY sync_scope,status')) return groups;
    if (sql.startsWith('SELECT * FROM po_sync_checkpoints')) return [{ id: 'checkpoint-fixture' }];
    if (sql.startsWith('SELECT COUNT(*) AS total')) return [{ total: 3 }];
    if (sql.startsWith('SELECT r.id FROM po_sync_runs')) return [{ id: 'run-fixture' }];
    if (sql.startsWith('SELECT r.id,')) return [{ id: 'run-fixture' }];
    throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
  };
  try {
    const summary = await repo.getSourceSyncStatusSummary({ accountId: 'account-fixture' });
    assert.equal(summary.length, 8);
    const summaryCall = calls.at(-1);
    assert.match(summaryCall.sql, /COUNT\(\*\) AS checkpoint_count/);
    assert.match(summaryCall.sql, /SUM\(items_fetched\)/);
    assert.match(summaryCall.sql, /GROUP BY sync_scope,status/);
    assert.match(summaryCall.sql, /sync_scope<>'replies'/);
    assert.deepEqual(summaryCall.params, ['account-fixture']);

    await repo.getSyncStatus({ accountId: 'account-fixture', syncScope: 'posts' });
    const statusCall = calls.at(-1);
    assert.match(statusCall.sql, /^SELECT \* FROM po_sync_checkpoints/);
    assert.deepEqual(statusCall.params, ['account-fixture', 'posts']);

    await repo.getSyncRun('run-fixture', { sourceId: 'source-fixture', regionCode: 'domestic', communityId: 'community-fixture' });
    const detail = calls.at(-1);
    assert.deepEqual(detail.params, ['run-fixture', 'source-fixture', 'community-fixture', 'domestic']);

    await repo.getLatestSyncRunForSource('source-fixture', { accountId: 'account-fixture' });
    const latestLookup = calls.at(-3);
    const latestDetail = calls.at(-1);
    assert.match(latestLookup.sql, /^SELECT r.id FROM po_sync_runs/);
    assert.deepEqual(latestLookup.params, ['source-fixture', 'account-fixture']);
    assert.deepEqual(latestDetail.params, ['run-fixture', 'account-fixture', 'source-fixture']);

    const listed = await repo.listSyncRuns({ regionCode: 'domestic', status: 'completed', page: 2, pageSize: 1 });
    assert.equal(listed.total, 3);
    assert.equal(listed.page, 2);
    assert.equal(listed.pageSize, 1);
    const count = calls.find(call => call.sql.startsWith('SELECT COUNT(*) AS total'));
    const page = calls.at(-1);
    assert.deepEqual(count.params, ['completed', 'domestic']);
    assert.match(page.sql, /FROM \(SELECT r\.id FROM po_sync_runs/);
    assert.match(page.sql, /r\.status=\?/);
    assert.match(page.sql, /g\.region_code=\?/);
    assert.match(page.sql, /LIMIT \? OFFSET \?/);
    assert.deepEqual(page.params, ['completed', 'domestic', 1, 1]);

    for (const select of [detail.sql, latestDetail.sql, page.sql]) {
      for (const column of optional) {
        const alias = column === 'community_id' ? 'run_community_id' : column;
        assert.ok(select.includes(present.includes(column) ? `r.${column} AS ${alias}` : `NULL AS ${alias}`));
      }
    }
    assert.equal(poolCalls, 0);
    return { metadataProbes: calls.filter(call => call.sql.includes('information_schema.COLUMNS')).length, queryCount: calls.length };
  } finally {
    await pool.end();
  }
}

function checkFrontend() {
  const source = fs.readFileSync(frontend, 'utf8');
  const start = source.indexOf('function checkpointsOf(');
  const end = source.indexOf('function accountIdentity(', start);
  const summaryStart = source.indexOf('function stageSummary(');
  const summaryEnd = source.indexOf('function renderStageStack(', summaryStart);
  assert.ok(start >= 0 && end > start && summaryStart >= 0 && summaryEnd > summaryStart);
  const context = vm.createContext({ pick: (item, ...keys) => keys.map(key => item?.[key]).find(value => value != null) });
  vm.runInContext(source.slice(start, end) + '\n' + source.slice(summaryStart, summaryEnd), context);
  const fixture = { checkpoints: groups };
  assert.equal(vm.runInContext('stageState', context)(fixture, 'posts'), 'failed');
  assert.equal(vm.runInContext('stageState', context)(fixture, 'comments'), 'partial');
  assert.equal(vm.runInContext('stageCount', context)(fixture, 'posts').replaceAll(',', ''), '30008');
  assert.equal(vm.runInContext('stageCount', context)(fixture, 'comments').replaceAll(',', ''), '10002');
  assert.match(vm.runInContext('stageSummary', context)(fixture, 'posts').replaceAll(',', ''), /30008 .* 20001 /);
  assert.match(vm.runInContext('stageSummary', context)(fixture, 'comments').replaceAll(',', ''), /10002 .* 40000 /);
  return sha(frontend);
}

(async () => {
  const missing = await checkRepository([]);
  const present = await checkRepository(optional);
  const frontendSha256 = checkFrontend();
  console.log(JSON.stringify({ status: 'PASS_OFFLINE_SQL_CONTRACT', repositorySha256: sha(repositoryFile), manifestSha256: sha(manifestFile), frontendSha256, groups: groups.length, checkpointCount: 74714, missing, present, productionConnections: 0 }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
