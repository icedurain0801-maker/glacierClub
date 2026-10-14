'use strict';

const mysql = require('mysql2/promise');
const { LastNightIsolatedStore } = require('../worker/src/lastNightIsolatedStore');
const { SOURCE_ID, BOARD_ID } = require('../worker/src/lastNightOverseasDailyJob');

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 8192) throw new Error('CRASH_FIXTURE_INPUT_TOO_LARGE');
  }
  const config = JSON.parse(input);
  const pool = mysql.createPool({ host: '127.0.0.1', port: config.identity.port,
    user: config.user, password: config.password, database: 'ln_last_night',
    connectionLimit: 1, dateStrings: true, timezone: 'Z', charset: 'utf8mb4' });
  const store = new LastNightIsolatedStore({ pool, identity: config.identity,
    analysisVersions: { light: 'test-light-v1', deep: 'test-deep-v1' } });
  const run = await store.startRun({ sourceId: SOURCE_ID, accountId: config.accountId,
    siteId: config.siteId, siteUrl: config.siteUrl, boardId: BOARD_ID,
    publishedFrom: config.publishedFrom, publishedTo: config.publishedTo });
  await store.registerFeeds(run.id, run.leaseEpoch, [{ feedKey: 'merged' }]);
  await store.registerTask({ runId: run.id, leaseEpoch: run.leaseEpoch,
    scope: 'comments', feedKey: 'merged', rootPostId: 'crash-post' });
  await store.commitPage({ runId: run.id, leaseEpoch: run.leaseEpoch, sourceId: SOURCE_ID,
    siteId: config.siteId, boardId: BOARD_ID, scope: 'comments', feedKey: 'merged',
    rootPostId: 'crash-post', cursor: null, nextCursor: 'c2', hasMore: true,
    items: [{ externalId: 'crash-comment-1', contentType: 'comment',
      rootPlatformContentId: 'crash-post', publishedAt: '2026-10-05T12:00:00.000Z' }] });
  process.exit(77);
}

main().catch(() => { process.exitCode = 1; });
