'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { SOURCE_ID, BOARD_ID } = require('./lastNightOverseasDailyJob');

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const utcSql = value => new Date(value).toISOString().replace('T', ' ').replace('Z', '');
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function taskHash({ scope, feedKey, rootPostId = '', commentId = '' }) {
  return sha(JSON.stringify([scope, feedKey, rootPostId, commentId]));
}
function grantsAreIsolated(rows, user) {
  if (!Array.isArray(rows) || !rows.length) return false;
  const account = user.toUpperCase();
  let databaseDml = false;
  for (const row of rows) {
    const grant = String(Object.values(row)[0] || '').toUpperCase();
    const match = /^GRANT (.+?) ON (.+?) TO ((?:'[^']+'@'[^']+')|(?:`[^`]+`@`[^`]+`))(.*)$/.exec(grant);
    if (!match || match[3].replace(/['`]/g, '') !== account ||
      !/^(?:| IDENTIFIED BY PASSWORD '\*[0-9A-F]+')$/.test(match[4])) return false;
    const scope = match[2].replace(/`/g, '');
    const privileges = match[1].split(',').map(value => value.trim()).sort();
    if (scope === '*.*' && privileges.join(',') === 'USAGE') continue;
    if (scope === 'LN_LAST_NIGHT.*' && privileges.join(',') === 'DELETE,INSERT,SELECT,UPDATE') {
      databaseDml = true;
      continue;
    }
    return false;
  }
  return databaseDml;
}

class LastNightIsolatedStore {
  constructor({ pool, identity, analysisVersions, leaseOwner = crypto.randomUUID(), isolatedTest = false } = {}) {
    if (!pool?.getConnection || !identity || identity.host !== '127.0.0.1' ||
      !Number.isInteger(identity.port) || identity.port < 43300 || identity.port > 43399 ||
      !Number.isInteger(identity.serverId) || identity.serverId <= 1 ||
      identity.database !== 'ln_last_night' || !path.isAbsolute(identity.datadir || '') ||
      !identity.version || !identity.user ||
      (!isolatedTest && !/^po_lastnight_writer_[a-z0-9_]+@(127\.0\.0\.1|localhost)$/.test(identity.user)) ||
      !analysisVersions?.light || !analysisVersions?.deep) fail('LAST_NIGHT_STORE_CONFIG_INVALID');
    this.pool = pool;
    this.identity = identity;
    this.analysisVersions = analysisVersions;
    this.leaseOwner = leaseOwner;
    this.isolatedTest = isolatedTest;
  }

  async connection() {
    const conn = await this.pool.getConnection();
    try {
      const [[row]] = await conn.query(`SELECT @@hostname AS hostname,@@port AS port,
        @@server_id AS serverId,@@datadir AS datadir,VERSION() AS version,
        DATABASE() AS db,CURRENT_USER() AS dbUser`);
      const actualDir = path.resolve(row?.datadir || '').toLowerCase();
      const expectedDir = path.resolve(this.identity.datadir).toLowerCase();
      if (Number(row?.port) !== this.identity.port || Number(row?.serverId) !== this.identity.serverId ||
        actualDir !== expectedDir || row?.version !== this.identity.version ||
        row?.db !== this.identity.database || row?.dbUser !== this.identity.user) {
        fail('LAST_NIGHT_STORE_IDENTITY_MISMATCH');
      }
      if (!this.isolatedTest) {
        const [grants] = await conn.query('SHOW GRANTS');
        if (!grantsAreIsolated(grants, this.identity.user)) fail('LAST_NIGHT_STORE_GRANTS_UNSAFE');
      }
      await conn.query("SET SESSION time_zone='+00:00'");
      return conn;
    } catch (error) { conn.release(); throw error; }
  }

  async freezeSites({ sites, configHash }) {
    if (!Array.isArray(sites) || sites.length !== 3 || !/^[a-f0-9]{64}$/.test(configHash || '')) {
      fail('LAST_NIGHT_STORE_SITES_INVALID');
    }
    const conn = await this.connection();
    try {
      await conn.beginTransaction();
      for (const site of sites) {
        const [rows] = await conn.query('SELECT board_id,url_snapshot,url_hash,config_hash FROM ln_sites WHERE source_id=? AND site_id=? FOR UPDATE', [SOURCE_ID, site.siteId]);
        const urlHash = sha(site.url);
        if (rows.length) {
          if (rows[0].board_id !== BOARD_ID || rows[0].url_snapshot !== site.url ||
            rows[0].url_hash !== urlHash || rows[0].config_hash !== configHash) fail('LAST_NIGHT_STORE_SITE_DRIFT');
        } else {
          await conn.query('INSERT INTO ln_sites (source_id,site_id,board_id,url_snapshot,url_hash,config_hash) VALUES (?,?,?,?,?,?)',
            [SOURCE_ID, site.siteId, BOARD_ID, site.url, urlHash, configHash]);
        }
      }
      const [[count]] = await conn.query('SELECT COUNT(*) AS n FROM ln_sites WHERE source_id=?', [SOURCE_ID]);
      if (Number(count.n) !== 3) fail('LAST_NIGHT_STORE_SITE_DRIFT');
      await conn.commit();
    } catch (error) { await conn.rollback().catch(() => {}); throw error; }
    finally { conn.release(); }
  }

  async startRun(input) {
    if (input.sourceId !== SOURCE_ID || input.boardId !== BOARD_ID || !input.accountId || !input.siteId) {
      fail('LAST_NIGHT_STORE_SCOPE_MISMATCH');
    }
    const conn = await this.connection();
    try {
      await conn.beginTransaction();
      const from = utcSql(input.publishedFrom), to = utcSql(input.publishedTo);
      const [siteRows] = await conn.query('SELECT url_snapshot FROM ln_sites WHERE source_id=? AND site_id=? FOR UPDATE', [SOURCE_ID, input.siteId]);
      if (siteRows.length !== 1 || siteRows[0].url_snapshot !== input.siteUrl) fail('LAST_NIGHT_STORE_SITE_DRIFT');
      const [rows] = await conn.query(`SELECT id,status,account_id,board_id,site_url_snapshot,
        lease_owner,lease_epoch,
        (lease_until>UTC_TIMESTAMP(3)) AS lease_active FROM ln_runs
        WHERE source_id=? AND site_id=? AND window_start=? AND window_end=? FOR UPDATE`,
      [SOURCE_ID, input.siteId, from, to]);
      let run;
      if (rows.length) {
        run = rows[0];
        if (run.account_id !== input.accountId || run.board_id !== BOARD_ID ||
          run.site_url_snapshot !== input.siteUrl) fail('LAST_NIGHT_STORE_RUN_IDENTITY_DRIFT');
        if (run.status === 'blocked') fail('LAST_NIGHT_STORE_RUN_BLOCKED');
        if (run.status === 'failed' && input.retryFailed !== true) fail('LAST_NIGHT_STORE_RETRY_APPROVAL_REQUIRED');
        if (run.status !== 'completed') {
          if (Number(run.lease_active) === 1 && run.lease_owner !== this.leaseOwner) fail('LAST_NIGHT_STORE_RUN_LEASED');
          const epoch = Number(run.lease_epoch) + 1;
          await conn.query(`UPDATE ln_runs SET status='running',lease_owner=?,lease_epoch=?,
            lease_until=UTC_TIMESTAMP(3)+INTERVAL 300 SECOND,error_code=NULL WHERE id=?`,
          [this.leaseOwner, epoch, run.id]);
          run = { id: run.id, status: 'running', leaseEpoch: epoch };
        }
      } else {
        run = { id: crypto.randomUUID(), status: 'running', leaseEpoch: 1 };
        await conn.query(`INSERT INTO ln_runs (id,source_id,account_id,site_id,board_id,
          site_url_snapshot,window_start,window_end,status,lease_owner,lease_epoch,lease_until)
          VALUES (?,?,?,?,?,?,?,?,'running',?,1,UTC_TIMESTAMP(3)+INTERVAL 300 SECOND)`,
        [run.id, SOURCE_ID, input.accountId, input.siteId, BOARD_ID, input.siteUrl,
          from, to, this.leaseOwner]);
      }
      await conn.commit();
      return run;
    } catch (error) { await conn.rollback().catch(() => {}); throw error; }
    finally { conn.release(); }
  }

  async loadPageState(key) {
    const conn = await this.connection();
    try {
      const [rows] = await conn.query('SELECT next_cursor,status,page_seq FROM ln_pages WHERE run_id=? AND task_hash=?',
        [key.runId, taskHash(key)]);
      return rows[0] ? { nextCursor: rows[0].next_cursor, status: rows[0].status,
        pageSeq: Number(rows[0].page_seq) } : null;
    } finally { conn.release(); }
  }

  async renewRunLease(id, leaseEpoch) {
    if (!id || !Number.isSafeInteger(leaseEpoch) || leaseEpoch < 1) fail('LAST_NIGHT_STORE_LEASE_INVALID');
    const conn = await this.connection();
    try {
      const [result] = await conn.query(`UPDATE ln_runs SET
        lease_until=UTC_TIMESTAMP(3)+INTERVAL 300 SECOND WHERE id=? AND status='running'
        AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)`,
      [id, this.leaseOwner, leaseEpoch]);
      if (result.affectedRows !== 1) fail('LAST_NIGHT_STORE_LEASE_LOST');
    } finally { conn.release(); }
  }

  async registerFeeds(runId, leaseEpoch, feeds) {
    if (!Array.isArray(feeds) || !feeds.length ||
      feeds.some(feed => !feed?.feedKey || typeof feed.feedKey !== 'string') ||
      new Set(feeds.map(feed => feed.feedKey)).size !== feeds.length) fail('LAST_NIGHT_STORE_FEEDS_INVALID');
    const manifestHash = sha(JSON.stringify(feeds.map(feed => feed.feedKey).sort()));
    const conn = await this.connection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(`SELECT feed_manifest_hash,lease_owner,lease_epoch,
        (lease_until>UTC_TIMESTAMP(3)) AS lease_active,status FROM ln_runs WHERE id=? FOR UPDATE`, [runId]);
      const run = rows[0];
      if (!run || run.status !== 'running' || run.lease_owner !== this.leaseOwner ||
        Number(run.lease_epoch) !== leaseEpoch || Number(run.lease_active) !== 1) fail('LAST_NIGHT_STORE_LEASE_LOST');
      if (run.feed_manifest_hash && run.feed_manifest_hash !== manifestHash) fail('LAST_NIGHT_STORE_FEED_DRIFT');
      if (!run.feed_manifest_hash) await conn.query('UPDATE ln_runs SET feed_manifest_hash=? WHERE id=?', [manifestHash, runId]);
      for (const feed of feeds) {
        const task = { scope: 'posts', feedKey: feed.feedKey };
        await conn.query(`INSERT IGNORE INTO ln_tasks (run_id,task_hash,scope,feed_key)
          VALUES (?,?,?,?)`, [runId, taskHash(task), task.scope, task.feedKey]);
      }
      await conn.commit();
    } catch (error) { await conn.rollback().catch(() => {}); throw error; }
    finally { conn.release(); }
  }

  async registerTask(input) {
    if (!['comments', 'replies'].includes(input.scope) || !input.feedKey ||
      !input.rootPostId || (input.scope === 'replies' && !input.commentId)) {
      fail('LAST_NIGHT_STORE_TASK_INVALID');
    }
    const conn = await this.connection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(`SELECT lease_owner,lease_epoch,
        (lease_until>UTC_TIMESTAMP(3)) AS lease_active,status
        FROM ln_runs WHERE id=? FOR UPDATE`, [input.runId]);
      const run = rows[0];
      if (!run || run.status !== 'running' || run.lease_owner !== this.leaseOwner ||
        Number(run.lease_epoch) !== input.leaseEpoch || Number(run.lease_active) !== 1) fail('LAST_NIGHT_STORE_LEASE_LOST');
      await conn.query(`INSERT IGNORE INTO ln_tasks
        (run_id,task_hash,scope,feed_key,root_post_id,comment_id) VALUES (?,?,?,?,?,?)`,
      [input.runId, taskHash(input), input.scope, input.feedKey, input.rootPostId,
        input.commentId || '']);
      await conn.commit();
    } catch (error) { await conn.rollback().catch(() => {}); throw error;
    } finally { conn.release(); }
  }

  async commitPage(input) {
    if (input.sourceId !== SOURCE_ID || input.boardId !== BOARD_ID ||
      !['posts', 'comments', 'replies'].includes(input.scope) || !Array.isArray(input.items) ||
      !Number.isSafeInteger(input.leaseEpoch) || input.leaseEpoch < 1 ||
      typeof input.hasMore !== 'boolean' || (input.hasMore && !input.nextCursor)) {
      fail('LAST_NIGHT_STORE_PAGE_INVALID');
    }
    const key = taskHash(input);
    const pageHash = sha(JSON.stringify([input.cursor ?? null, input.nextCursor ?? null,
      input.items.map(item => [item.contentType, item.externalId, item.fingerprint])]));
    const conn = await this.connection();
    try {
      await conn.beginTransaction();
      const [runs] = await conn.query(`SELECT site_id,board_id,window_start,window_end,status,lease_owner,lease_epoch,
        (lease_until>UTC_TIMESTAMP(3)) AS lease_active FROM ln_runs WHERE id=? FOR UPDATE`, [input.runId]);
      const run = runs[0];
      if (!run || run.site_id !== input.siteId || run.board_id !== BOARD_ID ||
        run.status !== 'running' || run.lease_owner !== this.leaseOwner ||
        Number(run.lease_epoch) !== input.leaseEpoch || Number(run.lease_active) !== 1) {
        fail('LAST_NIGHT_STORE_LEASE_LOST');
      }
      const [pages] = await conn.query('SELECT next_cursor,status,page_seq,last_page_hash FROM ln_pages WHERE run_id=? AND task_hash=? FOR UPDATE',
        [input.runId, key]);
      const [tasks] = await conn.query('SELECT task_hash FROM ln_tasks WHERE run_id=? AND task_hash=? FOR UPDATE',
        [input.runId, key]);
      if (tasks.length !== 1) fail('LAST_NIGHT_STORE_TASK_MISSING');
      const current = pages[0];
      if (current?.status === 'complete' || String(current?.next_cursor ?? '') !== String(input.cursor ?? '')) {
        fail('LAST_NIGHT_STORE_CURSOR_CONFLICT');
      }
      for (const item of input.items) {
        if (!item.externalId || !['post', 'comment', 'reply'].includes(item.contentType) ||
          (input.scope === 'posts' && item.contentType !== 'post')) fail('LAST_NIGHT_STORE_CONTENT_INVALID');
        if ((item.sourceId ?? item.source_id ?? SOURCE_ID) !== SOURCE_ID ||
          (item.siteId ?? item.site_id ?? input.siteId) !== input.siteId ||
          String(item.boardId ?? item.board_id ?? BOARD_ID) !== BOARD_ID ||
          (input.scope !== 'posts' &&
            String(item.rootPlatformContentId ?? item.root_post_id ?? '') !== String(input.rootPostId))) {
          fail('LAST_NIGHT_STORE_CONTENT_SCOPE_MISMATCH');
        }
        const published = new Date(item.publishedAt ?? item.published_at).getTime();
        const windowStart = Date.parse(`${String(run.window_start).replace(' ', 'T')}Z`);
        const windowEnd = Date.parse(`${String(run.window_end).replace(' ', 'T')}Z`);
        if (!Number.isFinite(published) || published < windowStart || published >= windowEnd) {
          fail('LAST_NIGHT_STORE_CONTENT_WINDOW_INVALID');
        }
        const fingerprint = item.fingerprint || sha(`${item.title || ''}\n${item.body || ''}\n${item.authorName || ''}`);
        const id = crypto.randomUUID();
        await conn.query(`INSERT INTO ln_contents (id,source_id,site_id,board_id,content_type,
          external_id,root_post_id,parent_external_id,title,body,author_name,published_at,
          source_url,fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE title=VALUES(title),body=VALUES(body),
          author_name=VALUES(author_name),published_at=VALUES(published_at),
          source_url=VALUES(source_url),fingerprint=VALUES(fingerprint),updated_at=UTC_TIMESTAMP(3)`,
        [id, SOURCE_ID, input.siteId, BOARD_ID, item.contentType, String(item.externalId),
          String(item.rootPlatformContentId || input.rootPostId || ''), String(item.platformParentId || ''),
          item.title || '', item.body || '', item.authorName || '',
          item.publishedAt ? utcSql(item.publishedAt) : null, item.sourceUrl || '', fingerprint]);
        const [contents] = await conn.query(`SELECT id FROM ln_contents WHERE source_id=? AND site_id=?
          AND board_id=? AND content_type=? AND external_id=?`,
        [SOURCE_ID, input.siteId, BOARD_ID, item.contentType, String(item.externalId)]);
        const contentId = contents[0].id;
        await conn.query('INSERT IGNORE INTO ln_run_contents (run_id,content_id,scope) VALUES (?,?,?)',
          [input.runId, contentId, input.scope]);
        await conn.query(`INSERT INTO ln_analysis_jobs (id,content_id,profile,version,
          content_fingerprint,status) VALUES (?,?, 'light',?,?,'pending')
          ON DUPLICATE KEY UPDATE id=id`,
        [crypto.randomUUID(), contentId, this.analysisVersions.light, fingerprint]);
      }
      if (current) {
        await conn.query(`UPDATE ln_pages SET next_cursor=?,status=?,page_seq=page_seq+1,
          last_page_hash=?,updated_at=UTC_TIMESTAMP(3) WHERE run_id=? AND task_hash=?`,
        [input.nextCursor || null, input.hasMore ? 'running' : 'complete', pageHash, input.runId, key]);
      } else {
        await conn.query(`INSERT INTO ln_pages (run_id,task_hash,scope,feed_key,root_post_id,
          comment_id,next_cursor,status,page_seq,last_page_hash) VALUES (?,?,?,?,?,?,?,?,1,?)`,
        [input.runId, key, input.scope, input.feedKey, input.rootPostId || '', input.commentId || '',
          input.nextCursor || null, input.hasMore ? 'running' : 'complete', pageHash]);
      }
      await conn.commit();
    } catch (error) { await conn.rollback().catch(() => {}); throw error; }
    finally { conn.release(); }
  }

  async finishRun(id, leaseEpoch) {
    const conn = await this.connection();
    try {
      await conn.beginTransaction();
      const [runs] = await conn.query(`SELECT status,lease_owner,lease_epoch,feed_manifest_hash,
        (lease_until>UTC_TIMESTAMP(3)) AS lease_active FROM ln_runs WHERE id=? FOR UPDATE`, [id]);
      if (runs[0]?.status !== 'running' || runs[0]?.lease_owner !== this.leaseOwner ||
        Number(runs[0].lease_epoch) !== leaseEpoch || Number(runs[0].lease_active) !== 1) fail('LAST_NIGHT_STORE_LEASE_LOST');
      if (!runs[0].feed_manifest_hash) fail('LAST_NIGHT_STORE_FEEDS_MISSING');
      const [[tasks]] = await conn.query(`SELECT COUNT(*) AS n,
        SUM(CASE WHEN p.status='complete' THEN 0 ELSE 1 END) AS incomplete
        FROM ln_tasks t LEFT JOIN ln_pages p ON p.run_id=t.run_id AND p.task_hash=t.task_hash
        WHERE t.run_id=?`, [id]);
      if (!Number(tasks.n) || Number(tasks.incomplete)) fail('LAST_NIGHT_STORE_TASKS_INCOMPLETE');
      await conn.query(`UPDATE ln_runs SET status='completed',lease_owner=NULL,lease_until=NULL,
        finished_at=UTC_TIMESTAMP(3) WHERE id=?`, [id]);
      await conn.commit();
    } catch (error) { await conn.rollback().catch(() => {}); throw error; }
    finally { conn.release(); }
  }

  async failRun(id, leaseEpoch, code) {
    const conn = await this.connection();
    try {
      const terminal = /^(UNAUTHORIZED|H5_HTTP_40[13]|CREDENTIAL_|LOGIN_|AUTHORIZATION_|BOARD_|LAST_NIGHT_ISOLATED_SCOPE|LAST_NIGHT_ISOLATED_PAGE_INCOMPLETE|COLLECTION_BOUNDARY_)/.test(String(code));
      await conn.query(`UPDATE ln_runs SET status=?,error_code=?,lease_owner=NULL,
        lease_until=NULL,finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'
        AND lease_owner=? AND lease_epoch=?`, [terminal ? 'blocked' : 'failed',
          String(code).slice(0, 100), id, this.leaseOwner, leaseEpoch]);
    } finally { conn.release(); }
  }

  async claimAnalysisJobs({ sourceId, limit }) {
    if (sourceId !== SOURCE_ID || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('LAST_NIGHT_STORE_SCOPE_MISMATCH');
    const conn = await this.connection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(`SELECT j.*,c.source_id,c.board_id,c.title,c.body,
        c.content_type,c.fingerprint,c.site_id FROM ln_analysis_jobs j
        JOIN ln_contents c ON c.id=j.content_id WHERE c.source_id=? AND
        (j.status='pending' OR (j.status='retryable' AND j.retry_at<=UTC_TIMESTAMP(3)) OR
        (j.status='running' AND j.lease_until<UTC_TIMESTAMP(3)))
        ORDER BY j.id LIMIT ? FOR UPDATE`, [SOURCE_ID, limit]);
      for (const row of rows) await conn.query(`UPDATE ln_analysis_jobs SET status='running',
        lease_owner=?,lease_epoch=lease_epoch+1,lease_until=UTC_TIMESTAMP(3)+INTERVAL 300 SECOND
        WHERE id=?`, [this.leaseOwner, row.id]);
      await conn.commit();
      return rows.map(row => ({ id: row.id, sourceId: row.source_id, boardId: row.board_id,
        profile: row.profile, leaseEpoch: Number(row.lease_epoch) + 1,
        content: { title: row.title, body: row.body, platform: 'bigplayer_h5',
          fingerprint: row.fingerprint, gameId: '00000000-0000-0000-0000-000000000002',
          communityId: '00000000-0000-0000-0000-000000000102', regionCode: 'overseas' } }));
    } catch (error) { await conn.rollback().catch(() => {}); throw error; }
    finally { conn.release(); }
  }

  async completeAnalysisJob(id, leaseEpoch, analysis, { queueDeep = false } = {}) {
    const conn = await this.connection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(`SELECT *,(lease_until>UTC_TIMESTAMP(3)) AS lease_active
        FROM ln_analysis_jobs WHERE id=? FOR UPDATE`, [id]);
      const job = rows[0];
      if (!job || job.status !== 'running' || job.lease_owner !== this.leaseOwner ||
        Number(job.lease_epoch) !== leaseEpoch || Number(job.lease_active) !== 1) fail('LAST_NIGHT_STORE_AI_LEASE_LOST');
      await conn.query(`INSERT INTO ln_analysis_results (content_id,profile,version,
        content_fingerprint,model_name,result_json) VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE result_json=VALUES(result_json),model_name=VALUES(model_name),
        completed_at=UTC_TIMESTAMP(3)`,
      [job.content_id, job.profile, job.version, job.content_fingerprint,
        analysis.modelName || null, JSON.stringify(analysis)]);
      await conn.query(`UPDATE ln_analysis_jobs SET status='completed',lease_owner=NULL,
        lease_until=NULL,error_code=NULL WHERE id=?`, [id]);
      if (queueDeep) await conn.query(`INSERT INTO ln_analysis_jobs (id,content_id,profile,
        version,content_fingerprint,status) VALUES (?,?,'deep',?,?,'pending')
        ON DUPLICATE KEY UPDATE id=id`,
      [crypto.randomUUID(), job.content_id, this.analysisVersions.deep, job.content_fingerprint]);
      await conn.commit();
    } catch (error) { await conn.rollback().catch(() => {}); throw error; }
    finally { conn.release(); }
  }

  async failAnalysisJob(id, leaseEpoch, code) {
    const conn = await this.connection();
    try {
      await conn.query(`UPDATE ln_analysis_jobs SET attempts=attempts+1,
        status=IF(attempts>=2,'failed','retryable'),retry_at=UTC_TIMESTAMP(3)+INTERVAL 60 SECOND,
        error_code=?,lease_owner=NULL,lease_until=NULL WHERE id=? AND status='running'
        AND lease_owner=? AND lease_epoch=?`, [String(code).slice(0, 100), id, this.leaseOwner, leaseEpoch]);
    } finally { conn.release(); }
  }
}

module.exports = { LastNightIsolatedStore, taskHash, grantsAreIsolated };
