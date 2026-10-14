'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const baseline = 'C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008';
const root = path.resolve(project, '../..', '.temp/bigplayer-recovery-20261009');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function method(text, name) {
  const start = text.indexOf(`  async ${name}(`);
  if (start < 0) throw new Error(`method missing: ${name}`);
  const end = text.indexOf('\n  async ', start + 1);
  return text.slice(start, end < 0 ? text.length : end);
}
function replaceMethod(text, source, name) { return text.replace(method(text, name), method(source, name)); }
fs.mkdirSync(root, { recursive: true });
const output = fs.mkdtempSync(path.join(root, 'v019-read-compat-'));
const baseManifest = JSON.parse(fs.readFileSync(path.join(baseline, 'package-release-manifest.json'), 'utf8'));
for (const entry of baseManifest.files) {
  if (sha(path.join(baseline, entry.path)) !== entry.sha256.toLowerCase()) throw new Error(`baseline drift: ${entry.path}`);
}
fs.cpSync(baseline, output, { recursive: true, errorOnExist: true });
const repoPath = 'server/src/db/repository.js';
const oldRepo = fs.readFileSync(path.join(baseline, repoPath), 'utf8');
const currentRepo = fs.readFileSync(path.join(project, repoPath), 'utf8');
let candidate = oldRepo;
const oldProjection = oldRepo.split('\n').find(line => line.startsWith('const SYNC_RUN_PROJECTION ='));
const newProjection = currentRepo.split('\n').filter(line => /^(const OPTIONAL_SYNC_RUN_COLUMNS|const optionalSyncRunColumn|const syncRunProjection)/.test(line)).join('\n');
if (!oldProjection || newProjection.split('\n').length !== 3) throw new Error('projection anchors missing');
candidate = candidate.replace(oldProjection, newProjection);
candidate = candidate.replace('  async health() {', method(currentRepo, 'getSyncRunProjection') + '\n  async health() {');
for (const name of ['getSyncRun', 'getLatestSyncRunForSource', 'listSyncRuns']) candidate = replaceMethod(candidate, currentRepo, name);
candidate = candidate.replace('  async listSyncParents(', method(currentRepo, 'getSourceSyncStatusSummary') + '\n  async listSyncParents(');
fs.writeFileSync(path.join(output, repoPath), candidate);
const appPath = 'server/src/app.js';
const oldApp = fs.readFileSync(path.join(baseline, appPath), 'utf8');
const target = "repo.getSyncStatus({ accountId: account.id }), account && !isFacebookSource(source)";
const replacement = "summary && source.platform === 'bigplayer_h5' && source.region_code === 'domestic' ? repo.getSourceSyncStatusSummary({ accountId: account.id }) : repo.getSyncStatus({ accountId: account.id }), account && !isFacebookSource(source)";
if (oldApp.split(target).length !== 2) throw new Error('source enrichment anchor ambiguous');
let candidateApp = oldApp.replace(target, replacement).replace('async function sourceWithAccount(source) {', 'async function sourceWithAccount(source, { summary = false } = {}) {');
candidateApp = candidateApp.replace('sources.map(sourceWithAccount)', 'sources.map(source => sourceWithAccount(source, { summary: true }))');
fs.writeFileSync(path.join(output, appPath), candidateApp);
const changed = [repoPath, appPath];
for (const file of changed) {
  const checked = spawnSync(process.execPath, ['--check', path.join(output, file)], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`syntax error: ${file}`);
}
const files = baseManifest.files.map(entry => ({ path: entry.path, sha256: sha(path.join(output, entry.path)) }));
const actualChanged = files.filter(entry => baseManifest.files.find(base => base.path === entry.path).sha256.toLowerCase() !== entry.sha256).map(entry => entry.path);
if (JSON.stringify(actualChanged.sort()) !== JSON.stringify(changed.sort())) throw new Error('unexpected package changes');
const manifest = { algorithm: 'sha256', baseline, baselineManifestSha256: sha(path.join(baseline, 'package-release-manifest.json')), changedFiles: changed, files };
fs.writeFileSync(path.join(output, 'package-release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const report = { candidate: output, baseline, baselineRepositorySha256: sha(path.join(baseline, repoPath)), candidateRepositorySha256: sha(path.join(output, repoPath)), manifestSha256: sha(path.join(output, 'package-release-manifest.json')), verifiedBaselineFiles: files.length, changedFiles: changed, productionTouched: false };
fs.writeFileSync(path.join(output, 'candidate-report.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
