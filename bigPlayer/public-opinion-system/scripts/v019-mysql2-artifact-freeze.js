'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const frozen = path.basename(project).startsWith('v019-mysql2-artifact-');
const root = frozen ? path.resolve(project, '../..') : path.resolve(project, '../..');
const owned = ['scripts/v019-mysql2-artifact-freeze.js', 'scripts/overseas-v019-mysql2-disabled.js', 'scripts/v019-mysql2-memory-peer.js', 'scripts/v019-offline-network-guard.cjs', 'scripts/v019-mysql2-offline-guard.cjs', 'scripts/overseas-v019-profile-adapter-contract.js', 'server/test/overseasV019Mysql2Artifact.test.js'];
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (fs.lstatSync(p).isSymbolicLink()) throw Error('ARTIFACT_LINK_REJECTED');
    if (e.isDirectory()) out.push(...walk(p)); else if (e.isFile()) out.push(p); else throw Error('ARTIFACT_ENTRY_REJECTED');
  }
  return out.sort();
}
function closure() {
  const found = new Map();
  function visit(name, from) {
    const entry = createRequire(path.join(from, 'package.json')).resolve(name);
    let dir = path.dirname(entry), pkg;
    while (dir !== path.dirname(dir)) {
      const file = path.join(dir, 'package.json');
      if (fs.existsSync(file)) { const p = JSON.parse(fs.readFileSync(file)); if (p.name === name) { pkg = p; break; } }
      dir = path.dirname(dir);
    }
    if (!pkg || !dir.startsWith(path.join(project, 'node_modules') + path.sep)) throw Error('ARTIFACT_RESOLUTION_ESCAPED');
    if (found.has(name)) { if (found.get(name).source !== dir) throw Error('ARTIFACT_DUPLICATE_RESOLUTION'); return; }
    found.set(name, { name, version: pkg.version, source: dir, packageSha256: sha(path.join(dir, 'package.json')) });
    for (const dep of Object.keys(pkg.dependencies || {})) visit(dep, dir);
  }
  visit('mysql2', project);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function freeze() {
  if (frozen || !fs.existsSync(path.join(root, '.git'))) throw Error('SOURCE_ROOT_REQUIRED');
  const packages = closure(), lock = JSON.parse(fs.readFileSync(path.join(project, 'package-lock.json')));
  for (const p of packages) if (lock.packages['node_modules/' + p.name]?.version !== p.version) throw Error('LOCK_VERSION_MISMATCH');
  const directory = fs.mkdtempSync(path.join(root, '.temp', 'v019-mysql2-artifact-'));
  const files = [];
  function copy(src, rel) { const dst = path.join(directory, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL); files.push({ path: rel.replaceAll('\\', '/'), bytes: fs.statSync(dst).size, sha256: sha(dst) }); }
  for (const p of owned) copy(path.join(project, p), p);
  copy(path.join(project, 'package-lock.json'), 'source-package-lock.json');
  for (const p of packages) for (const f of walk(p.source)) copy(f, path.join('node_modules', p.name, path.relative(p.source, f)));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = path.join(directory, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ kind: 'ACTUAL_MYSQL2_MEMORY_PROTOCOL_ARTIFACT', owner: 'development-lead', retentionDays: 30, productionActivationAllowed: false, packages, files }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ directory, manifestSha256: sha(manifest), packages, count: files.length }));
}
function verify(anchor) {
  if (!frozen || fs.realpathSync(project) !== project || !/^[a-f0-9]{64}$/.test(anchor || '') || sha(path.join(project, 'manifest.json')) !== anchor) throw Error('MANIFEST_REJECTED');
  const m = JSON.parse(fs.readFileSync(path.join(project, 'manifest.json')));
  const actual = walk(project).map(p => path.relative(project, p).replaceAll('\\', '/')).filter(p => p !== 'manifest.json').sort();
  if (JSON.stringify(actual) !== JSON.stringify(m.files.map(f => f.path).sort())) throw Error('CLOSURE_CHANGED');
  for (const f of m.files) if (fs.statSync(path.join(project, f.path)).size !== f.bytes || sha(path.join(project, f.path)) !== f.sha256) throw Error('ARTIFACT_CHANGED');
  const resolved = closure();
  if (resolved.length !== m.packages.length || resolved.some((p, i) => p.name !== m.packages[i].name || p.version !== m.packages[i].version || p.packageSha256 !== m.packages[i].packageSha256 || path.relative(project, p.source).replaceAll('\\', '/') !== 'node_modules/' + p.name)) throw Error('RUNTIME_CLOSURE_CHANGED');
  return m;
}
function test(anchor) {
  verify(anchor); const env = {}; for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const r = spawnSync(process.execPath, ['--require', './scripts/v019-mysql2-offline-guard.cjs', '--experimental-test-isolation=none', '--test', 'server/test/overseasV019Mysql2Artifact.test.js'], { cwd: project, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  verify(anchor); const directory = fs.mkdtempSync(path.join(root, '.temp', 'v019-mysql2-evidence-')), output = path.join(directory, 'result.json');
  const passed = r.status === 0 && /# fail 0\r?$/m.test(r.stdout || '') && /# pass [1-9]\d*\r?$/m.test(r.stdout || '');
  fs.writeFileSync(output, JSON.stringify({ kind: 'DEV_TEST_EVIDENCE', owner: 'development-lead', retentionDays: 30, manifestSha256: anchor, passed, unchanged: true, exitCode: r.status, realConfigurationRead: false, realConnectionOpened: false, actualMysql2Loaded: true, stdout: r.stdout, stderr: r.stderr }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, sha256: sha(output), passed })); process.exitCode = passed ? 0 : 1;
}
if (process.argv[2] === '--freeze' && process.argv.length === 3) freeze();
else if (process.argv[2] === '--verify' && process.argv.length === 4) { verify(process.argv[3]); console.log('VERIFIED'); }
else if (process.argv[2] === '--test' && process.argv.length === 4) test(process.argv[3]);
else throw Error('EXPLICIT_MODE_REQUIRED');
