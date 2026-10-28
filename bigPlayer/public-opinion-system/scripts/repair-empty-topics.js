'use strict';
// Dry-run by default. Topic-only repair; never invokes alert or notification code.
const fs = require('node:fs');
const path = require('node:path');
const { Repository } = require('../server/src/db/repository');
const { TypeSafeTopicAnalyzer } = require('../server/src/integrations/typeSafeTopicAnalyzer');
const { needsTopic, decisionKey, updateTopic } = require('./backfill-typesafe-topics');

async function repair({ repo, ai, outputDir, apply = false, maxRows = 50000 }) {
  const [clock] = await repo.query('SELECT UTC_TIMESTAMP(3) AS anchor');
  const anchor = clock.anchor instanceof Date ? clock.anchor : new Date(String(clock.anchor).replace(' ', 'T') + 'Z');
  if (!Number.isFinite(anchor.getTime())) throw new Error('Invalid database anchor');
  const from = new Date(anchor.getTime() - 2 * 86400000).toISOString();
  const to = anchor.toISOString();
  const bounds = [from.slice(0, 23).replace('T', ' '), to.slice(0, 23).replace('T', ' ')];
  const rows = (await repo.query(`SELECT a.id,a.content_id,a.topics,a.content_fingerprint,c.fingerprint,c.game_id,c.community_id,c.source_id,c.account_id,c.content_type,c.title,c.body,c.media
    FROM po_contents c JOIN po_analyses a ON a.content_id=c.id
    WHERE c.published_at>=? AND c.published_at<? AND COALESCE(c.is_deleted,0)=0
    ORDER BY c.published_at,c.id LIMIT ?`, [...bounds, maxRows + 1]));
  if (rows.length > maxRows) throw new Error('Repair scan limit exceeded; narrow the reviewed scope');
  const eligible = rows.filter(row => needsTopic(row.topics) && (!row.content_fingerprint || row.content_fingerprint === row.fingerprint));
  const grouped = new Map();
  for (const row of eligible) { const key = decisionKey(row); const group = grouped.get(key) || []; group.push(row); grouped.set(key, group); }
  const report = { from, to, scanned: rows.length, eligible: eligible.length, uniqueTexts: grouped.size, apply, updated: 0, skipped: 0, failed: [], calls: 0, notifications: 0 };
  fs.mkdirSync(outputDir, { recursive: true });
  const save = () => { const file = path.join(outputDir, 'status.json'); fs.writeFileSync(file + '.tmp', JSON.stringify(report, null, 2)); fs.renameSync(file + '.tmp', file); };
  save();
  if (!apply) return report;
  const cacheFile = path.join(outputDir, 'decisions.json');
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  const backup = value => fs.appendFileSync(path.join(outputDir, 'before-topics.jsonl'), JSON.stringify(value) + '\n');
  const entries = [...grouped]; let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < entries.length) {
      const batch = entries.slice(next, next += 10);
      const pending = batch.filter(([key]) => !cache[key]);
      try {
        if (pending.length) {
          report.calls++;
          const decisions = await ai.classify(pending.map(([, records]) => records[0]));
          pending.forEach(([key], index) => { cache[key] = decisions[index]; });
          fs.writeFileSync(cacheFile + '.tmp', JSON.stringify(cache)); fs.renameSync(cacheFile + '.tmp', cacheFile);
        }
        for (const [key, records] of batch) for (const row of records) {
          try {
            for (let attempt = 0; ; attempt++) {
              try {
                if (await updateTopic(repo, row, cache[key], backup, needsTopic, 3)) report.updated++; else report.skipped++;
                break;
              } catch (error) {
                if (attempt >= 2 || !['ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK'].includes(error.code)) throw error;
                await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
              }
            }
          } catch (error) {
            report.failed.push({ analysisIds: [row.id], code: error.code || 'TOPIC_REPAIR_FAILED' });
          }
        }
      } catch (error) {
        report.failed.push({ analysisIds: batch.flatMap(([, records]) => records.map(row => row.id)), code: error.code || 'TOPIC_REPAIR_FAILED' });
      }
      save();
    }
  }));
  report.finishedAt = new Date().toISOString(); save(); return report;
}
async function main() {
  require('../server/src/runtimeEnv').loadRuntimeEnv();
  // This repair uses the system CA store; do not inherit legacy TLS bypasses.
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  const repo = new Repository();
  try {
    const outputDir = path.join(process.env.ProgramData || 'C:/ProgramData', 'PublicOpinion/data/topic-repair-20261019-2d');
    const report = await repair({ repo, ai: new TypeSafeTopicAnalyzer(), outputDir, apply: process.argv.includes('--apply') });
    console.log(JSON.stringify(report));
    if (report.failed.length) process.exitCode = 1;
  } finally { await repo.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.code || 'TOPIC_REPAIR_FAILED'); process.exitCode = 1; });
module.exports = { repair };
