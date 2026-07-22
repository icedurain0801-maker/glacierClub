const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function createDbMock() {
  const state = {
    documents: [
      {
        id: 11,
        version_id: 1,
        name: JSON.stringify({ source: 'community-sync', originalName: 'Community HTML Sync' }),
        status: 'done',
        row_count: 0,
      },
    ],
    runs: [],
    pages: [],
    segments: [],
    entries: [],
    vectors: [],
    nextPageId: 1,
    nextRunId: 1,
    nextSegmentId: 1,
    nextEntryId: 101,
  };

  const db = {
    async query(sql, params = []) {
      const normalized = normalizeSql(sql);

      if (normalized === 'SELECT id, name FROM kb_documents WHERE version_id=? ORDER BY id DESC') {
        const [versionId] = params;
        return [[
          ...state.documents
            .filter(doc => doc.version_id === versionId)
            .sort((a, b) => b.id - a.id),
        ]];
      }

      if (normalized === 'INSERT INTO kb_documents (version_id, name, status) VALUES (?,?,"done")') {
        const [versionId, name] = params;
        const document = {
          id: state.documents.length + 11,
          version_id: versionId,
          name,
          status: 'done',
          row_count: 0,
        };
        state.documents.push(document);
        return [{ insertId: document.id }];
      }

      if (normalized === 'INSERT INTO community_sync_runs (version_id, trigger_type, status, started_at) VALUES (?,?,"running",NOW())') {
        const [versionId, triggerType] = params;
        const run = {
          id: state.nextRunId++,
          version_id: versionId,
          trigger_type: triggerType,
          status: 'running',
        };
        state.runs.push(run);
        return [{ insertId: run.id }];
      }

      if (normalized.startsWith('UPDATE community_sync_runs SET')) {
        const runId = params[params.length - 1];
        const run = state.runs.find(item => item.id === runId);
        if (run && typeof params[0] === 'string') run.status = params[0];
        return [{ affectedRows: 1 }];
      }

      if (normalized.includes('FROM community_sync_pages') && normalized.includes("crawl_status='synced'") && normalized.includes('SELECT url')) {
        const [versionId] = params;
        return [[
          ...state.pages
            .filter(item => item.version_id === versionId && item.crawl_status === 'synced' && item.url)
            .map(item => ({ url: item.url })),
        ]];
      }

      if (normalized.startsWith('INSERT INTO community_sync_pages ')) {
        const [versionId, runId, urlHash, url, title, preview, crawlStatus, lastError] = params;
        let row = state.pages.find(item => item.version_id === versionId && item.url_hash === urlHash);
        if (!row) {
          row = {
            id: state.nextPageId++,
            version_id: versionId,
            run_id: runId,
            url_hash: urlHash,
            url,
            title,
            content_preview: preview,
            raw_content: '',
            crawl_status: crawlStatus,
            last_error: lastError || null,
            content_hash: null,
            document_id: null,
            entry_id: null,
            thread_summary_entry_id: null,
            comment_count: 0,
            useful_comment_count: 0,
            ignored_comment_count: 0,
            selected_entry_count: 0,
            last_seen_at: new Date().toISOString(),
            last_synced_at: null,
          };
          state.pages.push(row);
        } else {
          row.run_id = runId;
          row.url = url;
          row.title = title;
          row.content_preview = preview;
          row.crawl_status = crawlStatus;
          row.last_error = lastError || null;
          row.last_seen_at = new Date().toISOString();
        }
        return [{ affectedRows: 1 }];
      }

      if (normalized === 'SELECT * FROM community_sync_pages WHERE version_id=? AND url_hash=?') {
        const [versionId, urlHash] = params;
        const row = state.pages.find(item => item.version_id === versionId && item.url_hash === urlHash) || null;
        return [[row]];
      }

      if (normalized.includes('FROM community_sync_pages') && normalized.includes('content_hash=?') && normalized.includes('id<>?')) {
        const [versionId, contentHash, excludePageId] = params;
        const row = state.pages
          .filter(item =>
            item.version_id === versionId &&
            item.content_hash === contentHash &&
            item.entry_id != null &&
            item.crawl_status === 'synced' &&
            item.id !== excludePageId
          )
          .sort((a, b) => (b.last_synced_at || '').localeCompare(a.last_synced_at || '') || b.id - a.id)[0];
        if (!row) return [[]];
        return [[{ id: row.id, document_id: row.document_id, entry_id: row.entry_id }]];
      }

      if (normalized.includes('FROM community_sync_page_segments') && normalized.includes('content_hash=?') && normalized.includes("quality_decision='selected'")) {
        const [versionId, contentHash, excludeSegmentId] = params;
        const row = state.segments
          .filter(item =>
            item.version_id === versionId &&
            item.content_hash === contentHash &&
            item.entry_id != null &&
            item.quality_decision === 'selected' &&
            item.id !== excludeSegmentId
          )
          .sort((a, b) => b.id - a.id)[0];
        if (!row) return [[]];
        return [[{ id: row.id, document_id: row.document_id, entry_id: row.entry_id }]];
      }

      if (normalized === 'SELECT id, entry_id FROM community_sync_page_segments WHERE version_id=? AND page_id=?') {
        const [versionId, pageId] = params;
        return [[
          ...state.segments
            .filter(item => item.version_id === versionId && item.page_id === pageId)
            .map(item => ({ id: item.id, entry_id: item.entry_id })),
        ]];
      }

      if (normalized === 'DELETE FROM community_sync_page_segments WHERE version_id=? AND page_id=?') {
        const [versionId, pageId] = params;
        state.segments = state.segments.filter(item => !(item.version_id === versionId && item.page_id === pageId));
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith('INSERT INTO community_sync_page_segments')) {
        const [
          versionId,
          pageId,
          sourceType,
          sourceUid,
          parentSourceUid,
          authorName,
          content,
          contentHash,
          qualityScore,
          qualityDecision,
          reasonTags,
          documentId,
          entryId,
        ] = params;
        state.segments.push({
          id: state.nextSegmentId++,
          version_id: versionId,
          page_id: pageId,
          source_type: sourceType,
          source_uid: sourceUid,
          parent_source_uid: parentSourceUid,
          author_name: authorName,
          content,
          content_hash: contentHash,
          quality_score: qualityScore,
          quality_decision: qualityDecision,
          reason_tags: reasonTags,
          document_id: documentId,
          entry_id: entryId,
        });
        return [{ insertId: state.nextSegmentId - 1 }];
      }

      if (normalized === 'INSERT INTO knowledge_entries (version_id, document_id, row_index, content, raw_json) VALUES (?,?,?,?,?)') {
        const [versionId, documentId, rowIndex, content, rawJson] = params;
        const entry = {
          id: state.nextEntryId++,
          version_id: versionId,
          document_id: documentId,
          row_index: rowIndex,
          content,
          raw_json: rawJson,
        };
        state.entries.push(entry);
        return [{ insertId: entry.id }];
      }

      if (normalized === 'INSERT INTO kb_vectors (version_id, entry_id, embedding, dim) VALUES (?,?,?,?)') {
        const [versionId, entryId, embeddingJson, dim] = params;
        state.vectors.push({ version_id: versionId, entry_id: entryId, embedding: embeddingJson, dim });
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith('UPDATE community_sync_pages SET')) {
        const pageId = params[params.length - 1];
        const row = state.pages.find(item => item.id === pageId);
        if (!row) throw new Error(`Missing page row ${pageId}`);

        if (params.length === 6) {
          const [contentHash, documentId, entryId, preview, rawContent] = params;
          row.content_hash = contentHash;
          row.document_id = documentId;
          row.entry_id = entryId;
          row.thread_summary_entry_id = null;
          row.content_preview = preview;
          row.raw_content = rawContent;
          row.comment_count = 0;
          row.useful_comment_count = 0;
          row.ignored_comment_count = 0;
          row.selected_entry_count = 1;
          row.crawl_status = 'synced';
          row.last_error = null;
          row.last_synced_at = new Date().toISOString();
          return [{ affectedRows: 1 }];
        }

        const [
          contentHash,
          documentId,
          entryId,
          threadSummaryEntryId,
          preview,
          rawContent,
          commentCount,
          usefulCommentCount,
          ignoredCommentCount,
          selectedEntryCount,
        ] = params;
        row.content_hash = contentHash;
        row.document_id = documentId;
        row.entry_id = entryId;
        row.thread_summary_entry_id = threadSummaryEntryId;
        row.content_preview = preview;
        row.raw_content = rawContent;
        row.comment_count = commentCount;
        row.useful_comment_count = usefulCommentCount;
        row.ignored_comment_count = ignoredCommentCount;
        row.selected_entry_count = selectedEntryCount;
        row.crawl_status = 'synced';
        row.last_error = null;
        row.last_synced_at = new Date().toISOString();
        return [{ affectedRows: 1 }];
      }

      if (normalized === 'SELECT COUNT(*) AS cnt FROM community_sync_pages WHERE version_id=? AND (entry_id=? OR thread_summary_entry_id=?)') {
        const [versionId, entryId, threadSummaryEntryId] = params;
        return [[{
          cnt: state.pages.filter(item =>
            item.version_id === versionId &&
            (item.entry_id === entryId || item.thread_summary_entry_id === threadSummaryEntryId)
          ).length,
        }]];
      }

      if (normalized === 'SELECT COUNT(*) AS cnt FROM community_sync_page_segments WHERE version_id=? AND entry_id=?') {
        const [versionId, entryId] = params;
        return [[{
          cnt: state.segments.filter(item => item.version_id === versionId && item.entry_id === entryId).length,
        }]];
      }

      if (normalized === 'DELETE FROM knowledge_entries WHERE id=? AND version_id=?') {
        const [entryId, versionId] = params;
        state.entries = state.entries.filter(item => !(item.id === entryId && item.version_id === versionId));
        state.vectors = state.vectors.filter(item => !(item.entry_id === entryId && item.version_id === versionId));
        return [{ affectedRows: 1 }];
      }

      if (normalized === 'SELECT DISTINCT entry_id FROM community_sync_pages WHERE version_id=? AND document_id=? AND entry_id IS NOT NULL') {
        const [versionId, documentId] = params;
        return [[
          ...state.pages
            .filter(item => item.version_id === versionId && item.document_id === documentId && item.entry_id != null)
            .map(item => ({ entry_id: item.entry_id })),
        ]];
      }

      if (normalized === 'SELECT DISTINCT thread_summary_entry_id AS entry_id FROM community_sync_pages WHERE version_id=? AND document_id=? AND thread_summary_entry_id IS NOT NULL') {
        const [versionId, documentId] = params;
        return [[
          ...state.pages
            .filter(item => item.version_id === versionId && item.document_id === documentId && item.thread_summary_entry_id != null)
            .map(item => ({ entry_id: item.thread_summary_entry_id })),
        ]];
      }

      if (normalized === 'SELECT DISTINCT entry_id FROM community_sync_page_segments WHERE version_id=? AND document_id=? AND entry_id IS NOT NULL') {
        const [versionId, documentId] = params;
        return [[
          ...state.segments
            .filter(item => item.version_id === versionId && item.document_id === documentId && item.entry_id != null)
            .map(item => ({ entry_id: item.entry_id })),
        ]];
      }

      if (normalized === 'UPDATE kb_documents SET status="done", row_count=? WHERE id=?') {
        const [rowCount, documentId] = params;
        const document = state.documents.find(item => item.id === documentId);
        if (!document) throw new Error(`Missing document ${documentId}`);
        document.status = 'done';
        document.row_count = rowCount;
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unhandled SQL: ${normalized}`);
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        query: db.query,
      };
    },
  };

  return { db, state };
}

function loadWorkerWithMocks(overrides = {}) {
  const root = path.resolve(__dirname, '../src');
  const workerPath = path.join(root, 'services', 'communitySyncWorker.js');
  const dbPath = path.join(root, 'config', 'db.js');
  const envPath = path.join(root, 'config', 'communitySync.js');
  const embeddingPath = path.join(root, 'services', 'embedding.js');
  const vectorStorePath = path.join(root, 'services', 'vectorStore.js');
  const settingsPath = path.join(root, 'services', 'communitySyncSettings.js');
  const crawlerPath = path.join(root, 'services', 'communityCrawler.js');
  const q1CrawlerPath = path.join(root, 'services', 'communityQ1Crawler.js');

  delete require.cache[workerPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: overrides.db };
  require.cache[envPath] = { id: envPath, filename: envPath, loaded: true, exports: overrides.envConfig || {} };
  require.cache[embeddingPath] = { id: embeddingPath, filename: embeddingPath, loaded: true, exports: overrides.embedding };
  require.cache[vectorStorePath] = { id: vectorStorePath, filename: vectorStorePath, loaded: true, exports: overrides.vectorStore };
  require.cache[settingsPath] = { id: settingsPath, filename: settingsPath, loaded: true, exports: overrides.settings || {} };
  require.cache[crawlerPath] = {
    id: crawlerPath,
    filename: crawlerPath,
    loaded: true,
    exports: overrides.communityCrawler || {
      CommunityCrawler: class {},
      CommunitySyncCancelledError: class CommunitySyncCancelledError extends Error {},
    },
  };
  require.cache[q1CrawlerPath] = {
    id: q1CrawlerPath,
    filename: q1CrawlerPath,
    loaded: true,
    exports: overrides.communityQ1Crawler || {
      Q1CommunityCrawler: class {},
      isQ1CommunityUrl: () => false,
    },
  };
  return require(workerPath);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs = 1000, stepMs = 20) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(stepMs);
  }
  throw new Error('waitFor timeout');
}

function createStopDeleteDbMock() {
  const state = {
    documents: [
      {
        id: 11,
        version_id: 1,
        name: JSON.stringify({ source: 'community-sync', originalName: 'Community HTML Sync' }),
        status: 'done',
        row_count: 2,
      },
    ],
    runs: [],
    pages: [],
    segments: [],
    entries: [],
    nextRunId: 1,
    purgeDeletes: 0,
  };

  const db = {
    async query(sql, params = []) {
      const normalized = normalizeSql(sql);

      if (normalized === 'INSERT INTO community_sync_runs (version_id, trigger_type, status, started_at) VALUES (?,?,"running",NOW())') {
        const [versionId, triggerType] = params;
        const run = {
          id: state.nextRunId++,
          version_id: versionId,
          trigger_type: triggerType,
          status: 'running',
        };
        state.runs.push(run);
        state.entries.push(
          { id: 301, version_id: versionId, document_id: 11, row_index: 1, content: 'page entry', raw_json: '{}' },
          { id: 302, version_id: versionId, document_id: 11, row_index: 2, content: 'segment entry', raw_json: '{}' }
        );
        state.pages.push({
          id: 21,
          version_id: versionId,
          run_id: run.id,
          entry_id: 301,
          thread_summary_entry_id: null,
          document_id: 11,
        });
        state.segments.push({
          id: 41,
          version_id: versionId,
          page_id: 21,
          entry_id: 302,
          document_id: 11,
        });
        return [{ insertId: run.id }];
      }

      if (normalized.startsWith('UPDATE community_sync_runs SET status=?,')) {
        const runId = params[params.length - 1];
        const run = state.runs.find(item => item.id === runId);
        if (run) {
          run.status = params[0];
          run.error = params[4] || null;
        }
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith('UPDATE community_sync_runs SET pages_found=')) {
        return [{ affectedRows: 1 }];
      }

      if (normalized.includes('FROM community_sync_pages') && normalized.includes("crawl_status='synced'") && normalized.includes('SELECT url')) {
        return [[]];
      }

      if (normalized === 'SELECT id, status FROM community_sync_runs WHERE version_id=? AND id=? LIMIT 1') {
        const [versionId, runId] = params;
        const run = state.runs.find(item => item.version_id === versionId && item.id === runId) || null;
        return [[run]];
      }

      if (normalized === 'SELECT status FROM community_sync_runs WHERE version_id=? AND id=? LIMIT 1') {
        const [versionId, runId] = params;
        const run = state.runs.find(item => item.version_id === versionId && item.id === runId) || null;
        return [[run ? { status: run.status } : null]];
      }

      if (normalized === 'SELECT id, entry_id, thread_summary_entry_id FROM community_sync_pages WHERE version_id=? AND run_id=?') {
        const [versionId, runId] = params;
        return [[
          ...state.pages
            .filter(item => item.version_id === versionId && item.run_id === runId)
            .map(item => ({
              id: item.id,
              entry_id: item.entry_id,
              thread_summary_entry_id: item.thread_summary_entry_id,
            })),
        ]];
      }

      if (normalized.startsWith('SELECT entry_id FROM community_sync_page_segments WHERE version_id=? AND page_id IN (')) {
        const [versionId, ...pageIds] = params;
        return [[
          ...state.segments
            .filter(item => item.version_id === versionId && pageIds.includes(item.page_id))
            .map(item => ({ entry_id: item.entry_id })),
        ]];
      }

      if (normalized.startsWith('DELETE FROM community_sync_page_segments WHERE version_id=? AND page_id IN (')) {
        const [versionId, ...pageIds] = params;
        state.segments = state.segments.filter(item => !(item.version_id === versionId && pageIds.includes(item.page_id)));
        state.purgeDeletes += 1;
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith('DELETE FROM community_sync_pages WHERE version_id=? AND id IN (')) {
        const [versionId, ...pageIds] = params;
        state.pages = state.pages.filter(item => !(item.version_id === versionId && pageIds.includes(item.id)));
        state.purgeDeletes += 1;
        return [{ affectedRows: 1 }];
      }

      if (normalized === 'DELETE FROM community_sync_runs WHERE version_id=? AND id=? LIMIT 1') {
        const [versionId, runId] = params;
        state.runs = state.runs.filter(item => !(item.version_id === versionId && item.id === runId));
        state.purgeDeletes += 1;
        return [{ affectedRows: 1 }];
      }

      if (normalized === 'SELECT COUNT(*) AS cnt FROM community_sync_pages WHERE version_id=? AND (entry_id=? OR thread_summary_entry_id=?)') {
        const [versionId, entryId, summaryEntryId] = params;
        return [[{
          cnt: state.pages.filter(item =>
            item.version_id === versionId &&
            (item.entry_id === entryId || item.thread_summary_entry_id === summaryEntryId)
          ).length,
        }]];
      }

      if (normalized === 'SELECT COUNT(*) AS cnt FROM community_sync_page_segments WHERE version_id=? AND entry_id=?') {
        const [versionId, entryId] = params;
        return [[{
          cnt: state.segments.filter(item => item.version_id === versionId && item.entry_id === entryId).length,
        }]];
      }

      if (normalized === 'DELETE FROM knowledge_entries WHERE id=? AND version_id=?') {
        const [entryId, versionId] = params;
        state.entries = state.entries.filter(item => !(item.id === entryId && item.version_id === versionId));
        return [{ affectedRows: 1 }];
      }

      if (normalized === 'SELECT id, name FROM kb_documents WHERE version_id=? ORDER BY id DESC') {
        const [versionId] = params;
        return [[...state.documents.filter(item => item.version_id === versionId)]];
      }

      if (normalized === 'SELECT DISTINCT entry_id FROM community_sync_pages WHERE version_id=? AND document_id=? AND entry_id IS NOT NULL') {
        const [versionId, documentId] = params;
        return [[
          ...state.pages
            .filter(item => item.version_id === versionId && item.document_id === documentId && item.entry_id != null)
            .map(item => ({ entry_id: item.entry_id })),
        ]];
      }

      if (normalized === 'SELECT DISTINCT thread_summary_entry_id AS entry_id FROM community_sync_pages WHERE version_id=? AND document_id=? AND thread_summary_entry_id IS NOT NULL') {
        const [versionId, documentId] = params;
        return [[
          ...state.pages
            .filter(item => item.version_id === versionId && item.document_id === documentId && item.thread_summary_entry_id != null)
            .map(item => ({ entry_id: item.thread_summary_entry_id })),
        ]];
      }

      if (normalized === 'SELECT DISTINCT entry_id FROM community_sync_page_segments WHERE version_id=? AND document_id=? AND entry_id IS NOT NULL') {
        const [versionId, documentId] = params;
        return [[
          ...state.segments
            .filter(item => item.version_id === versionId && item.document_id === documentId && item.entry_id != null)
            .map(item => ({ entry_id: item.entry_id })),
        ]];
      }

      if (normalized === 'UPDATE kb_documents SET status="done", row_count=? WHERE id=?') {
        const [rowCount, documentId] = params;
        const document = state.documents.find(item => item.id === documentId);
        if (document) {
          document.status = 'done';
          document.row_count = rowCount;
        }
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unhandled SQL: ${normalized}`);
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        query: db.query,
      };
    },
  };

  return { db, state };
}

