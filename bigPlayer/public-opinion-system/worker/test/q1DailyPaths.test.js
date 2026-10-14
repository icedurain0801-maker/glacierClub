const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveDefaultOutDir, acquireDailyLock } = require('../src/q1DailyJob');

test('Q1 daily output prefers explicit directory then ProgramData-style root', () => {
  const oldDir = process.env.Q1_DAILY_OUT_DIR, oldRoot = process.env.Q1_DAILY_OUT_ROOT;
  try {
    process.env.Q1_DAILY_OUT_DIR = 'C:\\explicit'; process.env.Q1_DAILY_OUT_ROOT = 'C:\\data';
    assert.equal(resolveDefaultOutDir(new Date('2026-09-17T00:00:00Z')), 'C:\\explicit');
    delete process.env.Q1_DAILY_OUT_DIR;
    assert.equal(resolveDefaultOutDir(new Date('2026-09-17T00:00:00Z')), path.join('C:\\data', 'q1-daily-2026-09-16'));
  } finally {
    if (oldDir == null) delete process.env.Q1_DAILY_OUT_DIR; else process.env.Q1_DAILY_OUT_DIR = oldDir;
    if (oldRoot == null) delete process.env.Q1_DAILY_OUT_ROOT; else process.env.Q1_DAILY_OUT_ROOT = oldRoot;
  }
});

test('Q1 daily lock uses configured lock root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'q1-lock-')), old = process.env.Q1_DAILY_LOCK_ROOT;
  try {
    process.env.Q1_DAILY_LOCK_ROOT = root;
    const lock = await acquireDailyLock('source', '2026-09-16');
    assert.equal(path.dirname(lock.file), root);
    await lock.release();
  } finally {
    if (old == null) delete process.env.Q1_DAILY_LOCK_ROOT; else process.env.Q1_DAILY_LOCK_ROOT = old;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
