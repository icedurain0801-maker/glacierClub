'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const project = path.resolve(__dirname, '../../..');
const output = path.resolve(project, '../../.temp/capability-timeout-fix-20261010');
const apiBaseline = 'C:/ProgramData/PublicOpinion/releases/release-20261010-login-auth-fix';
const frontBaseline = 'C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261010-login-auth-v212';
const apiCandidate = path.join(output, 'api-release'), frontCandidate = path.join(output, 'frontend-release');
function replaceBlock(before, after, start, end) {
  const a = before.indexOf(start), b = before.indexOf(end, a), c = after.indexOf(start), d = after.indexOf(end, c);
  assert(a >= 0 && b > a && c >= 0 && d > c);
  return before.slice(0, a) + after.slice(c, d) + before.slice(b);
}
function files(root, prefix = '') { return fs.readdirSync(root, { withFileTypes: true }).flatMap(e => { assert(!e.isSymbolicLink()); const p = path.posix.join(prefix, e.name); return e.isDirectory() ? files(path.join(root, e.name), p) : [p]; }); }
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(output, { recursive: true }); assert(!fs.existsSync(apiCandidate) && !fs.existsSync(frontCandidate));
fs.cpSync(apiBaseline, apiCandidate, { recursive: true }); fs.cpSync(frontBaseline, frontCandidate, { recursive: true });
const cPath = 'server/src/connectors/bigPlayerH5Connector.js';
let connector = fs.readFileSync(path.join(apiCandidate, cPath), 'utf8'), current = fs.readFileSync(path.join(project, cPath), 'utf8');
assert(!connector.includes('const capabilityProbeTokens'));
connector = connector.replace(/(const \{ BaseConnector[^\n]+\n)/, '$1const capabilityProbeTokens = new WeakMap();\n');
connector = replaceBlock(connector, current, '  async loadApiToken(', '  async requestQ1(');
connector = replaceBlock(connector, current, '  async requestQ1(', '    const context = q1Context(source);');
connector = replaceBlock(connector, current, '  async detectCapabilities(', '  async listOwnedContents(');
const tokenPoint = '      const refreshedToken = await this.loadApiToken(source, refreshCredentialContext, refreshAccount);';
assert.equal(connector.split(tokenPoint).length, 2);
connector = connector.replace(tokenPoint, '      const probe = capabilityProbeTokens.get(refreshCredentialContext);\n      if (probe?.connector === this) probe.promise = null;\n' + tokenPoint);
fs.writeFileSync(path.join(apiCandidate, cPath), connector);
const aPath = 'server/src/app.js';
const app = replaceBlock(fs.readFileSync(path.join(apiCandidate, aPath), 'utf8'), fs.readFileSync(path.join(project, aPath), 'utf8'), "    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'check-capabilities') {", '    // 手动采集入队');
fs.writeFileSync(path.join(apiCandidate, aPath), app);
for (const file of ['assets/sources.js', 'sources.html']) fs.copyFileSync(path.join(project, '../admin/PublicOpinion', file), path.join(frontCandidate, 'public/admin/PublicOpinion', file));
fs.copyFileSync(path.join(project, 'scripts/windows-services/frontend3001-server.js'), path.join(frontCandidate, 'frontend3001-server.js'));
const changes = [];
for (const [baseline, candidate, expected, manifest] of [
  [apiBaseline, apiCandidate, [aPath, cPath], 'package-release-manifest.json'],
  [frontBaseline, frontCandidate, ['frontend3001-server.js', 'public/admin/PublicOpinion/assets/sources.js', 'public/admin/PublicOpinion/sources.html'], 'frontend3001-release-manifest.json']
]) {
  const changed = files(baseline).filter(file => file !== manifest && hash(path.join(baseline, file)) !== hash(path.join(candidate, file)));
  assert.deepEqual(changed.sort(), expected.sort());
  changes.push(...changed.map(file => ({ release: candidate, path: file, baselineSha256: hash(path.join(baseline, file)), sha256: hash(path.join(candidate, file)) })));
}
const report = { apiBaseline, apiCandidate, frontBaseline, frontCandidate, changes };
fs.writeFileSync(path.join(output, 'candidate.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
