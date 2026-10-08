'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const { LastNightIsolatedStore, grantsAreIsolated } = require('../worker/src/lastNightIsolatedStore');
const { executeIsolatedFixture } = require('../worker/src/lastNightIsolatedExecutor');
const { collectIsolated, consumeIsolatedAnalysis } = require('../worker/src/lastNightIsolatedPipeline');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('../worker/src/lastNightOverseasDailyJob');

const root = path.resolve(__dirname, '../../..', '.temp/po-closeout-20261008');
const bin = 'C:/xampp/mysql/bin';
const port = 43319;
const serverId = 20261019;
const version = '10.4.14-MariaDB';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = code => Object.assign(new Error(code), { code });
const utcSql = value => new Date(value).toISOString().replace('T', ' ').replace('Z', '');
const shaFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function ownsInstance(identity, { port: expectedPort, serverId: expectedServerId,
  dataDir, pidFile, childPid, expectedVersion } = {}) {
  if (!identity || !Number.isSafeInteger(childPid) || childPid <= 0 ||
    Number(identity.port) !== expectedPort || Number(identity.serverId) !== expectedServerId ||
    path.resolve(identity.datadir || '').toLowerCase() !== path.resolve(dataDir || '').toLowerCase() ||
    path.resolve(identity.pidFile || '').toLowerCase() !== path.resolve(pidFile || '').toLowerCase() ||
    (expectedVersion && identity.version !== expectedVersion)) return false;
  try { return Number(fs.readFileSync(pidFile, 'utf8').trim()) === childPid; }
  catch { return false; }
}

async function portFree() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => probe.close(resolve));
}

