'use strict';

const fs = require('node:fs');
const path = require('node:path');

process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
const candidateRoot = path.resolve(__dirname, '../../../.temp/candidates/v058f-risk-severity-formal-integration-20260921');
const { Repository } = require(path.join(candidateRoot, 'server/src/db/repository.js'));

const sampleIds = ['919098', '919167', '6826813', '920120'];
const contentIds = {
  '919098': 'bc64d7a5-4032-49e9-80cd-4c83fabb7e94',
  '919167': '74f19f1c-f027-4826-a042-fb49dcc19724',
  '6826813': '3454bd9f-8bec-43e6-8eb5-e296ff965575',
  '920120': '20a46255-d6db-4140-b6c5-10dc9d5c5ea1'
};

const redact = value => String(value || '').replace(/(token|password|secret|authorization)=[^\s&]+/ig, '$1=[REDACTED]');
const marks = sampleIds.map(() => '?').join(',');

async function main() {
  const repo = new Repository(process.env);
  try {
    await repo.health();
    const contents = await repo.query(
      `SELECT c.id,c.external_id,c.source_id,c.game_id,c.community_id,s.platform,c.fingerprint,
              a.sentiment,a.severity,a.analysis_level,a.analysis_version,a.model_name,a.analysis_reason
         FROM po_contents c JOIN po_sources s ON s.id=c.source_id
         LEFT JOIN po_analyses a ON a.content_id=c.id
        WHERE c.external_id IN (${marks})
        ORDER BY FIELD(c.external_id,${marks})`,
      [...sampleIds, ...sampleIds]
    );
    const jobs = await repo.query(
      `SELECT j.content_id,j.analysis_profile,j.analysis_version,j.status,j.attempts,j.error_code,j.completed_at
         FROM po_analysis_jobs j JOIN po_contents c ON c.id=j.content_id
        WHERE c.external_id IN (${marks})
        ORDER BY FIELD(c.external_id,${marks}),j.analysis_profile,j.analysis_version`,
      [...sampleIds, ...sampleIds]
    );
    const alerts = await repo.query(
      `SELECT ac.content_id,a.id,a.status,a.severity,a.ding_talk_status,a.created_at,a.resolved_at
         FROM po_alert_contents ac JOIN po_alerts a ON a.id=ac.alert_id
         JOIN po_contents c ON c.id=ac.content_id
        WHERE c.external_id IN (${marks})
        ORDER BY FIELD(c.external_id,${marks}),a.created_at`,
      [...sampleIds, ...sampleIds]
    );
    const notificationCounts = await repo.query('SELECT ding_talk_status,COUNT(*) AS count FROM po_alerts GROUP BY ding_talk_status ORDER BY ding_talk_status');
    const outboxTables = await repo.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND (LOWER(table_name) LIKE '%outbox%' OR LOWER(table_name) LIKE '%notification%' OR LOWER(table_name) LIKE '%message%') ORDER BY table_name");
    const proofColumns = await repo.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND (LOWER(column_name) LIKE '%prompt%' OR LOWER(column_name) LIKE '%fingerprint%' OR LOWER(column_name) LIKE '%analysis_version%' OR LOWER(column_name) LIKE '%model_name%') ORDER BY table_name,column_name");
    const snapshot = {
      runId: 'N/A_PRECHECK_ONLY',
      phase: 'readonly_preflight',
      at: new Date().toISOString(),
      api: { status: 'BLOCKED_3001_PROHIBITED', reason: '本会话禁止访问或占用 3001；未伪造 API 通过' },
      dbWrites: 0,
      aiCalls: 0,
      notificationAttempts: 0,
      notifyGate: 'not invoked',
      deepConfig: {
        profile: 'deep',
        model: process.env.AI_ANALYSIS_DEEP_MODEL || null,
        version: process.env.AI_ANALYSIS_DEEP_VERSION || null,
        promptSchemaVersion: 'sentiment-quality-context-severity-exclusive-v4',
        promptHash: 'NOT_PERSISTED_IN_CURRENT_SCHEMA',
        promptHashEvidence: 'BLOCKED_UNTIL_PROVIDER_RUN_RECORDS_RAW_PROMPT_HASH'
      },
      sampleRows: contents.map(row => ({
        id: row.id,
        externalId: row.external_id,
        expectedContentId: contentIds[row.external_id] || null,
        identityMatch: row.id === contentIds[row.external_id],
        sourceId: row.source_id,
        gameId: row.game_id,
        communityId: row.community_id,
        platform: row.platform,
        fingerprint: row.fingerprint,
        sentiment: row.sentiment,
        severity: row.severity,
        analysisLevel: row.analysis_level,
        analysisVersion: row.analysis_version,
        modelName: row.model_name,
        analysisReason: row.analysis_reason
      })),
      deepJobs: jobs.filter(row => row.analysis_profile === 'deep'),
      deepJobCoverage: sampleIds.map(externalId => {
        const contentId = contentIds[externalId];
        const job = jobs.find(row => row.content_id === contentId && row.analysis_profile === 'deep');
        return { externalId, contentId, status: job?.status || 'missing', analysisVersion: job?.analysis_version || null };
      }),
      alerts,
      notificationCounts,
      outboxTables,
      proofColumns,
      gate: {
        fourSampleIdentity: contents.length === 4 && contents.every(row => row.id === contentIds[row.external_id]),
        fixedDeepProfile: process.env.AI_ANALYSIS_DEEP_MODEL === 'gpt-5.6-luna' && process.env.AI_ANALYSIS_DEEP_VERSION === 'sentiment-v1',
        strict919098Negative: contents.find(row => row.external_id === '919098')?.sentiment === 'negative',
        missingDeepSamples: sampleIds.map(externalId => contentIds[externalId]).filter(contentId => {
          const job = jobs.find(row => row.content_id === contentId && row.analysis_profile === 'deep');
          return !job || job.status !== 'completed';
        }),
        promptHashPresent: false,
        writePhaseAllowed: false,
        status: 'BLOCKED_PRECHECK_ONLY'
      }
    };
    const outputDir = path.join(__dirname, 'evidence', 'v325-risk-deep-readonly');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'preflight.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(snapshot, null, 2));
  } finally {
    await repo.pool.end();
  }
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKED_READONLY_SNAPSHOT_FAILED', code: error.code || 'READONLY_SNAPSHOT_FAILED', message: redact(error.message) }));
  process.exitCode = 1;
});
