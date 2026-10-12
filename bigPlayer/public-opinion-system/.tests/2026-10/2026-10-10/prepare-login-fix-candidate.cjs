'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const project = path.resolve(__dirname, '../../..');
const output = path.resolve(project, '../../.temp/login-authorization-fix-20261010');
const apiBaseline = 'C:/ProgramData/PublicOpinion/releases/v019-read-compat-vgfxk2';
const frontBaseline = 'C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261010-source-draft-v211';
const apiCandidate = path.join(output, 'api-release');
const frontCandidate = path.join(output, 'frontend-release');
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, 'Expected one exact patch target');
  return text.replace(before, after);
}
function files(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const p = path.posix.join(prefix, entry.name);
    assert(!entry.isSymbolicLink());
    return entry.isDirectory() ? files(path.join(root, entry.name), p) : [p];
  });
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(output, { recursive: true });
assert(!fs.existsSync(apiCandidate) && !fs.existsSync(frontCandidate), 'Refusing candidate overwrite');
fs.cpSync(apiBaseline, apiCandidate, { recursive: true });
fs.cpSync(frontBaseline, frontCandidate, { recursive: true });
const appPath = path.join(apiCandidate, 'server/src/app.js');
let app = fs.readFileSync(appPath, 'utf8');
app = replaceOnce(app, 'new BigPlayerH5Connector(process.env, { credentialContext, authRefreshCoordinator })', 'new BigPlayerH5Connector(process.env, { credentialContext, authRefreshCoordinator, loginSessionClient })');
const oldStart = "    if (req.method === 'GET' && resource === 'sources') {";
const oldEnd = "    if (req.method === 'GET' && resource === 'accounts' && id && path[2] === 'credentials')";
const current = fs.readFileSync(path.join(project, 'server/src/app.js'), 'utf8');
const newStart = "    if (req.method === 'GET' && resource === 'sources' && path.length <= 2) {";
assert(app.includes(oldStart) && app.includes(oldEnd));
assert(current.includes(newStart) && current.includes(oldEnd));
app = app.slice(0, app.indexOf(oldStart)) + current.slice(current.indexOf(newStart), current.indexOf(oldEnd)) + app.slice(app.indexOf(oldEnd));
fs.writeFileSync(appPath, app);
const connectorPath = path.join(apiCandidate, 'server/src/connectors/bigPlayerH5Connector.js');
let connector = fs.readFileSync(connectorPath, 'utf8');
connector = replaceOnce(connector, "throw new Error('LoginSessionClient login flow is unavailable');", "throw new ConnectorError('LOGIN_SESSION_CLIENT_UNAVAILABLE', 'LoginSessionClient login flow is unavailable');");
const healthBefore = "      return { ...installation, authorized: false, configured: false, reason: error.cause?.code || error.code || 'account credential invalid' };";
const healthAfter = fs.readFileSync(path.join(project, 'server/src/connectors/bigPlayerH5Connector.js'), 'utf8').match(/      const failure = error\.cause \|\| error;[\s\S]*?      return \{ \.\.\.installation, authorized: false, configured: false, reason \};/)[0];
connector = replaceOnce(connector, healthBefore, healthAfter);
fs.writeFileSync(connectorPath, connector);
for (const file of ['assets/sources.js', 'sources.html']) fs.copyFileSync(path.join(project, '../admin/PublicOpinion', file), path.join(frontCandidate, 'public/admin/PublicOpinion', file));
const report = { apiBaseline, apiCandidate, frontBaseline, frontCandidate, changes: [] };
for (const [before, after, expected, manifest] of [
  [apiBaseline, apiCandidate, ['server/src/app.js', 'server/src/connectors/bigPlayerH5Connector.js'], 'package-release-manifest.json'],
  [frontBaseline, frontCandidate, ['public/admin/PublicOpinion/assets/sources.js', 'public/admin/PublicOpinion/sources.html'], 'frontend3001-release-manifest.json']
]) {
  const changed = files(before).filter(file => file !== manifest && hash(path.join(before, file)) !== hash(path.join(after, file)));
  assert.deepEqual(changed.sort(), expected.sort());
  report.changes.push(...changed.map(file => ({ release: after, path: file, baselineSha256: hash(path.join(before, file)), sha256: hash(path.join(after, file)) })));
}
fs.writeFileSync(path.join(output, 'candidate.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
