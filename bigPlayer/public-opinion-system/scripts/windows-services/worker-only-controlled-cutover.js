'use strict';
// The sole cutover CLI. A non-fake apply remains unavailable until separately authorized.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { cutover } = require('./worker-only-cutover-transaction');
const { PIN: PINNED_WINSW_SHA256 } = require('./public-opinion-worker-only-adapter');
const { waitForMutationSafety } = require('./worker-mutation-safety');

const raw = process.argv.slice(2);
const args = Object.fromEntries(raw.filter(value => value.includes('=')).map(value => {
  const index = value.indexOf('='); return [value.slice(0, index), value.slice(index + 1)];
}));
const isPreflight = raw.includes('--preflight');
const apply = raw.includes('--apply');
const service = args['--service'] || 'PublicOpinionWorker';
const serviceRoot = args['--service-root'] || 'C:\\ProgramData\\PublicOpinion\\services';
const FIXED_SERVICE_ROOT = 'C:\\ProgramData\\PublicOpinion\\services';
const artifactKeys = ['candidate-wrapper', 'candidate-xml', 'candidate-release', 'worker-wrapper', 'worker-xml', 'api-wrapper', 'api-xml', 'verified-snapshot', 'env-file'];

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(); }
function reject(message) { const error = new Error(message); error.code = 'WORKER_ONLY_INPUT_REJECTED'; throw error; }
function regularNoReparse(value, label) {
  if (!value) reject(`${label} is required`);
  const file = path.resolve(value), stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) reject(`${label} must be a non-reparse regular file`);
  for (let current = file; ; current = path.dirname(current)) {
    const parent = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!parent || parent.isSymbolicLink()) reject(`${label} contains a reparse path`);
    const next = path.dirname(current); if (next === current) break;
  }
  return file;
}
function directoryNoReparse(value, label) {
  if (!value) reject(`${label} is required`);
  const directory = path.resolve(value), stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) reject(`${label} must be a non-reparse directory`);
  return directory;
}
function parseSnapshot(file) {
  try {
    // Windows PowerShell 5.1 writes UTF-8 with a BOM for the Stage C snapshot.
    // Accept exactly that one signature at this file boundary; JSON parsing stays
    // strict, so a repeated BOM, UTF-16 input, and malformed JSON still reject.
    let text = fs.readFileSync(file, 'utf8');
    if (text.startsWith('\uFEFF')) text = text.slice(1);
    return JSON.parse(text);
  } catch { reject('verified-snapshot must be valid JSON'); }
}
function verifyCandidateManifest(candidateRelease, manifestJson) {
  if (manifestJson.algorithm !== 'sha256' || manifestJson.kind !== 'worker' || !Array.isArray(manifestJson.files) || manifestJson.files.length === 0) reject('candidate manifest is not a non-empty Worker SHA-256 manifest');
  let hasWorkerEntry = false;
  for (const entry of manifestJson.files) {
    if (!entry || typeof entry.path !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256) || path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes('..')) reject('candidate manifest contains an invalid entry');
    const file = regularNoReparse(path.join(candidateRelease, entry.path), `candidate manifest entry ${entry.path}`);
    if (sha256(file) !== entry.sha256.toUpperCase()) reject(`candidate manifest hash mismatch: ${entry.path}`);
    if (entry.path.replaceAll('\\', '/') === 'worker/src/worker.js') hasWorkerEntry = true;
  }
  if (!hasWorkerEntry) reject('candidate manifest is missing worker/src/worker.js');
}
function verifyInputs(input, { fake = false } = {}) {
  const files = {};
  for (const key of ['candidate-wrapper', 'candidate-xml', 'worker-wrapper', 'worker-xml', 'api-wrapper', 'api-xml', 'verified-snapshot']) files[key] = regularNoReparse(input[`--${key}`], key);
  const candidateRelease = directoryNoReparse(input['--candidate-release'], 'candidate-release');
  const manifest = regularNoReparse(path.join(candidateRelease, 'package-worker-release-manifest.json'), 'candidate manifest');
  const workerEntry = regularNoReparse(path.join(candidateRelease, 'worker', 'src', 'worker.js'), 'candidate Worker entry');
  const snapshot = parseSnapshot(files['verified-snapshot']);
  if (snapshot.service !== 'PublicOpinionWorker') reject('verified-snapshot service mismatch');
  const map = { 'worker-wrapper': 'workerWrapper', 'worker-xml': 'workerXml', 'api-wrapper': 'apiWrapper', 'api-xml': 'apiXml' };
  for (const [key, snapshotKey] of Object.entries(map)) if (snapshot.sha256?.[snapshotKey] !== sha256(files[key])) reject(`verified-snapshot hash mismatch: ${key}`);
  if (snapshot.sha256?.candidateManifest !== sha256(manifest)) reject('verified-snapshot hash mismatch: candidate manifest');
  // Readiness must use the same existing service environment file which Stage C
  // verified and snapshotted.  Do not fall back to the caller's process env.
  const envFile = regularNoReparse(input['--env-file'], 'env-file');
  if (typeof snapshot.paths?.envFile !== 'string' || !snapshot.paths.envFile) reject('verified-snapshot env-file is missing');
  const snapshottedEnvFile = regularNoReparse(snapshot.paths.envFile, 'verified-snapshot env-file');
  if (!sameWindowsPath(envFile, snapshottedEnvFile)) reject('env-file does not match the verified service environment file');
  if (snapshot.sha256?.envFile !== sha256(envFile)) reject('verified-snapshot hash mismatch: env-file');
  const manifestJson = parseSnapshot(manifest);
  verifyCandidateManifest(candidateRelease, manifestJson);
  const expected = fake ? input['--fake-pinned-winsw-sha'] : PINNED_WINSW_SHA256;
  if (!expected || !/^[A-Fa-f0-9]{64}$/.test(expected) || sha256(files['candidate-wrapper']) !== expected.toUpperCase()) reject('candidate-wrapper SHA-256 mismatch');
  const result = { candidateWrapper: files['candidate-wrapper'], candidateXml: files['candidate-xml'], candidateRelease, candidateManifest: manifest, workerEntry, workerWrapper: files['worker-wrapper'], workerXml: files['worker-xml'], apiWrapper: files['api-wrapper'], apiXml: files['api-xml'], envFile };
  if (!fake) {
    if (!sameWindowsPath(result.workerWrapper, path.win32.join(FIXED_SERVICE_ROOT, 'PublicOpinionWorker.exe')) || !sameWindowsPath(result.workerXml, path.win32.join(FIXED_SERVICE_ROOT, 'PublicOpinionWorker.xml')) || !sameWindowsPath(result.apiWrapper, path.win32.join(FIXED_SERVICE_ROOT, 'PublicOpinionApi.exe')) || !sameWindowsPath(result.apiXml, path.win32.join(FIXED_SERVICE_ROOT, 'PublicOpinionApi.xml'))) reject('real preflight target is not the fixed Worker/API service material');
    const releases = path.win32.join(path.win32.dirname(FIXED_SERVICE_ROOT), 'releases').toLowerCase();
    if (!path.win32.normalize(candidateRelease).toLowerCase().startsWith(`${releases}\\`)) reject('candidate-release is outside the fixed release root');
  }
  return result;
}
function fakeInputs(root) {
  const p = name => path.join(root, name);
  for (const [name, value] of [['worker.exe', 'old-worker'], ['worker.xml', 'old-worker-xml'], ['api.exe', 'api'], ['api.xml', 'api-xml'], ['candidate.exe', 'fake-winsw'], ['candidate.xml', 'new-worker-xml']]) fs.writeFileSync(p(name), value);
  fs.mkdirSync(p('worker/src'), { recursive: true }); fs.writeFileSync(p('worker/src/worker.js'), "'use strict';\n");
  fs.writeFileSync(p('public-opinion.env'), 'PORT=4320\n');
  fs.writeFileSync(p('package-worker-release-manifest.json'), JSON.stringify({ algorithm: 'sha256', kind: 'worker', files: [{ path: 'worker/src/worker.js', sha256: sha256(p('worker/src/worker.js')) }] }));
  fs.writeFileSync(p('snapshot.json'), JSON.stringify({ service: 'PublicOpinionWorker', paths: { envFile: p('public-opinion.env') }, sha256: { workerWrapper: sha256(p('worker.exe')), workerXml: sha256(p('worker.xml')), apiWrapper: sha256(p('api.exe')), apiXml: sha256(p('api.xml')), candidateManifest: sha256(p('package-worker-release-manifest.json')), envFile: sha256(p('public-opinion.env')) } }));
  return { '--candidate-wrapper': p('candidate.exe'), '--candidate-xml': p('candidate.xml'), '--candidate-release': root, '--worker-wrapper': p('worker.exe'), '--worker-xml': p('worker.xml'), '--api-wrapper': p('api.exe'), '--api-xml': p('api.xml'), '--verified-snapshot': p('snapshot.json'), '--env-file': p('public-opinion.env'), '--fake-pinned-winsw-sha': sha256(p('candidate.exe')) };
}
function fakeInputArgs(root) {
  const generated = fakeInputs(root), supplied = Object.fromEntries(artifactKeys.map(key => [`--${key}`, args[`--${key}`]]).filter(([, value]) => value !== undefined));
  return { ...generated, ...supplied, ...(args['--fake-pinned-winsw-sha'] ? { '--fake-pinned-winsw-sha': args['--fake-pinned-winsw-sha'] } : {}) };
}
function realServiceRunner(command, commandArgs) {
  return childProcess.execFileSync(command, commandArgs, { encoding: 'utf8', windowsHide: true });
}
function sameWindowsPath(left, right) { return path.win32.normalize(left).toLowerCase() === path.win32.normalize(right).toLowerCase(); }
// This is the only Windows service controller.  The CLI deliberately does not
// instantiate it until a future explicit authorization branch is added.
function createPublicOpinionWorkerController({ wrapper, xml, runner = realServiceRunner, serviceName = 'PublicOpinionWorker', mutationWait = {} }) {
  if (serviceName !== 'PublicOpinionWorker') reject('controller service rejected');
  if (!wrapper || !xml) reject('controller Worker targets are required');
  if (runner === realServiceRunner && (!sameWindowsPath(wrapper, path.win32.join(FIXED_SERVICE_ROOT, 'PublicOpinionWorker.exe')) || !sameWindowsPath(xml, path.win32.join(FIXED_SERVICE_ROOT, 'PublicOpinionWorker.xml')))) reject('controller target is not the fixed PublicOpinionWorker service path');
  const invoke = (command, commandArgs) => runner(command, commandArgs);
  const controller = {
    wrapper, xml,
    state: () => /RUNNING/i.test(String(invoke('sc.exe', ['query', serviceName]))) ? 'Running' : 'Stopped',
    stop: async () => { invoke(wrapper, ['stop']); },
    awaitMutationSafe: async () => waitForMutationSafety({ wrapper, xml, serviceName, runner: invoke, ...mutationWait }),
    install: async () => { invoke(wrapper, ['install']); },
    start: async () => { invoke(wrapper, ['start']); }
  };
  controller.preflight = () => { if (controller.state() !== 'Running') reject('Worker service is not running at preflight'); };
  return controller;
}
function fakeServiceRunner(fault, calls) {
  let installs = 0, starts = 0;
  return (command, commandArgs) => {
    calls.push({ command: path.basename(command).toLowerCase(), args: commandArgs });
    if (command === 'sc.exe') { if (fault === 'preflight') throw Error('preflight'); return 'STATE              : 4  RUNNING'; }
    const action = commandArgs[0];
    if (action === 'stop' && fault === 'stop') throw Error('stop');
    if (action === 'install') { installs += 1; if ((fault === 'install' && installs === 1) || (fault === 'rollback' && installs === 2)) throw Error('install'); }
    if (action === 'start') { starts += 1; if (fault === 'start' && starts === 1) throw Error('start'); }
    return '';
  };
}
function createReadiness(input, { fake, fault }) {
  // An explicitly requested isolation readiness probe keeps fake service control
  // but runs the same read-only schema check against the snapshotted env file.
  // It is never available to a real controller or cutover apply.
  const isolatedReadiness = raw.includes('--isolation-readiness');
  if (isolatedReadiness && (!fake || !isPreflight)) reject('isolation-readiness requires fake read-only preflight');
  if (fake && !isolatedReadiness) return async () => { if (fault === 'readiness' || fault === 'rollback') throw Error('readiness'); };
  return async () => childProcess.execFileSync(process.execPath, [path.join(__dirname, 'worker-readiness.js'), input.candidateRelease, input.envFile], { encoding: 'utf8', windowsHide: true });
}
function controllerFor(input, { fake, fault = '', calls = [] }) {
  const controller = createPublicOpinionWorkerController({ wrapper: input.workerWrapper, xml: input.workerXml, runner: fake ? fakeServiceRunner(fault === 'switch' ? 'install' : fault, calls) : realServiceRunner });
  if (fake) {
    let gateAttempts = 0;
    controller.awaitMutationSafe = async stage => {
      gateAttempts += 1;
      calls.push({ command: 'mutation-gate', args: [stage, gateAttempts] });
      if (fault === 'lock-timeout' || (fault === 'rollback-lock-timeout' && stage === 'rollback')) {
        throw Object.assign(new Error('fake target remains locked'), { code: 'WORKER_MUTATION_GATE_TIMEOUT' });
      }
      if (fault === 'lock-delay' && gateAttempts === 1) await delay(5);
    };
  }
  return controller;
}
async function runPreflight(input, options) {
  const apiBefore = { wrapper: sha256(input.apiWrapper), xml: sha256(input.apiXml) };
  const worker = controllerFor(input, options); worker.preflight(); await createReadiness(input, options)();
  if (apiBefore.wrapper !== sha256(input.apiWrapper) || apiBefore.xml !== sha256(input.apiXml)) reject('API artifact changed during preflight');
  return { status: 'PASS', mode: options.fake ? 'fake-read-only-preflight' : 'read-only-worker-only-preflight', apiUnchanged: true, workerCalls: options.calls || [] };
}
async function applyCutover(input, options) {
  const worker = controllerFor(input, options);
  worker.preflight();
  return cutover({ api: { wrapper: input.apiWrapper, xml: input.apiXml, state: () => 'Running' }, worker, candidate: { wrapper: input.candidateWrapper, xml: fs.readFileSync(input.candidateXml, 'utf8'), release: input.candidateRelease }, readiness: createReadiness(input, options) });
}
function realApplyAuthorized() {
  return args['--controller'] === 'real' && process.env.PUBLIC_OPINION_WORKER_CUTOVER_AUTHORIZED === 'true' && args['--confirm'] && process.env.PUBLIC_OPINION_WORKER_CUTOVER_CONFIRM === args['--confirm'];
}
// API material is an observer-only input to the Worker transaction: its hashes
// are snapshotted before/after the operation, but it is never a deployment
// target.  Do not reject the two required observer arguments merely because
// their fixed filenames include "PublicOpinionApi".  Every other API/3001
// argument remains fail-closed so a caller cannot introduce an API source,
// destination, copy, switch, or service-control operation through this CLI.
function targetRejected() {
  if (service !== 'PublicOpinionWorker' || !/^C:\\ProgramData\\PublicOpinion\\services$/i.test(serviceRoot)) return true;
  return raw.some(value => {
    const equal = value.indexOf('=');
    const key = equal < 0 ? value : value.slice(0, equal);
    const argumentValue = equal < 0 ? '' : value.slice(equal + 1);
    if (key === '--api-wrapper' || key === '--api-xml') return false;
    return /(?:PublicOpinionApi|3001|(?:^|[-_])api(?:[-_]|$))/i.test(key)
      || /(?:PublicOpinionApi|3001)/i.test(argumentValue);
  });
}

