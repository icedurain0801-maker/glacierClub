const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyWorkerOnlyCutoverPlan, PINNED_WINSW_SHA256 } = require('../../../scripts/windows-services/verify-worker-only-cutover-plan');

function hash(text) { return crypto.createHash('sha256').update(text).digest('hex').toUpperCase(); }
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-worker-cutover-'));
  const write = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); return file; };
  const candidate = path.join(root, 'candidate'); fs.mkdirSync(path.join(candidate, 'worker', 'src'), { recursive: true }); write('candidate/worker/src/worker.js', 'module.exports = {};'); write('candidate/package-worker-release-manifest.json', '{}');
  const winsw = write('candidate-winsw.exe', 'winsw');
  const rollbackWrapper = write('rollback/PublicOpinionWorker.exe', 'old-winsw');
  const rollbackXml = write('rollback/PublicOpinionWorker.xml', '<service><id>PublicOpinionWorker</id><arguments>"C:\\old\\worker\\src\\worker.js"</arguments><env name="BUILD_SHA" value="old" /></service>');
  const apiWrapper = write('api/PublicOpinionApi.exe', 'api-winsw');
  const apiXml = write('api/PublicOpinionApi.xml', '<service><id>PublicOpinionApi</id></service>');
  return { root, candidate, winsw, rollbackWrapper, rollbackXml, apiWrapper, apiXml };
}

test('Worker-only cutover preflight is read-only and rejects API material reuse', () => {
  const fixture = makeFixture();
  try {
    const apiBefore = { wrapper: hash(fs.readFileSync(fixture.apiWrapper)), xml: hash(fs.readFileSync(fixture.apiXml)) };
    const dependencies = { releaseVerifier() {}, expectedWinSWHash: hash(fs.readFileSync(fixture.winsw)) };
    const result = verifyWorkerOnlyCutoverPlan({ candidateRelease: fixture.candidate, sourceRoot: fixture.root, candidateWinSW: fixture.winsw, rollbackWrapper: fixture.rollbackWrapper, rollbackXml: fixture.rollbackXml, apiWrapper: fixture.apiWrapper, apiXml: fixture.apiXml }, dependencies);
    assert.equal(result.status, 'PASS');
    assert.equal(result.apiUntouched.wrapperSha256, apiBefore.wrapper);
    assert.equal(result.apiUntouched.xmlSha256, apiBefore.xml);
    assert.deepEqual(result.prohibitedActions, ['deploy', 'copy-to-service-root', 'service-install', 'service-stop', 'service-start', 'service-restart', 'database-write', 'manual-sync-run']);
    assert.throws(() => verifyWorkerOnlyCutoverPlan({ candidateRelease: fixture.candidate, sourceRoot: fixture.root, candidateWinSW: fixture.winsw, rollbackWrapper: fixture.apiWrapper, rollbackXml: fixture.rollbackXml, apiWrapper: fixture.apiWrapper, apiXml: fixture.apiXml }, dependencies), /must not reuse an API wrapper/);
    assert.equal(hash(fs.readFileSync(fixture.apiWrapper)), apiBefore.wrapper);
    assert.equal(hash(fs.readFileSync(fixture.apiXml)), apiBefore.xml);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});
