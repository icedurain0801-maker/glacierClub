'use strict';

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const helper = path.resolve(__dirname, '../../../.temp/candidates/v363-bigplayer-controlled-apply-executor-20260922/scripts/execution-gates.ps1');
const targetSource = 'bigplayer-source';
const targetAccount = 'bigplayer-account';
const snapshot = '2026-09-23T10:00:00.000Z';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;

function evaluate(rows) {
  const json = JSON.stringify(rows).replaceAll("'", "''");
  return cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference='Stop'; . ${quote(helper)}; $r=Assert-BaselineGate (ConvertFrom-Json '${json}') '${targetSource}' '${targetAccount}' ([datetime]'${snapshot}'); $r|ConvertTo-Json -Compress`
  ], { encoding: 'utf8' });
}

function resultOf(result) {
  return JSON.parse(result.stdout.split(/\r?\n/).find(line => line.trim().startsWith('{')));
}

test('non-target Discord and TapTap active rows are observed but do not block', () => {
  const result = evaluate([
    { source_id: 'discord-source', account_id: 'discord-account', status: 'running', lease_until: '2026-09-23T11:00:00Z' },
    { source_id: 'taptap-source', account_id: 'taptap-account', status: 'queued', lease_until: null }
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual({ targetActive: resultOf(result).targetActive, nonTargetObserved: resultOf(result).nonTargetObserved }, { targetActive: 0, nonTargetObserved: 2 });
});

test('active target BigPlayer run blocks', () => {
  const result = evaluate([{ source_id: targetSource, account_id: targetAccount, status: 'running', lease_until: '2026-09-23T11:00:00Z' }]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /targetActive=1/);
});

test('expired-only target BigPlayer run passes with a structured warning count', () => {
  const result = evaluate([{ source_id: targetSource, account_id: targetAccount, status: 'running', lease_until: '2026-09-23T09:59:59Z' }]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(resultOf(result).targetExpired, 1);
  assert.equal(resultOf(result).targetActive, 0);
});

test('queued target BigPlayer run blocks even without a lease', () => {
  const result = evaluate([{ source_id: targetSource, account_id: targetAccount, status: 'queued', lease_until: null }]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /targetActive=1/);
});

test('one UTC snapshot consistently classifies equal and future lease boundaries', () => {
  const result = evaluate([
    { source_id: targetSource, account_id: targetAccount, status: 'running', lease_until: snapshot },
    { source_id: 'other-source', account_id: 'other-account', status: 'running', lease_until: '2026-09-23T10:00:00.001Z' }
  ]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = resultOf(result);
  assert.equal(Date.parse(parsed.dbUtcSnapshot), Date.parse(snapshot));
  assert.equal(parsed.targetExpired, 1);
  assert.equal(parsed.nonTargetObserved, 1);
});
