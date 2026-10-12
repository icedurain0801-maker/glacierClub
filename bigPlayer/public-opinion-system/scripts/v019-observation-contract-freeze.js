'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..'), root = /^v019-contract-/.test(path.basename(project)) ? path.dirname(path.dirname(project)) : path.resolve(project, '../..');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const common = ['scripts/overseas-v019-fixture-integration-contract.js', 'scripts/overseas-v019-observation-contract.js', 'scripts/v019-offline-network-guard.cjs', 'scripts/v019-observation-contract-freeze.js', 'server/test/fixtures/overseasObservationIdentity.js'];
const stages = Object.freeze({ identity: ['Identity', 6], stream: ['Stream', 8], reader: ['Reader', 10], conversion: ['Conversion', 8], integration: ['Integration', 10], metadata: ['Metadata', 5] });
function stageTest(stage) { if (!Object.hasOwn(stages, stage)) throw Error('STAGE_REQUIRED'); return 'server/test/overseasV019Observation' + stages[stage][0] + '.test.js'; }
function stageFiles(stage) { return [...common, ...(['reader', 'integration'].includes(stage) ? ['scripts/overseas-v019-isolated-reader-contract.js'] : []), stageTest(stage)]; }
function freeze(stage) {
  const test = stageTest(stage);
  if (!fs.existsSync(path.join(root, '.git')) || fs.realpathSync(path.join(root, '.temp')) !== path.join(root, '.temp')) throw Error('ROOT_INVALID');
  const target = fs.mkdtempSync(path.join(root, '.temp', 'v019-contract-' + stage + '-'));
  const files = stageFiles(stage).map(p => { const dst = path.join(target, p); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(project, p), dst, fs.constants.COPYFILE_EXCL); return { path: p, bytes: fs.statSync(dst).size, sha256: sha(dst) }; });
  const manifest = { kind: 'FIXTURE_OBSERVATION_CONTRACT', stage, files, test, productionActivationAllowed: false,
    command: 'node scripts/v019-observation-contract-freeze.js --test <manifest SHA256>', scope: 'fixture private identity and internal ReadableStream; no production signing, DB, env, HTTP or secrets' };
  const m = path.join(target, 'manifest.json'); fs.writeFileSync(m, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ directory: target, manifestSha256: sha(m), stage, files }));
}
function verify(anchor) {
  if (!/^v019-contract-(identity|stream|reader|conversion|integration|metadata)-/.test(path.basename(project)) || fs.realpathSync(project) !== project || path.dirname(project) !== path.join(root, '.temp')) throw Error('FROZEN_ROOT_REQUIRED');
  const f = path.join(project, 'manifest.json'); if (!/^[a-f0-9]{64}$/i.test(anchor || '') || sha(f) !== anchor.toLowerCase()) throw Error('MANIFEST_CHANGED');
  const m = JSON.parse(fs.readFileSync(f));
  const selected = stageTest(m.stage), expected = stageFiles(m.stage);
  if (m.test !== selected || JSON.stringify(m.files.map(e => e.path)) !== JSON.stringify(expected)) throw Error('SCOPE_CHANGED');
  for (const e of m.files) { const p = path.join(project, e.path); if (fs.lstatSync(p).isSymbolicLink() || fs.statSync(p).size !== e.bytes || sha(p) !== e.sha256) throw Error('FROZEN_FILE_CHANGED'); }
  return m;
}
function test(anchor) {
  const m = verify(anchor), env = {};
  for (const k of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[k]) env[k] = process.env[k];
  const r = spawnSync(process.execPath, ['--require', './scripts/v019-offline-network-guard.cjs', '--experimental-test-isolation=none', '--test', m.test], { cwd: project, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  verify(anchor); const count = stages[m.stage][1];
  const passed = r.status === 0 && new RegExp('^# pass ' + count + '\\r?$', 'm').test(r.stdout || '') && /^# fail 0\r?$/m.test(r.stdout || '');
  const dir = fs.mkdtempSync(path.join(root, '.temp', 'v019-contract-dev-'));
  const file = path.join(dir, 'result.json'); fs.writeFileSync(file, JSON.stringify({ kind: 'DEV_TEST_EVIDENCE', stage: m.stage, manifestSha256: anchor, exitCode: r.status, passed, unchanged: true,
    realHttpExecuted: false, sqlExecuted: false, productionActivationAllowed: false, stdout: r.stdout, stderr: r.stderr }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: file, sha256: sha(file), passed, exitCode: r.status })); process.exitCode = passed ? 0 : 1;
}
if (process.argv.length === 4 && process.argv[2] === '--freeze') freeze(process.argv[3]);
else if (process.argv.length === 4 && process.argv[2] === '--test') test(process.argv[3]);
else if (process.argv.length === 4 && process.argv[2] === '--verify') { const m = verify(process.argv[3]); console.log(JSON.stringify({ verified: true, stage: m.stage, files: m.files.length })); }
else throw Error('EXPLICIT_MODE_REQUIRED');