async function childExit(child, timeoutMs) {
  const closed = new Promise(resolve => {
    child.once('error', () => resolve({ code: null }));
    child.once('close', code => resolve({ code }));
  });
  let timer;
  const result = await Promise.race([closed,
    new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
  if (result) return result;
  child.kill();
  const stopped = await Promise.race([closed,
    new Promise(resolve => { timer = setTimeout(() => resolve(null), 5000); })
  ]).finally(() => clearTimeout(timer));
  if (!stopped) throw fail('ISOLATED_CHILD_STOP_UNCONFIRMED');
  throw fail('ISOLATED_CHILD_TIMEOUT');
}

async function connect(database, multipleStatements = false) {
  return mysql.createConnection({ host: '127.0.0.1', port, user: 'root',
    ...(database ? { database } : {}), multipleStatements, connectTimeout: 3000,
    dateStrings: true, timezone: 'Z', charset: 'utf8mb4' });
}

async function main(argv = process.argv) {
  if (argv.length !== 3 || argv[2] !== '--isolated') throw fail('PRODUCTION_EXECUTION_DISABLED');
  await portFree();
  fs.mkdirSync(root, { recursive: true });
  const space = fs.statfsSync(root);
  if (space.bavail * space.bsize < 4 * 1024 * 1024 * 1024) throw fail('ISOLATED_SPACE_INSUFFICIENT');
  const evidenceDir = fs.mkdtempSync(path.join(root, 'lastnight-db-e2e-'));
  const dataDir = path.join(evidenceDir, 'data');
  const pidFile = path.join(dataDir, 'isolated.pid');
  const ownIdentity = identity => ownsInstance(identity,
    { port, serverId, dataDir, pidFile, childPid: server?.pid, expectedVersion: version });
  const initLog = fs.openSync(path.join(evidenceDir, 'init.log'), 'wx');
  let serverLog, server, serverClosed = false, serverClose = Promise.resolve(), control, pool;
  let identityVerified = false;
  let result = { status: 'NO_GO', code: 'NOT_STARTED', productionTouched: false };
  try {
    const init = spawn(path.join(bin, 'mysql_install_db.exe'), [`--datadir=${dataDir}`, `--port=${port}`],
      { windowsHide: true, shell: false, stdio: ['ignore', initLog, initLog],
        env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
          PATH: `C:/Windows/System32;${bin}` } });
    const initialized = await childExit(init, 60000);
    if (initialized.code !== 0) throw fail('ISOLATED_INIT_FAILED');
    if (!fs.statSync(dataDir).isDirectory()) throw fail('ISOLATED_DATADIR_MISSING');
    serverLog = fs.openSync(path.join(evidenceDir, 'server.log'), 'wx');
    server = spawn(path.join(bin, 'mysqld.exe'), [
      '--no-defaults', '--basedir=C:/xampp/mysql', `--datadir=${dataDir}`,
      '--bind-address=127.0.0.1', `--port=${port}`, `--server-id=${serverId}`,
      `--pid-file=${pidFile}`,
      '--skip-log-bin', '--event-scheduler=OFF', '--innodb-buffer-pool-size=64M',
      '--max-connections=10', '--max-allowed-packet=32M'
    ], { windowsHide: true, shell: false, stdio: ['ignore', serverLog, serverLog] });
    serverClose = new Promise(resolve => server.once('close', () => { serverClosed = true; resolve(); }));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { control = await connect(); break; }
      catch { if (server.exitCode !== null) throw fail('ISOLATED_SERVER_START_FAILED'); await sleep(200); }
    }
    if (!control) throw fail('ISOLATED_SERVER_UNAVAILABLE');
    const [[identity]] = await control.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,@@pid_file AS pidFile,VERSION() AS version');
    if (serverClosed || !ownIdentity(identity)) throw fail('ISOLATED_IDENTITY_MISMATCH');
    identityVerified = true;
    await control.query('CREATE DATABASE ln_last_night CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
    const schemaPath = path.resolve(__dirname, '../worker/sql/lastNightIsolatedSchema.sql');
    const schema = await connect('ln_last_night', true);
    try { await schema.query(fs.readFileSync(schemaPath, 'utf8')); }
    finally { await schema.end(); }
    const fixtureUser = 'po_lastnight_writer_fixture';
    const fixturePassword = crypto.randomBytes(32).toString('hex');
    await control.query(`CREATE USER '${fixtureUser}'@'127.0.0.1' IDENTIFIED BY ?`, [fixturePassword]);
    await control.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ln_last_night.* TO '${fixtureUser}'@'127.0.0.1'`);
    pool = mysql.createPool({ host: '127.0.0.1', port, user: fixtureUser,
      password: fixturePassword, database: 'ln_last_night',
      waitForConnections: true, connectionLimit: 3, dateStrings: true, timezone: 'Z', charset: 'utf8mb4' });
    const identityConnection = await pool.getConnection();
    let userRow;
    let grantRows;
    try {
      [[userRow]] = await identityConnection.query('SELECT CURRENT_USER() AS dbUser');
      [grantRows] = await identityConnection.query('SHOW GRANTS');
    }
    finally { identityConnection.release(); }
    if (!grantsAreIsolated(grantRows, userRow.dbUser)) throw fail('ISOLATED_FIXTURE_GRANTS_UNSAFE');
    const storeIdentity = { host: '127.0.0.1', port, serverId, datadir: dataDir, version,
      database: 'ln_last_night', user: userRow.dbUser };
    const store = new LastNightIsolatedStore({ pool, identity: storeIdentity,
      analysisVersions: { light: 'test-light-v1', deep: 'test-deep-v1' } });
    const sites = [1, 2, 3].map(i => ({ siteId: `site-${i}`,
      url: `https://club-en.q1.com/?env=web&gameId=2177&gameVersion=1&site=${i}` }));
    await store.freezeSites({ sites, configHash: 'a'.repeat(64) });
    const input = { sourceId: SOURCE_ID, accountId: '00000000-0000-0000-0000-000000000001',
      siteId: sites[0].siteId, siteUrl: sites[0].url, boardId: BOARD_ID,
      publishedFrom: '2026-10-07T00:00:00.000Z', publishedTo: '2026-10-08T00:00:00.000Z' };
    const run = await store.startRun(input);
    await store.renewRunLease(run.id, run.leaseEpoch);
    let staleLeaseRejected = false;
    try { await store.renewRunLease(run.id, run.leaseEpoch + 1); }
    catch (error) { staleLeaseRejected = error.code === 'LAST_NIGHT_STORE_LEASE_LOST'; }
    if (!staleLeaseRejected) throw fail('ISOLATED_STALE_LEASE_ACCEPTED');
    await store.registerFeeds(run.id, run.leaseEpoch, [{ feedKey: 'merged' }]);
    let incompleteTasksRejected = false;
    try { await store.finishRun(run.id, run.leaseEpoch); }
    catch (error) { incompleteTasksRejected = error.code === 'LAST_NIGHT_STORE_TASKS_INCOMPLETE'; }
    if (!incompleteTasksRejected) throw fail('ISOLATED_INCOMPLETE_TASK_ACCEPTED');
    const page = { runId: run.id, leaseEpoch: run.leaseEpoch, sourceId: SOURCE_ID,
      siteId: sites[0].siteId, boardId: BOARD_ID, scope: 'posts', feedKey: 'merged',
      rootPostId: '', cursor: null, nextCursor: 'p2', hasMore: true,
      items: [{ externalId: 'post-1', contentType: 'post', title: 'fixture',
        publishedAt: '2026-10-07T12:00:00.000Z' }] };
    await store.commitPage(page);
    const resumed = await store.loadPageState(page);
    if (resumed.nextCursor !== 'p2' || resumed.status !== 'running') throw fail('ISOLATED_CURSOR_NOT_PERSISTED');
    let rollbackConfirmed = false;
    try { await store.commitPage({ ...page, cursor: 'p2', nextCursor: null, hasMore: false,
      items: [{ externalId: 'post-2', contentType: 'post',
        publishedAt: '2026-10-07T12:00:00.000Z' }, { contentType: 'post' }] }); }
    catch (error) { rollbackConfirmed = error.code === 'LAST_NIGHT_STORE_CONTENT_INVALID'; }
    if (!rollbackConfirmed || (await store.loadPageState(page)).nextCursor !== 'p2') throw fail('ISOLATED_PAGE_ROLLBACK_FAILED');
    let mixedScopeRejected = false;
    try { await store.commitPage({ ...page, cursor: 'p2', nextCursor: null, hasMore: false,
      items: [{ externalId: 'post-2', contentType: 'post', siteId: 'other-site',
        publishedAt: '2026-10-07T12:00:00.000Z' }] }); }
    catch (error) { mixedScopeRejected = error.code === 'LAST_NIGHT_STORE_CONTENT_SCOPE_MISMATCH'; }
    let outsideWindowRejected = false;
    try { await store.commitPage({ ...page, cursor: 'p2', nextCursor: null, hasMore: false,
      items: [{ externalId: 'post-2', contentType: 'post',
        publishedAt: '2026-10-08T00:00:00.000Z' }] }); }
    catch (error) { outsideWindowRejected = error.code === 'LAST_NIGHT_STORE_CONTENT_WINDOW_INVALID'; }
    if (!mixedScopeRejected || !outsideWindowRejected ||
      (await store.loadPageState(page)).nextCursor !== 'p2') throw fail('ISOLATED_SCOPE_ROLLBACK_FAILED');
    await store.commitPage({ ...page, cursor: 'p2', nextCursor: null, hasMore: false,
      items: [{ externalId: 'post-2', contentType: 'post',
        publishedAt: '2026-10-07T12:00:00.000Z' }] });
    await store.finishRun(run.id, run.leaseEpoch);
    const duplicate = await store.startRun(input);
    if (duplicate.status !== 'completed' || duplicate.id !== run.id) throw fail('ISOLATED_RUN_NOT_IDEMPOTENT');
    const jobs = await store.claimAnalysisJobs({ sourceId: SOURCE_ID, limit: 10 });
    if (jobs.length !== 2) throw fail('ISOLATED_OUTBOX_MISMATCH');
    for (const job of jobs) await store.completeAnalysisJob(job.id, job.leaseEpoch,
      { sentiment: 'neutral', modelName: 'fixture' }, { queueDeep: true });
    const deepJobs = await store.claimAnalysisJobs({ sourceId: SOURCE_ID, limit: 10 });
    if (deepJobs.length !== 2 || deepJobs.some(job => job.profile !== 'deep')) throw fail('ISOLATED_DEEP_OUTBOX_MISMATCH');
    for (const job of deepJobs) await store.completeAnalysisJob(job.id, job.leaseEpoch,
      { sentiment: 'neutral', modelName: 'fixture' });
    const fixture = await executeIsolatedFixture({ mode: 'isolated-test', store, sites,
      configHash: 'a'.repeat(64),
      source: { id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID,
        region_code: 'overseas', platform: 'bigplayer_h5', config: { boardId: BOARD_ID } },
      account: { id: input.accountId, source_id: SOURCE_ID, platform: 'bigplayer_h5' },
      publishedFrom: '2026-10-06T00:00:00.000Z', publishedTo: input.publishedFrom,
      connector: {
        async discoverFeeds() { return [{ boardId: BOARD_ID, feedKey: 'merged' }]; },
        async listFeedContents({ source, cursor }) {
          if (cursor) throw fail('ISOLATED_FIXTURE_CURSOR_UNEXPECTED');
          return { items: [{ externalId: `fixture-post-${source.siteId}`, contentType: 'post',
            publishedAt: '2026-10-06T12:00:00.000Z' }],
            hasMore: false, nextCursor: null, capability: 'authorized_scope' };
        },
        async listComments({ source, postId, commentId, cursor }) {
          if (cursor) throw fail('ISOLATED_FIXTURE_CURSOR_UNEXPECTED');
          if (commentId) return { items: [{ externalId: `fixture-reply-${source.siteId}`,
            platformParentId: commentId, publishedAt: '2026-10-06T12:00:00.000Z' }], hasMore: false, nextCursor: null,
            capability: 'authorized_scope' };
          return { items: [{ externalId: `fixture-comment-${source.siteId}`,
            publishedAt: '2026-10-06T12:00:00.000Z' }],
            replyTargets: [{ postId, commentId: `fixture-comment-${source.siteId}` }],
            hasMore: false, nextCursor: null, capability: 'authorized_scope' };
        }
      },
      ai: { configured: () => true, async analyzeBatch(items) {
        return items.map(() => ({ sentiment: 'neutral', modelName: 'fixture' }));
      } }, deepPolicy: () => true });
    if (fixture.collection.siteRuns.length !== 3 || fixture.analysisJobs !== 18) {
      throw fail('ISOLATED_THREE_SITE_PIPELINE_MISMATCH');
    }
    const [[counts]] = await control.query(`SELECT
      (SELECT COUNT(*) FROM ln_last_night.ln_contents) AS contents,
      (SELECT COUNT(*) FROM ln_last_night.ln_tasks) AS tasks,
      (SELECT COUNT(*) FROM ln_last_night.ln_analysis_jobs) AS jobs,
      (SELECT COUNT(*) FROM ln_last_night.ln_analysis_results) AS results`);
    if (Number(counts.contents) !== 11 || Number(counts.tasks) !== 10 ||
      Number(counts.jobs) !== 22 || Number(counts.results) !== 22) {
      throw fail('ISOLATED_PERSISTENCE_MISMATCH');
    }
    const crashWindow = { publishedFrom: '2026-10-05T00:00:00.000Z',
      publishedTo: '2026-10-06T00:00:00.000Z' };
    const crashChild = spawn(process.execPath,
      [path.join(__dirname, 'lastnight-isolated-crash-child.js')],
      { windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'ignore'] });
    crashChild.stdin.on('error', () => {});
    crashChild.stdin.end(JSON.stringify({ identity: storeIdentity, user: fixtureUser,
      password: fixturePassword, accountId: input.accountId,
      siteId: sites[0].siteId, siteUrl: sites[0].url, ...crashWindow }));
    const crashExit = await childExit(crashChild, 15000);
    if (crashExit.code !== 77) throw fail('ISOLATED_CRASH_CHILD_FAILED');
    const [crashRuns] = await control.query(`SELECT id FROM ln_last_night.ln_runs
      WHERE site_id=? AND window_start=? AND window_end=?`,
    [sites[0].siteId, utcSql(crashWindow.publishedFrom), utcSql(crashWindow.publishedTo)]);
    if (crashRuns.length !== 1) throw fail('ISOLATED_CRASH_RUN_MISSING');
    await control.query(`UPDATE ln_last_night.ln_runs SET lease_until=UTC_TIMESTAMP(3)-INTERVAL 1 SECOND
      WHERE id=?`, [crashRuns[0].id]);
    const resumedStore = new LastNightIsolatedStore({ pool, identity: storeIdentity,
      analysisVersions: { light: 'test-light-v1', deep: 'test-deep-v1' } });
    const resumedCursors = [];
    const recovery = await collectIsolated({ source: {
      id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID,
      region_code: 'overseas', platform: 'bigplayer_h5', config: { boardId: BOARD_ID }
    }, account: { id: input.accountId, source_id: SOURCE_ID, platform: 'bigplayer_h5' },
    sites, store: resumedStore, ...crashWindow,
    connector: {
      async discoverFeeds() { return [{ boardId: BOARD_ID, feedKey: 'merged' }]; },
      async listFeedContents({ source }) {
        return { items: source.siteId === sites[0].siteId
          ? [{ externalId: 'crash-post', contentType: 'post',
            publishedAt: '2026-10-05T12:00:00.000Z' }] : [],
        hasMore: false, capability: 'authorized_scope' };
      },
      async listComments({ cursor }) {
        resumedCursors.push(cursor);
        if (cursor !== 'c2') throw fail('ISOLATED_CRASH_CURSOR_RESTARTED');
        return { items: [{ externalId: 'crash-comment-2', contentType: 'comment',
          publishedAt: '2026-10-05T12:00:00.000Z' }],
          hasMore: false, capability: 'authorized_scope' };
      }
    } });
    const resumedPage = await resumedStore.loadPageState({ runId: crashRuns[0].id,
      scope: 'comments', feedKey: 'merged', rootPostId: 'crash-post' });
    if (recovery.siteRuns.length !== 3 || resumedCursors.length !== 1 ||
      resumedPage.status !== 'complete' || resumedPage.pageSeq !== 2) {
      throw fail('ISOLATED_CRASH_RECOVERY_FAILED');
    }
    for (;;) {
      const analysis = await consumeIsolatedAnalysis({ store: resumedStore,
        ai: { configured: () => true, async analyzeBatch(items) {
          return items.map(() => ({ sentiment: 'neutral', modelName: 'fixture' }));
        } }, deepPolicy: () => true });
      if (!analysis.jobs) break;
    }
    const [[finalCounts]] = await control.query(`SELECT
      (SELECT COUNT(*) FROM ln_last_night.ln_contents) AS contents,
      (SELECT COUNT(*) FROM ln_last_night.ln_tasks) AS tasks,
      (SELECT COUNT(*) FROM ln_last_night.ln_analysis_jobs) AS jobs,
      (SELECT COUNT(*) FROM ln_last_night.ln_analysis_results) AS results`);
    if (Number(finalCounts.contents) !== 14 || Number(finalCounts.tasks) !== 14 ||
      Number(finalCounts.jobs) !== 28 || Number(finalCounts.results) !== 28) {
      throw fail('ISOLATED_CRASH_PERSISTENCE_MISMATCH');
    }
    await pool.end();
    pool = null;
    result = { status: 'PASS_ISOLATED_DB_E2E', code: 'PERSISTENCE_AND_ROLLBACK_VERIFIED',
      productionTouched: false, port, serverId, contents: 14, tasks: 14, jobs: 28, results: 28,
      threeSiteRuns: fixture.collection.siteRuns.length,
      crashChildExitCode: crashExit.code, crashRecovery: true, resumedCommentPageSeq: resumedPage.pageSeq,
      fixtureDbUser: userRow.dbUser, fixtureGrantCount: grantRows.length,
      fixtureGrantsVerified: true, rollbackConfirmed, mixedScopeRejected,
      outsideWindowRejected, staleLeaseRejected,
      incompleteTasksRejected, schemaSha256: shaFile(schemaPath),
      storeSha256: shaFile(path.resolve(__dirname, '../worker/src/lastNightIsolatedStore.js')) };
  } catch (error) {
    result = { status: 'NO_GO_ISOLATED_DB', code: /^[A-Z0-9_]+$/.test(error?.code || '')
      ? error.code : 'ISOLATED_DB_FAILED', productionTouched: false };
  } finally {
    if (pool) await pool.end().catch(() => {});
    if (control) {
      if (identityVerified && !serverClosed) {
        try {
          const [[identity]] = await control.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,@@pid_file AS pidFile');
          if (ownIdentity({ ...identity, version })) {
            await control.query('SHUTDOWN');
          } else {
            result.status = 'NO_GO_ISOLATED_DB'; result.code = 'ISOLATED_CLEANUP_IDENTITY_MISMATCH';
          }
        } catch { result.status = 'NO_GO_ISOLATED_DB'; result.code = 'ISOLATED_CLEANUP_IDENTITY_UNCONFIRMED'; }
      }
      await control.end().catch(() => {});
    }
    if (server) {
      await Promise.race([serverClose, sleep(3000)]);
      if (!serverClosed) server.kill();
      await Promise.race([serverClose, sleep(3000)]);
    }
    fs.closeSync(initLog);
    if (serverLog !== undefined) fs.closeSync(serverLog);
    result.serverStopped = serverClosed;
    result.portReleased = await portFree().then(() => true, () => false);
    if (!result.serverStopped || !result.portReleased) {
      result.status = 'NO_GO_ISOLATED_DB'; result.code = 'ISOLATED_CLEANUP_UNCONFIRMED';
    }
    result.evidenceDir = evidenceDir;
    fs.writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.status !== 'PASS_ISOLATED_DB_E2E') process.exitCode = 1;
  }
}

if (require.main === module) main().catch(error => {
  process.stderr.write(JSON.stringify({ status: 'NO_GO_ISOLATED_DB',
    code: /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'ISOLATED_DB_PRECHECK_FAILED' }) + '\n');
  process.exitCode = 1;
});

module.exports = { main, ownsInstance };
