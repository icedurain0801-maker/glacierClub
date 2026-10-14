'use strict';
// Risk-specific verification. Never reads service env or connects to its database.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const root = path.resolve(__dirname, '../../..'), temp = path.join(root, '.temp');
const bin = 'C:/xampp/mysql/bin', port = 13316, serverId = 20261036, database = 'po_risk_fixture';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => probe.close(resolve));
}
async function main() {
  assert.equal(process.argv[2], '--isolated');
  assert.equal(process.argv[3], '--candidate');
  assert.equal(process.argv.length, 5);
  const manifestPath = path.resolve(process.argv[4]), manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.productionChanged, false);
  for (const overlay of Object.values(manifest.overlays)) for (const file of overlay.files) assert.equal(hash(path.join(overlay.runtime, file.path)), file.candidateSha256);
  for (const directory of [root, temp]) {
    assert(!fs.lstatSync(directory).isSymbolicLink());
    assert.equal(fs.realpathSync(directory), directory);
  }
  assert(fs.statfsSync(temp).bavail * fs.statfsSync(temp).bsize > 4 * 1024 ** 3);
  assert(fs.readFileSync(path.join(bin, 'mysql_install_db.exe')).toString('latin1').includes('--no-defaults %s --innodb-page-size=%d --bootstrap'));
  await freePort();
  const directory = fs.mkdtempSync(path.join(temp, 'risk-isolated-db-'));
  const dataDir = path.join(directory, 'data'), pidFile = path.join(directory, 'mysqld.pid');
  assert.equal(path.dirname(directory), temp);
  const result = { status: 'FAIL', productionTouched: false, directory, port, serverId, checks: [] };
  let server, control, closed = false, app; const pools = [];
  async function owns() {
    const [[row]] = await control.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,@@pid_file AS pidFile,VERSION() AS version');
    return row.port === port && row.serverId === serverId && path.resolve(row.datadir).toLowerCase() === dataDir.toLowerCase()
      && path.resolve(row.pidFile).toLowerCase() === pidFile.toLowerCase() && row.version === '10.4.14-MariaDB'
      && Number(fs.readFileSync(pidFile, 'utf8').trim()) === server.pid;
  }
  try {
    const init = spawnSync(path.join(bin, 'mysql_install_db.exe'), [`--datadir=${dataDir}`, `--port=${port}`], {
      encoding: 'utf8', timeout: 60000, windowsHide: true, shell: false,
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: `C:/Windows/System32;${bin}` }
    });
    fs.writeFileSync(path.join(directory, 'init.log'), `${init.stdout || ''}\n${init.stderr || ''}`, { flag: 'wx' });
    assert.equal(init.status, 0, 'isolated initializer failed');
    const log = fs.openSync(path.join(directory, 'server.log'), 'wx');
    server = spawn(path.join(bin, 'mysqld.exe'), ['--no-defaults', '--basedir=C:/xampp/mysql', `--datadir=${dataDir}`, '--bind-address=127.0.0.1', `--port=${port}`, `--server-id=${serverId}`, `--pid-file=${pidFile}`, '--skip-log-bin', '--event-scheduler=OFF', '--innodb-buffer-pool-size=64M', '--max-connections=15'], { windowsHide: true, shell: false, stdio: ['ignore', log, log] });
    fs.closeSync(log); server.once('close', () => { closed = true; });
    let spawnError; server.once('error', error => { spawnError = error; });
    for (let i = 0; i < 100 && !control; i++) {
      assert(!spawnError); assert.equal(server.exitCode, null);
      try { control = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', connectTimeout: 1000, dateStrings: true }); }
      catch { await pause(200); }
    }
    assert(control && await owns(), 'isolated identity mismatch');
    result.checks.push('owned_instance_identity');
    await control.query(`CREATE DATABASE ${database}`); await control.changeUser({ database });
    const schema = fs.readFileSync(path.join(__dirname, '../.tests/2026-10/2026-10-10/risk-normalization-schema.sql'), 'utf8');
    for (const statement of schema.split(/;\s*(?:\r?\n|$)/).filter(value => value.trim())) await control.query(statement);
    const password = crypto.randomBytes(24).toString('hex');
    await control.query("CREATE USER 'risk_fixture'@'127.0.0.1' IDENTIFIED BY ?", [password]);
    await control.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.* TO 'risk_fixture'@'127.0.0.1'`);
    const env = { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: database, DB_USER: 'risk_fixture', DB_PASSWORD: password, DB_POOL_SIZE: '4' };
    const envFile = path.join(directory, 'fixture.env');
    fs.writeFileSync(envFile, Object.entries({ ...env, AI_ANALYSIS_ENABLED: 'false', DINGTALK_ENABLED: 'false' }).map(([key, value]) => `${key}=${value}`).join('\n'));
    process.env.PUBLIC_OPINION_SERVICE_MODE = '1'; process.env.PUBLIC_OPINION_ENV_FILE = envFile;
    Object.assign(process.env, env, { AI_ANALYSIS_ENABLED: 'false', DINGTALK_ENABLED: 'false' });
    global.fetch = async () => { throw new Error('external network forbidden in risk fixture'); };
    const ids = Array.from({ length: 7 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
    const [gameId, communityId, sourceId, positiveId, negativeId, mildId, neutralId] = ids;
    await control.query("INSERT INTO po_games(id,name,kind,identifiers,region_code) VALUES (?,'fixture','owned','{}','domestic')", [gameId]);
    await control.query("INSERT INTO po_communities(id,game_id,name) VALUES (?,?,'fixture')", [communityId, gameId]);
    await control.query("INSERT INTO po_sources(id,game_id,community_id,platform,source_type,display_name,enabled,config) VALUES (?,?,?,'bigplayer_h5','owned_community','fixture',1,'{}')", [sourceId, gameId, communityId]);
    for (const [index, id] of [positiveId, negativeId, mildId, neutralId].entries()) {
      await control.query("INSERT INTO po_contents(id,game_id,community_id,source_id,external_id,content_type,title,body,media,published_at,engagement,fingerprint,source_url) VALUES (?,?,?,?,?,'post','fixture','fixture','[]',NOW(),'{}',?,'https://example.invalid/fixture')", [id, gameId, communityId, sourceId, `fixture-${index}`, `fp-${index}`]);
    }
    for (const [role, overlay] of Object.entries(manifest.overlays)) {
      const { Repository } = require(path.join(overlay.runtime, 'server/src/db/repository'));
      const repo = new Repository(env); pools.push(repo.pool);
      const writes = [
        [positiveId, { sentiment: 'positive', severity: 'urgent', negativeScore: 0.99, confidence: 0, qualityScore: 0.94, recommendHome: true, recommendFeature: true }],
        [negativeId, { sentiment: 'negative', severity: 'attention', negativeScore: 0.5, confidence: 0.1 }],
        [mildId, { sentiment: 'negative', severity: 'attention', negativeScore: 0.499, confidence: 1, gameComplaint: false }],
        [neutralId, { sentiment: 'neutral', severity: 'normal', negativeScore: 0.9, gameComplaint: false }]
      ];
      for (const [index, [id, analysis]] of writes.entries()) await repo.insertAnalysis(id, { ...analysis, contentFingerprint: `fp-${index}`, normalizationBatchId: `fixture-${role}`, reason: '原模型说明', analysisVersion: 'fixture-v1' });
      const rows = await repo.query('SELECT content_id,sentiment,severity,recommend_home FROM po_analyses');
      assert.equal(rows.find(row => row.content_id === positiveId).severity, 'normal');
      assert.equal(rows.find(row => row.content_id === positiveId).recommend_home, 1);
      assert.equal(rows.find(row => row.content_id === negativeId).severity, 'urgent');
      assert.equal(rows.find(row => row.content_id === mildId).severity, 'attention');
      assert.equal(rows.find(row => row.content_id === neutralId).severity, 'normal');
      await repo.upsertAnalysisCache({ ...writes[0][1], cacheKey: `fixture-${role}`, contentFingerprint: 'fp-0', profile: 'light', version: 'fixture-v1', modelName: 'fixture' });
      assert.equal((await repo.getAnalysisCache([`fixture-${role}`]))[0].severity, 'normal');
      await assert.rejects(repo.insertAnalysis(positiveId, { sentiment: 'positive', severity: 'attention', contentFingerprint: 'obsolete' }), { code: 'ANALYSIS_CONTENT_CHANGED' });
      await repo.enqueueAnalysisJob(positiveId, { version: 'fixture-v1', contentFingerprint: 'old' });
      await repo.query("UPDATE po_analysis_jobs SET status='running',attempts=2,lease_owner='old-owner' WHERE content_id=?", [positiveId]);
      await repo.enqueueAnalysisJob(positiveId, { version: 'fixture-v1', contentFingerprint: 'fp-0' });
      const [job] = await repo.query('SELECT status,attempts,lease_owner,content_fingerprint FROM po_analysis_jobs WHERE content_id=?', [positiveId]);
      assert.equal(job.status, 'pending'); assert.equal(job.attempts, 0); assert.equal(job.lease_owner, null); assert.equal(job.content_fingerprint, 'fp-0');
      assert.equal(await repo.countContents({ riskMode: 'attention' }), 1);
      assert.equal(await repo.countContents({ riskMode: 'negative' }), 1);
      assert.deepEqual(await repo.getContentStats({}), { post: 4, comment: 0, negative: 1, attention: 1 });
      const overview = await repo.getOverview({});
      assert.equal(overview.metrics.negative, 1); assert.equal(overview.metrics.attention, 1);
      assert.equal(overview.hotAttention[0].id, mildId); assert.equal(overview.hotNegative[0].id, negativeId);
      if (role !== 'api') {
        const worker = require(path.join(overlay.runtime, 'worker/src/worker'));
        assert.equal(worker.effectiveAnalysisForAlert({ sentiment: 'positive', severity: 'normal' }, { sentiment: 'negative', severity: 'urgent' }).severity, 'normal');
        assert.equal(worker.normalizePersistedAnalysis({ sentiment: 'positive', severity: 'attention' }).severity, 'normal');
      }
      result.checks.push(`${role}_repository_cache_queue_cas_list_overview`);
      await repo.pool.end(); pools.pop();
    }
    const apiRoot = manifest.overlays.api.runtime;
    app = require(path.join(apiRoot, 'server/src/app'));
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const apiPort = app.server.address().port;
    async function get(url) {
      return new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: apiPort, path: url }, response => {
        let body = ''; response.on('data', data => { body += data; }); response.on('end', () => {
          try { assert.equal(response.statusCode, 200, body); resolve(JSON.parse(body)); } catch (error) { reject(error); }
        });
      }).on('error', reject));
    }
    const attention = await get('/api/public-opinion/contents?riskMode=attention');
    const negative = await get('/api/public-opinion/contents?riskMode=negative');
    const overview = await get('/api/public-opinion/overview?fresh=1');
    assert.equal(attention.meta.total, 1); assert.equal(negative.meta.total, 1);
    assert.equal(attention.data[0].id, mildId); assert.equal(negative.data[0].id, negativeId);
    assert.equal(overview.data.metrics.attention, 1); assert.equal(overview.data.metrics.negative, 1);
    result.checks.push('actual_loopback_api_contents_and_overview');
    const [[audit]] = await control.query("SELECT detail FROM po_audit_events WHERE event_type='analysis_result_persisted' ORDER BY created_at,id LIMIT 1");
    assert(JSON.parse(audit.detail).rawAnalysis);
    result.status = 'PASS_ISOLATED';
  } catch (error) { result.error = error.code || error.message; result.missingField = /Field '([^']+)' doesn't have/.exec(error.message)?.[1]; result.stack = error.stack?.split('\n').slice(1, 3).join('\n'); process.exitCode = 1; }
  finally {
    if (app) { await new Promise(resolve => app.server.close(resolve)); await app.repo.pool.end(); }
    for (const pool of pools) await pool.end().catch(() => {});
    if (control) {
      try { if (server && await owns()) await control.query('SHUTDOWN'); else result.identityLost = true; }
      catch (error) { result.shutdownError = error.code || error.message; }
      await control.end().catch(() => {});
    }
    for (let i = 0; i < 100 && !closed; i++) await pause(200);
    result.serverStopped = closed;
    try { await freePort(); result.portReleased = true; } catch { result.portReleased = false; }
    if (!closed || !result.portReleased || result.shutdownError) { result.status = 'FAIL'; process.exitCode = 1; }
    fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
