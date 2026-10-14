'use strict';

// Builds an inactive candidate from the actual deployed Worker, never the dirty
// workspace. It does not change services, environment, task actions or the DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const BASE = 'C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1';
const SOURCE = '081a16d2-5545-4afd-9c65-e04777e4540b';
const FILES = ['worker/src/worker.js', 'worker/src/workerScanLease.js',
  'server/src/db/repository.js', 'worker/src/schedulerCandidateLoader.js',
  'worker/src/schedulerRepositoryAdapter.js'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('BASE_CONTEXT_CHANGED');
  return text.replace(before, after);
}
function patch(relative, text) {
  if (relative === 'worker/src/worker.js') {
    text = replaceOnce(text, 'async function runSource(deps, source, precreatedSyncRun = null) {',
      `async function runSource(deps, source, precreatedSyncRun = null) {\n  // Dedicated overseas collector owns this source; no collection side effects.\n  if (String(source?.id) === '${SOURCE}') return { skipped: true, reasonCode: 'OVERSEAS_DEDICATED_COLLECTOR' };`);
    for (const signature of [
      'async function syncStagePage(deps, stage) {',
      'async function runPagedSource(deps, source, connector, run, syncRun, knownAccount = null, finishOnce = createFinishOnce(deps, source, run, syncRun)) {'
    ]) {
      const sourceExpr = signature.includes('syncStagePage') ? 'stage?.source?.id' : 'source?.id';
      text = replaceOnce(text, signature, signature + `\n  if (String(${sourceExpr}) === '${SOURCE}') throw Object.assign(new Error('OVERSEAS_DEDICATED_COLLECTOR'), { code: 'OVERSEAS_DEDICATED_COLLECTOR' });`);
    }
    const stageSignature = text.split('\n').find(line => line.startsWith('async function syncStage(deps, '));
    if (!stageSignature) throw new Error('BASE_CONTEXT_CHANGED');
    text = replaceOnce(text, stageSignature, stageSignature + `\n  if (String(source?.id) === '${SOURCE}') throw Object.assign(new Error('OVERSEAS_DEDICATED_COLLECTOR'), { code: 'OVERSEAS_DEDICATED_COLLECTOR' });`);
    return text;
  }
  if (relative === 'worker/src/workerScanLease.js') {
    text = replaceOnce(text,
      "WHERE (status='running' AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3)))\n       OR (status='queued' AND updated_at<DATE_ADD(UTC_TIMESTAMP(3), INTERVAL -? SECOND))",
      `WHERE COALESCE(source_id,'')<>'${SOURCE}'\n      AND account_id NOT IN (SELECT id FROM po_accounts WHERE source_id='${SOURCE}')\n      AND ((status='running' AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3)))\n       OR (status='queued' AND updated_at<DATE_ADD(UTC_TIMESTAMP(3), INTERVAL -? SECOND)))`);
    return text;
  }
  if (relative === 'server/src/db/repository.js') {
    for (const method of ['listRunnableSyncRuns', 'listDueSources', 'listManualDueSources']) {
      const start = text.indexOf(`async ${method}(`);
      const end = text.indexOf('\n  async ', start + 1);
      if (start < 0 || end < 0) throw new Error('BASE_METHOD_CHANGED');
      const part = replaceOnce(text.slice(start, end), 'WHERE s.enabled=1',
        `WHERE s.id<>'${SOURCE}' AND s.enabled=1`);
      text = text.slice(0, start) + part + text.slice(end);
    }
    return replaceOnce(text,
      'WHERE (next_retry_at IS NULL OR next_retry_at<=UTC_TIMESTAMP(3)) AND ${where}',
      `WHERE COALESCE(source_id,'')<>'${SOURCE}' AND account_id NOT IN (SELECT id FROM po_accounts WHERE source_id='${SOURCE}') AND (next_retry_at IS NULL OR next_retry_at<=UTC_TIMESTAMP(3)) AND ` + '${where}');
  }
  if (relative === 'worker/src/schedulerCandidateLoader.js') {
    return replaceOnce(text,
      "const where = allowlist ? ` WHERE s.id IN (${allowlist.map(() => '?').join(',')})` : '';",
      `const where = allowlist ? \` WHERE s.id<>'${SOURCE}' AND s.id IN (\${allowlist.map(() => '?').join(',')})\` : " WHERE s.id<>'${SOURCE}'";`);
  }
  if (relative === 'worker/src/schedulerRepositoryAdapter.js') {
    const guard = `    if (String(sourceId) === '${SOURCE}') throw multisiteError('OVERSEAS_DEDICATED_COLLECTOR', 'Source is owned by the dedicated overseas collector');\n`;
    for (const signature of [
      "    if (!['scheduled', 'scheduled_catchup'].includes(triggerType)) {",
      "    if (!runId || !sourceId || !accountId || !ownerId || !scheduledAt || !nextSlotAt) throw new TypeError('scheduleSlotAtomic requires run/source/account/owner/times');",
      "  async function acquireLease({ sourceId, runId, ownerId, now, leaseUntil, scheduledAt, nextSlotAt } = {}) {"
    ]) {
      text = replaceOnce(text, signature, signature.startsWith('  async') ? signature + '\n' + guard.trimEnd() : guard + signature);
    }
    return text;
  }
  throw new Error('FILE_OUT_OF_SCOPE');
}
function main() {
  const repoRoot = path.resolve(__dirname, '../../..');
  const packageRoot = path.join(repoRoot, '.temp', `overseas-shared-exclusion-${Date.now()}`);
  const prepared = FILES.map(relative => {
    const original = fs.readFileSync(path.join(BASE, relative));
    const candidate = Buffer.from(patch(relative, original.toString('utf8').replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n'));
    return { relative, original, candidate };
  });
  fs.mkdirSync(packageRoot, { recursive: false });
  for (const file of prepared) for (const kind of ['before', 'candidate']) {
    const destination = path.join(packageRoot, kind, file.relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, kind === 'before' ? file.original : file.candidate, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(packageRoot, 'delivery.json'), JSON.stringify({
    status: 'PREPARED_NOT_DEPLOYED', base: BASE, excludedSourceId: SOURCE,
    purpose: 'Collection exclusion only. AI/translation remain the existing shared consumers.',
    files: prepared.map(file => ({ path: file.relative, beforeSha256: sha(file.original), candidateSha256: sha(file.candidate) })),
    activation: 'Requires an approved drained shared Worker switch. Never overwrite live release files.',
    rollback: 'Return to a release retaining this same target exclusion; do not re-enable the original collector for the target source.',
    limitations: 'Not a scheduled collector. Dedicated production consumer and Windows task wiring still required.'
  }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'PREPARED_NOT_DEPLOYED', packageRoot, files: prepared.length }));
}
if (require.main === module) main();
module.exports = { patch, FILES };
