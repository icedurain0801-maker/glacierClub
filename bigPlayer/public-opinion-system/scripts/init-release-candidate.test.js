const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, 'init-release-candidate.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-init-'));
  const payload = path.join(root, 'payload'); fs.mkdirSync(path.join(payload, 'src'), { recursive: true });
  fs.writeFileSync(path.join(payload, 'src', 'dep.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(payload, 'src', 'sample.js'), "require('./dep');\n");
  fs.writeFileSync(path.join(payload, 'src', 'sample.test.js'), "require('node:test'); require('./sample');\n");
  const rollbackRelease = path.join(root, 'prior-release'); fs.mkdirSync(rollbackRelease, { recursive: true });
  fs.mkdirSync(path.join(rollbackRelease, 'src'), { recursive: true });
  for (const name of ['dep.js', 'sample.js', 'sample.test.js']) fs.copyFileSync(path.join(payload, 'src', name), path.join(rollbackRelease, 'src', name));
  const rollbackWorkerPath = path.join(rollbackRelease, 'src', 'sample.js');
  const dbConfig = path.join(root, 'public-opinion.env'); fs.writeFileSync(dbConfig, 'DB_HOST=127.0.0.1\nDB_NAME=public_opinion\n');
  const hostHash = hash('127.0.0.1'); const nameHash = hash('public_opinion');
  fs.writeFileSync(path.join(root, 'release-readonly-preflight.ps1'), `param([string]$CandidateId,[string]$EvidenceId,[string]$SourceCommit)
$writesPerformed = $false
if ($false) { Invoke-WebRequest -Method Get -Uri http://127.0.0.1:1 }
Write-Output "writesPerformed=false"
Write-Output (ConvertTo-Json @{ platform='bigplayer_h5'; subject='account'; candidateId=$CandidateId; evidenceId=$EvidenceId; sourceCommit=$SourceCommit; workerPath='payload/worker'; dbHostFingerprint='${hostHash}'; dbNameFingerprint='${nameHash}' } -Compress)
exit 0
`);
  fs.writeFileSync(path.join(root, 'worker-evidence.json'), JSON.stringify({ platform: 'bigplayer_h5', subject: 'account', commit: 'abc', path: path.join(payload, 'src', 'sample.js'), dbHost: `sha256:${hostHash}`, dbName: `sha256:${nameHash}`, rollbackReleasePath: rollbackRelease, rollbackWorkerPath, rollbackWorkerSha256: hash(fs.readFileSync(rollbackWorkerPath)), rollbackCommand: `Copy-Item -LiteralPath '${rollbackWorkerPath}' -Destination '${path.join(payload, 'src', 'sample.js')}' -Force` }));
  return { root, payload, hostHash, nameHash };
}
function run(args) { const payloadArg = args.find(([key]) => key === 'payloadRoot'); if (payloadArg && !args.some(([key]) => key === 'workerEvidence')) args.push(['workerEvidence', path.join(path.dirname(payloadArg[1]), 'worker-evidence.json')]); if(payloadArg && !args.some(([key]) => key === 'dbConfig')) args.push(['dbConfig', path.join(path.dirname(payloadArg[1]), 'public-opinion.env')]); return spawnSync(process.execPath, [script, ...args.flatMap(([k, v]) => [`--${k}`, v])], { encoding: 'utf8' }); }

test('failure removes temporary candidate and never creates READY', () => {
  const f = fixture(); const target = path.join(f.root, 'broken'); fs.rmSync(path.join(f.payload, 'src', 'dep.js'));
  const result = run([['candidateId', 'broken'], ['parentEvidence', 'p'], ['sourceCommit', 'c'], ['payloadRoot', f.payload], ['targetRoot', target]]);
  assert.notEqual(result.status, 0); assert.equal(fs.existsSync(path.join(target, 'READY.json')), false); assert.equal(fs.existsSync(target), false);
});
test('success generates independent identity, closure and checksums before READY', () => {
  const f = fixture(); const candidateId = 'v-test'; const target = path.join(f.root, candidateId);
  const result = run([['candidateId', candidateId], ['parentEvidence', 'v-parent'], ['sourceCommit', 'abc'], ['payloadRoot', f.payload], ['targetRoot', target]]);
  assert.equal(result.status, 0, result.stderr); const ready = JSON.parse(fs.readFileSync(path.join(target, 'READY.json'))); const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'))); const closure = JSON.parse(fs.readFileSync(path.join(target, 'formal-file-closure.json')));
  const provenance = JSON.parse(fs.readFileSync(path.join(target, 'provenance.json'))); assert.equal(path.basename(target), candidateId); assert.equal(ready.candidateId, candidateId); assert.equal(manifest.candidateId, candidateId); assert.equal(closure.sourceEvidenceId, 'v-parent'); assert.equal(ready.evidenceId, manifest.evidenceId); assert.equal(ready.preflight.status, 'EXECUTED_PASS'); assert.ok(closure.files.every(file => file.rollback?.object && file.rollback?.restoreCommand)); assert.match(fs.readFileSync(path.join(target, 'checksums.sha256'), 'utf8'), /READY\.json/);
  assert.equal(manifest.targetPlatform, 'bigplayer_h5'); assert.equal(manifest.rollbackBaseline, 'pre-bigplayer-taptap-formal1'); assert.equal(provenance.targetPlatform, 'bigplayer_h5'); assert.equal(ready.rollbackBaseline, 'pre-bigplayer-taptap-formal1');
});
test('target and rollback identity rejects TapTap or BigPlayer-previous labels', () => {
  for (const [name, key, value] of [['taptap-target', 'targetPlatform', 'taptap'], ['bigplayer-previous', 'rollbackBaseline', 'bigplayer-previous-release']]) {
    const f = fixture(); const target = path.join(f.root, name); const result = run([['candidateId', name], ['parentEvidence', 'p'], ['sourceCommit', 'abc'], ['payloadRoot', f.payload], ['targetRoot', target], [key, value]]);
    assert.notEqual(result.status, 0, name); assert.match(result.stderr, /must be/); assert.equal(fs.existsSync(path.join(target, 'READY.json')), false);
  }
});
test('preflight execution failure leaves no READY', () => {
  const f = fixture(); const target = path.join(f.root, 'preflight-fail');
  fs.writeFileSync(path.join(f.root, 'release-readonly-preflight.ps1'), 'Write-Error "failed"; exit 7\n');
  const result = run([['candidateId', 'preflight-fail'], ['parentEvidence', 'p'], ['sourceCommit', 'c'], ['payloadRoot', f.payload], ['targetRoot', target]]);
  assert.notEqual(result.status, 0); assert.equal(fs.existsSync(target), false);
});
test('candidate id must match target basename', () => {
  const f = fixture(); const target = path.join(f.root, 'different-name');
  const result = run([['candidateId', 'v-test'], ['parentEvidence', 'p'], ['sourceCommit', 'c'], ['payloadRoot', f.payload], ['targetRoot', target]]);
  assert.notEqual(result.status, 0); assert.equal(fs.existsSync(target), false);
});
test('external dependency and incomplete rollback cannot produce READY', () => {
  const f = fixture(); const target = path.join(f.root, 'external-dep'); fs.writeFileSync(path.join(f.payload, 'src', 'sample.js'), "require('../outside');\n");
  const result = run([['candidateId', 'external-dep'], ['parentEvidence', 'p'], ['sourceCommit', 'c'], ['payloadRoot', f.payload], ['targetRoot', target]]);
  assert.notEqual(result.status, 0); assert.equal(fs.existsSync(target), false);
});
test('legacy id and hash mismatch cannot produce READY', () => {
  const f = fixture(); const legacyTarget = path.join(f.root, 'legacy'); fs.writeFileSync(path.join(f.payload, 'src', 'sample.js'), 'const legacy = "v334b";\n');
  const legacy = run([['candidateId', 'legacy'], ['parentEvidence', 'p'], ['sourceCommit', 'c'], ['payloadRoot', f.payload], ['targetRoot', legacyTarget]]);
  assert.notEqual(legacy.status, 0); assert.equal(fs.existsSync(legacyTarget), false);
  const hashFixture = fixture(); const hashTarget = path.join(hashFixture.root, 'hash-fail');
  const mismatch = run([['candidateId', 'hash-fail'], ['parentEvidence', 'p'], ['sourceCommit', 'c'], ['payloadRoot', hashFixture.payload], ['targetRoot', hashTarget], ['simulateHashMismatch', 'true']]);
  assert.notEqual(mismatch.status, 0); assert.equal(fs.existsSync(hashTarget), false);
});
test('worker evidence contract rejects platform, subject, path, commit and DB fingerprint mismatches', () => {
  const mutations = {
    platform: "platform='taptap'",
    subject: "subject='source'",
    workerPath: "workerPath='server'",
    sourceCommit: "sourceCommit='wrong'",
    dbFingerprint: "dbHostFingerprint=''"
  };
  for (const [name, replacement] of Object.entries(mutations)) {
    const f = fixture(); const target = path.join(f.root, `contract-${name}`); const preflight = path.join(f.root, 'release-readonly-preflight.ps1');
    let text = fs.readFileSync(preflight, 'utf8'); text = text.replace(/platform='bigplayer_h5'|subject='account'|workerPath='payload\/worker'|dbHostFingerprint='0123456789abcdef'/, replacement); if (name === 'sourceCommit') text = text.replace("sourceCommit=$SourceCommit", replacement);
    fs.writeFileSync(preflight, text);
    const result = run([['candidateId', `contract-${name}`], ['parentEvidence', 'p'], ['sourceCommit', 'c'], ['payloadRoot', f.payload], ['targetRoot', target]]);
    assert.notEqual(result.status, 0, name); assert.equal(fs.existsSync(target), false);
  }
});
test('worker evidence rejects missing target release and rollback objects', () => {
  for (const field of ['path', 'rollbackReleasePath']) {
    const f = fixture(); const target = path.join(f.root, `missing-${field}`); const evidence = JSON.parse(fs.readFileSync(path.join(f.root, 'worker-evidence.json'), 'utf8'));
    evidence[field] = path.join(f.root, 'does-not-exist'); fs.writeFileSync(path.join(f.root, 'worker-evidence.json'), JSON.stringify(evidence));
    const result = run([['candidateId', `missing-${field}`], ['parentEvidence', 'p'], ['sourceCommit', 'abc'], ['payloadRoot', f.payload], ['targetRoot', target]]);
    assert.notEqual(result.status, 0, field); assert.equal(fs.existsSync(target), false);
  }
});
test('source commit mutation reaches preflight identity gate', () => {
  const f = fixture(); const target = path.join(f.root, 'source-commit-mismatch'); const preflight = path.join(f.root, 'release-readonly-preflight.ps1'); let text = fs.readFileSync(preflight, 'utf8').replace('sourceCommit=$SourceCommit', "sourceCommit='mutated-commit'"); fs.writeFileSync(preflight, text);
  const result = run([['candidateId', 'source-commit-mismatch'], ['parentEvidence', 'p'], ['sourceCommit', 'abc'], ['payloadRoot', f.payload], ['targetRoot', target]]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /preflight evidence identity mismatch/); assert.equal(fs.existsSync(path.join(target, 'READY.json')), false);
});
test('DB host and DB name fingerprint mutations each fail before READY', () => {
  for (const field of ['dbHost', 'dbName']) {
    const f = fixture(); const target = path.join(f.root, `db-${field}-worker-mismatch`); const evidence = JSON.parse(fs.readFileSync(path.join(f.root, 'worker-evidence.json'), 'utf8')); evidence[field] = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; fs.writeFileSync(path.join(f.root, 'worker-evidence.json'), JSON.stringify(evidence));
    const result = run([['candidateId', `db-${field}-worker-mismatch`], ['parentEvidence', 'p'], ['sourceCommit', 'abc'], ['payloadRoot', f.payload], ['targetRoot', target]]);
    assert.notEqual(result.status, 0, `${field} worker/config`); assert.match(result.stderr, /worker evidence DB fingerprint mismatch with config/); assert.equal(fs.existsSync(path.join(target, 'READY.json')), false);
    const g = fixture(); const targetPreflight = path.join(g.root, `db-${field}-preflight-mismatch`); const preflight = path.join(g.root, 'release-readonly-preflight.ps1'); let preflightText = fs.readFileSync(preflight, 'utf8'); const wrong = field === 'dbHost' ? g.nameHash : g.hostHash; const current = field === 'dbHost' ? g.hostHash : g.nameHash; preflightText = preflightText.replace(current, wrong); fs.writeFileSync(preflight, preflightText);
    const preflightResult = run([['candidateId', `db-${field}-preflight-mismatch`], ['parentEvidence', 'p'], ['sourceCommit', 'abc'], ['payloadRoot', g.payload], ['targetRoot', targetPreflight]]);
    assert.notEqual(preflightResult.status, 0, `${field} preflight/worker`); assert.match(preflightResult.stderr, /preflight evidence does not match worker evidence\/config/); assert.equal(fs.existsSync(path.join(targetPreflight, 'READY.json')), false);
  }
});
test('rollback hash, command target, per-file object and WhatIf failures never create READY', () => {
  const cases = [
    ['rollback-hash', evidence => { evidence.rollbackWorkerSha256 = '0'.repeat(64); }, /rollback worker hash mismatch/],
    ['rollback-command', evidence => { evidence.rollbackCommand = `Copy-Item -LiteralPath '${evidence.rollbackWorkerPath}' -Destination '${evidence.rollbackWorkerPath}' -Force`; }, /rollback command must be the exact worker restore command/],
    ['rollback-object', evidence => { evidence.rollbackWorkerPath = path.join(path.dirname(evidence.rollbackWorkerPath), 'missing.js'); }, /rollback worker path does not exist/]
  ];
  for (const [name, mutate, expected] of cases) {
    const f = fixture(); const target = path.join(f.root, name); const evidence = JSON.parse(fs.readFileSync(path.join(f.root, 'worker-evidence.json'), 'utf8')); mutate(evidence); fs.writeFileSync(path.join(f.root, 'worker-evidence.json'), JSON.stringify(evidence));
    const result = run([['candidateId', name], ['parentEvidence', 'p'], ['sourceCommit', 'abc'], ['payloadRoot', f.payload], ['targetRoot', target]]);
    assert.notEqual(result.status, 0, name); assert.match(result.stderr, expected, name); assert.equal(fs.existsSync(path.join(target, 'READY.json')), false);
  }
  const f = fixture(); const target = path.join(f.root, 'per-file-rollback-object'); fs.rmSync(path.join(f.root, 'prior-release', 'src', 'dep.js'));
  const result = run([['candidateId', 'per-file-rollback-object'], ['parentEvidence', 'p'], ['sourceCommit', 'abc'], ['payloadRoot', f.payload], ['targetRoot', target]]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /rollback object missing for src[\\/]dep\.js/); assert.equal(fs.existsSync(path.join(target, 'READY.json')), false);
});
