'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { prepareLocalPreflight, writeEvidence } = require('./snapshot-production-dba-preflight');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-dba-preflight-acl-'));
const originalReadFile = fs.readFileSync;
const originalConnect = mysql.createConnection;
let credentialReads = 0;
let databaseConnections = 0;
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
  assert.equal(commands, 0);
  assert.equal(credentialReads, 0);
  assert.equal(databaseConnections, 0);
  fs.readFileSync = originalReadFile;
  mysql.createConnection = originalConnect;
  const evidence = { status: 'PASS_LOCAL_PREFLIGHT_ACL', productionTouched: false, identities: list.length,
    evidenceWritten: true, successCleanupConfirmed: true, failureCleanupConfirmed: true,
    credentialReads, databaseConnections, staticTargetRejectedBeforeAcl: commands === 0 };
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
