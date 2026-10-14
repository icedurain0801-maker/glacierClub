const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const installer = fs.readFileSync(path.resolve(__dirname, '../install-q1-daily-task.cmd'), 'utf8');

test('installer only prints the unified scheduler handoff guidance and never auto-disables or deletes', () => {
  const installBlock = installer.slice(
    installer.match(/^:install\r?$/m).index,
    installer.match(/^:validate\r?$/m).index
  );
  assert.match(installBlock, /UNIFIED_SOURCE_SCHEDULER_MODE=enabled/i);
  assert.match(installBlock, /does not disable or delete/i);
  assert.doesNotMatch(installBlock, /schtasks\s+\/(?:Delete|Change).*\/(?:Disable|F)/i);

  const removeBlock = installer.slice(
    installer.match(/^:remove\r?$/m).index,
    installer.match(/^:usage\r?$/m).index
  );
  assert.match(removeBlock, /schtasks\s+\/Delete/i);
});
