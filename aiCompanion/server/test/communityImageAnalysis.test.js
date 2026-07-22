const assert = require('assert');
const path = require('path');

function createDbMock() {
  const state = {
    rows: [],
  };

  return {
    state,
    db: {
      async query(sql, params = []) {
        if (sql.includes('FROM community_sync_image_analysis')) {
          const [versionId, imageHash] = params;
          const row = state.rows.find(item => item.version_id === versionId && item.image_hash === imageHash);
          return [row ? [row] : []];
        }

        if (sql.startsWith('INSERT INTO community_sync_image_analysis')) {
          const [versionId, imageHash, sourceUrl, mimeType, analysisText, isUseful] = params;
          const existing = state.rows.find(item => item.version_id === versionId && item.image_hash === imageHash);
          if (existing) {
            existing.source_url = sourceUrl;
            existing.mime_type = mimeType;
            existing.analysis_text = analysisText;
            existing.is_useful = isUseful;
          } else {
            state.rows.push({
              version_id: versionId,
              image_hash: imageHash,
              source_url: sourceUrl,
              mime_type: mimeType,
              analysis_text: analysisText,
              is_useful: isUseful,
            });
          }
          return [{ affectedRows: 1 }];
        }

        throw new Error(`Unhandled SQL: ${sql}`);
      },
    },
  };
}

function loadServiceWithMocks({ db, llmChat, kbConfig }) {
  const root = path.resolve(__dirname, '../src');
  const servicePath = path.join(root, 'services', 'communityImageAnalysis.js');
  const dbPath = path.join(root, 'config', 'db.js');
  const kbPath = path.join(root, 'config', 'kb.js');
  const llmPath = path.join(root, 'services', 'llm.js');

  delete require.cache[servicePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  require.cache[kbPath] = {
    id: kbPath,
    filename: kbPath,
    loaded: true,
    exports: kbConfig || {
      chatMedia: { imageMaxBytes: 10 * 1024 * 1024 },
      llm: { mediaAnalysisModel: 'mock-model' },
    },
  };
  require.cache[llmPath] = {
    id: llmPath,
    filename: llmPath,
    loaded: true,
    exports: { chat: llmChat },
  };

  return require(servicePath);
}

async function testReuseByImageHash() {
  const { db, state } = createDbMock();
  let llmCalls = 0;
  const service = loadServiceWithMocks({
    db,
    llmChat: async () => {
      llmCalls += 1;
      return {
        content: JSON.stringify({
          isUseful: true,
          summary: '活动海报',
          text: '7月30日更新维护，奖励包含头像框和点券',
        }),
      };
    },
  });

  const fetchImage = async url => ({
    url,
    buffer: Buffer.from('same-image-binary'),
    mimeType: 'image/png',
  });

  const first = await service.analyzePageImages({
    versionId: 1,
    imageUrls: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
    maxImagesPerPage: 5,
    fetchImage,
  });

  const second = await service.analyzePageImages({
    versionId: 1,
    imageUrls: ['https://cdn.example.com/c.png'],
    maxImagesPerPage: 5,
    fetchImage,
  });

  assert.strictEqual(llmCalls, 1);
  assert.strictEqual(first.length, 1);
  assert.strictEqual(second.length, 1);
  assert.strictEqual(state.rows.length, 1);
  assert.ok(first[0].analysisText.includes('7月30日更新维护'));
  assert.ok(second[0].cached);
}

async function testSkipUselessImageAfterCache() {
  const { db, state } = createDbMock();
  let llmCalls = 0;
  const service = loadServiceWithMocks({
    db,
    llmChat: async () => {
      llmCalls += 1;
      return {
        content: JSON.stringify({
          isUseful: false,
          summary: '',
          text: '',
        }),
      };
    },
  });

  const fetchImage = async url => ({
    url,
    buffer: Buffer.from('useless-image-binary'),
    mimeType: 'image/jpeg',
  });

  const first = await service.analyzePageImages({
    versionId: 2,
    imageUrls: ['https://cdn.example.com/poster.jpg'],
    maxImagesPerPage: 5,
    fetchImage,
  });
  const second = await service.analyzePageImages({
    versionId: 2,
    imageUrls: ['https://cdn.example.com/poster-copy.jpg'],
    maxImagesPerPage: 5,
    fetchImage,
  });

  assert.strictEqual(llmCalls, 1);
  assert.deepStrictEqual(first, []);
  assert.deepStrictEqual(second, []);
  assert.strictEqual(state.rows.length, 1);
  assert.strictEqual(state.rows[0].is_useful, 0);
}

async function main() {
  await testReuseByImageHash();
  console.log('  OK reuses cached image analysis by content hash');
  await testSkipUselessImageAfterCache();
  console.log('  OK caches useless image decisions');
  console.log('\ncommunityImageAnalysis.test passed');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