async function testDedupesIdenticalContentAcrossUrls() {
  const { db, state } = createDbMock();
  const embeddingCalls = [];
  const removedEntries = [];
  const worker = loadWorkerWithMocks({
    db,
    embedding: {
      async embedBatch(inputs) {
        embeddingCalls.push(inputs);
        return [[0.1, 0.2, 0.3]];
      },
    },
    vectorStore: {
      add() {},
      removeEntry(versionId, entryId) {
        removedEntries.push({ versionId, entryId });
      },
    },
  });

  const result = await worker._persistPages(1, [
    { url: 'https://club.q1.com/post/1', title: 'Same', content: 'duplicate body' },
    { url: 'https://club.q1.com/post/2', title: 'Same', content: 'duplicate body' },
  ]);

  assert.deepStrictEqual(result, { changed: 2, written: 1 });
  assert.strictEqual(embeddingCalls.length, 1);
  assert.strictEqual(state.entries.length, 1);
  assert.strictEqual(state.pages.length, 2);
  assert.strictEqual(state.pages[0].entry_id, state.pages[1].entry_id);
  assert.strictEqual(state.documents[0].row_count, 1);
  assert.deepStrictEqual(removedEntries, []);
}

async function testSharedEntryIsNotDeletedWhenOnePageChanges() {
  const { db, state } = createDbMock();
  state.entries.push({
    id: 200,
    version_id: 1,
    document_id: 11,
    row_index: 1,
    content: 'old shared content',
    raw_json: '{}',
  });
  state.nextEntryId = 201;
  state.pages.push(
    {
      id: state.nextPageId++,
      version_id: 1,
      run_id: null,
      url_hash: hash('https://club.q1.com/post/a'),
      url: 'https://club.q1.com/post/a',
      title: 'Old A',
      content_preview: 'old shared content',
      raw_content: 'old shared content',
      crawl_status: 'synced',
      last_error: null,
      content_hash: 'hash-old',
      document_id: 11,
      entry_id: 200,
      thread_summary_entry_id: null,
      comment_count: 0,
      useful_comment_count: 0,
      ignored_comment_count: 0,
      selected_entry_count: 1,
      last_seen_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    },
    {
      id: state.nextPageId++,
      version_id: 1,
      run_id: null,
      url_hash: hash('https://club.q1.com/post/b'),
      url: 'https://club.q1.com/post/b',
      title: 'Old B',
      content_preview: 'old shared content',
      raw_content: 'old shared content',
      crawl_status: 'synced',
      last_error: null,
      content_hash: 'hash-old',
      document_id: 11,
      entry_id: 200,
      thread_summary_entry_id: null,
      comment_count: 0,
      useful_comment_count: 0,
      ignored_comment_count: 0,
      selected_entry_count: 1,
      last_seen_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    }
  );

  const embeddingCalls = [];
  const removedEntries = [];
  const worker = loadWorkerWithMocks({
    db,
    embedding: {
      async embedBatch(inputs) {
        embeddingCalls.push(inputs);
        return [[0.9, 0.1]];
      },
    },
    vectorStore: {
      add() {},
      removeEntry(versionId, entryId) {
        removedEntries.push({ versionId, entryId });
      },
    },
  });

  const result = await worker._persistPages(1, [
    { url: 'https://club.q1.com/post/a', title: 'New A', content: 'new unique content' },
  ]);

  assert.deepStrictEqual(result, { changed: 1, written: 1 });
  assert.strictEqual(embeddingCalls.length, 1);
  assert.strictEqual(state.entries.length, 2);
  const pageA = state.pages.find(item => item.url.endsWith('/a'));
  const pageB = state.pages.find(item => item.url.endsWith('/b'));
  assert.notStrictEqual(pageA.entry_id, 200);
  assert.strictEqual(pageB.entry_id, 200);
  assert.deepStrictEqual(removedEntries, []);
  assert.strictEqual(state.documents[0].row_count, 2);
}

