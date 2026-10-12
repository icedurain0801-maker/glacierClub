'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRequire } = require('node:module'), { spawnSync } = require('node:child_process');
const artifact = path.resolve(__dirname, '..'), root = path.resolve(artifact, '../..');
const frozen = path.basename(artifact).startsWith('v019-seven-read-executor-');
const owned = ['scripts/v019-seven-read-freeze.js', 'scripts/v019-seven-read-license.js', 'scripts/v019-seven-read-cli.js', 'scripts/overseas-v019-mysql2-disabled.js', 'scripts/v019-mysql2-memory-peer.js', 'scripts/v019-offline-network-guard.cjs', 'scripts/v019-mysql2-offline-guard.cjs', 'scripts/overseas-v019-profile-adapter-contract.js', 'server/test/overseasV019Mysql2Artifact.test.js', 'server/test/overseasV019SevenReadLicense.test.js'];
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir) {
  const out = []; if (fs.lstatSync(dir).isSymbolicLink()) throw Error('PERMIT_ARTIFACT_LINK_REJECTED');
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, e.name); if (fs.lstatSync(file).isSymbolicLink()) throw Error('PERMIT_ARTIFACT_LINK_REJECTED'); if (e.isDirectory()) out.push(...walk(file)); else if (e.isFile()) out.push(file); else throw Error('PERMIT_ARTIFACT_ENTRY_REJECTED'); }
  return out.sort();
}
function closure() {
  const found = new Map();
  function visit(name, from) {
    let dir = path.dirname(createRequire(path.join(from, 'package.json')).resolve(name)), pkg;
    while (dir !== path.dirname(dir)) { const p = path.join(dir, 'package.json'); if (fs.existsSync(p)) { const candidate = JSON.parse(fs.readFileSync(p)); if (candidate.name === name) { pkg = candidate; break; } } dir = path.dirname(dir); }
    if (!pkg || !dir.startsWith(path.join(artifact, 'node_modules') + path.sep)) throw Error('PERMIT_ARTIFACT_RESOLUTION_ESCAPED');
    if (found.has(name)) { if (found.get(name).source !== dir) throw Error('PERMIT_ARTIFACT_DUPLICATE'); return; }
    found.set(name, { name, version: pkg.version, source: dir, packageSha256: sha(path.join(dir, 'package.json')) });
    for (const dep of Object.keys(pkg.dependencies || {})) visit(dep, dir);
  }
  visit('mysql2', artifact); return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function freeze() {
  if (frozen || !fs.existsSync(path.join(root, '.git')) || fs.realpathSync(path.join(root, '.temp')) !== path.join(root, '.temp')) throw Error('PERMIT_SOURCE_REQUIRED');
  const packages = closure(), lock = JSON.parse(fs.readFileSync(path.join(artifact, 'package-lock.json')));
  for (const p of packages) if (lock.packages['node_modules/' + p.name]?.version !== p.version) throw Error('PERMIT_LOCK_MISMATCH');
  const directory = fs.mkdtempSync(path.join(root, '.temp', 'v019-seven-read-executor-')), files = [];
  const copy = (src, rel) => { const dst = path.join(directory, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL); files.push({ path: rel.replaceAll('\\', '/'), bytes: fs.statSync(dst).size, sha256: sha(dst) }); };
  for (const p of owned) copy(path.join(artifact, p), p); copy(path.join(artifact, 'package-lock.json'), 'source-package-lock.json');
  for (const p of packages) for (const f of walk(p.source)) copy(f, path.join('node_modules', p.name, path.relative(p.source, f)));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = path.join(directory, 'manifest.json'); fs.writeFileSync(manifest, JSON.stringify({ kind: 'CONTROLLED_SEVEN_READ_EXECUTOR', owner: 'development-lead', retentionDays: 30, productionApprovalPresent: false, packages, files, tests: owned.slice(-2) }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ directory, manifestSha256: sha(manifest), fileCount: files.length }));
}
function verifyArtifact(anchor) {
  if (!frozen || fs.realpathSync(artifact) !== artifact || !/^[a-f0-9]{64}$/.test(anchor || '') || sha(path.join(artifact, 'manifest.json')) !== anchor) throw Error('PERMIT_ARTIFACT_REJECTED');
  const m = JSON.parse(fs.readFileSync(path.join(artifact, 'manifest.json')));
  const actual = walk(artifact).map(p => path.relative(artifact, p).replaceAll('\\', '/')).filter(p => p !== 'manifest.json').sort();
  if (JSON.stringify(actual) !== JSON.stringify(m.files.map(f => f.path).sort())) throw Error('PERMIT_ARTIFACT_CHANGED');
  for (const f of m.files) if (fs.statSync(path.join(artifact, f.path)).size !== f.bytes || sha(path.join(artifact, f.path)) !== f.sha256) throw Error('PERMIT_ARTIFACT_CHANGED');
  const resolved = closure(); if (resolved.length !== m.packages.length || resolved.some((p, i) => p.name !== m.packages[i].name || p.version !== m.packages[i].version || p.packageSha256 !== m.packages[i].packageSha256 || path.relative(artifact, p.source).replaceAll('\\', '/') !== 'node_modules/' + p.name)) throw Error('PERMIT_CLOSURE_CHANGED');
  return m;
}
function test(anchor) {
  const m = verifyArtifact(anchor), env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const r = spawnSync(process.execPath, ['--require', './scripts/v019-mysql2-offline-guard.cjs', '--experimental-test-isolation=none', '--test', ...m.tests], { cwd: artifact, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  verifyArtifact(anchor); const directory = fs.mkdtempSync(path.join(root, '.temp', 'v019-seven-read-dev-')), output = path.join(directory, 'result.json');
  const passed = r.status === 0 && /# fail 0\r?$/m.test(r.stdout || '') && /# pass [1-9]\d*\r?$/m.test(r.stdout || '');
  fs.writeFileSync(output, JSON.stringify({ kind: 'DEV_TEST_EVIDENCE', owner: 'development-lead', retentionDays: 30, manifestSha256: anchor, passed, unchanged: true, exitCode: r.status, realConfigurationRead: false, realConnectionOpened: false, productionPermitIssued: false, stdout: r.stdout, stderr: r.stderr }, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ output, sha256: sha(output), passed })); process.exitCode = passed ? 0 : 1;
}
module.exports = { verifyArtifact };
if (require.main === module) {
  if (process.argv[2] === '--freeze' && process.argv.length === 3) freeze();
  else if (process.argv[2] === '--verify' && process.argv.length === 4) { verifyArtifact(process.argv[3]); console.log('VERIFIED'); }
  else if (process.argv[2] === '--test' && process.argv.length === 4) test(process.argv[3]);
  else throw Error('PERMIT_EXPLICIT_MODE_REQUIRED');
}
