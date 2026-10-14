'use strict';
// Read-only, deliberately over-inclusive closure: dynamic first-party imports
// and installed dependency data are frozen too. No env, DB or process startup.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const project = path.resolve(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inventory(extraFiles = []) {
  const files = new Map();
  const add = file => {
    const absolute = path.resolve(project, file);
    const relative = path.relative(project, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('INVENTORY_PATH_OUTSIDE_PROJECT');
    if (files.has(relative)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      const workspace = { 'public-opinion-system-server': 'server', 'public-opinion-system-worker': 'worker' }[path.basename(absolute)];
      if (path.dirname(absolute) !== path.join(project, 'node_modules') || !workspace
        || fs.realpathSync(absolute) !== fs.realpathSync(path.join(project, workspace))) throw Error('INVENTORY_UNEXPECTED_LINK');
      files.set(relative, { path: absolute, kind: 'workspace-link', sha256: sha256(`workspace-link:${fs.realpathSync(absolute)}`) });
    } else if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) add(path.join(relative, name));
    } else if (stat.isFile()) files.set(relative, { path: absolute, kind: 'file', sha256: sha256(fs.readFileSync(absolute)) });
    else throw Error('INVENTORY_UNSUPPORTED_ENTRY');
  };
  for (const file of ['server/src', 'worker/src', 'shared', 'node_modules', 'package.json', 'package-lock.json',
    'server/package.json', 'worker/package.json', 'scripts/overseas-candidate-inventory.js', ...extraFiles]) add(file);
  return { nodeVersion: process.version, policy: 'all-first-party-source-and-installed-dependency-bytes-no-upgrade',
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}
function verifyInventory(expected, extraFiles = []) {
  const actual = inventory(extraFiles);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw Error('OVERSEAS_CANDIDATE_VERSION_CHANGED');
  return true;
}
if (require.main === module) console.log(JSON.stringify(inventory(process.argv.slice(2))));
module.exports = { inventory, verifyInventory };
