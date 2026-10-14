'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: project, encoding: 'utf8', windowsHide: true }).trim();
const temp = path.join(root, '.temp');
if (fs.lstatSync(temp).isSymbolicLink() || path.resolve(fs.realpathSync(temp)) !== path.resolve(temp)) throw Error('ROOT_TEMP_REJECTED');
const files = ['scripts/overseas-v019-isolated-runner.js', 'server/test/overseasV019IsolatedRunner.test.js', 'scripts/v019-offline-network-guard.cjs'];
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const dir = fs.mkdtempSync(path.join(temp, 'overseas-v019-isolated-candidate-'));
const entries = [];
for (const relative of files) { const source = path.join(project, relative); const target = path.join(dir, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target); entries.push({ path: relative, sha256: sha(source), bytes: fs.statSync(source).size }); }
const manifest = { status: 'DEV_TEST_EVIDENCE / REAL_HTTP_NO_GO', createdAt: new Date().toISOString(), root: '[UNPUBLISHED_TEMP_ROOT]', files: entries, testCommand: 'node --require ./scripts/v019-offline-network-guard.cjs --test server/test/overseasV019IsolatedRunner.test.js', guards: ['mode=isolated', 'internal data-only fixture; injected transport rejected; no exported callback factory', 'offline guard is accident prevention, not hostile-JS sandbox', 'SRC-A board=100017 languages=2/9/16 are fixture identities, not real account/site authorization', 'perSite=8 total=24 timeout=10s total=5m retry=0 redirect=0 fallback=0', 'internal monotonic clock; one absolute request deadline including JSON', 'unknown auth probe only; disabled/unauthorized rejected; feeds blocked for unknown'] };
const manifestPath = path.join(dir, 'manifest.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ directory: dir, manifest: manifestPath, manifestSha256: sha(manifestPath), files: entries }));
