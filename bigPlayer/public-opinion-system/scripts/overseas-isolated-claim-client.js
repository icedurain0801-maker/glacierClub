'use strict';
const fs = require('node:fs'), path = require('node:path'), mysql = require('mysql2/promise');
const { Repository } = require('../server/src/db/repository');
const { createOverseasManualReceipt } = require('../worker/src/overseasManualReceipt');
const { createOverseasRunContractJournal } = require('../worker/src/overseasBigPlayerRunContractJournal');
const { createOverseasRecoveryIntent } = require('../worker/src/overseasRecoveryIntent');
const { claimRecoveryRun } = require('../server/src/db/overseasRecoveryClaim');
const check = value => { if (!value) throw Object.assign(Error('Isolated client identity invalid'), { code: 'ISOLATED_CLAIM_CLIENT_IDENTITY' }); };
async function main() {
  check(process.argv.length === 3 && process.argv[2] === '--isolated-child');
  const c = JSON.parse(fs.readFileSync(0, 'utf8')), root = path.resolve(__dirname, '../../..');
  check(c.db.host === '127.0.0.1' && c.db.port === 13316 && c.db.database === 'po_overseas_fixture' && c.serverId === 20261036
    && c.db.user === 'po_overseas_fixture' && c.db.connectionLimit >= 1 && c.db.connectionLimit <= 4);
  const directory = fs.realpathSync(c.directory);
  check(directory === path.resolve(c.directory) && path.dirname(directory) === path.join(root, '.temp') && !fs.lstatSync(directory).isSymbolicLink()
    && !fs.lstatSync(path.join(root, '.temp')).isSymbolicLink());
  const pool = mysql.createPool(c.db);
  try {
    const [[i]] = await pool.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS dataDir,@@pid_file AS pidFile,VERSION() AS version');
    check(i.port === 13316 && i.serverId === c.serverId && i.version === '10.4.14-MariaDB'
      && path.resolve(i.dataDir).toLowerCase() === path.join(directory, 'data').toLowerCase()
      && path.resolve(i.pidFile).toLowerCase() === path.join(directory, 'mysqld.pid').toLowerCase()
      && Number(fs.readFileSync(i.pidFile, 'utf8').trim()) === c.serverPid);
    const repo = Object.create(Repository.prototype); repo.pool = pool;
    const receipt = await createOverseasManualReceipt({ repositoryRoot: root, directory: path.join(directory, 'receipts') });
    const journal = await createOverseasRunContractJournal({ repositoryRoot: root, directory: path.join(directory, 'reclaim-journal') });
    const reader = await createOverseasRecoveryIntent({ repositoryRoot: root, directory: path.join(directory, 'intents'), receipt, journal });
    const proof = await reader.read(c.intentId);
    const row = await claimRecoveryRun(repo, { proof, runId: proof.scope.runId, leaseSeconds: 1 });
    check(row && Number(row.lease_epoch) === proof.next.leaseEpoch);
    // Parent interrupts ONLY this spawned client after durable CAS and before Journal publication.
    process.stdout.write('CLAIM_COMMITTED_JOURNAL_NOT_PUBLISHED\n');
    await new Promise(() => { setInterval(() => {}, 1000); });
  } finally { await pool.end(); }
}
main().catch(error => { process.stderr.write(error.code || 'ISOLATED_CLAIM_CLIENT_FAILED'); process.exitCode = 1; });
