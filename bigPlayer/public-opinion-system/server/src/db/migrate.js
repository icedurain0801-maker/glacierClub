const { loadRuntimeEnv } = require('../runtimeEnv');
loadRuntimeEnv();

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

function connConfig(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  return {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'public_opinion'
  };
}

async function main() {
  const dir = path.join(__dirname, '..', '..', '..', 'migrations');
  const only = process.argv[2];
  const conn = await mysql.createConnection({ ...(typeof connConfig(process.env) === 'string' ? { uri: connConfig(process.env) } : connConfig(process.env)), multipleStatements: true });
  await conn.query('CREATE TABLE IF NOT EXISTS po_schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  const [done] = await conn.query('SELECT version FROM po_schema_migrations');
  const applied = new Set(done.map(row => row.version));
  const files = only ? [path.basename(only)] : fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) { console.log(`skip (already applied): ${file}`); continue; }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await conn.query(sql);
    await conn.query('INSERT INTO po_schema_migrations (version) VALUES (?)', [file]);
    console.log(`migration applied: ${file}`);
  }
  await conn.end();
  console.log('all migrations up to date');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