async function testStructuredPageCreatesSelectedDigestAndIgnoredSegments() {
  const { db, state } = createDbMock();
  const embeddingCalls = [];
  const worker = loadWorkerWithMocks({
    db,
    embedding: {
      async embedBatch(inputs) {
        embeddingCalls.push(inputs);
        return inputs.map((_, index) => [index + 0.1, index + 0.2]);
      },
    },
    vectorStore: {
      add() {},
      removeEntry() {},
    },
  });

  const page = {
    url: 'https://club.q1.com/post/100',
    title: '活动答疑汇总',
    content: '帖子正文内容，用于页面内容哈希。',
    rawContent: '原始线程归档内容',
    thread: {
      type: 'q1_post',
      board: { name: '活动专区' },
      post: {
        id: '100',
        title: '活动答疑汇总',
        authorName: '版主A',
        createdAt: '2026-07-21 10:00',
        content: '这里是帖子正文，包含活动入口、奖励规则和领取方式。',
      },
      comments: [
        {
          id: 'c1',
          authorName: '玩家甲',
          createdAt: '2026-07-21 10:05',
          content: '活动规则是今天20点结束，兑换码每个账号只能领1次，记得完成任务后刷新领取。',
          replies: [],
        },
        {
          id: 'c2',
          authorName: '玩家乙',
          createdAt: '2026-07-21 10:08',
          content: '可以先刷新页面再重新进入活动试试。',
          replies: [],
        },
        {
          id: 'c3',
          authorName: '玩家丙',
          createdAt: '2026-07-21 10:09',
          content: '666',
          replies: [],
        },
      ],
      imageInsights: [
        {
          imageHash: 'img-a',
          analysisText: '截图展示了活动入口位于首页右上角的福利按钮内。',
        },
      ],
    },
  };

  const result = await worker._persistPages(1, [page]);

  assert.deepStrictEqual(result, { changed: 1, written: 4 });
  assert.strictEqual(embeddingCalls.length, 4);
  assert.strictEqual(state.entries.length, 4);
  assert.strictEqual(state.segments.length, 6);

  const syncedPage = state.pages[0];
  assert.strictEqual(syncedPage.comment_count, 3);
  assert.strictEqual(syncedPage.useful_comment_count, 2);
  assert.strictEqual(syncedPage.ignored_comment_count, 1);
  assert.strictEqual(syncedPage.selected_entry_count, 4);
  assert.strictEqual(syncedPage.raw_content, '原始线程归档内容');
  assert.ok(syncedPage.entry_id);
  assert.ok(syncedPage.thread_summary_entry_id);
  assert.notStrictEqual(syncedPage.entry_id, syncedPage.thread_summary_entry_id);
  assert.strictEqual(state.documents[0].row_count, 4);

  const selectedSegments = state.segments.filter(item => item.quality_decision === 'selected');
  const digestOnlySegments = state.segments.filter(item => item.quality_decision === 'digest_only');
  const ignoredSegments = state.segments.filter(item => item.quality_decision === 'ignored');

  assert.strictEqual(selectedSegments.length, 4);
  assert.strictEqual(digestOnlySegments.length, 1);
  assert.strictEqual(ignoredSegments.length, 1);

  const postSegment = state.segments.find(item => item.source_type === 'post_main');
  const digestSegment = state.segments.find(item => item.source_type === 'comment_digest');
  const imageSegment = state.segments.find(item => item.source_type === 'image_fact');
  const ignoredSegment = ignoredSegments[0];

  assert.ok(postSegment.entry_id);
  assert.strictEqual(postSegment.entry_id, syncedPage.entry_id);
  assert.ok(digestSegment.entry_id);
  assert.strictEqual(digestSegment.entry_id, syncedPage.thread_summary_entry_id);
  assert.ok(imageSegment.entry_id);
  assert.strictEqual(digestOnlySegments[0].entry_id, null);
  assert.strictEqual(ignoredSegment.entry_id, null);
}

