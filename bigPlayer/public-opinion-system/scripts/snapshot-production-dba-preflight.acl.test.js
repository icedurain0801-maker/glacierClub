'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { secureEvidenceDir } = require('./snapshot-production-dba-preflight');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-dba-preflight-acl-'));
try {
  const { dir, who } = secureEvidenceDir(root);
  const resultPath = path.join(dir, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify({ status: 'NO_GO', productionTouched: false, credentialsSaved: false }) + '\n', { flag: 'wx' });
  const acl = spawnSync('icacls.exe', [dir], { encoding: 'utf8' });
  assert.equal(acl.status, 0);
  const list = acl.stdout.split(/\r?\n/).filter(value => value.includes(':(OI)(CI)'));
  assert.ok(list.every(value => !/\\(Users|Authenticated Users):/i.test(value)));
  assert.ok(list.some(value => value.includes('SYSTEM')));
  assert.ok(list.some(value => value.includes('Administrators')));
  assert.ok(list.some(value => value.toLowerCase().includes(who.toLowerCase())));
  assert.ok(fs.existsSync(resultPath));
  assert.match(fs.readFileSync(resultPath, 'utf8'), /credentialsSaved/);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(fs.existsSync(dir), false);
  let failedDir;
  assert.throws(() => secureEvidenceDir(root, (command) => {
    if (command === 'whoami.exe') return { status: 0, stdout: `${who}\n` };
    failedDir = fs.readdirSync(root).map(name => path.join(root, name))[0];
    return { status: 1, stdout: '' };
  }), /EVIDENCE_ACL_FAILED/);
  assert.equal(fs.existsSync(failedDir), false);
  const evidence = { status: 'PASS_LOCAL_PREFLIGHT_ACL', productionTouched: false, identities: list.length,
    evidenceWritten: true, successCleanupConfirmed: true, failureCleanupConfirmed: true };
  const evidenceRoot = path.resolve(__dirname, '../../..', '.temp/po-closeout-20261008');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidencePath = path.join(evidenceRoot, 'dba-preflight-acl-local-test.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ ...evidence, evidencePath }) + '\n');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
