'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ownsInstance } = require('./lastnight-isolated-db-e2e');

test('shutdown ownership requires child PID, datadir, server ID and port', () => {
  const temporaryRoot = path.resolve(__dirname, '../../..', '.temp');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'lastnight-identity-'));
  try {
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(dataDir);
    const pidFile = path.join(dataDir, 'isolated.pid');
    fs.writeFileSync(pidFile, '12345\n');
    const expected = { port: 43319, serverId: 20261019, dataDir, pidFile,
      childPid: 12345, expectedVersion: '10.4.14-MariaDB' };
    const actual = { port: 43319, serverId: 20261019, datadir: dataDir,
      pidFile, version: expected.expectedVersion };
    assert.equal(ownsInstance(actual, expected), true);
    for (const wrong of [
      [{ ...actual, port: 3306 }, expected],
      [{ ...actual, serverId: 1 }, expected],
      [{ ...actual, datadir: root }, expected],
      [{ ...actual, pidFile: path.join(root, 'other.pid') }, expected],
      [{ ...actual, version: 'other' }, expected],
      [actual, { ...expected, childPid: 54321 }]
    ]) assert.equal(ownsInstance(...wrong), false);
    fs.unlinkSync(pidFile);
    assert.equal(ownsInstance(actual, expected), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
