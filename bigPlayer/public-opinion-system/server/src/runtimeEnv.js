const fs = require('node:fs');
const path = require('node:path');

function serviceEnvFile() {
  const configured = String(process.env.PUBLIC_OPINION_ENV_FILE || '').trim();
  if (!configured) {
    throw new Error('PUBLIC_OPINION_ENV_FILE is required in service mode');
  }

  const envFile = path.resolve(configured);
  let stat;
  try {
    stat = fs.lstatSync(envFile);
  } catch {
    throw new Error('PUBLIC_OPINION_ENV_FILE must reference an existing regular file');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('PUBLIC_OPINION_ENV_FILE must reference a non-reparse regular file');
  }

  // A link-like reparse point can resolve elsewhere even when the platform does
  // not expose it as a symbolic link through lstat().
  const resolvedTarget = path.resolve(fs.realpathSync.native(envFile));
  const sameTarget = process.platform === 'win32'
    ? resolvedTarget.toLowerCase() === envFile.toLowerCase()
    : resolvedTarget === envFile;
  if (!sameTarget) {
    throw new Error('PUBLIC_OPINION_ENV_FILE must reference a non-reparse regular file');
  }
  return envFile;
}

function loadRuntimeEnv() {
  const serviceMode = process.env.PUBLIC_OPINION_SERVICE_MODE === '1';
  const envFile = serviceMode
    ? serviceEnvFile()
    : path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envFile)) return false;
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Node.js 20.12+ is required to load the runtime environment file');
  }
  process.loadEnvFile(envFile);
  return true;
}

module.exports = { loadRuntimeEnv };
