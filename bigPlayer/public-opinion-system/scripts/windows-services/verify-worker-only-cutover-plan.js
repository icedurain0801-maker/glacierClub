'use strict';

// Read-only gate for a future Worker-only cutover. This file intentionally has
// no service, copy, delete, install, start, stop, or restart operation.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PINNED_WINSW_SHA256 = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA';

function fail(message) { throw new Error(`WORKER_ONLY_CUTOVER_PREFLIGHT: ${message}`); }
function absolute(value, label) { if (!value) fail(`${label} is required`); return path.resolve(value); }
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(); }
function regularFile(file, label) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a non-link regular file: ${file}`);
  return file;
}
function directory(dir, label) {
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a non-link directory: ${dir}`);
  return dir;
}
function inside(parent, child) { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function xmlValue(xml, tag) { return (xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i')) || [])[1] || ''; }
function xmlAttribute(xml, name) { return (xml.match(new RegExp(`<env\\s+name=["']${name}["']\\s+value=["']([^"']+)["']`, 'i')) || [])[1] || ''; }

function verifyCandidateRelease(candidateRelease, sourceRoot) {
  const verifier = path.join(__dirname, 'verify-worker-release.js');
  execFileSync(process.execPath, [verifier, candidateRelease, sourceRoot], { stdio: 'pipe' });
}

function verifyWorkerOnlyCutoverPlan(options, dependencies = {}) {
  const candidateRelease = directory(absolute(options.candidateRelease, 'candidateRelease'), 'candidateRelease');
  const sourceRoot = directory(absolute(options.sourceRoot, 'sourceRoot'), 'sourceRoot');
  const candidateWinSW = regularFile(absolute(options.candidateWinSW || options.candidateWinSw, 'candidateWinSW'), 'candidateWinSW');
  const rollbackWrapper = regularFile(absolute(options.rollbackWrapper, 'rollbackWrapper'), 'rollbackWrapper');
  const rollbackXml = regularFile(absolute(options.rollbackXml, 'rollbackXml'), 'rollbackXml');
  const apiWrapper = regularFile(absolute(options.apiWrapper, 'apiWrapper'), 'apiWrapper');
  const apiXml = regularFile(absolute(options.apiXml, 'apiXml'), 'apiXml');
  const workerEntry = regularFile(path.join(candidateRelease, 'worker', 'src', 'worker.js'), 'candidate Worker entry');
  const manifest = regularFile(path.join(candidateRelease, 'package-worker-release-manifest.json'), 'candidate manifest');
  if ([candidateWinSW, rollbackWrapper, rollbackXml].some(item => item === apiWrapper || item === apiXml)) fail('Worker material must not reuse an API wrapper or XML path');
  if (inside(candidateRelease, apiWrapper) || inside(candidateRelease, apiXml)) fail('candidateRelease must not contain API wrapper/XML');

  const apiBefore = { wrapper: digest(apiWrapper), xml: digest(apiXml) };
  const candidateWinSWHash = digest(candidateWinSW);
  const expectedWinSWHash = dependencies.expectedWinSWHash || PINNED_WINSW_SHA256;
  if (candidateWinSWHash !== expectedWinSWHash) fail(`candidateWinSW SHA-256 mismatch: ${candidateWinSWHash}`);
  const rollbackXmlText = fs.readFileSync(rollbackXml, 'utf8');
  if (xmlValue(rollbackXmlText, 'id') !== 'PublicOpinionWorker') fail('rollbackXml must identify PublicOpinionWorker');
  if (!/worker\\src\\worker\.js/i.test(xmlValue(rollbackXmlText, 'arguments'))) fail('rollbackXml must target worker/src/worker.js');
  if (!xmlAttribute(rollbackXmlText, 'BUILD_SHA')) fail('rollbackXml is missing BUILD_SHA');
  const releaseVerifier = dependencies.releaseVerifier || verifyCandidateRelease;
  releaseVerifier(candidateRelease, sourceRoot);
  const apiAfter = { wrapper: digest(apiWrapper), xml: digest(apiXml) };
  if (apiBefore.wrapper !== apiAfter.wrapper || apiBefore.xml !== apiAfter.xml) fail('API artifact changed during read-only preflight');
  return {
    status: 'PASS',
    mode: 'read-only-worker-only-cutover-preflight',
    candidate: { release: candidateRelease, workerEntrySha256: digest(workerEntry), manifestSha256: digest(manifest), winSWSource: candidateWinSW, winSWSourceSha256: candidateWinSWHash },
    rollback: { wrapper: rollbackWrapper, wrapperSha256: digest(rollbackWrapper), xml: rollbackXml, xmlSha256: digest(rollbackXml) },
    apiUntouched: { wrapper: apiWrapper, wrapperSha256: apiAfter.wrapper, xml: apiXml, xmlSha256: apiAfter.xml },
    prohibitedActions: ['deploy', 'copy-to-service-root', 'service-install', 'service-stop', 'service-start', 'service-restart', 'database-write', 'manual-sync-run']
  };
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null) fail('arguments must be --name value pairs');
    output[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return output;
}

if (require.main === module) {
  try { console.log(JSON.stringify(verifyWorkerOnlyCutoverPlan(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { PINNED_WINSW_SHA256, parseArgs, verifyWorkerOnlyCutoverPlan };
