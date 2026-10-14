'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const SOURCE_ID = '081a16d2-5545-4afd-9c65-e04777e4540b';
const MAX_REQUESTS = 84;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function createBoundedTransport({ fetchImpl = globalThis.fetch, maxRequests = MAX_REQUESTS, deadlineMs = 120000 } = {}) {
const requestEvidence = [];
let attemptCount = 0; let sentCount = 0; let blockedCount = 0;
const runDeadline = AbortSignal.timeout(deadlineMs);
async function transport(url, options = {}) {
  const index = ++attemptCount;
  if (index > maxRequests) { blockedCount++; throw Object.assign(new Error('OVERSEAS_HTTP_BUDGET_EXCEEDED'), { code: 'OVERSEAS_HTTP_BUDGET_EXCEEDED' }); }
  sentCount++;
  try {
    const signals = [runDeadline]; if (options.signal) signals.push(options.signal);
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.any(signals) });
    const clone = response.clone(); const body = await clone.arrayBuffer();
    requestEvidence.push({ index, capability: new URL(url).pathname, status: response.status, ok: response.ok, urlOrigin: new URL(response.url || url).origin, bodyBytes: body.byteLength, bodySha256: sha(Buffer.from(body)) });
    return response;
  } catch (error) {
    requestEvidence.push({ index, capability: new URL(url).pathname, errorCode: error.code || 'FETCH_FAILED' });
    throw error;
  }
}
return { transport, evidence: () => ({ attemptCount, sentCount, blockedCount, requestBudget: maxRequests, requests: [...requestEvidence] }) };
}
function providerItems(raw) {
  if (Array.isArray(raw?.data)) return raw.data;
  for (const list of [raw?.data?.items, raw?.data?.list]) if (Array.isArray(list)) return list;
  return [];
}
function siteSource(source, account, site) {
  const config = JSON.parse(source.config);
  const siteUrl = String(site.url);
  return { ...source, account, account_id: account.id, siteId: site.siteId || site.site_id, site_id: site.siteId || site.site_id, siteUrl, site_url_snapshot: siteUrl, config: JSON.stringify({ ...config, baseUrl: siteUrl }) };
}
async function main() {
  const { loadRuntimeEnv } = require('../server/src/runtimeEnv');
  loadRuntimeEnv(); process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  const { Repository } = require('../server/src/db/repository');
  const { CredentialContext } = require('../server/src/services/credentialContext');
  const { BigPlayerH5Connector } = require('../server/src/connectors/bigPlayerH5Connector');
  const { createOverseasBigPlayerSiteSession } = require('../server/src/connectors/overseasBigPlayerSiteSession');
  const budget = createBoundedTransport(), { transport } = budget;
  const repo = new Repository(process.env);
  try {
  const credentialContext = new CredentialContext({ repo });
  const source = (await repo.listSources()).find(item => item.id === SOURCE_ID);
  if (!source) throw Object.assign(new Error('SOURCE_NOT_FOUND'), { code: 'SOURCE_NOT_FOUND' });
  const account = await repo.getAccount(source.default_account_id);
  const sites = JSON.parse(source.config).siteUrls || [];
  const registry = await repo.query('SELECT site_id,url_hash,enabled,auth_status FROM po_source_sites WHERE source_id=? ORDER BY site_id', [SOURCE_ID]);
  const uniqueSites = new Set(sites.map(site => site.siteId || site.site_id));
  const urlHash = url => sha(String(url));
  if (sites.length !== 3 || uniqueSites.size !== 3 || registry.length !== 3 || registry.some(site => !uniqueSites.has(site.site_id) || Number(site.enabled) !== 1)
    || sites.some(site => { const id = site.siteId || site.site_id; const row = registry.find(item => item.site_id === id); return !row || row.url_hash !== urlHash(site.url); })) throw Object.assign(new Error('OVERSEAS_SITE_REGISTRY_MISMATCH'), { code: 'OVERSEAS_SITE_REGISTRY_MISMATCH' });
  const session = createOverseasBigPlayerSiteSession({ transport });
  const connector = new BigPlayerH5Connector({ ...process.env, BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club-en.q1.com' }, { credentialContext, overseasSiteSession: session, fetchImpl: transport });
  const enrich = connector.enrichQ1FeedItems.bind(connector);
  connector.enrichQ1FeedItems = input => enrich({ ...input, items: input.items.slice(0, 20) });
  const results = [];
  const itemArtifacts = [];
  const artifactPath = path.resolve(__dirname, '../../../.temp', `overseas-real-small-batch-items-${Date.now()}.json`);
  const implementation = [__filename, require.resolve('../server/src/connectors/overseasBigPlayerSiteSession'), require.resolve('../server/src/connectors/bigPlayerH5Connector')]
    .map(filename => ({ path: filename, sha256: sha(fs.readFileSync(filename)) }));
  const startedAt = new Date().toISOString();
  fs.writeFileSync(artifactPath, JSON.stringify({ sourceId: SOURCE_ID, startedAt, implementation, sites: [] }, null, 2) + '\n', { flag: 'wx' });
  for (const site of sites) {
    const scoped = siteSource(source, account, site);
    const feed = await connector.discoverFeeds({ source: scoped, account, credentialContext });
    const merged = feed.find(item => item.endpointKind === 'merged') || feed[0] || null;
    const page = merged ? await connector.listFeedContents({ source: scoped, account, credentialContext, feed: merged, limit: 1, cursor: null, segmentId: `real-small-batch-${scoped.siteId}` }) : { items: [], nextCursor: null, hasMore: false };
    const items = Array.isArray(page.items) ? page.items : [];
    const supplied = providerItems(page.raw);
    itemArtifacts.push({ siteId: scoped.siteId, providerItemCount: supplied.length, sampledCount: items.length, nextCursor: page.nextCursor || null, items, raw: page.raw || null });
    fs.writeFileSync(artifactPath, JSON.stringify({ sourceId: SOURCE_ID, startedAt, implementation, sites: itemArtifacts }, null, 2) + '\n', 'utf8');
    results.push({ siteId: scoped.siteId, feedCount: feed.length, feedKinds: feed.map(item => item.endpointKind || null), providerItemCount: supplied.length, sampledCount: items.length, incomplete: supplied.length > items.length, itemHashes: items.map(item => sha(JSON.stringify(item))), hasMore: Boolean(page.hasMore), nextCursorPresent: page.nextCursor != null });
  }
  console.log(JSON.stringify({ status: 'FETCH_COMPLETED', sourceId: SOURCE_ID, startedAt, implementation, siteCount: results.length, registrySiteCount: registry.length, ...budget.evidence(), itemArtifactPath: artifactPath, itemArtifactSha256: sha(fs.readFileSync(artifactPath)), sites: results }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'NO_GO', errorCode: error.code || 'OVERSEAS_REAL_SMALL_BATCH_FAILED', ...budget.evidence() }, null, 2));
    process.exitCode = 1;
  } finally { await repo.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'NO_GO', errorCode: error.code || 'OVERSEAS_REAL_SMALL_BATCH_FAILED' })); process.exitCode = 1; });
module.exports = { main, createBoundedTransport, providerItems };
