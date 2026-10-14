'use strict';
const mysql = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/node_modules/mysql2/promise.js');
const sourceId = '5c21f78d-5f67-4467-963d-dcdeb5e26cab';
const accountId = '70c393cf-9600-11f1-b3d2-d85ed3ae61b0';
const communityId = '00000000-0000-0000-0000-000000000101';
async function main() {
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1' || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') throw Error('DB_TARGET_MISMATCH');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, timezone: 'Z', dateStrings: true, multipleStatements: false, connectTimeout: 3000 });
  const select = async (sql, params = []) => { if (!/^SELECT\s/.test(sql)) throw Error('NON_SELECT_QUERY'); return (await conn.query({ sql, timeout: 8000 }, params))[0]; };
  try {
    const [identity] = await select('SELECT CURRENT_USER() AS user_name,DATABASE() AS db_name');
    if (identity.user_name !== 'root@localhost' || identity.db_name !== 'public_opinion') throw Error('IDENTITY_MISMATCH');
    const rows = await select(`SELECT c.id,c.external_id,c.content_type,c.fingerprint,j.id AS job_id,j.status,j.content_fingerprint,j.analysis_version,j.analysis_profile,a.content_fingerprint AS result_fingerprint,a.analysis_level,a.analysis_version AS result_version,a.analyzed_at
      FROM po_contents c LEFT JOIN po_analysis_jobs j ON j.content_id=c.id AND j.analysis_profile='light' AND j.trigger_reason=CASE WHEN c.content_type='post' THEN 'domestic_today_recovery' ELSE 'domestic_today_comment_recovery' END
      LEFT JOIN po_analyses a ON a.content_id=c.id AND a.analysis_level=j.analysis_profile AND a.analysis_version=j.analysis_version
      WHERE c.source_id=? AND c.account_id=? AND c.community_id=? AND c.content_type IN ('post','comment') AND c.published_at>=? AND c.published_at<? AND c.is_deleted=0`, [sourceId, accountId, communityId, '2026-10-08 16:00:00.000', '2026-10-09 16:00:00.000']);
    const issues = [], counts = {};
    for (const row of rows) {
      counts[row.content_type] = (counts[row.content_type] || 0) + 1;
      if (!row.job_id || row.status !== 'completed' || row.content_fingerprint !== row.fingerprint || row.result_fingerprint !== row.fingerprint || !row.analyzed_at) issues.push(`${row.external_id}:ai-result`);
    }
    console.log(JSON.stringify({ status: issues.length ? 'NO_GO' : 'PASS_CURRENT_AI_RESULTS', total: rows.length, counts, completedJobs: rows.filter(row => row.status === 'completed').length, matchedResults: rows.filter(row => row.result_fingerprint === row.fingerprint && row.analyzed_at).length, issueCount: issues.length, issues: issues.slice(0, 20) }));
    if (issues.length || rows.length < 150) process.exitCode = 1;
  } finally { await conn.end(); }
}
main().catch(error => { console.error(error.code || error.message || 'READONLY_QA_FAILED'); process.exitCode = 1; });
