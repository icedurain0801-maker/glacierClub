'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..', '..');
const scripts = path.join(root, 'scripts', 'windows-services');
const serverFile = path.join(scripts, 'frontend3001-server.js');
const managerFile = path.join(scripts, 'manage-frontend3001.ps1');
const verifierFile = path.join(scripts, 'verify-frontend3001-release.js');
const builderFile = path.join(scripts, 'build-frontend3001-release.ps1');

function run(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
}

test('3000 QA configuration stays loopback-only and pins API plus health to 4320', () => {
  const server = fs.readFileSync(serverFile, 'utf8');
  const manager = fs.readFileSync(managerFile, 'utf8');
  assert.match(server, /\[3000, 3001\]\.includes\(listenPort\)/);
  assert.match(server, /requestUrl\.pathname === '\/health'/);
  assert.match(server, /requestUrl\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(server, /upstream\.port !== '4320'/);
  assert.doesNotMatch(server, /4321/);
  assert.match(manager, /ExpectedListenPort -eq 3000\) \{ '127\.0\.0\.1' \}/);
  assert.match(manager, /Apply only supports the resident frontend port 3001/);
  assert.doesNotMatch(manager, /4321/);
});

test('release verifier accepts the built contract and rejects a stale 4321 upstream', t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-f3000-contract-'));
  const release = path.join(fixtureRoot, 'release');
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const built = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', builderFile, '-SourceRoot', root, '-RuntimeRoot', release]);
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  const verified = run(process.execPath, [verifierFile, release]);
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);

  const runtimeServer = path.join(release, 'frontend3001-server.js');
  fs.writeFileSync(runtimeServer, fs.readFileSync(runtimeServer, 'utf8').replaceAll('4320', '4321'));
  const rejected = run(process.execPath, [verifierFile, release]);
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stdout}\n${rejected.stderr}`, /4320|4321/);
});

test('manager dry-run exposes 3000 without touching SCM or ProgramData', () => {
  const result = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', managerFile, '-Mode', 'DryRun', '-ListenPort', '3000']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /ListenPort=3000 upstreamOrigin=http:\/\/127\.0\.0\.1:4320/);
  assert.match(result.stdout, /No file, ACL, service, task, listener, process, or production configuration was changed/);
});
