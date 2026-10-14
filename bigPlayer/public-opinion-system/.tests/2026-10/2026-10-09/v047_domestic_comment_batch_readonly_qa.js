'use strict';
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/node_modules/mysql2/promise.js');
const root = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/domestic-today-recovery-20261009';
const sourceId = '5c21f78d-5f67-4467-963d-dcdeb5e26cab';
const accountId = '70c393cf-9600-11f1-b3d2-d85ed3ae61b0';
const communityId = '00000000-0000-0000-0000-000000000101';
const siteId = 'site-7586e54f3a0cb84f433d59cf6baa1d4d';
const start = '2026-10-08T16:00:00.000Z', end = '2026-10-09T04:31:29.177Z';
const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;
const iso = value => new Date(String(value).replace(' ', 'T') + 'Z').toISOString();

async function main() {
  const names = fs.readdirSync(root).filter(name => /^graph-v[34]-comments-\d+-(?:page1-(?:retry1-)?|diagnostic1-)execution\.json$/.test(name)).sort();
  const reports = names.map(name => ({ name, report: JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')) }));
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1' || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') throw Error('DB_TARGET_MISMATCH');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, timezone: 'Z', dateStrings: true, multipleStatements: false, connectTimeout: 3000 });
  const select = async (sql, params = []) => { if (!/^SELECT\s/.test(sql)) throw Error('NON_SELECT_QUERY'); return (await conn.query({ sql, timeout: 8000 }, params))[0]; };
  try {
    const [identity] = await select('SELECT CURRENT_USER() AS user_name,DATABASE() AS db_name');
    if (identity.user_name !== 'root@localhost' || identity.db_name !== 'public_opinion') throw Error('IDENTITY_MISMATCH');
    const issues = [], summaries = [];
    for (const entry of reports) {
      const report = entry.report;
      if (report.status === 'FAILED_GRAPH') {
        const postId = entry.name.match(/comments-(\d+)-/)[1];
        const cps = await select("SELECT id,status,`cursor`,items_fetched,lease_owner,lease_until FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND task_kind='domestic_today_comment_recovery' AND task_key=? AND sync_scope='comments' AND root_platform_content_id=? AND window_start=? AND window_end=?", [accountId, siteId, `${postId}:root:0`, postId, start, end]);
        const roots = await select('SELECT id FROM po_contents WHERE source_id=? AND account_id=? AND community_id=? AND external_id=?', [sourceId, accountId, communityId, postId]);
        const comments = roots.length === 1 ? await select("SELECT id,external_id,published_at,raw_payload FROM po_contents WHERE source_id=? AND account_id=? AND community_id=? AND content_type='comment' AND root_content_id=? AND published_at>=? AND published_at<?", [sourceId, accountId, communityId, roots[0].id, '2026-10-08 16:00:00.000', '2026-10-09 04:31:29.177']) : [];
        summaries.push({ file: entry.name, postId, status: report.status, errorCode: report.errorCode, checkpoint: cps.map(cp => ({ status: cp.status, itemsFetched: Number(cp.items_fetched), cursor: cp.cursor, leaseOwner: cp.lease_owner, leaseUntil: cp.lease_until })), inWindowCommentIds: comments.map(row => row.external_id) });
        continue;
      }
      const p = String(report.postId), ids = report.contentIds || [];
      if (report.status !== 'COMPLETED_COMMENT_TASK_AI_QUEUED' || report.pages !== 1 || !/^\d+$/.test(p) || report.allCommentsComplete !== false || report.aiQueued !== ids.length || report.replyTargets?.length) issues.push(`${p}:report`);
      const post = await select('SELECT id,content_type,source_id,account_id,community_id FROM po_contents WHERE source_id=? AND external_id=?', [sourceId, p]);
      if (post.length !== 1 || post[0].content_type !== 'post' || post[0].account_id !== accountId || post[0].community_id !== communityId) { issues.push(`${p}:post`); continue; }
      let rows = [], jobs = [];
      if (ids.length) {
        rows = await select(`SELECT id,external_id,source_id,account_id,community_id,content_type,root_content_id,parent_content_id,platform_parent_id,content_depth,published_at,source_url,body,is_deleted,fingerprint,raw_payload FROM po_contents WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        jobs = await select(`SELECT content_id,status,content_fingerprint FROM po_analysis_jobs WHERE content_id IN (${ids.map(() => '?').join(',')}) AND analysis_profile='light' AND trigger_reason='domestic_today_comment_recovery'`, ids);
      }
      if (rows.length !== ids.length || jobs.length !== ids.length) issues.push(`${p}:row-job-count`);
      for (const row of rows) {
        const time = iso(row.published_at), raw = parseJson(row.raw_payload), url = new URL(row.source_url);
        if (row.source_id !== sourceId || row.account_id !== accountId || row.community_id !== communityId || row.content_type !== 'comment' || row.root_content_id !== post[0].id || row.parent_content_id !== post[0].id || String(row.platform_parent_id) !== p || Number(row.content_depth) !== 1) issues.push(`${p}/${row.external_id}:parent`);
        if (time < start || time >= end || url.origin !== 'https://club.q1.com' || url.searchParams.get('postId') !== p) issues.push(`${p}/${row.external_id}:time-url`);
        if (raw.boardId !== '2' || raw.recoveryContextAncestor !== false || String(raw.providerComment?.id) !== String(row.external_id) || Number(row.is_deleted) || !String(row.body || '').trim()) issues.push(`${p}/${row.external_id}:raw-content`);
        if (!jobs.some(job => job.content_id === row.id && job.content_fingerprint === row.fingerprint)) issues.push(`${p}/${row.external_id}:ai-fingerprint`);
      }
      const cps = await select("SELECT id,status,items_fetched,lease_owner,lease_until FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND task_kind='domestic_today_comment_recovery' AND task_key=? AND sync_scope='comments' AND root_platform_content_id=? AND window_start=? AND window_end=?", [accountId, siteId, `${p}:root:0`, p, start, end]);
      if (cps.length !== 1 || cps[0].status !== 'completed' || Number(cps[0].items_fetched) !== ids.length || cps[0].lease_owner || cps[0].lease_until) issues.push(`${p}:checkpoint`);
      summaries.push({ postId: p, comments: rows.map(row => row.external_id), aiStatuses: jobs.map(job => job.status), checkpoint: cps[0]?.status || null });
    }
    const failed = summaries.filter(item => item.status === 'FAILED_GRAPH');
    const successful = summaries.filter(item => item.postId && item.status !== 'FAILED_GRAPH');
    const unresolved = failed.filter(item => !successful.some(done => done.postId === item.postId));
    console.log(JSON.stringify({ status: issues.length ? 'NO_GO_SUCCESSFUL_PAGES' : unresolved.length ? 'PASS_PRIOR_PAGES_FAILED_TARGET_NO_GO' : 'PASS_EXPLICIT_COMMENT_PAGES_HISTORICAL_FAILURE_RECOVERED', reports: reports.length, successfulReports: successful.length, successfulComments: successful.reduce((n, item) => n + item.comments.length, 0), failed, unresolvedFailures: unresolved, summaries, issues }));
    if (issues.length) process.exitCode = 1;
  } finally { await conn.end(); }
}
main().catch(error => { console.error(error.code || error.message || 'READONLY_QA_FAILED'); process.exitCode = 1; });
