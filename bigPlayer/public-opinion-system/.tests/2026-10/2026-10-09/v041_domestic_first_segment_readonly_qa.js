'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const mysql = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/node_modules/mysql2/promise.js');

const root = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/domestic-today-recovery-20261009';
const reports = ['first-segment-v8-execution.json', 'first-segment-v8-page2-execution.json']
  .map(name => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8')));
const report = reports[0];
const evidence = JSON.parse(fs.readFileSync(`${root}/first-page-readonly-evidence.json`, 'utf8'));
const sourceId = '5c21f78d-5f67-4467-963d-dcdeb5e26cab';
const accountId = '70c393cf-9600-11f1-b3d2-d85ed3ae61b0';
const communityId = '00000000-0000-0000-0000-000000000101';
const siteId = 'site-7586e54f3a0cb84f433d59cf6baa1d4d';
const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };

async function main() {
  if (reports.some(item => item.status !== 'PARTIAL_TODAY' || item.pages !== 1
    || item.sourceId !== sourceId || item.accountId !== accountId
    || item.publishedFrom !== report.publishedFrom || item.publishedTo !== report.publishedTo)) fail('REPORT_SCOPE_MISMATCH');
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1'
    || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') fail('DB_TARGET_MISMATCH');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME,
    timezone: 'Z', dateStrings: true, multipleStatements: false, connectTimeout: 3000 });
  const select = async (sql, params = []) => {
    if (!/^SELECT\s/i.test(sql)) fail('NON_SELECT_QUERY');
    return (await conn.query({ sql, timeout: 8000 }, params))[0];
  };
  try {
    const [identity] = await select('SELECT CURRENT_USER() AS user_name, DATABASE() AS db_name');
    if (identity.user_name !== 'root@localhost' || identity.db_name !== 'public_opinion') fail('IDENTITY_MISMATCH');
    const ids = reports.flatMap(item => item.storedExternalIds.map(String));
    const contentIds = reports.flatMap(item => item.contentIds);
    const aiContentIds = reports.flatMap(item => item.aiContentIds);
    if (new Set(ids).size !== ids.length || ids.length !== 36
      || contentIds.length !== ids.length || aiContentIds.length !== ids.length) fail('REPORT_IDS_INVALID');
    const rows = await select(`SELECT id, source_id, account_id, community_id, external_id, published_at, is_deleted,
      title, body, media, raw_payload, fingerprint FROM po_contents WHERE source_id=? AND external_id IN (${ids.map(() => '?').join(',')})`, [sourceId, ...ids]);
    const byId = new Map(rows.map(row => [String(row.external_id), row]));
    const expectedTimes = new Map(evidence.todayRowsAbsentInDatabase.map(row => [row.externalId, row.providerCreatedAt]));
    const issues = [], jobIds = [];
    for (const externalId of ids) {
      const row = byId.get(externalId);
      if (!row) { issues.push(`${externalId}:missing`); continue; }
      if (row.source_id !== sourceId || row.account_id !== accountId || row.community_id !== communityId) issues.push(`${externalId}:owner`);
      if (!contentIds.includes(row.id) || !aiContentIds.includes(row.id)) issues.push(`${externalId}:report-id`);
      const published = new Date(String(row.published_at).replace(' ', 'T') + 'Z').toISOString();
      if (published < report.publishedFrom || published >= report.publishedTo || (expectedTimes.has(externalId) && published !== new Date(expectedTimes.get(externalId)).toISOString())) issues.push(`${externalId}:published`);
      const raw = parseJson(row.raw_payload);
      if (raw?._contentIntegrity?.status !== 'detail_enriched' || !raw?.providerDetail
        || raw.providerDetailSha256 !== sha(raw.providerDetail)
        || String(raw.providerDetail.id ?? raw.providerDetail.postId) !== externalId) issues.push(`${externalId}:detail`);
      if (!/^[a-f0-9]{64}$/.test(String(row.fingerprint || ''))) issues.push(`${externalId}:fingerprint`);
      if (Number(row.is_deleted) !== 0 || !String(row.title || row.body || '').trim()) issues.push(`${externalId}:deleted-or-no-text`);
      jobIds.push(row.id);
    }
    const jobs = await select(`SELECT content_id, analysis_profile, status, content_fingerprint, trigger_reason FROM po_analysis_jobs
      WHERE content_id IN (${jobIds.map(() => '?').join(',')}) AND analysis_profile='light' AND trigger_reason='domestic_today_recovery'`, jobIds);
    const jobById = new Map(jobs.map(job => [job.content_id, job]));
    for (const row of rows) {
      const job = jobById.get(row.id);
      if (!job || job.content_fingerprint !== row.fingerprint) issues.push(`${row.external_id}:ai-job`);
    }
    const cps = await select(`SELECT id, status, \`cursor\`, items_fetched, lease_owner, lease_until, window_start, window_end
      FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND task_kind='domestic_today_recovery'
      AND task_key='board2:merged:2026-10-09' AND sync_scope='posts' AND root_platform_content_id=''
      AND window_start=? AND window_end=?`, [accountId, siteId, report.publishedFrom, report.publishedTo]);
    const cp = cps[0];
    if (cps.length !== 1 || !['idle', 'completed'].includes(cp.status) || !cp.cursor
      || Number(cp.items_fetched) < ids.length || cp.lease_owner || cp.lease_until) issues.push('checkpoint');
    const [today] = await select('SELECT COUNT(*) AS count FROM po_contents WHERE source_id=? AND account_id=? AND community_id=? AND published_at>=? AND published_at<? AND is_deleted=0',
      [sourceId, accountId, communityId, '2026-10-08 16:00:00', '2026-10-09 16:00:00']);
    const [lock] = await select('SELECT IS_USED_LOCK(?) AS holder', [`public-opinion-sync-account-${accountId}`]);
    const cumulativeMissingExpectedIds = evidence.todayRowsAbsentInDatabase.map(row => row.externalId).filter(id => !ids.includes(id));
    if (cumulativeMissingExpectedIds.length) issues.push('captured-ids-missing');
    console.log(JSON.stringify({ status: issues.length ? 'NO_GO' : 'PASS_FIRST_SEGMENT_DB', sourceId,
      reportCount: ids.length, dbCount: rows.length, aiJobs: jobs.length,
      aiStatuses: jobs.reduce((counts, job) => { counts[job.status] = (counts[job.status] || 0) + 1; return counts; }, {}),
      checkpoint: cp ? { status: cp.status, itemsFetched: Number(cp.items_fetched), hasCursor: Boolean(cp.cursor), leaseFree: !cp.lease_owner && !cp.lease_until } : null,
      accountLockFree: lock.holder == null, todayCount: Number(today.count), cumulativeMissingExpectedIds, issues }));
    if (issues.length) process.exitCode = 1;
  } finally { await conn.end(); }
}
main().catch(error => { console.error(error.code || 'READONLY_QA_FAILED'); process.exitCode = 1; });
