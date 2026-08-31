const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '../src/app.js'), 'utf8');
const repositorySource = fs.readFileSync(path.resolve(__dirname, '../src/db/repository.js'), 'utf8');
const crawlerSource = fs.readFileSync(path.resolve(__dirname, '../../scripts/q1_crawler.py'), 'utf8');

test('Q1 crawler import contract is wired through the protected HTTP endpoint', () => {
  assert.match(appSource, /sources.*import/);
  assert.match(appSource, /analysis.*content-batch/);
  assert.match(appSource, /ANALYSIS_BATCH_TOO_LARGE/);
  assert.match(appSource, /PUBLIC_OPINION_IMPORT_TOKEN/);
  assert.match(appSource, /REQUEST_TOO_LARGE/);
  assert.match(repositorySource, /async importContentBatch/);
  assert.match(repositorySource, /async enqueueAnalysisBatch/);
  assert.match(repositorySource, /upsertContentPage/);
  assert.match(crawlerSource, /--import-to-server/);
  assert.match(crawlerSource, /submit_analysis_batch/);
  assert.match(crawlerSource, /analysis_submit_failed/);
  assert.match(crawlerSource, /collection_import_failed/);
  assert.match(crawlerSource, /authorization.*Bearer/);
});