if (targetRejected()) { console.error('WORKER_ONLY_TARGET_REJECTED'); process.exitCode = 5; }
else if (!isPreflight && !apply) { console.error('Use --preflight or --apply'); process.exitCode = 2; }
else if (apply && args['--controller'] !== 'fake' && !realApplyAuthorized()) {
  // This is intentionally before verifyInputs/controller construction and every service operation.
  console.error('REAL_APPLY_UNAUTHORIZED: single-use authorization and matching confirmation required'); process.exitCode = 3;
} else {
  const fake = args['--controller'] === 'fake', fault = args['--fault'] || '';
  const isolation = fake ? fs.mkdtempSync(path.join(args['--isolation-dir'] || os.tmpdir(), 'po-cli-fake-')) : null;
  try {
    const input = verifyInputs(fake ? fakeInputArgs(isolation) : args, { fake }); const calls = [];
    const options = { fake, fault, calls };
    const operation = isPreflight ? runPreflight(input, options) : applyCutover(input, options);
    Promise.resolve(operation).then(result => {
      // The preflight helper and transaction already verify API hashes. The output is intentionally scalar for CI.
      console.log(JSON.stringify({ mode: fake ? 'fake' : 'real', ...result, apiUnchanged: true, workerCalls: calls }));
    }).catch(error => { console.error(`${error.code || 'WORKER_ONLY_INPUT_REJECTED'}: ${error.message}`); process.exitCode = 4; })
      .finally(() => { if (isolation) fs.rmSync(isolation, { recursive: true, force: true }); });
  } catch (error) { console.error(`${error.code || 'WORKER_ONLY_INPUT_REJECTED'}: ${error.message}`); if (isolation) fs.rmSync(isolation, { recursive: true, force: true }); process.exitCode = 4; }
}

module.exports = { createPublicOpinionWorkerController, verifyInputs, waitForMutationSafety };
