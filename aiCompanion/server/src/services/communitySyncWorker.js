const crypto = require('crypto');
const db = require('../config/db');
const envConfig = require('../config/communitySync');
const embedding = require('./embedding');
const vectorStore = require('./vectorStore');
const settings = require('./communitySyncSettings');
const { CommunityCrawler, CommunitySyncCancelledError } = require('./communityCrawler');
const { Q1CommunityCrawler, isQ1CommunityUrl } = require('./communityQ1Crawler');
const { buildSegments } = require('./communityThreadSegments');

const SCHEDULE_POLL_MS = 60 * 1000;
const RUN_STOP_TIMEOUT_MS = 30 * 1000;
const DELETE_STOP_WAIT_MS = 1500;

let timer = null;
let running = false;
let currentRunContext = null;
const scheduledRuns = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function isCancelledError(err) {
  return err instanceof CommunitySyncCancelledError || err?.name === 'CommunitySyncCancelledError';
}

async function waitForRunCompletion(context, timeoutMs = RUN_STOP_TIMEOUT_MS) {
  if (!context || !context.completion) return;
  const timeout = new Promise((_, reject) => {
    const timerId = setTimeout(() => {
      clearTimeout(timerId);
      reject(new Error('timed out waiting for community sync to stop'));
    }, timeoutMs);
  });
  await Promise.race([context.completion.promise, timeout]);
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function buildPageContentHash(page) {
  return hash(`${page.title || ''}\n${page.content || ''}`);
}

function isStructuredThreadPage(page) {
  return page?.thread?.type === 'q1_post';
}

async function getStatus(versionId) {
  const config = versionId
    ? await settings.getEffectiveConfig(versionId)
    : envConfig;
  return {
    ...settings.toPublic(config),
    running,
  };
}

async function resolveScheduledVersionId() {
  if (envConfig.versionId) return envConfig.versionId;
  if (!envConfig.versionCode) return null;
  const [rows] = await db.query('SELECT id FROM versions WHERE code=? AND status="active"', [envConfig.versionCode]);
  return rows[0] ? rows[0].id : null;
}

async function ensureDocument(versionId) {
  const [rows] = await db.query(
    'SELECT id, name FROM kb_documents WHERE version_id=? ORDER BY id DESC',
    [versionId]
  );
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.name || '{}');
      if (meta && meta.source === 'community-sync') return row.id;
    } catch {
      // Keep scanning older documents.
    }
  }
  const meta = JSON.stringify({ source: 'community-sync', originalName: 'Community HTML Sync' });
  const [ins] = await db.query(
    'INSERT INTO kb_documents (version_id, name, status) VALUES (?,?,"done")',
    [versionId, meta]
  );
  return ins.insertId;
}

async function createRun(versionId, triggerType) {
  const [ins] = await db.query(
    'INSERT INTO community_sync_runs (version_id, trigger_type, status, started_at) VALUES (?,?,"running",NOW())',
    [versionId, triggerType]
  );
  return ins.insertId;
}

async function updateRunProgress(runId, patch = {}) {
  const fields = [];
  const values = [];
  if (patch.pagesFound != null) {
    fields.push('pages_found=?');
    values.push(patch.pagesFound);
  }
  if (patch.pagesChanged != null) {
    fields.push('pages_changed=?');
    values.push(patch.pagesChanged);
  }
  if (patch.entriesWritten != null) {
    fields.push('entries_written=?');
    values.push(patch.entriesWritten);
  }
  if (!fields.length) return;
  values.push(runId);
  await db.query(
    `UPDATE community_sync_runs SET ${fields.join(', ')} WHERE id=?`,
    values
  );
}

async function finishRun(runId, status, patch) {
  await db.query(
    `UPDATE community_sync_runs
       SET status=?, pages_found=?, pages_changed=?, entries_written=?, error=?, finished_at=NOW()
     WHERE id=?`,
    [
      status,
      patch.pagesFound || 0,
      patch.pagesChanged || 0,
      patch.entriesWritten || 0,
      patch.error ? String(patch.error).slice(0, 1000) : null,
      runId,
    ]
  );
}

