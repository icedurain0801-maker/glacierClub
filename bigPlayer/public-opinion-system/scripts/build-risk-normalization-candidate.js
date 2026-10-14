'use strict';
// Offline only: create overlays for each deployed base, never replace a service.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const staging = path.resolve(project, '../../.temp/risk-normalization-20261010');
const candidate = fs.mkdtempSync(path.join(staging, 'candidate-'));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const read = relative => fs.readFileSync(path.join(project, relative), 'utf8');
function replaceOnce(text, before, after) {
  if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) throw new Error(`candidate anchor mismatch: ${before.slice(0, 90)}`);
  return text.replace(before, after);
}
function block(text, name, method = true) {
  const startPattern = new RegExp(`^${method ? '  (?:async )?' : '(?:async )?function '}${name}\\(`, 'm');
  const start = text.search(startPattern);
  if (start < 0) throw new Error(`missing ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.search(method ? /^  (?:async )?[A-Za-z_$][\w$]*\(/m : /^(?:async )?function /m);
  if (next < 0) throw new Error(`missing boundary after ${name}`);
  return text.slice(start, start + 1 + next);
}
function transplant(target, current, names, method = true) {
  for (const name of names) target = replaceOnce(target, block(target, name, method), block(current, name, method));
  return target;
}
const bases = {
  api: 'C:/ProgramData/PublicOpinion/releases/v019-read-compat-vgfxk2',
  analysis: 'C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1',
  collection: 'C:/ProgramData/PublicOpinion/releases/worker-release-v055-overseas-exclusion-1791605078003'
};
const manifest = { schemaVersion: 1, policyVersion: 'positive-normal-negative-50-game-complaint-v5', productionChanged: false, overlays: {} };
for (const [role, base] of Object.entries(bases)) {
  const output = path.join(candidate, `overlay-${role}`);
  if (fs.existsSync(output)) throw new Error(`candidate already exists: ${role}`);
  const changed = [];
  function emit(relative, transform) {
    const source = path.join(base, relative);
    const original = fs.existsSync(source) ? fs.readFileSync(source) : null;
    const content = transform(original?.toString('utf8'));
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { flag: 'wx' });
    const syntax = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8', windowsHide: true, shell: false });
    if (syntax.status !== 0) throw new Error(`candidate syntax failed: ${role}/${relative}`);
    changed.push({ path: relative, baseSha256: original ? digest(original) : null, candidateSha256: digest(content) });
  }
  emit('server/src/services/riskSeverityNormalizer.js', () => read('server/src/services/riskSeverityNormalizer.js'));
  emit('server/src/integrations/aiAnalyzer.js', original => {
    let text = replaceOnce(original, "const crypto = require('node:crypto');", "const crypto = require('node:crypto');\nconst { normalizeAnalysisResult } = require('../services/riskSeverityNormalizer');");
    text = text.replace(/const PROMPT_SCHEMA_VERSION = '[^']+';/, "const PROMPT_SCHEMA_VERSION = 'sentiment-quality-context-severity-exclusive-v5';");
    return transplant(text, read('server/src/integrations/aiAnalyzer.js'), ['buildMessages', 'parseResponse', 'analyzeBatch']);
  });
  emit('server/src/db/repository.js', original => {
    let text = replaceOnce(original, "const crypto = require('node:crypto');", "const crypto = require('node:crypto');\nconst { normalizeAnalysisResult } = require('../services/riskSeverityNormalizer');");
    const current = read('server/src/db/repository.js');
    text = transplant(text, current, ['insertAnalysis', 'upsertAnalysisCache', 'enqueueAnalysisJob', 'countWindowHits']);
    text = replaceOnce(text, '  async insertAnalysis(', block(current, 'writeAnalysisWithAudit') + '  async insertAnalysis(');
    if (!text.includes('  async reconcilePositiveRiskAlerts(')) text = replaceOnce(text, '  async enqueueAnalysisJob(', block(current, 'reconcilePositiveRiskAlerts') + '  async enqueueAnalysisJob(');
    return text;
  });
  emit('server/src/pipeline/alertEngine.js', original => {
    let text = replaceOnce(original, 'const SEVERITY_RANK =', "const { normalizeAnalysisResult } = require('../services/riskSeverityNormalizer');\nconst SEVERITY_RANK =");
    return transplant(text, read('server/src/pipeline/alertEngine.js'), ['process', 'processAiUrgent']);
  });
  if (role !== 'api') {
    emit('worker/src/worker.js', original => {
      let text = replaceOnce(original, "const crypto = require('node:crypto');", "const crypto = require('node:crypto');\nconst { normalizeAnalysisResult } = require('../../server/src/services/riskSeverityNormalizer');");
      text = replaceOnce(text, 'function effectiveAnalysisForAlert(analysis, lightAnalysis) {', "function normalizePersistedAnalysis(analysis, context = {}) { return normalizeAnalysisResult(analysis, context); }\n\nfunction effectiveAnalysisForAlert(analysis, lightAnalysis) {\n  if (analysis?.sentiment === 'positive') return normalizePersistedAnalysis(analysis);");
      const line = text.split('\n').find(value => value.includes('const cachedAnalysis = cacheAnalysis(job); const analysis = {'));
      if (!line) throw new Error(`analysis line missing: ${role}`);
      let normalized = line.replace('const analysis = {', 'const analysis = normalizePersistedAnalysis({').replace(/ };\r?$/, ', normalizationBatchId: scope.runId || job.sync_run_id || job.id, cacheKey: analysisCacheKey(ai, job, profile) }, job);');
      text = replaceOnce(text, line, normalized);
      text = replaceOnce(text, 'await repo.getLightAnalysis(job.content_id) : null;', 'normalizePersistedAnalysis(await repo.getLightAnalysis(job.content_id), job) : null;');
      text = replaceOnce(text, "if (typeof repo.insertAnalysis === 'function') await repo.insertAnalysis(job.content_id, analysis);", "if (typeof repo.insertAnalysis === 'function') await repo.insertAnalysis(job.content_id, analysis);\n        await repo.reconcilePositiveRiskAlerts(job.content_id, analysis, { runId: scope.runId || job.sync_run_id || job.id });");
      const fallback = text.split('\n').find(value => value.includes('const analysis = analyses[index];'));
      const fallbackAfter = "  for (let index = 0; index < queue.length; index += 1) { const { content, raw, hit } = queue[index]; const analysis = normalizePersistedAnalysis(analyses[index], raw); const persisted = { ...analysis, normalizationBatchId: scope.runId || content.sync_run_id || content.id, triggerReason: 'keyword_match', matchedKeywords: hit.matchedKeywords }; await deps.repo.insertAnalysis(content.id, persisted); await deps.repo.reconcilePositiveRiskAlerts(content.id, persisted, { runId: scope.runId || content.sync_run_id || content.id }); const created = await deps.alertEngine.process({ game, content, hit, analysis: persisted }); alerted += created.filter(item => !item.reused).length; }";
      text = replaceOnce(text, fallback, fallbackAfter);
      text = replaceOnce(text, 'effectiveAnalysisForAlert,', 'effectiveAnalysisForAlert, normalizePersistedAnalysis,');
      return text;
    });
    emit('worker/src/q1DailyAnalysisRunner.js', original => {
      let text = replaceOnce(original, "const crypto = require('node:crypto');", "const crypto = require('node:crypto');\nconst { normalizeAnalysisResult } = require('../../server/src/services/riskSeverityNormalizer');");
      text = transplant(text, read('worker/src/q1DailyAnalysisRunner.js'), ['normalizeAnalysis'], false);
      text = replaceOnce(text, 'normalizeAnalysis(results[i], profile, job.content_fingerprint || job.fingerprint)', 'normalizeAnalysis(results[i], profile, job.content_fingerprint || job.fingerprint, { title: job.title, body: job.body })');
      text = replaceOnce(text, 'await this.repo.insertAnalysis(job.content_id, analysis);', 'await this.repo.insertAnalysis(job.content_id, { ...analysis, normalizationBatchId: this.claimOwner, cacheKey: keys[i] });\n        await this.repo.reconcilePositiveRiskAlerts(job.content_id, analysis, { runId: this.claimOwner });');
      return text;
    });
  }
  const runtime = path.join(candidate, `runtime-${role}`);
  fs.mkdirSync(runtime);
  for (const relative of ['package.json', 'package-lock.json', 'node_modules', 'server/src', 'worker/src', 'shared']) {
    const source = path.join(base, relative);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(runtime, relative), { recursive: true, filter: item => {
      if (fs.lstatSync(item).isSymbolicLink()) throw new Error(`release symlink not allowed: ${item}`);
      return true;
    } });
  }
  for (const file of changed) fs.copyFileSync(path.join(output, file.path), path.join(runtime, file.path));
  if (role === 'collection') {
    const original = fs.readFileSync(path.join(base, 'worker/src/worker.js'), 'utf8');
    const built = fs.readFileSync(path.join(runtime, 'worker/src/worker.js'), 'utf8');
    const exclusions = text => text.split('\n').filter(line => line.includes('OVERSEAS_DEDICATED_COLLECTOR')).join('\n');
    if (!exclusions(original) || exclusions(original) !== exclusions(built)) throw new Error('overseas exclusions changed');
  }
  manifest.overlays[role] = { base, output, runtime, files: changed };
}
fs.writeFileSync(path.join(candidate, 'runtime-overlay-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ productionChanged: false, manifest: path.join(candidate, 'runtime-overlay-manifest.json') }));
