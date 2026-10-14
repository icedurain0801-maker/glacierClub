'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const license = require('../../scripts/v019-seven-read-license'), engine = require('../../scripts/overseas-v019-mysql2-disabled'), cli = require('../../scripts/v019-seven-read-cli');
const contract = require('../../scripts/overseas-v019-profile-adapter-contract');
const artifact = path.resolve(__dirname, '../..'), root = path.resolve(artifact, '../..');
const normalized = p => path.resolve(p).replaceAll('\\', '/');
const manifestSha = license.hash(fs.readFileSync(path.join(artifact, 'manifest.json')));
function setup() {
  const dir = fs.mkdtempSync(path.join(root, '.temp', 'v019-mysql2-config-fixture-permit-')), file = path.join(dir, 'synthetic-config.txt');
  fs.writeFileSync(file, 'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=public_opinion\nDB_USER=isolated-db-user\nDB_PASSWORD=isolated-db-password\nUNRELATED_SECRET=permit-other-secret\n', { flag: 'wx' });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'), key = publicKey.export({ format: 'der', type: 'spki' });
  const nonce = crypto.randomBytes(16).toString('hex'), now = Date.now();
  const payload = { version: 1, lane: 'fixture-seven-read', scope: 'overseas-seven-select-readonly', sourceId: contract.sourceId, target: { host: '127.0.0.1', port: 3306, database: 'public_opinion', serverId: 1, version: '10.4.14-MariaDB' }, artifactDirectory: normalized(artifact), artifactManifestSha256: manifestSha, sqlSha256: license.hash(license.canonical(contract.sqlContract)), command: { ...license.command }, configuration: { path: normalized(file), physicalRead: 'whole-specified-file', readCount: 1, selectedFields: [...contract.selectedFields], identityGrantStatus: 'unverified' }, budget: JSON.parse(JSON.stringify(license.budget)), forbidden: { ...license.forbidden }, issuedAt: new Date(now - 100).toISOString(), expiresAt: new Date(now + 30000).toISOString(), nonce, outputDirectory: normalized(path.join(root, '.temp', 'v019-seven-read-fixture-output-' + nonce)), owner: 'development-lead', retentionDays: 30, decisionId: 'fixture-decision', authorityFingerprint: license.hash(key) };
  const envelope = { payload, keyId: 'fixture-ephemeral', signature: '' };
  const sign = () => { envelope.signature = crypto.sign(null, Buffer.from(license.canonical(payload)), privateKey).toString('base64'); };
  sign(); return { file, key: key.toString('base64'), envelope, sign };
}
async function noEffects(f) {
  const originalOpen = fs.openSync, mysql = require('mysql2'), originalCreate = mysql.createConnection;
  let reads = 0, connections = 0;
  fs.openSync = function (file, ...args) { if (args[0] === 'r' && typeof file === 'string' && (file.endsWith('synthetic-config.txt') || normalized(file) === contract.configurationPath)) reads++; return originalOpen.call(this, file, ...args); };
  mysql.createConnection = function (...args) { connections++; return originalCreate.apply(this, args); };
  try { await f(); assert.equal(reads, 0); assert.equal(connections, 0); }
  finally { fs.openSync = originalOpen; mysql.createConnection = originalCreate; }
}
function safe(r) { for (const value of ['isolated-db-user', 'isolated-db-password', 'permit-other-secret']) assert.ok(!JSON.stringify(r).includes(value)); }
test('signed fixture entry validates complete scope, claims once then real mysql2 seven reads', async () => {
  const s = setup(), r = await license.executeFixture(s.envelope, s.key);
  assert.equal(r.status, 'ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS');
  const raw = JSON.parse(fs.readFileSync(r.output)), claim = JSON.parse(fs.readFileSync(path.join(s.envelope.payload.outputDirectory, 'claim.json')));
  assert.equal(raw.configurationReads, 1); assert.equal(raw.selects, 7); assert.equal(raw.realConnectionOpened, false); assert.equal(raw.realConfigurationRead, false); assert.equal(raw.automaticReplayAllowed, false); assert.equal(claim.state, 'CLAIMED_NO_AUTOMATIC_REPLAY'); assert.equal(claim.retentionDays, 30); safe(raw);
});
test('fixture envelope cannot activate production, regardless of environment flags', async () => {
  const s = setup(); process.env.V019_LIVE = 'true'; process.env.V019_APPROVED_PUBLIC_KEY = s.key;
  try { await noEffects(async () => { await assert.rejects(license.executeProduction(s.envelope), { code: 'PERMIT_SCOPE_REJECTED' }); assert.throws(() => engine.runProductionMysql2(), { code: 'REAL_MYSQL2_EXECUTOR_DISABLED' }); }); }
  finally { delete process.env.V019_LIVE; delete process.env.V019_APPROVED_PUBLIC_KEY; }
});
test('wrong signature, wrong trusted key and post-signature tamper reject before config/connection/claim', async () => {
  const s = setup(), other = setup();
  await noEffects(async () => {
    await assert.rejects(license.executeFixture(s.envelope, other.key), { code: 'PERMIT_SIGNATURE_REJECTED' });
    const bad = JSON.parse(JSON.stringify(s.envelope)); bad.signature = Buffer.alloc(64, 1).toString('base64'); await assert.rejects(license.executeFixture(bad, s.key), { code: 'PERMIT_SIGNATURE_REJECTED' });
    bad.signature = s.envelope.signature; bad.payload.decisionId = 'tampered'; await assert.rejects(license.executeFixture(bad, s.key), { code: 'PERMIT_SIGNATURE_REJECTED' });
  }); assert.equal(fs.existsSync(s.envelope.payload.outputDirectory), false);
});
test('signed source/target/code/SQL/command/config/budget/output/retention changes fail closed', async () => {
  const changes = [p => p.sourceId = 'other', p => p.target.host = 'remote', p => p.target.port = 3307, p => p.artifactManifestSha256 = '0'.repeat(64), p => p.sqlSha256 = '0'.repeat(64), p => p.command.mode = '--live', p => p.configuration.path = contract.configurationPath, p => p.configuration.physicalRead = 'five-keys-only', p => p.configuration.readCount = 2, p => p.configuration.selectedFields.push('DATABASE_URL'), p => p.budget.selects = 8, p => p.budget.retryCount = 1, p => p.forbidden.r8 = true, p => p.retentionDays = 1, p => p.outputDirectory = normalized(root), p => p.owner = 'other'];
  await noEffects(async () => { for (const change of changes) { const s = setup(), originalOutput = s.envelope.payload.outputDirectory; change(s.envelope.payload); s.sign(); await assert.rejects(license.executeFixture(s.envelope, s.key)); assert.equal(fs.existsSync(originalOutput), false); } });
});
test('expired/future/overlong permit windows reject before secret reads', async () => {
  await noEffects(async () => {
    for (const kind of ['expired', 'future', 'overlong']) { const s = setup(), now = Date.now(); s.envelope.payload.issuedAt = new Date(kind === 'future' ? now + 10000 : now - 10000).toISOString(); s.envelope.payload.expiresAt = new Date(kind === 'expired' ? now - 1000 : now + (kind === 'overlong' ? 300000 : 20000)).toISOString(); s.sign(); await assert.rejects(license.executeFixture(s.envelope, s.key), { code: 'PERMIT_EXPIRED' }); }
  });
});
test('persistent claim prohibits repeated and concurrent execution with one winner', async () => {
  const s = setup(); const results = await Promise.allSettled([license.executeFixture(s.envelope, s.key), license.executeFixture(s.envelope, s.key)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.code, 'PERMIT_ALREADY_CLAIMED');
  await noEffects(async () => { await assert.rejects(license.executeFixture(s.envelope, s.key), { code: 'PERMIT_ALREADY_CLAIMED' }); });
});
test('config failure retains claim and does not automatically replay', async () => {
  const s = setup(); fs.writeFileSync(s.file, 'DB_HOST=remote\n'); const r = await license.executeFixture(s.envelope, s.key);
  assert.equal(r.status, 'NO_GO'); assert.ok(fs.existsSync(path.join(s.envelope.payload.outputDirectory, 'claim.json'))); assert.ok(fs.existsSync(r.output));
  await noEffects(async () => { await assert.rejects(license.executeFixture(s.envelope, s.key), { code: 'PERMIT_ALREADY_CLAIMED' }); }); safe(JSON.parse(fs.readFileSync(r.output)));
});
test('claim without execution models process exit; copied/reused capability and restart replay denied', async () => {
  const s = setup(), claim = license.claimFixtureOnly(s.envelope, s.key);
  assert.equal(claim.status, 'FIXTURE_CLAIM_ABANDONED_NO_REPLAY');
  assert.ok(fs.existsSync(path.join(s.envelope.payload.outputDirectory, 'claim.json'))); assert.equal(fs.existsSync(path.join(s.envelope.payload.outputDirectory, 'result.json')), false);
  await assert.rejects(engine.runAuthorizedMysql2({ ...claim }), { code: 'PERMIT_CAPABILITY_REJECTED' });
  await noEffects(async () => { await assert.rejects(license.executeFixture(s.envelope, s.key), { code: 'PERMIT_ALREADY_CLAIMED' }); });
  for (const key of ['authorizeProduction', 'authorizeFixture', 'consumeExecution', 'finishExecution']) assert.equal(license[key], undefined);
});
test('permit expiry during synthetic file read stops before driver creation and preserves claim/result', async () => {
  const s = setup(), open = fs.openSync, now = Date.now;
  let shifted = false;
  fs.openSync = function (file, flags, ...args) { if (flags === 'r' && file === s.file) shifted = true; return open.call(this, file, flags, ...args); };
  Date.now = () => shifted ? Date.parse(s.envelope.payload.expiresAt) + 1 : now();
  let r;
  try { r = await license.executeFixture(s.envelope, s.key); }
  finally { fs.openSync = open; Date.now = now; }
  assert.equal(r.status, 'NO_GO'); const raw = JSON.parse(fs.readFileSync(r.output)); assert.equal(raw.configurationReads, 1); assert.equal(raw.actualMysql2Loaded, false); assert.ok(fs.existsSync(path.join(s.envelope.payload.outputDirectory, 'claim.json'))); safe(raw);
});
test('production-shaped attempted fixture forgery has no registered manager anchor and zero config/connection', async () => {
  const s = setup(); s.envelope.payload.lane = 'production-seven-read'; s.envelope.payload.configuration.path = contract.configurationPath;
  s.envelope.payload.outputDirectory = normalized(path.join(root, '.temp', 'v019-seven-read-output-' + s.envelope.payload.nonce));
  // Keep the fixture signature; do not issue a production permit or write an anchor.
  const lstat = fs.lstatSync;
  fs.lstatSync = function (file, ...args) { if (path.resolve(file) === license.anchorPath) throw Object.assign(Error('not enrolled fixture'), { code: 'ENOENT' }); return lstat.call(this, file, ...args); };
  try { await noEffects(async () => { await assert.rejects(license.executeProduction(s.envelope), { code: 'TRUST_ANCHOR_UNENROLLED' }); }); }
  finally { fs.lstatSync = lstat; }
  assert.equal(fs.existsSync(s.envelope.payload.outputDirectory), false);
});
test('callers cannot supply publicKey/anchor/provider/live/getter or forged production capability', async () => {
  const s = setup(); await noEffects(async () => {
    for (const key of ['publicKey', 'anchorPath', 'provider', 'live']) await assert.rejects(license.executeProduction({ ...s.envelope, [key]: s.key }));
    let touched = 0; const bad = {}; Object.defineProperty(bad, 'payload', { get() { touched++; return s.envelope.payload; } }); await assert.rejects(license.executeProduction(bad)); assert.equal(touched, 0);
    await assert.rejects(engine.runAuthorizedMysql2({ lane: 'production-seven-read', configurationPath: contract.configurationPath }), { code: 'PERMIT_CAPABILITY_REJECTED' });
  });
});
test('exact production CLI accepts only encoded envelope, never public key/live/env/file arguments', async () => {
  const s = setup(), encoded = Buffer.from(JSON.stringify(s.envelope)).toString('base64');
  assert.deepEqual(cli.decodeArguments(['--execute', '--permit-base64', encoded]), s.envelope);
  for (const args of [[], ['--live'], ['--execute', '--permit-file', s.file], ['--execute', '--permit-base64', encoded, '--public-key', s.key], ['--execute', '--permit-base64', '$SECRET']]) assert.throws(() => cli.decodeArguments(args), { code: 'PERMIT_CLI_REJECTED' });
  await noEffects(async () => { const r = await cli.main(['--execute', '--permit-base64', encoded]); assert.equal(r, 2); });
});
test('existing config compatibility accepts localhost and explicit empty password', async () => {
  const s = setup();
  fs.writeFileSync(s.file, 'DB_HOST=localhost\nDB_PORT=3306\nDB_NAME=public_opinion\nDB_USER=root\nDB_PASSWORD=\nUNRELATED_SECRET=compat-secret\n');
  const r = await license.executeFixture(s.envelope, s.key);
  assert.equal(r.status, 'ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS');
  const raw = JSON.parse(fs.readFileSync(r.output)); assert.equal(raw.configurationReads, 1); safe(raw);
});
