'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..'), frozen = /^v019-narrow-metadata-fixture-/.test(path.basename(project));
const root = frozen ? path.dirname(path.dirname(project)) : path.resolve(project, '../..');
const files = ['scripts/overseas-v019-narrow-metadata-driver.js', 'scripts/v019-narrow-metadata-freeze.js', 'scripts/v019-offline-network-guard.cjs', 'server/test/overseasV019NarrowMetadataDriver.test.js'];
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function freeze() {
  if (frozen || !fs.existsSync(path.join(root, '.git')) || fs.realpathSync(path.join(root, '.temp')) !== path.join(root, '.temp')) throw Error('ROOT_INVALID');
  const directory = fs.mkdtempSync(path.join(root, '.temp', 'v019-narrow-metadata-fixture-'));
  const entries = files.map(p => { const dst = path.join(directory, p); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(project, p), dst, fs.constants.COPYFILE_EXCL); return { path: p, bytes: fs.statSync(dst).size, sha256: sha(dst) }; });
  const manifest = path.join(directory, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ kind: 'NARROW_METADATA_FIXTURE_DRIVER', files: entries, test: files[3], count: 10, productionActivationAllowed: false }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ directory, manifestSha256: sha(manifest), files: entries }));
}
function verify(anchor) {
  if (!frozen || path.dirname(project) !== path.join(root, '.temp') || fs.realpathSync(project) !== project) throw Error('FROZEN_ROOT_REQUIRED');
  const file = path.join(project, 'manifest.json'); if (!/^[a-f0-9]{64}$/.test(anchor || '') || sha(file) !== anchor) throw Error('MANIFEST_CHANGED');
  const m = JSON.parse(fs.readFileSync(file));
  if (m.test !== files[3] || m.count !== 10 || JSON.stringify(m.files.map(f => f.path)) !== JSON.stringify(files)) throw Error('SCOPE_CHANGED');
  for (const e of m.files) { const p = path.join(project, e.path); if (fs.lstatSync(p).isSymbolicLink() || fs.statSync(p).size !== e.bytes || sha(p) !== e.sha256) throw Error('FROZEN_FILE_CHANGED'); }
  return m;
}
function test(anchor) {
  const m = verify(anchor), env = {}; for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const r = spawnSync(process.execPath, ['--require', './scripts/v019-offline-network-guard.cjs', '--experimental-test-isolation=none', '--test', m.test], { cwd: project, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  verify(anchor); const passed = r.status === 0 && /^# pass 10\r?$/m.test(r.stdout || '') && /^# fail 0\r?$/m.test(r.stdout || '');
  const directory = fs.mkdtempSync(path.join(root, '.temp', 'v019-narrow-metadata-dev-')), file = path.join(directory, 'result.json');
  fs.writeFileSync(file, JSON.stringify({ kind: 'DEV_TEST_EVIDENCE', manifestSha256: anchor, passed, exitCode: r.status, unchanged: true, realConnectionOpened: false, realSqlExecuted: false, realConfigurationRead: false, productionActivationAllowed: false, stdout: r.stdout, stderr: r.stderr }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: file, sha256: sha(file), passed, exitCode: r.status })); process.exitCode = passed ? 0 : 1;
}
if (process.argv.length === 3 && process.argv[2] === '--freeze') freeze();
else if (process.argv.length === 4 && process.argv[2] === '--verify') { verify(process.argv[3]); console.log(JSON.stringify({ verified: true, files: files.length })); }
else if (process.argv.length === 4 && process.argv[2] === '--test') test(process.argv[3]);
else throw Error('EXPLICIT_MODE_REQUIRED');
