'use strict';
// Incremental compatibility overlay for the deployed legacy (pre-030) Worker.
// No service, database, or task mutation. Context mismatches fail closed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCE = '081a16d2-5545-4afd-9c65-e04777e4540b';
const FILES = ['worker/src/worker.js', 'worker/src/workerScanLease.js', 'server/src/db/repository.js',
  'worker/src/schedulerCandidateLoader.js', 'worker/src/schedulerRepositoryAdapter.js', 'server/src/connectors/bigplayerH5Connector.js'];
const ADDITIONS = ['shared/overseasCommentIntegrity.js', 'worker/src/sharedOverseasCommentTargets.js'];
function once(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('OVERLAY_CONTEXT_CHANGED: ' + before.slice(0, 90));
  return text.replace(before, after);
}
function patchRuntime(file, input) {
  let text = input.replace(/\r\n/g, '\n');
  if (file === 'worker/src/worker.js') {
    text = text.split('\n').filter(line => !(line.includes(SOURCE) && line.includes('OVERSEAS_DEDICATED_COLLECTOR'))
      && !line.includes('Dedicated overseas collector owns this source')).join('\n');
    text = "const { loadSharedCommentTargets, loadPendingReplies } = require('./sharedOverseasCommentTargets');\n" + text;
    text = text.replaceAll('const timestamp = new Date(value).getTime();', 'const timestamp = utcDateTime(value).getTime();');
    text = once(text, "&& first(syncRun, ['trigger_type', 'triggerType'], null) === 'scheduled_site'", "&& ['scheduled_site','manual'].includes(first(syncRun, ['trigger_type', 'triggerType'], null))");
    text = once(text, 'const sourceItems = scope', 'const sourceItems = scope');
    text = once(text, 'if (deps.aiAnalysisPolicy) normalized.forEach',
      "normalized.forEach((item, index) => { if (sourceItems[index].recoveryContextAncestor) item.recoveryContextAncestor = true; });\n  if (deps.aiAnalysisPolicy) normalized.forEach");
    text = once(text, "parentPlatformContentId: taskKind === 'facebook_reply' ? commentId : null",
      "parentPlatformContentId: ['facebook_reply','q1_reply'].includes(taskKind) ? commentId : null");
    text = once(text, "taskKind === 'facebook_reply' ? { ...raw, platformParentId: commentId, contentDepth: 2 } : raw",
      "['facebook_reply','q1_reply'].includes(taskKind) ? { ...raw, platformParentId: commentId, contentDepth: 2 } : raw");
    text = once(text, "change: 'changed' });\n", "change: 'changed' }).filter(entry => !entry.raw?.recoveryContextAncestor);\n");
    text = once(text, "if (entry.change !== 'unchanged' && isInCollectionWindow(entry)) scheduleComments",
      "if ((source.region_code === 'overseas' || entry.change !== 'unchanged') && isInCollectionWindow(entry)) scheduleComments");
    text = once(text, 'feeds.forEach(scheduleFeed);', `feeds.forEach(scheduleFeed);
  if (source.region_code === 'overseas' && commentsSupported) {
    try {
      for (const postId of await loadSharedCommentTargets(deps.repo, source, account)) scheduleComments(postId);
      for (const target of await loadPendingReplies(deps.repo, source, account, deps.collectionWindow)) scheduleReply(target);
    }
    catch (error) { failStage('comments', 'historical_parent_discovery', error); }
  }`);
  } else if (file === 'server/src/db/repository.js') {
    // Page commits already persist cumulative counts. A resumed attempt may
    // skip every completed checkpoint and report zero; never erase that ledger.
    text = text.replaceAll('discovered_count=COALESCE(?,discovered_count), stored_count=COALESCE(?,stored_count)',
      'discovered_count=GREATEST(discovered_count,COALESCE(?,discovered_count)), stored_count=GREATEST(stored_count,COALESCE(?,stored_count))');
    text = text.replaceAll(`s.id<>'${SOURCE}' AND `, '')
      .replaceAll(`COALESCE(source_id,'')<>'${SOURCE}' AND account_id NOT IN (SELECT id FROM po_accounts WHERE source_id='${SOURCE}') AND `, '');
    text = "const { scopeOf, assertOwner, validateCommentAncestry } = require('../../../shared/overseasCommentIntegrity');\n" + text;
    text = once(text, 'SELECT c.id, c.fingerprint FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analysis_jobs',
      'SELECT c.id, c.fingerprint, c.raw_payload FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analysis_jobs');
    text = once(text, 'async _upsertContentPageAttempt({ account, syncRunId,', 'async _upsertContentPageAttempt({ account, source, syncRunId,');
    text = once(text, "AND parent_run_id IS NOT NULL AND trigger_type='scheduled_site' AND lease_owner=?", "AND parent_run_id IS NOT NULL AND trigger_type IN ('scheduled_site','manual') AND lease_owner=?");
    text = once(text, '  async claimSyncCheckpoint({ accountId,', `  async claimSyncCheckpoint(input) {
    for (let attempt = 0; ; attempt++) {
      try { return await this._claimSyncCheckpointOnce(input); }
      catch (error) {
        if (!['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error?.code) || attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt + Math.floor(Math.random() * 100)));
      }
    }
  }
  async _claimSyncCheckpointOnce({ accountId,`);
    text = once(text, 'let fetchedCount = 0; let insertedCount', 'const overseasScope = scopeOf(source, account);\n      let fetchedCount = 0; let insertedCount');
    text = once(text, ".sort((left, right) => String(left.raw.externalId || '')", ".sort((left, right) => Number(left.raw.contentDepth || 0) - Number(right.raw.contentDepth || 0) || String(left.raw.externalId || '')");
    text = once(text, 'const rootExternalId = raw.rootPlatformContentId', `if (overseasScope && existing) assertOwner(overseasScope, existing);
        const rootExternalId = raw.rootPlatformContentId`);
    for (const variable of ['root', 'parent']) text = once(text,
      `const ${variable}Row = ${variable}ExternalId ? (await conn.query('SELECT id FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1',`,
      `const ${variable}Row = ${variable}ExternalId ? (await conn.query(overseasScope ? 'SELECT * FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1' : 'SELECT id FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1',`);
    text = once(text, 'const contentType = raw.contentType || (syncScope', `if (overseasScope && syncScope === 'comments') await validateCommentAncestry(conn, overseasScope, rootRow, parentRow, raw, existing);
        if (overseasScope && raw.recoveryContextAncestor && existing) {
          contents[sourceIndex] = { content: existing, change: 'unchanged' }; continue;
        }
        const contentType = raw.contentType || (syncScope`);
    // Shared feeds must retain site proof for subsequent comment discovery.
    text = once(text, 'JSON.stringify(feed)]);', "JSON.stringify({ ...feed, ...(source?.siteId ? { siteId: source.siteId } : {}) })]);");
  } else if (file === 'worker/src/schedulerCandidateLoader.js') {
    text = once(text, `const where = allowlist ? \` WHERE s.id<>'${SOURCE}' AND s.id IN (\${allowlist.map(() => '?').join(',')})\` : " WHERE s.id<>'${SOURCE}'";`,
      "const where = allowlist ? ` WHERE s.id IN (${allowlist.map(() => '?').join(',')})` : '';" );
  } else if (file === 'worker/src/schedulerRepositoryAdapter.js') {
    text = text.split('\n').filter(line => !(line.includes(SOURCE) && line.includes('OVERSEAS_DEDICATED_COLLECTOR'))).join('\n');
  } else if (file === 'worker/src/workerScanLease.js') {
    text = once(text, `WHERE COALESCE(source_id,'')<>'${SOURCE}'
      AND account_id NOT IN (SELECT id FROM po_accounts WHERE source_id='${SOURCE}')
      AND ((status='running'`, "WHERE ((status='running'");
    text = once(text, "OR (status='queued' AND updated_at<", "OR (status='queued' AND attempts>0 AND COALESCE(error_code,'')<>'SYNC_ACCOUNT_BUSY' AND updated_at<");
    text = once(text, '    ORDER BY updated_at ASC, id ASC LIMIT ?', `    AND NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT parent_run_id FROM po_sync_runs WHERE parent_run_id IS NOT NULL) parent_runs WHERE parent_runs.parent_run_id=po_sync_runs.id)
    ORDER BY updated_at ASC, id ASC LIMIT ?`);
  } else if (file === 'server/src/connectors/bigplayerH5Connector.js') {
    text = once(text, 'return repliesInWindow;', `// Keep an out-of-window parent as context for in-window replies, including
    // separately paged replies. The repository preserves an existing ancestor.
    if (new URL(context.baseUrl).hostname === 'club-en.q1.com' && (repliesInWindow.length || replyTargets.some(target => target.commentId === top.externalId))) return [{ ...top, recoveryContextAncestor: true, ...(repliesInWindow.length ? { replies: repliesInWindow } : {}) }];
    return repliesInWindow;`);
  } else throw new Error('OVERLAY_FILE_INVALID');
  if (text.includes('OVERSEAS_DEDICATED_COLLECTOR')) throw new Error('DEDICATED_GUARD_REMAINS');
  return text;
}
function prepare(base, destination, project = path.resolve(__dirname, '..')) {
  if (fs.existsSync(destination)) throw new Error('DESTINATION_EXISTS');
  const changed = FILES.map(file => ({ file, before: fs.readFileSync(path.join(base, file)), after: patchRuntime(file, fs.readFileSync(path.join(base, file), 'utf8')) }));
  fs.cpSync(base, destination, { recursive: true, dereference: false });
  for (const { file, after } of changed) fs.writeFileSync(path.join(destination, file), after);
  for (const file of ADDITIONS) { fs.mkdirSync(path.dirname(path.join(destination, file)), { recursive: true }); fs.copyFileSync(path.join(project, file), path.join(destination, file)); }
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  const manifest = { base, destination, createdAt: new Date().toISOString(), files: changed.map(item => ({ path: item.file, before: sha(item.before), after: sha(item.after) })), additions: ADDITIONS.map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(destination, file))) })) };
  fs.writeFileSync(destination + '.overlay.json', JSON.stringify(manifest, null, 2));
  return manifest;
}
if (require.main === module) console.log(JSON.stringify(prepare(process.argv[2], process.argv[3])));
module.exports = { patchRuntime, prepare, FILES, ADDITIONS };
