'use strict';
// Pure offline loader. Never imports runtime config, connects to DB or sends HTTP.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const originals = Object.freeze([
  ['.temp/overseas-real-small-batch-fetch-84-raw.json', '06b1cd4a19f180ae8b906cbb7e88467b420c63376aae128249eba7b47ebab9d4'],
  ['bigPlayer/.temp/overseas-real-small-batch-items-1791599835385.json', 'b2f84e03b7c675b05843aa4bd8fe127730d58ca4ba7655c07ba7bb5aaba8acca']
]);
function loadOriginals() {
  const loaded = originals.map(([relative, expected]) => {
    const absolute = path.resolve(root, relative), bytes = fs.readFileSync(absolute);
    assert.equal(sha(bytes), expected, 'original hash mismatch');
    return { path: absolute, sha256: expected, bytes: bytes.length, value: JSON.parse(bytes) };
  });
  const [fetch, items] = loaded.map(x => x.value);
  assert.equal(fetch.status, 'FETCH_COMPLETED');
  assert.equal(fetch.sourceId, items.sourceId);
  assert.equal(fetch.itemArtifactSha256, loaded[1].sha256);
  assert.equal(items.sites.length, 3);
  assert.equal(new Set(items.sites.map(x => x.siteId)).size, 3);
  assert.deepEqual(fetch.requests.map(x => x.index).sort((a, b) => a - b), Array.from({ length: 72 }, (_, i) => i + 1));
  for (const site of items.sites) {
    const f = fetch.sites.find(x => x.siteId === site.siteId);
    assert.ok(f);
    assert.equal(site.items.length, 20);
    assert.equal(site.raw.data.length, 20);
    assert.deepEqual(site.items.map(x => sha(JSON.stringify(x))), f.itemHashes);
    assert.deepEqual(site.raw.data.map(x => String(x.id)), site.items.map(x => String(x.externalId)));
  }
  return { fetch, items, artifacts: loaded.map(({ value, ...metadata }) => metadata) };
}
function audit() {
  const { fetch, items, artifacts } = loadOriginals();
  return {
    status: 'OFFLINE_ORIGINALS_VERIFIED', sourceId: items.sourceId, artifacts,
    scriptSha256: sha(fs.readFileSync(__filename)), originalExecutionScriptSha256: null,
    originalCountDefectCause: 'UNCONFIRMED_EXECUTION_VERSION',
    attemptCount: fetch.attemptCount, sentCount: fetch.sentCount, requestBudget: fetch.requestBudget,
    budgetBlockedInferred: fetch.attemptCount - fetch.sentCount,
    budgetBlockedBasis: 'attemptCount-minus-sentCount; transport budget only; no explicit original blocked field',
    observations: items.sites.reduce((n, s) => n + s.items.length, 0),
    uniqueExternalIds: new Set(items.sites.flatMap(s => s.items.map(i => String(i.externalId)))).size,
    sites: items.sites.map(s => ({ siteId: s.siteId, recordedProviderCount: s.providerItemCount,
      correctedProviderCount: s.raw.data.length, observedCount: s.items.length,
      enrichment: s.raw.paginationDiagnostics.contentEnrichment,
      cursor: JSON.parse(s.nextCursor), boundedWindowPresent: Boolean(s.raw.boundedWindow),
      observations: s.items.map(i => ({ externalId: String(i.externalId), fingerprint: i.fingerprint,
        itemSha256: sha(JSON.stringify(i)), integrity: i.rawPayload?._contentIntegrity?.status || null })) }))
  };
}
if (require.main === module) console.log(JSON.stringify(audit(), null, 2));
module.exports = { loadOriginals, audit, sha, root };
