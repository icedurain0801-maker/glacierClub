require('dotenv').config();

const db = require('../src/config/db');
const vectorStore = require('../src/services/vectorStore');
const chatSimulation = require('../src/services/chatSimulation');

function parseArgs(argv) {
  const args = {
    scenarioKey: 'mixed_pressure',
    promptMode: 'independent',
    turns: 4,
    customTopic: '',
    versionId: 0,
  };

  argv.forEach(item => {
    if (!item.startsWith('--')) return;
    const [rawKey, ...rawValue] = item.slice(2).split('=');
    const key = rawKey.trim();
    const value = rawValue.join('=').trim();
    if (!key) return;

    if (key === 'scenario') args.scenarioKey = value || args.scenarioKey;
    if (key === 'mode') args.promptMode = value || args.promptMode;
    if (key === 'turns') args.turns = value || args.turns;
    if (key === 'topic') args.customTopic = value;
    if (key === 'version') args.versionId = parseInt(value, 10) || 0;
  });

  return args;
}

async function resolveVersionId(preferredVersionId) {
  if (preferredVersionId) return preferredVersionId;

  const [rows] = await db.query(
    'SELECT id FROM versions WHERE status = "active" ORDER BY id ASC LIMIT 1'
  );
  if (!rows.length) {
    throw new Error('没有可用的 active 版本，请先创建版本');
  }
  return rows[0].id;
}

function formatScore(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(1) : '-';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const versionId = await resolveVersionId(args.versionId);
  const turns = chatSimulation.sanitizeTurns(args.turns);
  const promptMode = chatSimulation.normalizePromptMode(args.promptMode);

  console.log('[simulator] loading vector store...');
  await vectorStore.loadAll();

  console.log(`[simulator] version=${versionId} scenario=${args.scenarioKey} mode=${promptMode} turns=${turns}`);
  if (args.customTopic) {
    console.log(`[simulator] topic=${args.customTopic}`);
  }

  const result = await chatSimulation.runSimulation({
    versionId,
    scenarioKey: args.scenarioKey,
    promptMode,
    turns,
    customTopic: args.customTopic,
    requestMeta: {
      ip: '127.0.0.1',
      forwardedFor: '',
      userAgent: 'chat-simulator-script',
    },
  });

  console.log('\n=== Summary ===');
  console.log(`sessionId: ${result.session.id}`);
  console.log(`sessionKey: ${result.session.sessionKey}`);
  console.log(`scenario: ${result.scenario.label} (${result.scenario.key})`);
  console.log(`mode: ${result.config.promptModeLabel} (${result.config.promptMode})`);
  console.log(`turns: ${result.summary.totalTurns}`);
  console.log(`scoredTurns: ${result.summary.scoredTurns}`);
  console.log(`highRiskTurns: ${result.summary.highRiskTurns}`);
  console.log(`avgTotalScore: ${formatScore(result.summary.avgTotalScore)}`);

  console.log('\n=== Transcript ===');
  result.transcript.forEach(item => {
    console.log(`\n[Turn ${item.turn}]`);
    console.log(`User: ${item.userContent}`);
    console.log(`Bot : ${item.assistantContent}`);
    console.log(
      `Score: ${formatScore(item.totalScore)} | Grade: ${item.grade || '-'} | Risk: ${item.riskLevel || '-'} | Status: ${item.scoreStatus || '-'}`
    );
  });
}

main().catch(err => {
  console.error('\n[simulator] failed:', err.stack || err.message);
  process.exitCode = 1;
});
