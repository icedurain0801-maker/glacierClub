'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseEnv(source) {
  const parsed = {};
  for (const line of String(source || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function loadEnvFile(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) return false;
  const parsed = parseEnv(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) env[key] = value;
  }
  return true;
}

function loadLocalEnvironment({ env = process.env, serviceDir = path.resolve(__dirname, '..') } = {}) {
  const systemDir = path.dirname(serviceDir);
  const loaded = [];
  // A Windows service runs from an immutable release directory.  It must use
  // the centrally managed environment file rather than relying on a sibling
  // `.env` that would duplicate secrets into each release.
  const configured = String(env.PUBLIC_OPINION_ENV_FILE || '').trim();
  const candidates = [configured, path.join(systemDir, '.env'), path.join(serviceDir, '.env')].filter(Boolean);
  for (const filePath of candidates) {
    if (loadEnvFile(filePath, env)) loaded.push(filePath);
  }
  if (env.PUBLIC_OPINION_SERVER_URL === undefined && env.LOGIN_SESSION_SERVER_URL === undefined) {
    env.PUBLIC_OPINION_SERVER_URL = `http://127.0.0.1:${env.PORT || 4320}`;
  }
  return loaded;
}

module.exports = { loadEnvFile, loadLocalEnvironment, parseEnv };
