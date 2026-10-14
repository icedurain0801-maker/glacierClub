const { Q1AnalysisRunner } = require('../../../worker/src/q1DailyAnalysisRunner');
const { Repository } = require('../../../server/src/db/repository');
const { AiAnalyzer } = require('../../../server/src/integrations/aiAnalyzer');

const contentIds = ['f1b932b3-e5d9-44ca-8ecb-116afa302751', '5140a024-032e-4abb-b403-d609c1ca895c', '5a1b3441-91f7-46b5-8e39-83ca167dd4db', '79fabc2d-8e28-4629-a32e-53e60faf111f'];
const repo = new Repository();
const ai = new AiAnalyzer();
const emit = (phase, rows) => console.log(JSON.stringify({ phase, at: new Date().toISOString(), rows }));
const claim = repo.claimAnalysisJobs.bind(repo);
repo.claimAnalysisJobs = async options => {
  const jobs = await claim(options);
  emit('claimed', jobs.map(job => ({ contentId: job.content_id, jobId: job.id, status: job.status, attempts: job.attempts, leaseOwner: job.lease_owner })));
  return jobs;
};
async function snapshot(phase) {
  emit(phase, await repo.query(`SELECT c.external_id,c.id,j.status,j.attempts,j.error_code,a.sentiment,a.analysis_level,a.analyzed_at FROM po_contents c LEFT JOIN po_analysis_jobs j ON j.content_id=c.id AND j.analysis_profile='light' LEFT JOIN po_analyses a ON a.content_id=c.id AND a.analysis_level='light' WHERE c.id IN (?,?,?,?)`, contentIds));
}
async function main() {
  const spec = ai.selectProfile('light');
  if (!ai.configured('light') || spec.version !== 'sentiment-v1' || ai.batchSize !== 10) throw new Error('P0_ANALYSIS_CONFIG_MISMATCH');
  await snapshot('before');
  if (!process.argv.includes('--execute')) return;
  const runner = new Q1AnalysisRunner({ repo, ai, contentIds, sourceId: '081a16d2-5545-4afd-9c65-e04777e4540b', scope: { gameId: '00000000-0000-0000-0000-000000000002', communityId: '00000000-0000-0000-0000-000000000102' }, claimOwner: `p0-exact-analysis:${process.pid}`, batchSize: 4, parallel: 1, maxAttempts: 3, alertEngine: {} });
  emit('processed', await runner.processBatch('light'));
  await snapshot('after');
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => repo.pool.end());