async function upsertPageShell(versionId, page) {
  const urlHash = hash(page.url);
  await db.query(
    `INSERT INTO community_sync_pages (version_id, run_id, url_hash, url, title, content_preview, crawl_status, last_error, last_seen_at)
     VALUES (?,?,?,?,?,?,?,NULL,NOW())
     ON DUPLICATE KEY UPDATE
       run_id=VALUES(run_id),
       url=VALUES(url),
       title=VALUES(title),
       content_preview=VALUES(content_preview),
       crawl_status=VALUES(crawl_status),
       last_error=NULL,
       last_seen_at=NOW()`,
    [
      versionId,
      page.runId || null,
      urlHash,
      page.url,
      page.title || '',
      page.content ? page.content.slice(0, 1200) : '',
      page.crawlStatus || 'seen',
    ]
  );
  const [rows] = await db.query(
    'SELECT * FROM community_sync_pages WHERE version_id=? AND url_hash=?',
    [versionId, urlHash]
  );
  return rows[0];
}

async function loadExistingSyncedPageUrls(versionId) {
  const [rows] = await db.query(
    `SELECT url
       FROM community_sync_pages
      WHERE version_id=?
        AND crawl_status='synced'
        AND url IS NOT NULL
        AND url <> ''`,
    [versionId]
  );
  return rows
    .map(row => String(row?.url || '').trim())
    .filter(Boolean);
}

async function findReusableEntry(versionId, contentHash, excludePageId) {
  const [rows] = await db.query(
    `SELECT id, document_id, entry_id
       FROM community_sync_pages
      WHERE version_id=?
        AND content_hash=?
        AND entry_id IS NOT NULL
        AND crawl_status='synced'
        AND id<>?
      ORDER BY last_synced_at DESC, id DESC
      LIMIT 1`,
    [versionId, contentHash, excludePageId]
  );
  return rows[0] || null;
}

async function findReusableSegmentEntry(versionId, contentHash, excludeSegmentId) {
  const [rows] = await db.query(
    `SELECT id, document_id, entry_id
       FROM community_sync_page_segments
      WHERE version_id=?
        AND content_hash=?
        AND entry_id IS NOT NULL
        AND quality_decision='selected'
        AND id<>?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`,
    [versionId, contentHash, excludeSegmentId]
  );
  return rows[0] || null;
}

async function releaseEntryIfUnused(versionId, entryId) {
  if (!entryId) return false;
  const [pageRows] = await db.query(
    'SELECT COUNT(*) AS cnt FROM community_sync_pages WHERE version_id=? AND (entry_id=? OR thread_summary_entry_id=?)',
    [versionId, entryId, entryId]
  );
  const [segmentRows] = await db.query(
    'SELECT COUNT(*) AS cnt FROM community_sync_page_segments WHERE version_id=? AND entry_id=?',
    [versionId, entryId]
  );
  if ((pageRows[0] && pageRows[0].cnt) > 0) return false;
  if ((segmentRows[0] && segmentRows[0].cnt) > 0) return false;
  vectorStore.removeEntry(versionId, entryId);
  await db.query('DELETE FROM knowledge_entries WHERE id=? AND version_id=?', [entryId, versionId]);
  return true;
}

async function insertKnowledgeEntry({ versionId, documentId, rowIndex, content, raw }) {
  const [vec] = await embedding.embedBatch([content]);
  const [entryIns] = await db.query(
    'INSERT INTO knowledge_entries (version_id, document_id, row_index, content, raw_json) VALUES (?,?,?,?,?)',
    [versionId, documentId, rowIndex, content, raw]
  );
  if (vec) {
    await db.query(
      'INSERT INTO kb_vectors (version_id, entry_id, embedding, dim) VALUES (?,?,?,?)',
      [versionId, entryIns.insertId, JSON.stringify(vec), vec.length]
    );
    vectorStore.add(versionId, entryIns.insertId, vec);
  }
  return entryIns.insertId;
}

