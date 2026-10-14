'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const RUNNER = 'C:/ProgramData/PublicOpinion/collection-check/runtime/source-check-runner.js';
function syncCollectionCheckTasks() {
  if (process.platform !== 'win32' || process.env.PUBLIC_OPINION_SERVICE_MODE !== '1' || !fs.existsSync(RUNNER)) return;
  const child = spawn(process.execPath, [RUNNER, '--sync'], { windowsHide: true, stdio: 'ignore', env: process.env });
  child.on('error', () => console.error('[collection-check] task synchronization could not start'));
  child.unref();
}
module.exports = { syncCollectionCheckTasks };