async function testDeleteRunReturnsStoppingAndPurgesAfterCancel() {
  const { db, state } = createStopDeleteDbMock();
  const removedEntries = [];
  class TestCancelledError extends Error {
    constructor(message = 'cancelled') {
      super(message);
      this.name = 'CommunitySyncCancelledError';
    }
  }
  class HangingCrawler {
    constructor(options) {
      this.signal = options.signal;
    }

    async crawl() {
      await new Promise((resolve, reject) => {
        const fail = () => {
          setTimeout(() => reject(new TestCancelledError()), 1700);
        };
        if (this.signal.aborted) {
          fail();
          return;
        }
        this.signal.addEventListener('abort', fail, { once: true });
      });
      return { pages: [] };
    }
  }

  const worker = loadWorkerWithMocks({
    db,
    settings: {
      validateConfigForRun() {},
    },
    vectorStore: {
      add() {},
      removeEntry(versionId, entryId) {
        removedEntries.push({ versionId, entryId });
      },
    },
    embedding: {
      async embedBatch() {
        throw new Error('embedBatch should not run in stop/delete test');
      },
    },
    communityCrawler: {
      CommunityCrawler: HangingCrawler,
      CommunitySyncCancelledError: TestCancelledError,
    },
  });

  const runPromise = worker.runOnce({
    triggerType: 'manual',
    config: {
      versionId: 1,
      baseUrl: 'https://example.com/community',
    },
  });

  const runId = await waitFor(() => {
    const run = state.runs[0];
    return run ? run.id : 0;
  });

  const startedAt = Date.now();
  const result = await worker.deleteRun(1, runId);
  const elapsedMs = Date.now() - startedAt;

  assert.deepStrictEqual(result, {
    found: true,
    deleted: false,
    reason: 'stopping',
    stopping: true,
  });
  assert.ok(elapsedMs < 1900, `deleteRun took too long: ${elapsedMs}ms`);

  await assert.rejects(runPromise, err => err && err.name === 'CommunitySyncCancelledError');
  await waitFor(() => state.runs.length === 0, 1500, 25);

  assert.strictEqual(state.pages.length, 0);
  assert.strictEqual(state.segments.length, 0);
  assert.strictEqual(state.entries.length, 0);
  assert.strictEqual(state.documents[0].row_count, 0);
  assert.deepStrictEqual(removedEntries, [
    { versionId: 1, entryId: 301 },
    { versionId: 1, entryId: 302 },
  ]);
  assert.ok(state.purgeDeletes >= 3);
}

async function main() {
  await testDedupesIdenticalContentAcrossUrls();
  console.log('  OK dedupes identical content across urls');
  await testSharedEntryIsNotDeletedWhenOnePageChanges();
  console.log('  OK keeps shared entry when one page changes');
  await testStructuredPageCreatesSelectedDigestAndIgnoredSegments();
  console.log('  OK writes structured thread segments');
  await testDeleteRunReturnsStoppingAndPurgesAfterCancel();
  console.log('  OK returns stopping quickly and purges after cancel');
  console.log('\ncommunitySyncWorker.test passed');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
