'use strict';
const fs = require('node:fs');
const mysql = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/node_modules/mysql2/promise.js');

const report = JSON.parse(fs.readFileSync('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/domestic-today-recovery-20261009/graph-v3-comments-926761-page1-execution.json', 'utf8'));
const sourceId = '5c21f78d-5f67-4467-963d-dcdeb5e26cab';
const accountId = '70c393cf-9600-11f1-b3d2-d85ed3ae61b0';
const communityId = '00000000-0000-0000-0000-000000000101';
const siteId = 'site-7586e54f3a0cb84f433d59cf6baa1d4d';
const windowStart = '2026-10-08T16:00:00.000Z';
const windowEnd = '2026-10-09T04:31:29.177Z';
const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;
const iso = value => new Date(String(value).replace(' ', 'T') + 'Z').toISOString();

async function main() {
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1' || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') throw Error('DB_TARGET_MISMATCH');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, timezone: 'Z', dateStrings: true, multipleStatements: false, connectTimeout: 3000 });
  const select = async (sql, params = []) => {
    if (!/^SELECT\s/.test(sql)) throw Error('NON_SELECT_QUERY');
    return (await conn.query({ sql, timeout: 8000 }, params))[0];
  };
  try {
    const [identity] = await select('SELECT CURRENT_USER() AS user_name, DATABASE() AS db_name');
    if (identity.user_name !== 'root@localhost' || identity.db_name !== 'public_opinion') throw Error('IDENTITY_MISMATCH');
    const issues = [];
    if (report.status !== 'COMPLETED_COMMENT_TASK_AI_QUEUED' || report.postId !== '926761' || report.pages !== 1 || report.contentIds?.length !== 2 || report.aiQueued !== 2 || report.allCommentsComplete !== false) issues.push('report');
    const post = await select('SELECT id,source_id,account_id,community_id,external_id,content_type FROM po_contents WHERE source_id=? AND external_id=?', [sourceId, '926761']);
    const rows = await select('SELECT id,source_id,account_id,community_id,external_id,content_type,root_content_id,parent_content_id,platform_parent_id,content_depth,published_at,source_url,body,is_deleted,fingerprint,raw_payload FROM po_contents WHERE id IN (?,?)', report.contentIds);
    if (post.length !== 1 || post[0].content_type !== 'post' || rows.length !== 2) issues.push('row-count');
    const jobs = await select('SELECT content_id,analysis_profile,status,content_fingerprint,trigger_reason FROM po_analysis_jobs WHERE content_id IN (?,?) AND analysis_profile=? AND trigger_reason=?', [...report.contentIds, 'light', 'domestic_today_comment_recovery']);
    for (const row of rows) {
      if (row.source_id !== sourceId || row.account_id !== accountId || row.community_id !== communityId || row.content_type !== 'comment' || row.root_content_id !== post[0]?.id || row.parent_content_id !== post[0]?.id || String(row.platform_parent_id) !== '926761' || Number(row.content_depth) !== 1) issues.push(`${row.external_id}:identity-parent`);
      const published = iso(row.published_at);
      if (published < '2026-10-08T16:00:00.000Z' || published >= '2026-10-09T04:31:29.177Z') issues.push(`${row.external_id}:time`);
      const url = new URL(row.source_url);
      if (url.origin !== 'https://club.q1.com' || url.searchParams.get('postId') !== '926761') issues.push(`${row.external_id}:url`);
      const raw = parseJson(row.raw_payload);
      if (raw.boardId !== '2' || raw.recoveryContextAncestor !== false || String(raw.providerComment?.id) !== String(row.external_id)) issues.push(`${row.external_id}:raw`);
      if (Number(row.is_deleted) || !String(row.body || '').trim() || !/^[a-f0-9]{64}$/.test(String(row.fingerprint))) issues.push(`${row.external_id}:content`);
      const job = jobs.find(item => item.content_id === row.id);
      if (!job || job.content_fingerprint !== row.fingerprint) issues.push(`${row.external_id}:ai-job`);
    }
    const cps = await select("SELECT id,status,`cursor`,items_fetched,lease_owner,lease_until FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND task_kind='domestic_today_comment_recovery' AND task_key='926761:root:0' AND sync_scope='comments' AND root_platform_content_id='926761' AND window_start=? AND window_end=?", [accountId, siteId, windowStart, windowEnd]);
    if (cps.length !== 1 || cps[0].status !== 'completed' || cps[0].lease_owner || cps[0].lease_until || Number(cps[0].items_fetched) !== 2) issues.push('checkpoint');
    const [lock] = await select('SELECT IS_USED_LOCK(?) AS holder', [`public-opinion-sync-account-${accountId}`]);
    const [count] = await select('SELECT COUNT(*) AS n FROM po_contents WHERE source_id=? AND account_id=? AND community_id=? AND published_at>=? AND published_at<? AND is_deleted=0', [sourceId, accountId, communityId, '2026-10-08 16:00:00.000', '2026-10-09 16:00:00.000']);
    console.log(JSON.stringify({ status: issues.length ? 'NO_GO' : 'PASS_COMMENT_926761', rows: rows.map(row => ({ externalId: row.external_id, publishedAt: iso(row.published_at), depth: row.content_depth, rawId: parseJson(row.raw_payload).providerComment?.id })), aiJobs: jobs.map(job => ({ status: job.status, fingerprintMatched: rows.some(row => row.id === job.content_id && row.fingerprint === job.content_fingerprint) })), checkpoint: cps[0] ? { status: cps[0].status, itemsFetched: Number(cps[0].items_fetched), leaseFree: !cps[0].lease_owner && !cps[0].lease_until } : null, accountLockFree: lock.holder == null, todayTotal: Number(count.n), issues }));
    if (issues.length) process.exitCode = 1;
  } finally { await conn.end(); }
}
main().catch(error => { console.error(error.code || error.message || 'READONLY_QA_FAILED'); process.exitCode = 1; });
