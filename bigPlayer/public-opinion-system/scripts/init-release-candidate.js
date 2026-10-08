#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('arguments must be --key value pairs');
    out[key.slice(2)] = argv[i + 1];
  }
  return out;
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(); }
function json(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function walk(root) { return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => { const p = path.join(root, entry.name); return entry.isDirectory() ? walk(p) : [p]; }); }
function relativeRequireClosure(root) {
  const missing = [];
  for (const file of walk(root).filter(x => /\.(?:js|cjs|mjs|json)$/.test(x))) {
    const source = fs.readFileSync(file, 'utf8');
    const requests = [];
    for (const match of source.matchAll(/(?:require\s*\(|from\s+|import\s*\()\s*['"](\.[^'"]+)['"]/g)) requests.push(match[1]);
    for (const request of requests) {
      const base = path.resolve(path.dirname(file), request);
      if (base !== root && !base.startsWith(`${root}${path.sep}`)) { missing.push(`external:${request}`); continue; }
      const candidates = [base, ...['.js', '.cjs', '.mjs', '.json'].map(ext => `${base}${ext}`), path.join(base, 'index.js'), path.join(base, 'index.json')];
      if (!candidates.some(fs.existsSync)) missing.push(path.relative(root, base));
    }
  }
  if (missing.length) throw new Error(`missing relative payload dependencies: ${missing.join(', ')}`);
}
function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return (result.stdout || '').trim();
}
function validateRollbackDryRun(files, cwd, workerEvidence) {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  for (const file of files) {
    const rollback = file.rollback || {};
    if (rollback.object === 'test-only payload' && rollback.restoreCommand === 'remove test-only payload') continue;
    if (rollback.object === 'candidate-only preflight script' && rollback.restoreCommand === 'remove release-readonly-preflight.ps1') continue;
    const match = String(rollback.restoreCommand || '').match(/^Copy-Item -LiteralPath '(.+)' -Destination '(.+)' -Force$/);
    if (!match || path.resolve(match[1]) !== path.resolve(rollback.object) || path.normalize(match[2]).replaceAll('\\', '/') !== file.target) throw new Error(`rollback command/object/target mismatch: ${file.target}`);
    if (!fs.existsSync(match[1]) || !fs.statSync(match[1]).isFile()) throw new Error(`rollback object unavailable: ${match[1]}`);
    if (rollback.sha256 && sha(match[1]) !== String(rollback.sha256).toUpperCase()) throw new Error(`rollback hash mismatch: ${file.target}`);
    run(shell, ['-NoProfile', '-NonInteractive', '-Command', `Copy-Item -LiteralPath ${quote(match[1])} -Destination ${quote(match[2])} -Force -WhatIf`], cwd);
  }
  if (!workerEvidence?.rollbackCommand) throw new Error('worker rollback command missing');
  const workerMatch = workerEvidence.rollbackCommand.match(/^Copy-Item -LiteralPath '(.+)' -Destination '(.+)' -Force$/);
  if (!workerMatch || path.resolve(workerMatch[1]) !== path.resolve(workerEvidence.rollbackWorkerPath) || path.resolve(workerMatch[2]) !== path.resolve(workerEvidence.path)) throw new Error('worker rollback command/path mismatch');
  run(shell, ['-NoProfile', '-NonInteractive', '-Command', `Copy-Item -LiteralPath ${quote(workerMatch[1])} -Destination ${quote(workerMatch[2])} -Force -WhatIf`], cwd);
}
function runPreflight(file, cwd, expected) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('Invoke-WebRequest') || !text.includes('writesPerformed')) throw new Error('preflight script is not a read-only health/ready probe');
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, '-TargetServiceAccount', 'candidate-test', '-TargetServicePath', cwd, '-WorkerPath', 'payload/worker', '-ApiBaseUrl', 'http://127.0.0.1:1', '-CandidateId', expected.candidateId, '-EvidenceId', expected.evidenceId, '-SourceCommit', expected.sourceCommit], { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0 || !/writesPerformed\s*[=:]\s*\$?false/i.test(result.stdout || '')) throw new Error(`preflight execution failed or did not report writesPerformed=false: ${(result.stderr || result.stdout || '').trim()}`);
  let evidence; try { evidence = JSON.parse((result.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1)); } catch { throw new Error('preflight did not emit JSON evidence'); }
  const required = ['platform', 'subject', 'candidateId', 'evidenceId', 'sourceCommit', 'workerPath', 'dbHostFingerprint', 'dbNameFingerprint'];
  if (required.some(key => !evidence[key])) throw new Error('preflight evidence missing required worker/DB contract field');
  if (evidence.platform !== 'bigplayer_h5' || evidence.subject !== 'account') throw new Error('preflight evidence has invalid platform or credential subject');
  if (evidence.candidateId !== expected.candidateId || evidence.evidenceId !== expected.evidenceId || evidence.sourceCommit !== expected.sourceCommit) throw new Error('preflight evidence identity mismatch');
  if (evidence.workerPath !== 'payload/worker' || !/^[a-f0-9]{16,64}$/i.test(evidence.dbHostFingerprint) || !/^[a-f0-9]{16,64}$/i.test(evidence.dbNameFingerprint)) throw new Error('preflight worker path or DB fingerprint contract mismatch');
  if (evidence.platform !== expected.workerEvidence.platform || evidence.subject !== expected.workerEvidence.subject || evidence.dbHostFingerprint.toUpperCase() !== expected.dbFingerprints.dbHost || evidence.dbNameFingerprint.toUpperCase() !== expected.dbFingerprints.dbName) throw new Error('preflight evidence does not match worker evidence/config');
}
function required(a, key) { if (!a[key]) throw new Error(`missing --${key}`); return a[key]; }
function readWorkerEvidence(file, sourceCommit) {
  let value;
  try { value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (error) { throw new Error(`worker evidence unreadable: ${error.message}`); }
  const requiredFields = ['platform', 'subject', 'commit', 'path', 'dbHost', 'dbName', 'rollbackReleasePath', 'rollbackWorkerPath', 'rollbackWorkerSha256', 'rollbackCommand'];
  const missing = requiredFields.filter(field => !String(value?.[field] || '').trim());
  if (missing.length) throw new Error(`worker evidence missing fields: ${missing.join(', ')}`);
  if (value.platform !== 'bigplayer_h5') throw new Error(`worker platform mismatch: ${value.platform}`);
  if (value.subject !== 'account') throw new Error(`worker credential subject mismatch: ${value.subject}`);
  if (/taptap/i.test(value.path)) throw new Error('worker path points to TapTap release');
  if (!fs.existsSync(value.path) || !fs.statSync(value.path).isFile()) throw new Error(`worker target path does not exist: ${value.path}`);
  if (value.commit !== sourceCommit) throw new Error(`worker commit mismatch: ${value.commit}`);
  if (Object.keys(value).some(key => /secret|token|password|cipher/i.test(key))) throw new Error('worker evidence must not contain secret fields');
  if (!fs.existsSync(value.rollbackReleasePath) || !fs.statSync(value.rollbackReleasePath).isDirectory()) throw new Error(`rollback release path does not exist: ${value.rollbackReleasePath}`);
  if (!fs.existsSync(value.rollbackWorkerPath) || !fs.statSync(value.rollbackWorkerPath).isFile()) throw new Error(`rollback worker path does not exist: ${value.rollbackWorkerPath}`);
  const rollbackRoot = path.resolve(value.rollbackReleasePath);
  if (!path.resolve(value.rollbackWorkerPath).startsWith(`${rollbackRoot}${path.sep}`)) throw new Error('rollback worker path is outside release');
  if (!/^[a-f0-9]{16,64}$/i.test(value.rollbackWorkerSha256)) throw new Error('rollback worker hash is invalid');
  if (sha(value.rollbackWorkerPath) !== value.rollbackWorkerSha256.toUpperCase()) throw new Error('rollback worker hash mismatch');
  if (value.rollbackCommand !== `Copy-Item -LiteralPath '${value.rollbackWorkerPath}' -Destination '${value.path}' -Force`) throw new Error('rollback command must be the exact worker restore command');
  if (/^sha256:(?:0123456789abcdef|fedcba9876543210)$/i.test(value.dbHost) || /^sha256:(?:0123456789abcdef|fedcba9876543210)$/i.test(value.dbName)) throw new Error('DB fingerprints are placeholders');
  return { platform: value.platform, subject: value.subject, commit: value.commit, path: value.path, dbHost: value.dbHost, dbName: value.dbName, rollbackReleasePath: value.rollbackReleasePath, rollbackWorkerPath: value.rollbackWorkerPath, rollbackWorkerSha256: value.rollbackWorkerSha256, rollbackCommand: value.rollbackCommand };
}
function configFingerprints(file) {
  const values = {};
  for (const line of fs.readFileSync(path.resolve(file), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(DB_HOST|DB_NAME)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  if (!values.DB_HOST || !values.DB_NAME) throw new Error('DB config must provide DB_HOST and DB_NAME');
  return { dbHost: shaValue(values.DB_HOST), dbName: shaValue(values.DB_NAME) };
}
function shaValue(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }

function main() {
  const a = args(process.argv);
  const candidateId = required(a, 'candidateId');
  const parentEvidence = required(a, 'parentEvidence');
  const sourceCommit = required(a, 'sourceCommit');
  const targetPlatform = a.targetPlatform || 'bigplayer_h5';
  const rollbackBaseline = a.rollbackBaseline || 'pre-bigplayer-taptap-formal1';
  if (targetPlatform !== 'bigplayer_h5') throw new Error(`targetPlatform must be bigplayer_h5, got ${targetPlatform}`);
  if (rollbackBaseline !== 'pre-bigplayer-taptap-formal1') throw new Error(`rollbackBaseline must be pre-bigplayer-taptap-formal1, got ${rollbackBaseline}`);
  const workerEvidencePath = required(a, 'workerEvidence');
  const dbConfigPath = required(a, 'dbConfig');
  const payloadRoot = path.resolve(required(a, 'payloadRoot'));
  const targetRoot = path.resolve(required(a, 'targetRoot'));
  if (!fs.existsSync(payloadRoot) || !fs.statSync(payloadRoot).isDirectory()) throw new Error('payloadRoot must be a directory');
  if (fs.existsSync(targetRoot)) throw new Error(`targetRoot already exists: ${targetRoot}`);
  if (path.basename(targetRoot) !== candidateId) throw new Error('candidateId must equal targetRoot basename');
  const workerEvidence = readWorkerEvidence(workerEvidencePath, sourceCommit);
  const dbFingerprints = configFingerprints(dbConfigPath);
  if (workerEvidence.dbHost.replace(/^sha256:/i, '').toUpperCase() !== dbFingerprints.dbHost || workerEvidence.dbName.replace(/^sha256:/i, '').toUpperCase() !== dbFingerprints.dbName) throw new Error('worker evidence DB fingerprint mismatch with config');
  const evidenceId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${candidateId}`;
  const temporary = `${targetRoot}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.mkdirSync(temporary, { recursive: true });
  try {
    fs.cpSync(payloadRoot, path.join(temporary, 'payload'), { recursive: true, errorOnExist: true });
    for (const file of walk(path.join(temporary, 'payload')).filter(x => /\.(?:js|cjs|mjs|json|md|ps1)$/.test(x))) {
      if (/v334b?/i.test(fs.readFileSync(file, 'utf8'))) throw new Error(`legacy candidate identity found in payload: ${path.relative(temporary, file)}`);
    }
    relativeRequireClosure(path.join(temporary, 'payload'));
    const tests = walk(path.join(temporary, 'payload')).filter(x => x.endsWith('.test.js'));
    if (!tests.length) throw new Error('payload contains no .test.js files');
    run(process.execPath, ['--test', ...tests], temporary);
    const sourcePreflight = path.join(path.dirname(payloadRoot), 'release-readonly-preflight.ps1');
    const preflight = path.join(temporary, 'release-readonly-preflight.ps1');
    if (!fs.existsSync(sourcePreflight)) throw new Error('release-readonly-preflight.ps1 is missing beside payloadRoot');
    fs.copyFileSync(sourcePreflight, preflight);
    runPreflight(preflight, temporary, { candidateId, evidenceId, sourceCommit, workerEvidence, dbFingerprints });
    const files = walk(path.join(temporary, 'payload')).map(file => {
      const payload = path.relative(temporary, file).replaceAll('\\', '/');
      const target = path.relative(temporary, file).replace(/^payload[\\/]/, '').replaceAll('\\', '/');
      if (file.includes(`${path.sep}test${path.sep}`)) return { payload, target, sha256: sha(file), rollback: { object: 'test-only payload', restoreCommand: 'remove test-only payload' } };
      const previousPath = path.join(workerEvidence.rollbackReleasePath, target);
      if (!fs.existsSync(previousPath) || !fs.statSync(previousPath).isFile()) throw new Error(`rollback object missing for ${target}: ${previousPath}`);
      return { payload, target, sha256: sha(file), rollback: { object: previousPath, sha256: sha(previousPath), restoreCommand: `Copy-Item -LiteralPath '${previousPath}' -Destination '${target}' -Force` } };
    });
    files.push({ payload: 'release-readonly-preflight.ps1', target: 'release-readonly-preflight.ps1', sha256: sha(preflight), rollback: { object: 'candidate-only preflight script', restoreCommand: 'remove release-readonly-preflight.ps1' } });
    if (files.some(file => !file.rollback?.object || !file.rollback?.restoreCommand)) throw new Error('rollback mapping incomplete');
    validateRollbackDryRun(files, temporary, workerEvidence);
    const closure = { evidenceId, sourceEvidenceId: parentEvidence, sourceCommit, payloadRoot: 'payload/', files };
    json(path.join(temporary, 'formal-file-closure.json'), closure);
    json(path.join(temporary, 'rollback-plan.json'), { candidateId, rollbackObjects: [...new Set(files.map(x => x.rollback))], policy: 'restore prior release; no service switch or database write by initializer' });
    json(path.join(temporary, 'manifest.json'), { candidateId, status: 'READY_FOR_RELEASE_PREFLIGHT', evidenceId, parentEvidenceId: parentEvidence, sourceCommit, targetPlatform, rollbackBaseline, workerEvidence, payload: files.map(x => x.payload), files: ['formal-file-closure.json', 'rollback-plan.json', 'manifest.json', 'provenance.json', 'checksums.sha256', 'READY.json', 'release-readonly-preflight.ps1'] });
    json(path.join(temporary, 'provenance.json'), { candidateId, evidenceId, parentEvidenceId: parentEvidence, sourceCommit, targetPlatform, rollbackBaseline, workerEvidence, payloadRoot: 'payload/', initialization: 'scripts/init-release-candidate.js', executionPolicy: { serviceStarted: false, databaseTouched: false, productionEndpointAccessed: false, realRunExecuted: false } });
    const ready = { status: 'READY_FOR_RELEASE_PREFLIGHT', candidateId, evidenceId, parentEvidenceId: parentEvidence, sourceCommit, targetPlatform, rollbackBaseline, workerEvidence, selfContainedPayload: 'payload/', tests: { command: 'node --test payload/**/*.test.js', status: 'PASS' }, preflight: { script: 'release-readonly-preflight.ps1', status: 'EXECUTED_PASS' }, checksums: 'checksums.sha256', safety: { serviceStarted: false, databaseTouched: false, productionEndpointAccessed: false, realRunExecuted: false } };
    json(path.join(temporary, 'READY.json'), ready);
    const checksumFiles = walk(temporary).filter(file => path.basename(file) !== 'checksums.sha256');
    const checksumLines = checksumFiles.map(file => `${sha(file)}  ${path.relative(temporary, file).replaceAll('\\', '/')}`).sort();
    if (a.simulateHashMismatch === 'true') checksumLines[0] = `${'0'.repeat(64)}  ${checksumLines[0].split(/\s+/).slice(1).join(' ')}`;
    fs.writeFileSync(path.join(temporary, 'checksums.sha256'), `${checksumLines.join('\n')}\n`);
    for (const line of fs.readFileSync(path.join(temporary, 'checksums.sha256'), 'utf8').trim().split(/\r?\n/)) {
      const [expected, ...rest] = line.split(/\s+/); const relative = rest.join(' ');
      if (sha(path.join(temporary, relative)) !== expected) throw new Error(`checksum mismatch ${relative}`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(temporary, 'manifest.json')));
    const provenance = JSON.parse(fs.readFileSync(path.join(temporary, 'provenance.json')));
    const readyCheck = JSON.parse(fs.readFileSync(path.join(temporary, 'READY.json')));
    if (![manifest, provenance, readyCheck].every(item => item.candidateId === candidateId && item.evidenceId === evidenceId && item.targetPlatform === targetPlatform && item.rollbackBaseline === rollbackBaseline && JSON.stringify(item.workerEvidence) === JSON.stringify(workerEvidence))) throw new Error('candidate identity/target/rollback cross-reference mismatch');
    fs.renameSync(temporary, targetRoot);
    console.log(JSON.stringify({ status: 'PASS', candidateId, evidenceId, targetRoot }, null, 2));
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

try { main(); } catch (error) { console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2)); process.exitCode = 1; }
