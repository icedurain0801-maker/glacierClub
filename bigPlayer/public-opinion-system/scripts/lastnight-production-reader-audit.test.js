'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runAudit, grantSummary, aclSafe, claimOnce, identitySql, readerSql,
  accountSql, credentialsSql } = require('./lastnight-production-reader-audit');

const sourceId = '081a16d2-5545-4afd-9c65-e04777e4540b';
const accountId = '00000000-0000-0000-0000-000000000001';
const root = path.resolve(__dirname, '../../..', '.temp/po-closeout-20261008');

function fixture({ identityPort = 3306, configHost = 'localhost', actor = 'root@localhost',
  configUser = 'root',
  readerHosts = [], credentials = [] } = {}) {
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'reader-audit-local-'));
  const queries = [];
  let connections = 0;
  const conn = { async query({ sql }, params) {
    queries.push({ sql, params });
    if (sql === identitySql) return [[{ hostname: 'LIUFUYI-2-48', port: identityPort,
      serverId: 1, datadir: 'C:/xampp/mysql/data', version: '10.4.14-MariaDB',
      db: 'public_opinion', dbUser: actor, dbRole: null }]];
    if (sql === readerSql) return [readerHosts.map(Host => ({ Host }))];
    if (sql === accountSql) return [[{ id: accountId }]];
    if (sql === credentialsSql) return [credentials];
    if (sql.startsWith('SHOW GRANTS FOR')) return [[{ grant: "GRANT USAGE ON *.* TO 'po_lastnight_reader'@'localhost'" }]];
    throw new Error('unexpected query');
  }, async end() {} };
  return { dir, queries, get connections() { return connections; },
    options: { makeEvidenceDir: () => ({ dir }), checkAcl: () => true,
      takeOnce: dir => dir,
      readEnv: () => ({ DB_HOST: configHost, DB_PORT: '3306',
        DB_NAME: 'public_opinion', DB_USER: configUser, DB_PASSWORD: 'hidden' }),
      connect: async () => { connections += 1; return conn; } } };
}

test('one scoped audit emits shape only and never returns secret fields', async () => {
  const f = fixture({ credentials: [{ credential_type: 'api_token', rowsCount: 1,
    hasCipher: 1, hasRef: 0, cipherVersion: 2 }] });
  try {
    const { evidence } = await runAudit(f.options);
    assert.equal(evidence.code, 'READER_MISSING');
    assert.equal(evidence.connectionAttempts, 1);
    assert.equal(evidence.queryAttempts, 4);
    assert.deepEqual(evidence.credentialShapes, [{ type: 'api_token', rows: 1,
      hasCipher: true, cipherVersion: 2, hasRef: false }]);
    assert.deepEqual(f.queries.find(x => x.sql === accountSql).params, [sourceId]);
    assert.deepEqual(f.queries.find(x => x.sql === credentialsSql).params, [sourceId, accountId]);
    const saved = fs.readFileSync(path.join(f.dir, 'result.json'), 'utf8');
    assert.doesNotMatch(saved, /hidden|secret_cipher|secret_ref|GRANT USAGE|SELECT Host/i);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('target config and first-query identity drift stop before account reads', async () => {
  for (const options of [{ configHost: 'remote.example' }, { configUser: 'other' },
    { identityPort: 43319 },
    { actor: 'other@localhost' }]) {
    const f = fixture(options);
    try {
      const { evidence } = await runAudit(f.options);
      const configMismatch = Boolean(options.configHost || options.configUser);
      assert.equal(evidence.code, configMismatch ? 'AUDIT_TARGET_CONFIG_MISMATCH' : 'AUDIT_IDENTITY_MISMATCH');
      assert.equal(f.connections, configMismatch ? 0 : 1);
      assert.deepEqual(f.queries.map(x => x.sql), configMismatch ? [] : [identitySql]);
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
  }
});

test('one-shot claim and ACL gate precede reading the privileged environment', async () => {
  const f = fixture();
  let envRead = false;
  f.options.takeOnce = () => { throw new Error('AUDIT_ONCE_CLAIM_FAILED'); };
  f.options.readEnv = () => { envRead = true; throw new Error('unexpected'); };
  try {
    const { evidence } = await runAudit(f.options);
    assert.equal(evidence.connectionAttempts, 0);
    assert.equal(envRead, false);
    assert.equal(f.connections, 0);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('ACL gate rejects an extra principal on the restricted env file', () => {
  const command = (name, _args) => name === 'whoami.exe'
    ? { status: 0, stdout: 'HOST\\operator\n' }
    : { status: 0, stdout: `${__filename} NT AUTHORITY\\SYSTEM:(F)\n` +
      `  BUILTIN\\Administrators:(F)\n  HOST\\operator:(OI)(CI)(F)\n` +
      `  HOST\\stranger:(F)\n` };
  assert.equal(aclSafe(__filename, command), false);
});

test('ACL gate accepts the actual restricted directory format and rejects broad ACEs', () => {
  const lines = [`${__filename} HOST\\operator:(OI)(CI)(F)`,
    '  BUILTIN\\Administrators:(OI)(CI)(F)',
    '  NT AUTHORITY\\SYSTEM:(OI)(CI)(F)'];
  const command = (name) => name === 'whoami.exe'
    ? { status: 0, stdout: 'HOST\\operator\n' }
    : { status: 0, stdout: lines.join('\n') + '\n' };
  assert.equal(aclSafe(__filename, command), true);
  for (const extra of ['BUILTIN\\Users:(RX)',
    'NT AUTHORITY\\Authenticated Users:(M)', 'Everyone:(F)', 'HOST\\unknown:(F)']) {
    const unsafe = name => name === 'whoami.exe'
      ? { status: 0, stdout: 'HOST\\operator\n' }
      : { status: 0, stdout: [...lines, `  ${extra}`].join('\n') + '\n' };
    assert.equal(aclSafe(__filename, unsafe), false);
  }
});

test('restricted evidence directory can be claimed only once', () => {
  fs.mkdirSync(root, { recursive: true });
  const parent = fs.mkdtempSync(path.join(root, 'reader-once-local-'));
  const first = path.join(parent, 'first');
  const second = path.join(parent, 'second');
  const marker = path.join(parent, 'claimed.once');
  try {
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    assert.equal(claimOnce(first, marker, () => true), marker);
    assert.throws(() => claimOnce(second, marker, () => true));
    assert.equal(fs.existsSync(second), true);
    assert.equal(fs.existsSync(marker), true);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('reader grant summary rejects global and cross-table permissions', () => {
  const account = "'po_lastnight_reader'@'localhost'";
  const rows = ["GRANT USAGE ON *.* TO " + account,
    ...['po_sources', 'po_games', 'po_communities', 'po_source_sites',
      'po_accounts', 'po_credentials'].map(table =>
      `GRANT SELECT ON \`public_opinion\`.\`${table}\` TO ${account}`)]
    .map(grant => ({ grant }));
  assert.deepEqual(grantSummary(rows, 'localhost'),
    { sixTableSelect: true, extraPrivilege: false, grantRows: 7 });
  assert.equal(grantSummary([...rows, { grant: `GRANT UPDATE ON *.* TO ${account}` }],
    'localhost').extraPrivilege, true);
});