async function reuseEntry({ versionId, pageRow, page, contentHash, reusedEntry }) {
  const previousEntryId = pageRow.entry_id;
  await db.query(
    `UPDATE community_sync_pages
       SET content_hash=?, document_id=?, entry_id=?, thread_summary_entry_id=NULL, content_preview=?, raw_content=?, comment_count=0,
           useful_comment_count=0, ignored_comment_count=0, selected_entry_count=1,
           crawl_status='synced', last_synced_at=NOW(), last_error=NULL
     WHERE id=?`,
    [
      contentHash,
      reusedEntry.document_id,
      reusedEntry.entry_id,
      page.content.slice(0, 1200),
      page.rawContent || page.content || '',
      pageRow.id,
    ]
  );
  if (previousEntryId && previousEntryId !== reusedEntry.entry_id) {
    await releaseEntryIfUnused(versionId, previousEntryId);
  }
  return reusedEntry.entry_id;
}

async function replaceEntry({ versionId, documentId, pageRow, page, contentHash }) {
  const content = [
    page.title ? `Title: ${page.title}` : '',
    `URL: ${page.url}`,
    '',
    page.content,
  ].filter(Boolean).join('\n');
  const raw = JSON.stringify({
    source: 'community-sync',
    url: page.url,
    title: page.title || '',
    contentHash,
    crawledAt: nowIso(),
  });
  const previousEntryId = pageRow.entry_id;
  const entryId = await insertKnowledgeEntry({
    versionId,
    documentId,
    rowIndex: pageRow.id,
    content,
    raw,
  });

  await db.query(
    `UPDATE community_sync_pages
       SET content_hash=?, document_id=?, entry_id=?, thread_summary_entry_id=NULL, content_preview=?, raw_content=?, comment_count=0,
           useful_comment_count=0, ignored_comment_count=0, selected_entry_count=1,
           crawl_status='synced', last_synced_at=NOW(), last_error=NULL
     WHERE id=?`,
    [contentHash, documentId, entryId, page.content.slice(0, 1200), page.rawContent || page.content || '', pageRow.id]
  );
  if (previousEntryId && previousEntryId !== entryId) {
    await releaseEntryIfUnused(versionId, previousEntryId);
  }
  return entryId;
}

async function markPageFailed(versionId, runId, page, error) {
  const urlHash = hash(page.url);
  await db.query(
    `INSERT INTO community_sync_pages (version_id, run_id, url_hash, url, title, content_preview, crawl_status, last_error, last_seen_at)
     VALUES (?,?,?,?,?,?,?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       run_id=VALUES(run_id),
       url=VALUES(url),
       title=VALUES(title),
       content_preview=VALUES(content_preview),
       crawl_status=VALUES(crawl_status),
       last_error=VALUES(last_error),
       last_seen_at=NOW()`,
    [
      versionId,
      runId || null,
      urlHash,
      page.url,
      page.title || '',
      page.content ? page.content.slice(0, 1200) : '',
      'failed',
      String(error || '').slice(0, 1000),
    ]
  );
}

async function clearPageSegments(versionId, pageId) {
  const [rows] = await db.query(
    `SELECT id, entry_id
       FROM community_sync_page_segments
      WHERE version_id=? AND page_id=?`,
    [versionId, pageId]
  );
  await db.query(
    'DELETE FROM community_sync_page_segments WHERE version_id=? AND page_id=?',
    [versionId, pageId]
  );
  return rows;
}

function buildSegmentContent(page, segment) {
  return String(segment.content || '').trim();
}

function buildSegmentRaw(page, segment) {
  return JSON.stringify({
    source: 'community-sync',
    url: page.url,
    title: page.title || '',
    sourceType: segment.sourceType,
    sourceUid: segment.sourceUid,
    parentSourceUid: segment.parentSourceUid || null,
    qualityScore: segment.qualityScore || 0,
    qualityDecision: segment.qualityDecision,
    reasonTags: segment.reasonTags || [],
    crawledAt: nowIso(),
  });
}

async function countDocumentEntries(versionId, documentId) {
  const ids = new Set();
  const [pageRows] = await db.query(
    'SELECT DISTINCT entry_id FROM community_sync_pages WHERE version_id=? AND document_id=? AND entry_id IS NOT NULL',
    [versionId, documentId]
  );
  const [summaryRows] = await db.query(
    'SELECT DISTINCT thread_summary_entry_id AS entry_id FROM community_sync_pages WHERE version_id=? AND document_id=? AND thread_summary_entry_id IS NOT NULL',
    [versionId, documentId]
  );
  const [segmentRows] = await db.query(
    'SELECT DISTINCT entry_id FROM community_sync_page_segments WHERE version_id=? AND document_id=? AND entry_id IS NOT NULL',
    [versionId, documentId]
  );
  for (const row of [...pageRows, ...summaryRows, ...segmentRows]) {
    if (row?.entry_id != null) ids.add(row.entry_id);
  }
  return ids.size;
}

