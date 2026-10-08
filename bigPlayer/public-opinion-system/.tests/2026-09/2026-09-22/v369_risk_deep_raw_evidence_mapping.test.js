'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'evidence', 'v366-risk-deep-real-rerun-c264074f-f6a3-4c8b-8cee-6cc3fbae1d61');
const mapping = JSON.parse(fs.readFileSync(path.join(dir, 'request-response-mapping.json')));

test('request indices uniquely map to fixed external ids', () => {
  assert.deepEqual(mapping.requestInputs.map(item => [item.i, item.externalId]), [[0, '919167'], [1, '920120'], [2, '6826813']]);
  assert.equal(new Set(mapping.requestInputs.map(item => item.i)).size, 3);
  assert.equal(new Set(mapping.requestInputs.map(item => item.externalId)).size, 3);
});

test('each raw file agrees with request index and persisted result', () => {
  const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json')));
  for (const expected of mapping.resolvedMapping) {
    const evidence = JSON.parse(fs.readFileSync(path.join(dir, expected.rawFile)));
    const persisted = result.samples.find(item => item.externalId === expected.externalId)?.result;
    assert.equal(evidence.externalId, expected.externalId);
    assert.equal(evidence.requestIndex, expected.i);
    assert.equal(evidence.raw.i, expected.i);
    assert.equal(evidence.raw.s, persisted.sentiment);
    assert.equal(evidence.raw.v, persisted.severity);
    assert.equal(evidence.promptHash, mapping.requestPromptHash);
  }
});

test('original provider array order is preserved separately from request index', () => {
  assert.deepEqual(mapping.originalProviderArray.map(item => item.i), [0, 2, 1]);
  assert.equal(mapping.providerCallSequence, 1);
});
