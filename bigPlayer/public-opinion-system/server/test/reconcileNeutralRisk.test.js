const test = require('node:test');
const assert = require('node:assert/strict');
const { target } = require('../../scripts/reconcile-neutral-risk');
const policy = require('../src/services/riskSeverityNormalizer');
const issue = require('../src/services/productIssueEvidence');
const content = { body: '签到', fingerprint: 'current', is_deleted: 0 };
const analysis = { sentiment: 'neutral', severity: 'attention', content_fingerprint: 'current', risk_context: JSON.stringify({rawAnalysis:{sentiment:'neutral',severity:'attention',riskDecision:{level:'L1',claim_type:'emotion',confidence:0.9}}}) };
test('historical repair only corrects neutral attention records to normal', () => {
  assert.equal(target(analysis,content,policy,issue).severity,'normal');
  for(const severity of ['urgent','negative','normal']) assert.equal(target({...analysis,severity},content,policy,issue),null);
  for(const sentiment of ['positive','negative']) assert.equal(target({...analysis,sentiment},content,policy,issue),null);
});
test('historical repair skips stale or deleted content', () => {
  assert.equal(target({...analysis,content_fingerprint:'old'},content,policy,issue),null);
  assert.equal(target(analysis,{...content,is_deleted:1},policy,issue),null);
});
test('historical repair preserves neutral observable concern', () => {
  assert.equal(target(analysis,{...content,body:'进不去了'},policy,issue),null);
});
