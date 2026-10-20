const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
test('both persisted risk codes use the same public label without altering severity codes', () => {
  const vm = require('node:vm');
  const sandbox = { window: { PublicOpinionRiskModes: require("../../shared/riskModes") }, module: { exports: {} }, URLSearchParams, console, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(root, '../admin/PublicOpinion/assets/content.js'), 'utf8'), sandbox);
  const content = sandbox.module.exports;
  const detail = require('../../../admin/PublicOpinion/assets/alert-detail');
  assert.equal(content.severityLabel('negative'), '紧急告警');
  assert.equal(content.severityLabel('urgent'), '紧急告警');
  assert.equal(detail.severityLabel('negative'), '紧急告警');
  const { NAMES, LEVELS } = require('../src/services/riskDecisionTree');
  assert.equal(NAMES.L2, '紧急告警'); assert.equal(NAMES.L3, '紧急告警');
  assert.equal(LEVELS.L2, 'negative'); assert.equal(LEVELS.L3, 'urgent');
});
test('runtime source and administrator pages contain no obsolete label', () => {
  assert(!fs.readFileSync(path.join(root, 'sentiment_evaluator.py'), 'utf8').includes('负面待处理'));
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);
  for (const dir of ['server/src', 'worker/src', 'shared', '../admin/PublicOpinion']) {
    for (const file of walk(path.join(root, dir)).filter(file => /\.(js|html|css|json|py)$/.test(file))) {
      assert(!fs.readFileSync(file, 'utf8').includes('负面待处理'), file);
    }
  }
});