async function refreshCommunitySyncDocumentCounts(versionId) {
  const [rows] = await db.query(
    'SELECT id, name FROM kb_documents WHERE version_id=? ORDER BY id DESC',
    [versionId]
  );
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.name || '{}');
      if (!meta || meta.source !== 'community-sync') continue;
    } catch {
      continue;
    }
    const rowCount = await countDocumentEntries(versionId, row.id);
    await db.query(
      'UPDATE kb_documents SET status="done", row_count=? WHERE id=?',
      [rowCount, row.id]
    );
  }
}

async function purgeRun(versionId, runId) {
  const releasedEntryIds = new Set();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [pageRows] = await conn.query(
      `SELECT id, entry_id, thread_summary_entry_id
         FROM community_sync_pages
        WHERE version_id=? AND run_id=?`,
      [versionId, runId]
    );
    const pageIds = pageRows.map(row => row.id).filter(Boolean);
    for (const row of pageRows) {
      if (row?.entry_id) releasedEntryIds.add(row.entry_id);
      if (row?.thread_summary_entry_id) releasedEntryIds.add(row.thread_summary_entry_id);
    }

    if (pageIds.length) {
      const placeholders = pageIds.map(() => '?').join(',');
      const [segmentRows] = await conn.query(
        `SELECT entry_id
           FROM community_sync_page_segments
          WHERE version_id=? AND page_id IN (${placeholders})`,
        [versionId, ...pageIds]
      );
      for (const row of segmentRows) {
        if (row?.entry_id) releasedEntryIds.add(row.entry_id);
      }
      await conn.query(
        `DELETE FROM community_sync_page_segments
          WHERE version_id=? AND page_id IN (${placeholders})`,
        [versionId, ...pageIds]
      );
      await conn.query(
        `DELETE FROM community_sync_pages
          WHERE version_id=? AND id IN (${placeholders})`,
        [versionId, ...pageIds]
      );
    }
    await conn.query(
      'DELETE FROM community_sync_runs WHERE version_id=? AND id=? LIMIT 1',
      [versionId, runId]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  for (const entryId of releasedEntryIds) {
    await releaseEntryIfUnused(versionId, entryId);
  }
  await refreshCommunitySyncDocumentCounts(versionId);
}

async function syncStructuredPage({ versionId, documentId, pageRow, page, contentHash }) {
  const previousEntryIds = new Set();
  if (pageRow.entry_id) previousEntryIds.add(pageRow.entry_id);
  if (pageRow.thread_summary_entry_id) previousEntryIds.add(pageRow.thread_summary_entry_id);
  const clearedSegments = await clearPageSegments(versionId, pageRow.id);
  for (const row of clearedSegments) {
    if (row?.entry_id) previousEntryIds.add(row.entry_id);
  }

  const { segments, stats } = buildSegments(page);
  let written = 0;
  let primaryEntryId = null;
  let threadSummaryEntryId = null;

  for (const [index, segment] of segments.entries()) {
    let entryId = null;
    let segmentDocumentId = null;
    if (segment.qualityDecision === 'selected') {
      const reusable = await findReusableSegmentEntry(versionId, segment.contentHash, 0);
      if (reusable) {
        entryId = reusable.entry_id;
        segmentDocumentId = reusable.document_id;
      } else {
        segmentDocumentId = documentId;
        entryId = await insertKnowledgeEntry({
          versionId,
          documentId,
          rowIndex: pageRow.id * 1000 + index + 1,
          content: buildSegmentContent(page, segment),
          raw: buildSegmentRaw(page, segment),
        });
        written += 1;
      }
    }

    await db.query(
      `INSERT INTO community_sync_page_segments
         (version_id, page_id, source_type, source_uid, parent_source_uid, author_name, content, content_hash,
          quality_score, quality_decision, reason_tags, document_id, entry_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        versionId,
        pageRow.id,
        segment.sourceType,
        segment.sourceUid,
        segment.parentSourceUid || null,
        segment.authorName || null,
        buildSegmentContent(page, segment),
        segment.contentHash,
        segment.qualityScore || 0,
        segment.qualityDecision,
        JSON.stringify(segment.reasonTags || []),
        segmentDocumentId,
        entryId,
      ]
    );

    if (!primaryEntryId && segment.sourceType === 'post_main' && entryId) primaryEntryId = entryId;
    if (!primaryEntryId && entryId) primaryEntryId = entryId;
    if (segment.sourceType === 'comment_digest' && entryId) threadSummaryEntryId = entryId;
  }

  await db.query(
    `UPDATE community_sync_pages
       SET content_hash=?, document_id=?, entry_id=?, thread_summary_entry_id=?, content_preview=?, raw_content=?,
           comment_count=?, useful_comment_count=?, ignored_comment_count=?, selected_entry_count=?,
           crawl_status='synced', last_synced_at=NOW(), last_error=NULL
     WHERE id=?`,
    [
      contentHash,
      documentId,
      primaryEntryId,
      threadSummaryEntryId,
      (page.content || '').slice(0, 1200),
      page.rawContent || page.content || '',
      stats.commentCount || 0,
      stats.usefulCommentCount || 0,
      stats.ignoredCommentCount || 0,
      stats.selectedEntryCount || 0,
      pageRow.id,
    ]
  );

  for (const entryId of previousEntryIds) {
    if (entryId && entryId !== primaryEntryId && entryId !== threadSummaryEntryId) {
      await releaseEntryIfUnused(versionId, entryId);
    }
  }
  return { written };
}

async function persistPages(versionId, pages) {
  const documentId = await ensureDocument(versionId);
  let changed = 0;
  let written = 0;
  for (const page of pages) {
    const contentHash = buildPageContentHash(page);
    const pageRow = await upsertPageShell(versionId, page);
    if (pageRow.content_hash === contentHash && pageRow.crawl_status === 'synced') continue;
    changed += 1;
    if (isStructuredThreadPage(page)) {
      const result = await syncStructuredPage({ versionId, documentId, pageRow, page, contentHash });
      written += result.written;
      continue;
    }
    const reusedEntry = await findReusableEntry(versionId, contentHash, pageRow.id);
    if (reusedEntry) {
      await reuseEntry({ versionId, pageRow, page, contentHash, reusedEntry });
      continue;
    }
    await replaceEntry({ versionId, documentId, pageRow, page, contentHash });
    written += 1;
  }
  const entryCount = await countDocumentEntries(versionId, documentId);
  await db.query(
    'UPDATE kb_documents SET status="done", row_count=? WHERE id=?',
    [entryCount || written, documentId]
  );
  return { changed, written };
}

async function resolveRunConfig({ versionId, config }) {
  if (config) {
    const targetVersionId = config.versionId || versionId || await resolveScheduledVersionId();
    if (!targetVersionId) throw new Error('community sync version is required');
    return { ...config, versionId: targetVersionId };
  }
  if (!versionId) {
    const scheduledVersionId = await resolveScheduledVersionId();
    if (!scheduledVersionId) throw new Error('COMMUNITY_SYNC_VERSION_ID or COMMUNITY_SYNC_VERSION_CODE is required');
    return { ...envConfig, versionId: scheduledVersionId };
  }
  return settings.getEffectiveConfig(versionId);
}

async function runOnce({ versionId, triggerType = 'manual', config } = {}) {
  if (running) throw new Error('community sync is already running');
  const runConfig = await resolveRunConfig({ versionId, config });
  settings.validateConfigForRun(runConfig);

  const completion = createDeferred();
  const controller = new AbortController();
  const runContext = {
    runId: null,
    versionId: runConfig.versionId,
    triggerType,
    controller,
    completion,
    deleteAfterStop: false,
  };
  currentRunContext = runContext;
  running = true;
  let runId = null;
  const progress = {
    pagesFound: 0,
    pagesChanged: 0,
    entriesWritten: 0,
  };
  try {
    runId = await createRun(runConfig.versionId, triggerType);
    runContext.runId = runId;
    let acceptedCount = 0;
    const existingPageUrls = await loadExistingSyncedPageUrls(runConfig.versionId);
    const crawlerOptions = {
      ...runConfig,
      existingPageUrls,
      signal: controller.signal,
      onPage: async (page) => {
        await upsertPageShell(runConfig.versionId, {
          ...page,
          runId,
          crawlStatus: page.accepted ? 'fetched' : 'ignored',
        });
        if (page.accepted) acceptedCount += 1;
        progress.pagesFound = acceptedCount;
        await updateRunProgress(runId, { pagesFound: acceptedCount });
      },
    };
    const crawler = isQ1CommunityUrl(runConfig.baseUrl)
      ? new Q1CommunityCrawler(crawlerOptions)
      : new CommunityCrawler(crawlerOptions);
    const crawled = await crawler.crawl();
    const persisted = await persistPages(runConfig.versionId, crawled.pages);
    progress.pagesFound = crawled.pages.length;
    progress.pagesChanged = persisted.changed;
    progress.entriesWritten = persisted.written;
    await finishRun(runId, 'done', {
      pagesFound: crawled.pages.length,
      pagesChanged: persisted.changed,
      entriesWritten: persisted.written,
    });
    return { runId, pagesFound: crawled.pages.length, ...persisted };
  } catch (err) {
    if (runId) {
      const cancelled = isCancelledError(err);
      await finishRun(runId, cancelled ? 'cancelled' : 'failed', {
        ...progress,
        error: cancelled ? 'community sync cancelled' : err.message,
      });
    }
    throw err;
  } finally {
    running = false;
    if (currentRunContext === runContext) currentRunContext = null;
    completion.resolve();
    if (runContext.deleteAfterStop && runId) {
      setTimeout(() => {
        purgeRun(runConfig.versionId, runId).catch(err => {
          console.error(`[communitySync] delayed delete for run ${runId} failed:`, err.message);
        });
      }, 0);
    }
  }
}

function shouldRunScheduled(key, config, forceRunOnStart) {
  const now = Date.now();
  const last = scheduledRuns.get(key);
  if (!last) {
    scheduledRuns.set(key, now);
    return forceRunOnStart && config.runOnStart;
  }
  if (forceRunOnStart && config.runOnStart) return true;
  const nowDate = new Date(now);
  const targetToday = new Date(nowDate);
  targetToday.setHours(config.scheduleHour ?? 3, config.scheduleMinute ?? 0, 0, 0);
  if (nowDate < targetToday) return false;
  return last < targetToday.getTime();
}

async function getScheduledConfigs() {
  const configs = [];
  if (envConfig.enabled) {
    const versionId = await resolveScheduledVersionId();
    if (versionId) configs.push({ key: `env:${versionId}`, config: { ...envConfig, versionId } });
  }

  const dbConfigs = await settings.listEnabledConfigs();
  for (const config of dbConfigs) {
    configs.push({ key: `db:${config.versionId}`, config });
  }
  return configs;
}

async function tick({ forceRunOnStart = false } = {}) {
  if (running) return;
  let scheduled;
  try {
    scheduled = await getScheduledConfigs();
  } catch (err) {
    console.error('[communitySync] failed to load scheduled configs:', err.message);
    return;
  }

  for (const item of scheduled) {
    if (running) return;
    if (!shouldRunScheduled(item.key, item.config, forceRunOnStart)) continue;
    try {
      await runOnce({ triggerType: 'scheduled', config: item.config });
      scheduledRuns.set(item.key, Date.now());
    } catch (err) {
      scheduledRuns.set(item.key, Date.now());
      console.error('[communitySync] scheduled run failed:', err.message);
    }
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, SCHEDULE_POLL_MS);
  setTimeout(() => tick({ forceRunOnStart: true }), 5000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function listRuns(versionId, limit = 20) {
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const [rows] = await db.query(
    `SELECT id, trigger_type, status, pages_found, pages_changed, entries_written, error, started_at, finished_at
       FROM community_sync_runs
      WHERE version_id=?
      ORDER BY id DESC
      LIMIT ?`,
    [versionId, safeLimit]
  );
  return rows;
}

async function deleteRun(versionId, runId) {
  const safeRunId = parseInt(runId, 10);
  if (!Number.isFinite(safeRunId) || safeRunId <= 0) return { found: false };

  const [rows] = await db.query(
    `SELECT id, status
       FROM community_sync_runs
      WHERE version_id=? AND id=?
      LIMIT 1`,
    [versionId, safeRunId]
  );
  const run = rows[0];
  if (!run) return { found: false };

  const activeRun = currentRunContext && currentRunContext.runId === safeRunId
    ? currentRunContext
    : null;
  if (activeRun) {
    activeRun.controller.abort();
    try {
      await waitForRunCompletion(activeRun, DELETE_STOP_WAIT_MS);
    } catch (err) {
      activeRun.deleteAfterStop = true;
      return { found: true, deleted: false, reason: 'stopping', stopping: true };
    }
  } else if (run.status === 'running') {
    let settled = false;
    const deadline = Date.now() + DELETE_STOP_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(250);
      const [pollRows] = await db.query(
        `SELECT status
           FROM community_sync_runs
          WHERE version_id=? AND id=?
          LIMIT 1`,
        [versionId, safeRunId]
      );
      if (!pollRows[0] || pollRows[0].status !== 'running') {
        settled = true;
        break;
      }
    }
    if (!settled) return { found: true, deleted: false, reason: 'stopping', stopping: true };
  }

  await purgeRun(versionId, safeRunId);

  return { found: true, deleted: true, id: safeRunId };
}

async function listPages(versionId, limit = 50) {
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);
  const [rows] = await db.query(
    `SELECT id, run_id, url, title, content_preview, crawl_status, content_hash, document_id, entry_id,
            thread_summary_entry_id, comment_count, useful_comment_count, ignored_comment_count, selected_entry_count,
            last_seen_at, last_synced_at, last_error
       FROM community_sync_pages
      WHERE version_id=?
      ORDER BY last_seen_at DESC, id DESC
      LIMIT ?`,
    [versionId, safeLimit]
  );
  return rows;
}

async function getPage(versionId, pageId) {
  const [rows] = await db.query(
    `SELECT p.id, p.run_id, p.url, p.title, p.content_preview, p.crawl_status, p.content_hash,
            p.document_id, p.entry_id, p.thread_summary_entry_id, p.raw_content, p.comment_count,
            p.useful_comment_count, p.ignored_comment_count, p.selected_entry_count,
            p.last_seen_at, p.last_synced_at, p.last_error,
            ke.content AS entry_content
       FROM community_sync_pages p
       LEFT JOIN knowledge_entries ke ON ke.id = p.entry_id AND ke.version_id = p.version_id
      WHERE p.version_id=? AND p.id=?
      LIMIT 1`,
    [versionId, pageId]
  );
  const page = rows[0] || null;
  if (!page) return null;
  const [segments] = await db.query(
    `SELECT id, source_type, source_uid, parent_source_uid, author_name, content, content_hash,
            quality_score, quality_decision, reason_tags, document_id, entry_id, created_at, updated_at
       FROM community_sync_page_segments
      WHERE version_id=? AND page_id=?
      ORDER BY
        CASE source_type
          WHEN 'post_main' THEN 0
          WHEN 'image_fact' THEN 1
          WHEN 'comment_answer' THEN 2
          WHEN 'comment_digest' THEN 3
          ELSE 9
        END,
        CASE quality_decision
          WHEN 'selected' THEN 0
          WHEN 'digest_only' THEN 1
          ELSE 2
        END,
        id ASC`,
    [versionId, pageId]
  );
  return {
    ...page,
    content: page.raw_content || page.entry_content || '',
    segments: segments.map(segment => ({
      ...segment,
      reason_tags: (() => {
        try {
          return JSON.parse(segment.reason_tags || '[]');
        } catch {
          return [];
        }
      })(),
    })),
  };
}

module.exports = {
  getStatus,
  deleteRun,
  getPage,
  listPages,
  listRuns,
  runOnce,
  start,
  stop,
  tick,
  _persistPages: persistPages,
};
