'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { prepareLocalPreflight, writeEvidence, runPreflight } = require('./snapshot-production-dba-preflight');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-dba-preflight-acl-'));
const originalReadFile = fs.readFileSync;
const originalConnect = mysql.createConnection;
let credentialReads = 0;
let databaseConnections = 0;

async function main() {
try {
  fs.readFileSync = () => { credentialReads++; throw new Error('CREDENTIAL_READ_FORBIDDEN'); };
  mysql.createConnection = () => { databaseConnections++; throw new Error('DATABASE_CONNECT_FORBIDDEN'); };
  const { dir, who } = prepareLocalPreflight({ root });
  const resultPath = path.join(dir, 'result.json');
  writeEvidence(resultPath, { status: 'NO_GO', productionTouched: false, code: 'LOCAL_ONLY' });
  const acl = spawnSync('icacls.exe', [dir], { encoding: 'utf8' });
  assert.equal(acl.status, 0);
  const list = acl.stdout.split(/\r?\n/).filter(value => value.includes(':(OI)(CI)'));
  assert.ok(list.every(value => !/\\(Users|Authenticated Users):/i.test(value)));
  assert.ok(list.some(value => value.includes('SYSTEM')));
  assert.ok(list.some(value => value.includes('Administrators')));
  assert.ok(list.some(value => value.toLowerCase().includes(who.toLowerCase())));
  assert.ok(fs.existsSync(resultPath));
  assert.throws(() => writeEvidence(path.join(dir, 'forbidden.json'), { status: 'NO_GO', password: 'forbidden' }), /EVIDENCE_OUTPUT_NOT_ALLOWED/);
  assert.throws(() => writeEvidence(path.join(dir, 'nested-forbidden.json'), { status: 'NO_GO', target: { datadir: 'forbidden' } }), /EVIDENCE_OUTPUT_NOT_ALLOWED/);
  assert.equal(fs.existsSync(path.join(dir, 'forbidden.json')), false);
  fs.readFileSync = originalReadFile;
  assert.match(fs.readFileSync(resultPath, 'utf8'), /LOCAL_ONLY/);
  fs.readFileSync = () => { credentialReads++; throw new Error('CREDENTIAL_READ_FORBIDDEN'); };
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(fs.existsSync(dir), false);
  let failedDir;
  assert.throws(() => prepareLocalPreflight({ root, runCommand: (command) => {
    if (command === 'whoami.exe') return { status: 0, stdout: `${who}\n` };
    failedDir = fs.readdirSync(root).map(name => path.join(root, name))[0];
    return { status: 1, stdout: '' };
  } }), /EVIDENCE_ACL_FAILED/);
  assert.equal(fs.existsSync(failedDir), false);
  let commands = 0;
  assert.throws(() => prepareLocalPreflight({ root, target: { hostname: 'unexpected' },
    runCommand: () => { commands++; return { status: 0 }; } }), /STATIC_TARGET_MISMATCH/);
  assert.throws(() => prepareLocalPreflight({ root, target: {
    connectHost: 'localhost', hostname: 'LIUFUYI-2-48', port: 3306, serverId: 1,
    datadirHash: '41c80186c8f3e3e677308d5a4e427afac2bb32d4ffe158561389aaf62a63ba4a',
    version: '10.4.14-MariaDB', database: 'public_opinion'
  }, runCommand: () => { commands++; return { status: 0 }; } }), /STATIC_TARGET_MISMATCH/);
  assert.equal(commands, 0);
  assert.equal(credentialReads, 0);
  assert.equal(databaseConnections, 0);
  fs.readFileSync = originalReadFile;
  mysql.createConnection = originalConnect;

  const fixture = path.join(root, 'fixture.env');
  const runCase = async (host, connect, port = '3306', osQuery = () => []) => {
    fs.writeFileSync(fixture, `DB_HOST=${host}\nDB_PORT=${port}\nDB_NAME=public_opinion\nDB_USER=fake\nDB_PASSWORD=do-not-print\n`);
    const caseRoot = fs.mkdtempSync(path.join(root, 'case-'));
    const result = await runPreflight({ root: caseRoot, envPath: fixture, connect, osQuery });
    const saved = fs.readFileSync(path.join(result.dir, 'result.json'), 'utf8');
    assert.equal(saved.includes('do-not-print'), false);
    assert.equal(saved.includes('C:/xampp/mysql/data'), false);
    assert.deepEqual(JSON.parse(saved), result.evidence);
    const caseAcl = spawnSync('icacls.exe', [result.dir], { encoding: 'utf8' });
    assert.equal(caseAcl.status, 0);
    assert.doesNotMatch(caseAcl.stdout, /\(I\)\(OI\)\(CI\)/);
    return result;
  };

  let connects = 0;
  const config = await runCase('localhost', async () => { connects++; throw new Error('SHOULD_NOT_CONNECT'); });
  assert.equal(config.evidence.code, 'TARGET_CONFIG_MISMATCH');
  assert.equal(config.evidence.phase, 'CONFIG_VALIDATION');
  assert.equal(config.evidence.connectionAttempts, 0);
  assert.equal(config.evidence.queryAttempts, 0);
  assert.equal(config.evidence.productionReadAttempted, false);
  assert.equal(connects, 0);
  const portAlias = await runCase('127.0.0.1', async () => { connects++; throw new Error('SHOULD_NOT_CONNECT'); }, '03306');
  assert.equal(portAlias.evidence.code, 'TARGET_CONFIG_MISMATCH');
  assert.equal(portAlias.evidence.connectionAttempts, 0);
  assert.equal(portAlias.evidence.queryAttempts, 0);
  assert.equal(connects, 0);

  const connectFailure = await runCase('127.0.0.1', async () => { connects++; throw new Error('password=do-not-print'); });
  assert.equal(connectFailure.evidence.code, 'DATABASE_CONNECT_FAILED');
  assert.equal(connectFailure.evidence.phase, 'CONNECT');
  assert.equal(connectFailure.evidence.connectionAttempts, 1);
  assert.equal(connectFailure.evidence.queryAttempts, 0);
  assert.equal(connectFailure.evidence.productionReadAttempted, true);

  const identity = { currentUser: 'fake@localhost', currentRole: null, hostname: 'LIUFUYI-2-48',
    port: 3306, serverId: 1, datadir: 'C:/xampp/mysql/data/', version: '10.4.14-MariaDB',
    databaseName: 'public_opinion', readOnly: 0 };
  const fingerprintMutations = [
    { hostname: 'other' }, { port: 3307 }, { serverId: 2 },
    { datadir: 'C:/xampp/mysql/other/' }, { version: 'other' }, { databaseName: 'other' }
  ];
  for (const mutation of fingerprintMutations) {
    let identityQueries = 0;
    const identityFailure = await runCase('127.0.0.1', async () => ({
      query: async ({ sql }) => {
        identityQueries++;
        assert.match(sql, /@@datadir/);
        assert.doesNotMatch(sql, /CURRENT_USER|CONNECTION_ID/);
        return [[{ ...identity, ...mutation }]];
      },
      end: async () => {}
    }));
    assert.equal(identityFailure.evidence.code, 'TARGET_IDENTITY_MISMATCH');
    assert.equal(identityFailure.evidence.phase, 'IDENTITY');
    assert.equal(identityFailure.evidence.connectionAttempts, 1);
    assert.equal(identityFailure.evidence.queryAttempts, 1);
    assert.equal(identityQueries, 1);
  }

  const queryOrder = [];
  const laterFailure = await runCase('127.0.0.1', async () => ({
    query: async ({ sql }) => {
      queryOrder.push(sql);
      if (queryOrder.length === 1) return [[identity]];
      throw new Error('password=do-not-print');
    },
    end: async () => {}
  }));
  assert.equal(laterFailure.evidence.code, 'DATABASE_QUERY_FAILED');
  assert.equal(laterFailure.evidence.phase, 'PRIVILEGES');
  assert.equal(laterFailure.evidence.connectionAttempts, 1);
  assert.equal(laterFailure.evidence.queryAttempts, 2);
  assert.match(queryOrder[0], /@@datadir/);
  assert.match(queryOrder[1], /CURRENT_USER/);
  assert.equal(laterFailure.evidence.identity.datadirMatches, true);

  const responses = [
    [identity], [{ currentUser: 'fake@localhost', currentRole: null, readOnly: 0 }],
    [], [], [], [], [{ n: 0, maxAgeSeconds: 0, rowsModified: 0, rowsLocked: 0 }],
    [{ n: 0, bytes: 0 }], [{ type: 'TRIGGER', n: 0 }, { type: 'ROUTINE', n: 0 }, { type: 'EVENT', n: 0 }],
    [], [{ scheduleLeases: 0, workerLeases: 0, recentHeartbeats: 0 }],
    [{ eventScheduler: 'OFF' }], [], []
  ];
  const makeFullConnection = () => {
    let index = 0;
    return { query: async () => [responses[index++]], end: async () => {} };
  };
  const osFailure = await runCase('127.0.0.1', async () => makeFullConnection(), '3306',
    () => { throw new Error('password=do-not-print'); });
  assert.equal(osFailure.evidence.code, 'OS_STATE_FAILED');
  assert.equal(osFailure.evidence.phase, 'OS_STATE');
  assert.equal(osFailure.evidence.connectionAttempts, 1);
  assert.equal(osFailure.evidence.queryAttempts, responses.length);

  const complete = await runCase('127.0.0.1', async options => {
    assert.deepEqual({ host: options.host, port: options.port, database: options.database },
      { host: '127.0.0.1', port: 3306, database: 'public_opinion' });
    return makeFullConnection();
  });
  assert.equal(complete.failed, false);
  assert.equal(complete.evidence.phase, 'COMPLETE');
  assert.equal(complete.evidence.connectionAttempts, 1);
  assert.equal(complete.evidence.queryAttempts, responses.length);
  assert.equal(complete.evidence.productionReadAttempted, true);

  const evidence = { status: 'PASS_LOCAL_PREFLIGHT_ACL', productionTouched: false, identities: list.length,
    evidenceWritten: true, successCleanupConfirmed: true, failureCleanupConfirmed: true,
    credentialReads, databaseConnections, staticTargetRejectedBeforeAcl: commands === 0,
    fakeConnectionCases: 12, fingerprintMutationsRejected: fingerprintMutations.length,
    configAttempts: [config.evidence.connectionAttempts, config.evidence.queryAttempts],
    connectFailureAttempts: [connectFailure.evidence.connectionAttempts, connectFailure.evidence.queryAttempts],
    identityFailureAttempts: [1, 1],
    laterFailureAttempts: [laterFailure.evidence.connectionAttempts, laterFailure.evidence.queryAttempts],
    osFailureAttempts: [osFailure.evidence.connectionAttempts, osFailure.evidence.queryAttempts],
    completeAttempts: [complete.evidence.connectionAttempts, complete.evidence.queryAttempts] };
  const evidenceRoot = path.resolve(__dirname, '../../..', '.temp/po-closeout-20261008');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidencePath = path.join(evidenceRoot, 'dba-preflight-acl-local-test.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ ...evidence, evidencePath }) + '\n');
} finally {
  fs.readFileSync = originalReadFile;
  mysql.createConnection = originalConnect;
  fs.rmSync(root, { recursive: true, force: true });
}
}

main().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
