'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009';
const staticRoot = path.join(root, 'domestic-pending-bMQyMh');
const apiRoot = path.join(root, 'v019-read-compat-vgfxk2');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(staticRoot, 'manifest.json'), 'utf8'));
const original = fs.readFileSync(manifest.baseline);
const before = fs.readFileSync(path.join(staticRoot, 'sources.before.js'));
const updated = fs.readFileSync(path.join(staticRoot, 'sources.js'));

assert.equal(sha(path.join(apiRoot, 'package-release-manifest.json')), '2cb014364222f660d07e4c324b4f241a6a6ff1ebe6ace2a62ef4f9f385d45f06');
assert.equal(sha(path.join(apiRoot, 'server/src/db/repository.js')), 'f6b73474a329861e12469d58918c5d272478b89fff6f5f606cb59464cef1343e');
assert.equal(sha(manifest.baseline), manifest.baselineSha256);
assert.equal(sha(path.join(staticRoot, 'sources.before.js')), manifest.baselineSha256);
assert.equal(sha(path.join(staticRoot, 'sources.js')), manifest.sha256);
assert.deepEqual(original, before);
assert.equal(manifest.changes, 1);
assert.equal(manifest.byteOffset, 44782);
assert.deepEqual(updated, Buffer.concat([
  original.subarray(0, manifest.byteOffset),
  Buffer.from(manifest.after),
  original.subarray(manifest.byteOffset + Buffer.byteLength(manifest.before))
]));

const source = updated.toString('utf8');
const start = source.indexOf('function checkpointsOf(');
const end = source.indexOf('function accountIdentity(', start);
const summaryStart = source.indexOf('function stageSummary(');
const summaryEnd = source.indexOf('function renderStageStack(', summaryStart);
assert.ok(start >= 0 && end > start && summaryStart >= 0 && summaryEnd > summaryStart);
const pick = (item, ...keys) => keys.map(key => item?.[key]).find(value => value != null);
const context = vm.createContext({ pick, STAGES: [['posts'], ['comments']] });
vm.runInContext(source.slice(start, end) + '\n' + source.slice(summaryStart, summaryEnd), context);
const stageState = vm.runInContext('stageState', context);
const stageCount = vm.runInContext('stageCount', context);
const stageSummary = vm.runInContext('stageSummary', context);
const flat = value => String(value).replaceAll(',', '');

const full = { checkpoints: [
  { sync_scope: 'posts', status: 'idle', items_fetched: 2 },
  { sync_scope: 'posts', status: 'idle', items_fetched: 3 },
  { sync_scope: 'posts', status: 'failed', items_fetched: 4, error_message: 'post failure' },
  { sync_scope: 'comments', status: 'running', items_fetched: 5 },
  { sync_scope: 'comments', status: 'running', items_fetched: 7 },
  { sync_scope: 'comments', status: 'partial', items_fetched: 11, error_message: 'comment failure' }
] };
const summary = { checkpoints: [
  { sync_scope: 'posts', status: 'idle', checkpoint_count: 2, items_fetched: 5, error_message: 'post failure' },
  { sync_scope: 'posts', status: 'failed', checkpoint_count: 1, items_fetched: 4, error_message: 'post failure' },
  { sync_scope: 'comments', status: 'running', checkpoint_count: 2, items_fetched: 12, error_message: 'comment failure' },
  { sync_scope: 'comments', status: 'partial', checkpoint_count: 1, items_fetched: 11, error_message: 'comment failure' }
] };
for (const scope of ['posts', 'comments']) {
  assert.equal(stageState(full, scope), stageState(summary, scope));
  assert.equal(stageCount(full, scope), stageCount(summary, scope));
  assert.equal(stageSummary(full, scope), stageSummary(summary, scope));
}
assert.equal(stageState(summary, 'posts'), 'failed');
assert.equal(stageState(summary, 'comments'), 'running');
assert.match(flat(stageSummary(summary, 'posts')), /9 .* 2 /);
assert.match(flat(stageSummary(summary, 'comments')), /23 .* 2 /);

const errorLine = source.split(/\r?\n/).find(line => line.includes('const error = STAGES.flatMap(([scope]) => checkpointsFor(source, scope))'));
assert.ok(errorLine);
const errorExpression = errorLine.trim().replace(/^const error = /, '').replace(/;$/, '');
const errorFor = item => vm.runInContext(errorExpression, vm.createContext({
  STAGES: [['posts'], ['comments']],
  checkpointsFor: context.checkpointsFor,
  pick,
  source: item
}));
assert.equal(errorFor(full), 'post failure');
assert.equal(errorFor(summary), 'post failure');
assert.equal(errorFor({ checkpoints: [] }), undefined);
assert.equal(errorFor({ checkpoints: [], last_error: 'source fallback' }), 'source fallback');

assert.equal(stageSummary({ checkpoints: [{ sync_scope: 'posts', status: 'idle', items_fetched: 0 }] }, 'posts'), '0 已写入 / 1 待处理');
assert.equal(stageSummary({ checkpoints: [{ sync_scope: 'posts', status: 'idle', checkpoint_count: 0, items_fetched: 0 }] }, 'posts'), '0 已写入');
assert.equal(stageSummary({ checkpoints: [] }, 'posts'), '-');

console.log(JSON.stringify({ status: 'PASS_ISOLATED_DOMESTIC_STATIC_CONTRACT', apiManifestSha256: sha(path.join(apiRoot, 'package-release-manifest.json')), apiRepositorySha256: sha(path.join(apiRoot, 'server/src/db/repository.js')), staticManifestSha256: sha(path.join(staticRoot, 'manifest.json')), deployedBeforeSha256: manifest.baselineSha256, staticAfterSha256: manifest.sha256, changedSpans: 1, scopesChecked: 2, productionConnections: 0 }));
