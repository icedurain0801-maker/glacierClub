const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { loadRuntimeEnv } = require('../src/runtimeEnv');

function withServiceEnv(file, run) {
  const before = {
    mode: process.env.PUBLIC_OPINION_SERVICE_MODE,
    file: process.env.PUBLIC_OPINION_ENV_FILE,
    value: process.env.RUNTIME_ENV_TEST_VALUE
  };
  process.env.PUBLIC_OPINION_SERVICE_MODE = '1';
  if (file == null) delete process.env.PUBLIC_OPINION_ENV_FILE;
  else process.env.PUBLIC_OPINION_ENV_FILE = file;
  delete process.env.RUNTIME_ENV_TEST_VALUE;
  try {
    return run();
  } finally {
    for (const [key, value] of [
      ['PUBLIC_OPINION_SERVICE_MODE', before.mode],
      ['PUBLIC_OPINION_ENV_FILE', before.file],
      ['RUNTIME_ENV_TEST_VALUE', before.value]
    ]) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('service mode loads only the explicitly configured regular file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-opinion-env-'));
  const envFile = path.join(root, 'public-opinion.env');
  fs.writeFileSync(envFile, 'RUNTIME_ENV_TEST_VALUE=service-file\n', 'utf8');
  try {
    withServiceEnv(envFile, () => {
      assert.equal(loadRuntimeEnv(), true);
      assert.equal(process.env.RUNTIME_ENV_TEST_VALUE, 'service-file');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('service mode fails closed when the configured file is absent', () => {
  withServiceEnv(null, () => {
    assert.throws(() => loadRuntimeEnv(), /PUBLIC_OPINION_ENV_FILE is required/);
  });
  withServiceEnv(path.join(os.tmpdir(), 'missing-public-opinion.env'), () => {
    assert.throws(() => loadRuntimeEnv(), /existing regular file/);
  });
});

test('service mode rejects directories and reparse links', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-opinion-env-'));
  const envFile = path.join(root, 'public-opinion.env');
  const linkedFile = path.join(root, 'linked.env');
  fs.writeFileSync(envFile, 'RUNTIME_ENV_TEST_VALUE=linked-file\n', 'utf8');
  try {
    withServiceEnv(root, () => {
      assert.throws(() => loadRuntimeEnv(), /non-reparse regular file/);
    });
    try {
      fs.symlinkSync(envFile, linkedFile, 'file');
    } catch (error) {
      t.skip(`symbolic links unavailable: ${error.code}`);
      return;
    }
    withServiceEnv(linkedFile, () => {
      assert.throws(() => loadRuntimeEnv(), /non-reparse regular file/);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
