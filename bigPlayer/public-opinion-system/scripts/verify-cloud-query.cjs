'use strict';
// Read-only acceptance check; never changes the serving backend.
process.env.PUBLIC_OPINION_SERVICE_MODE = '1';
process.env.PUBLIC_OPINION_ENV_FILE = 'C:/ProgramData/PublicOpinion/config/public-opinion.env';
require('../server/src/runtimeEnv').loadRuntimeEnv();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Repository } = require('../server/src/db/repository');
const { BaasQueryRepository } = require('../server/src/services/baasQueryRepository');
const { buildDocuments } = require('../server/src/services/baasQueryProjectionWriter');
async function run() {
  const repo = new Repository();
  const cloud = new BaasQueryRepository({ tokenFile: 'C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi', reviewRepository: repo });
  try {
    const state = JSON.parse(fs.readFileSync('C:/ProgramData/PublicOpinion/data/baas-query/build-state.json'));
    await cloud.ready();
    const ids = [state.ids[0], state.ids[Math.floor(state.ids.length / 2)], state.ids.at(-1)];
    const expected = await buildDocuments(repo, ids);
    const results = [];
    for (const row of expected) {
      const start = Date.now();
      const filters = { communityId: row.community_id, contentId: row.id };
      assert.equal(await cloud.countContents(filters), 1);
      const [actual] = await cloud.listContents(filters);
      assert.equal(actual.id, row.id);
      assert.equal(actual.fingerprint, row.fingerprint);
      assert.equal(actual.sentiment, row.sentiment);
      assert.equal(actual.severity, row.severity);
      assert.ok(actual.body.length >= row.body.length);
      results.push({ type: row.content_type, detailVerified: true, elapsedMs: Date.now() - start });
    }
    const groups = new Map();
    for (let offset = 0; offset < state.ids.length; offset += 200) {
      const batch = state.ids.slice(offset, offset + 200);
      const rows = await repo.query(`SELECT c.community_id,s.platform,c.content_type,COUNT(*) total FROM po_contents c JOIN po_sources s ON s.id=c.source_id WHERE c.id IN (${batch.map(() => '?').join(',')}) AND c.is_deleted=0 GROUP BY c.community_id,s.platform,c.content_type`, batch);
      for (const row of rows) {
        const filters = { communityId: row.community_id, platform: row.platform, contentType: row.content_type };
        const key = JSON.stringify(filters), group = groups.get(key) || { filters, total: 0 };
        group.total += Number(row.total); groups.set(key, group);
      }
    }
    let driftedGroups = 0;
    for (const group of groups.values()) {
      const actual = await cloud.countContents(group.filters);
      if (actual !== group.total) { driftedGroups++; console.log(JSON.stringify({ snapshotCountDrift: actual - group.total, filters: group.filters })); }
    }
    const communities = await cloud.listCommunities();
    assert.ok(communities.length > 0);
    for (const community of communities) {
      const started = Date.now();
      try {
        const result = await cloud.getOverview({ communityId: community.id, from: '2026-10-15T00:00:00+08:00', to: '2026-10-16T00:00:00+08:00' });
        console.log(JSON.stringify({ community: community.name, overview: result.metrics.total, elapsedMs: Date.now() - started }));
      } catch (e) { console.error(JSON.stringify({ community: community.name, code: e.code, message: String(e.message).slice(0, 200) })); throw e; }
    }
    console.log(JSON.stringify({ status: driftedGroups ? 'retry_snapshot_after_sync' : 'success', projectedCount: state.ids.length, verifiedGroups: groups.size - driftedGroups, driftedGroups, samples: results }));
    if (driftedGroups) process.exitCode = 2;
  } finally { await repo.pool.end(); }
}
run().catch(e => { console.error(JSON.stringify({ status: 'failed', code: e.code || 'QUERY_ACCEPTANCE_FAILED', message: String(e.message).slice(0, 200) })); process.exitCode = 1; });
