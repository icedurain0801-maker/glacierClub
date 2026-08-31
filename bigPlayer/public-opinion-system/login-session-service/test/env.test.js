'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadEnvFile, loadLocalEnvironment, parseEnv } = require('../src/env');

test('parseEnv reads simple dotenv syntax without exposing values', () => {
  assert.deepEqual(parseEnv('# comment\nexport A=one\nB="two words"\nC=three # comment'), { A: 'one', B: 'two words', C: 'three' });
});

test('loadEnvFile never overwrites an existing process environment value', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'EXISTING=from-file\nNEW=value\n');
  const env = { EXISTING: 'from-process' };
  loadEnvFile(file, env);
  assert.deepEqual(env, { EXISTING: 'from-process', NEW: 'value' });
});

test('loadLocalEnvironment loads parent system env before service env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-env-'));
  const systemDir = path.join(dir, 'public-opinion-system');
  const serviceDir = path.join(systemDir, 'login-session-service');
  fs.mkdirSync(serviceDir, { recursive: true });
  fs.writeFileSync(path.join(systemDir, '.env'), 'SHARED=system\nSYSTEM_ONLY=yes\n');
  fs.writeFileSync(path.join(serviceDir, '.env'), 'SHARED=service\nSERVICE_ONLY=yes\n');
  const env = {};
  const loaded = loadLocalEnvironment({ env, serviceDir });
  assert.equal(loaded.length, 2);
  assert.deepEqual(env, { SHARED: 'system', SYSTEM_ONLY: 'yes', SERVICE_ONLY: 'yes', PUBLIC_OPINION_SERVER_URL: 'http://127.0.0.1:4320' });
});
