'use strict';
const fs = require('node:fs/promises'), path = require('node:path');
const policies = new WeakSet();
const fail = () => { throw Object.assign(new Error('State directory policy invalid'), { code: 'OVERSEAS_STATE_DIRECTORY_INVALID' }); };
const inside = (base, target) => { const relative = path.relative(base, target); return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
// No directory/ACL writes. Production policy is deliberately not implemented.
async function createIsolatedStateDirectoryPolicy({ repositoryRoot, directory } = {}) {
  if (!path.isAbsolute(repositoryRoot || '') || !path.isAbsolute(directory || '')) fail();
  const root = await fs.realpath(repositoryRoot), temp = path.join(root, '.temp'), base = path.resolve(directory);
  if (!inside(temp, base)) fail();
  async function validate(target) {
    if (!path.isAbsolute(target || '')) fail(); target = path.resolve(target);
    if (target !== base && !inside(base, target)) fail();
    let current = root;
    for (const part of path.relative(root, target).split(path.sep)) {
      current = path.join(current, part); const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
    }
    if (await fs.realpath(target) !== target) fail(); return target;
  }
  await validate(base);
  const policy = Object.freeze({ kind: 'isolated-v1', directory: base, validate, productionActivationAllowed: false });
  policies.add(policy); return policy;
}
async function resolveStateDirectory({ policy, directory } = {}) {
  if (!policies.has(policy)) fail(); return policy.validate(directory);
}
module.exports = { createIsolatedStateDirectoryPolicy, resolveStateDirectory, isTrustedStateDirectoryPolicy: value => policies.has(value) };
