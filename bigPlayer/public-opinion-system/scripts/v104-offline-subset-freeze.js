'use strict';
// Four selected trusted tests only. This orchestrator may launch guarded Node;
// the test process itself may not launch children, load env or open sockets.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const tests = ['worker/test/overseasManualHandoffOfflineSubset.test.js', 'worker/test/schedulerModeOfflineSubset.test.js',
  'server/test/unifiedSchedulerMigrationOfflineSubset.test.js', 'server/test/publicOpinionSourcesMultisiteOfflineSubset.test.js'];
const extras = [...tests, 'migrations/023_unified_source_scheduling.sql', 'scripts/offline-test-guard.cjs', 'scripts/v104-offline-subset-freeze.js'];
const asset = 'contract-assets/bigPlayer/admin/PublicOpinion/assets/sources.js';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function repositoryRoot() {
  const snapshot = /^overseas-v104-offline-/.test(path.basename(project));
  const root = snapshot ? path.dirname(path.dirname(project)) : path.resolve(project, '../..');
  if (!fs.existsSync(path.join(root, '.git')) || fs.realpathSync(root) !== root
    || fs.realpathSync(path.join(root, '.temp')) !== path.join(root, '.temp')) throw Error('REPOSITORY_ROOT_INVALID');
  return root;
}
function freeze() {
  if (/^overseas-v104-offline-/.test(path.basename(project))) throw Error('FREEZE_SOURCE_REQUIRED');
  const root = repositoryRoot(), source = require('./overseas-candidate-inventory').inventory(extras);
  const snapshotRoot = fs.mkdtempSync(path.join(root, '.temp', 'overseas-v104-offline-'));
  for (const entry of source.files) {
    const relative = path.relative(project, entry.path), target = path.join(snapshotRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (entry.kind === 'file') fs.copyFileSync(entry.path, target, fs.constants.COPYFILE_EXCL);
    else if (entry.kind === 'workspace-link') fs.symlinkSync(path.join(snapshotRoot, path.basename(entry.path) === 'public-opinion-system-server' ? 'server' : 'worker'), target, 'junction');
    else throw Error('FREEZE_KIND_INVALID');
  }
  const assetSource = path.join(root, 'bigPlayer/admin/PublicOpinion/assets/sources.js'), assetTarget = path.join(snapshotRoot, asset);
  fs.mkdirSync(path.dirname(assetTarget), { recursive: true }); fs.copyFileSync(assetSource, assetTarget, fs.constants.COPYFILE_EXCL);
  require('./overseas-candidate-inventory').verifyInventory(source, extras);
  const inventory = require(path.join(snapshotRoot, 'scripts/overseas-candidate-inventory')).inventory(extras);
  const manifest = { kind: 'V104_FOUR_OFFLINE_SUBSETS', snapshotRoot, tests, extras, inventory,
    asset: { sourceRelativePath: 'bigPlayer/admin/PublicOpinion/assets/sources.js', path: asset, bytes: fs.statSync(assetTarget).size, sha256: digest(assetTarget) },
    exclusions: 'Original 18 files remain NOT_TESTED; no fresh process, recovery, Progress, shared entry, SQL or production proof',
    testCommand: 'node scripts/v104-offline-subset-freeze.js --test <manifest SHA256>', productionActivationAllowed: false };
  const file = path.join(snapshotRoot, 'manifest.json'); fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ snapshotRoot, manifestSha256: digest(file), files: inventory.files.length, assetSha256: manifest.asset.sha256 }));
}
function verify(anchor) {
  if (!/^overseas-v104-offline-/.test(path.basename(project)) || path.dirname(project) !== path.join(repositoryRoot(), '.temp')) throw Error('FROZEN_ROOT_REQUIRED');
  const file = path.join(project, 'manifest.json');
  if (!/^[a-f0-9]{64}$/i.test(anchor || '') || digest(file).toLowerCase() !== anchor.toLowerCase()) throw Error('MANIFEST_ANCHOR_MISMATCH');
  const m = JSON.parse(fs.readFileSync(file));
  if (m.snapshotRoot !== project || JSON.stringify(m.tests) !== JSON.stringify(tests) || JSON.stringify(m.extras) !== JSON.stringify(extras) || m.asset.path !== asset) throw Error('MANIFEST_SCOPE_MISMATCH');
  require('./overseas-candidate-inventory').verifyInventory(m.inventory, extras);
  const a = path.join(project, asset);
  if (fs.lstatSync(a).isSymbolicLink() || fs.statSync(a).size !== m.asset.bytes || digest(a) !== m.asset.sha256) throw Error('ASSET_CHANGED');
  return m;
}
function run(anchor) {
  const before = verify(anchor), env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync(process.execPath, ['--require', './scripts/offline-test-guard.cjs', '--experimental-test-isolation=none', '--test', ...tests],
    { cwd: project, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  verify(anchor);
  const pass = result.status === 0 && /^# tests 34\r?$/m.test(result.stdout || '') && /^# pass 34\r?$/m.test(result.stdout || '')
    && /^# fail 0\r?$/m.test(result.stdout || '') && /OFFLINE_GUARD_DENIALS:\{\}/.test(result.stdout || '')
    && !/OFFLINE_GUARD_DENIED:/.test((result.stdout || '') + (result.stderr || ''));
  const out = fs.mkdtempSync(path.join(repositoryRoot(), '.temp', 'v104-offline-dev-'));
  const evidence = { kind: 'DEV_TEST_EVIDENCE', manifestSha256: anchor, snapshotRoot: project, exitCode: result.status,
    passed: pass, unchanged: true, files: before.inventory.files.length, productionTouched: false, sqlExecuted: false,
    childExecutedByTests: false, portOpened: false, stdout: result.stdout, stderr: result.stderr };
  const file = path.join(out, 'result.json'); fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: file, sha256: digest(file), passed: pass, exitCode: result.status }));
  process.exitCode = pass ? 0 : 1;
}
if (process.argv[2] === '--freeze' && process.argv.length === 3) freeze();
else if (process.argv[2] === '--verify' && process.argv.length === 4) { const m = verify(process.argv[3]); console.log(JSON.stringify({ verified: true, files: m.inventory.files.length })); }
else if (process.argv[2] === '--test' && process.argv.length === 4) run(process.argv[3]);
else throw Error('EXPLICIT_MODE_REQUIRED');
