'use strict';
// Standalone local evidence audit: built-ins only, no app imports, env, DB or network.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function original(relative, expected) {
  const absolute = path.join(root, relative);
  const bytes = fs.readFileSync(absolute);
  assert.equal(sha(bytes), expected);
  return { absolute, sha256: expected, value: JSON.parse(bytes) };
}
const fetchArtifact = original('.temp/overseas-real-small-batch-fetch-84-raw.json', '06b1cd4a19f180ae8b906cbb7e88467b420c63376aae128249eba7b47ebab9d4');
const itemsArtifact = original('bigPlayer/.temp/overseas-real-small-batch-items-1791599835385.json', 'b2f84e03b7c675b05843aa4bd8fe127730d58ca4ba7655c07ba7bb5aaba8acca');
const f = fetchArtifact.value, a = itemsArtifact.value;
assert.equal(f.status, 'FETCH_COMPLETED');
assert.equal(f.sourceId, a.sourceId);
assert.equal(f.itemArtifactSha256, itemsArtifact.sha256);
assert.equal(path.resolve(f.itemArtifactPath), itemsArtifact.absolute);
assert.equal(f.requestBudget, 84);
assert.equal(f.attemptCount, 72);
assert.equal(f.sentCount, 72);
assert.equal(f.requests.length, 72);
assert.equal(f.siteCount, 3);
assert.equal(f.registrySiteCount, 3);
assert.equal(a.sites.length, 3);
assert.equal(new Set(a.sites.map(s => s.siteId)).size, 3);
assert.deepEqual(f.requests.map(r => r.index).sort((a, b) => a - b), Array.from({ length: 72 }, (_, i) => i + 1));
f.requests.forEach(r => {
  assert.equal(r.status, 200);
  assert.equal(r.ok, true);
  assert.match(r.bodySha256, /^[a-f0-9]{64}$/);
  assert.ok(r.bodyBytes > 0);
});
const sites = a.sites.map(s => {
  const summary = f.sites.find(t => t.siteId === s.siteId);
  assert.ok(summary);
  assert.ok(Array.isArray(s.raw.data));
  assert.equal(s.raw.code, 0);
  assert.equal(s.raw.data.length, 20);
  assert.equal(s.items.length, 20);
  assert.equal(s.sampledCount, 20);
  assert.equal(new Set(s.items.map(i => i.externalId)).size, 20);
  assert.deepEqual(s.items.map(i => sha(JSON.stringify(i))), summary.itemHashes);
  assert.deepEqual(s.raw.data.map(i => String(i.id)), s.items.map(i => String(i.externalId)));
  const currentRead = Array.isArray(s.raw?.data) ? s.raw.data : (s.raw?.data?.items || s.raw?.data?.list || []);
  assert.equal(currentRead.length, 20);
  const times = s.raw.data.map(i => Date.parse(i.createTime));
  const cursor = JSON.parse(s.nextCursor);
  const d = s.raw.paginationDiagnostics;
  assert.equal(d.pagesFetched, 1);
  assert.equal(d.timeOrderVerified, false);
  assert.equal(d.timeBoundaryReached, false);
  assert.equal(d.providerHasMore, true);
  assert.equal(summary.hasMore, true);
  assert.equal(summary.nextCursorPresent, true);
  assert.equal(cursor.pageIndex, 2);
  assert.equal(cursor.offsetId, 20);
  return { siteId: s.siteId, providerRawCount: s.raw.data.length, recordedProviderCount: s.providerItemCount,
    itemCount: s.items.length, currentExpressionProviderCount: currentRead.length, itemHashesMatch: true, rawIdsMatch: true,
    enrichment: d.contentEnrichment, pagesFetched: d.pagesFetched,
    timeOrderVerified: d.timeOrderVerified, timeBoundaryReached: d.timeBoundaryReached,
    parseableRawTimes: times.filter(Number.isFinite).length,
    nonIncreasingRawTimes: times.every((t, i) => Number.isFinite(t) && (i === 0 || t <= times[i - 1])),
    nextPageIndex: cursor.pageIndex, nextOffsetId: cursor.offsetId };
});
const idSets = a.sites.map(s => new Set(s.items.map(i => i.externalId)));
const counts = {};
for (const r of f.requests) counts[r.capability] = (counts[r.capability] || 0) + 1;
console.log(JSON.stringify({ result: 'EVIDENCE_AUDIT_COMPLETED', scope: 'local_originals_only',
  artifacts: [fetchArtifact, itemsArtifact].map(({ absolute, sha256 }) => ({ path: absolute, sha256 })),
  attemptCount: f.attemptCount, sentCount: f.sentCount, requestBudget: f.requestBudget,
  budgetBlockedInferred: f.attemptCount - f.sentCount, explicitBlockedFieldPresent: Object.hasOwn(f, 'blockedCount'),
  capabilities: counts, sites, crossSiteUniqueExternalIds: new Set(idSets.flatMap(s => [...s])).size,
  realHttpExecutedByQa: false, realDbOpenedByQa: false, realAiExecutedByQa: false }, null, 2));
