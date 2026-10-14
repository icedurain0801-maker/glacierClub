'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const mysql = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/node_modules/mysql2/promise.js');
const root = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/domestic-today-recovery-20261009';
const names = ['first-segment-v8-execution.json', ...Array.from({ length: 5 }, (_, i) => `first-segment-v8-page${i + 2}-execution.json`)];
const reports = names.map(name => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8')));
const evidence = JSON.parse(fs.readFileSync(`${root}/first-page-readonly-evidence.json`, 'utf8'));
const sourceId = '5c21f78d-5f67-4467-963d-dcdeb5e26cab';
const accountId = '70c393cf-9600-11f1-b3d2-d85ed3ae61b0';
const communityId = '00000000-0000-0000-0000-000000000101';
const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = value => new Date(String(value).replace(' ', 'T') + 'Z').toISOString();

async function main() {
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1' || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') throw Error('DB_TARGET_MISMATCH');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, timezone: 'Z', dateStrings: true, multipleStatements: false, connectTimeout: 3000 });
  const select = async (sql, params = []) => { if (!/^SELECT\s/.test(sql)) throw Error('NON_SELECT_QUERY'); return (await conn.query({ sql, timeout: 8000 }, params))[0]; };
  try {
    const [identity] = await select('SELECT CURRENT_USER() AS user_name,DATABASE() AS db_name');
    if (identity.user_name !== 'root@localhost' || identity.db_name !== 'public_opinion') throw Error('IDENTITY_MISMATCH');
    const issues = [];
    if (reports.some(report => report.status !== 'PARTIAL_TODAY' || report.pages !== 1 || report.sourceId !== sourceId || report.accountId !== accountId || report.publishedFrom !== reports[0].publishedFrom || report.publishedTo !== reports[0].publishedTo)) issues.push('report-scope');
    const ids = reports.flatMap(report => report.storedExternalIds.map(String));
    const contentIds = reports.flatMap(report => report.contentIds);
    const aiContentIds = reports.flatMap(report => report.aiContentIds);
    if (ids.length !== 116 || new Set(ids).size !== 116 || contentIds.length !== 116 || aiContentIds.length !== 116 || new Set(contentIds).size !== 116) issues.push('report-count-or-duplicate');
    const rows = await select(`SELECT id,source_id,account_id,community_id,external_id,published_at,is_deleted,title,body,media,raw_payload,fingerprint FROM po_contents WHERE source_id=? AND external_id IN (${ids.map(() => '?').join(',')})`, [sourceId, ...ids]);
    const byId = new Map(rows.map(row => [String(row.external_id), row]));
    const expectedTimes = new Map(evidence.todayRowsAbsentInDatabase.map(row => [String(row.externalId), new Date(row.providerCreatedAt).toISOString()]));
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) { issues.push(`${id}:missing`); continue; }
      if (row.source_id !== sourceId || row.account_id !== accountId || row.community_id !== communityId || !contentIds.includes(row.id) || !aiContentIds.includes(row.id)) issues.push(`${id}:owner-report`);
      const time = iso(row.published_at);
      if (time < reports[0].publishedFrom || time >= reports[0].publishedTo || (expectedTimes.has(id) && time !== expectedTimes.get(id))) issues.push(`${id}:time`);
      const raw = parseJson(row.raw_payload);
      if (raw?._contentIntegrity?.status !== 'detail_enriched' || !raw?.providerDetail || raw.providerDetailSha256 !== sha(raw.providerDetail) || String(raw.providerDetail.id ?? raw.providerDetail.postId) !== id) issues.push(`${id}:detail`);
      if (Number(row.is_deleted) || !String(row.title || row.body || '').trim() || !/^[a-f0-9]{64}$/.test(String(row.fingerprint))) issues.push(`${id}:content`);
    }
    const jobs = await select(`SELECT content_id,status,content_fingerprint FROM po_analysis_jobs WHERE content_id IN (${contentIds.map(() => '?').join(',')}) AND analysis_profile='light' AND trigger_reason='domestic_today_recovery'`, contentIds);
    const jobById = new Map(jobs.map(job => [job.content_id, job]));
    for (const row of rows) if (!jobById.has(row.id) || jobById.get(row.id).content_fingerprint !== row.fingerprint) issues.push(`${row.external_id}:ai-job`);
    const missingOriginal = [...expectedTimes.keys()].filter(id => !byId.has(id));
    if (missingOriginal.length) issues.push('original-16-missing');
    console.log(JSON.stringify({ status: issues.length ? 'NO_GO' : 'PASS_116_POSTS_DB_AI_QUEUE', reportCount: ids.length, distinctReportIds: new Set(ids).size, dbRows: rows.length, aiJobs: jobs.length, aiStatuses: jobs.reduce((o, j) => (o[j.status] = (o[j.status] || 0) + 1, o), {}), missingOriginal, issues: issues.slice(0, 30), issueCount: issues.length }));
    if (issues.length) process.exitCode = 1;
  } finally { await conn.end(); }
}
main().catch(error => { console.error(error.code || error.message || 'READONLY_QA_FAILED'); process.exitCode = 1; });
