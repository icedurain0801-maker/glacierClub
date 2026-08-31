const fs = require('node:fs');
const path = require('node:path');

function loadRuntimeEnv() {
  const envFile = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envFile)) return false;
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Node.js 20.12+ is required to load public-opinion-system/.env');
  }
  process.loadEnvFile(envFile);
  return true;
}

module.exports = { loadRuntimeEnv };
