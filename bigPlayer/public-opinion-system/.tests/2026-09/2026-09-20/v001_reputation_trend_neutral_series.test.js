const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../../../');
const appSource = fs.readFileSync(path.join(ROOT, '../admin/PublicOpinion/assets/app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ROOT, '../admin/PublicOpinion/index.html'), 'utf8');
const start = appSource.indexOf('function normalizeSentiment(');
const end = appSource.indexOf('// 议题分布', start);
const container = { innerHTML: '' };
const context = vm.createContext({
  document: { querySelector: selector => selector === '#trend' ? container : null },
  $: selector => selector === '#trend' ? container : null,
  esc: value => String(value ?? ''),
  scopeEmpty: label => `暂无${label}`,
  periodLabel: () => '今日'
});
vm.runInContext(appSource.slice(start, end), context);

test('口碑趋势保留三类情感并排除 unclassified 中性率分母', () => {
  context.renderTrend([
    { date: '2026-09-20', positive: 2, negative: 5, neutral: 3, unclassified: 90 }
  ], { positive: 2, neutral: 3, negative: 5, unclassified: 90 });

  assert.match(container.innerHTML, /正向率/);
  assert.match(container.innerHTML, /负面率/);
  assert.match(container.innerHTML, /中性率/);
  assert.match(container.innerHTML, /20\.0%/);
  assert.match(container.innerHTML, /50\.0%/);
  assert.match(container.innerHTML, /30\.0%/);
  assert.doesNotMatch(container.innerHTML, /90\.0%/);
  assert.equal((container.innerHTML.match(/trend-bar-group neutral/g) || []).length, 1);
  assert.match(container.innerHTML, /正向 2 · 中性 3 · 负面 5 · 共 10/);
});

test('中性为零时不输出伪柱，日期仍保留中性系列位置', () => {
  context.renderTrend([
    { date: '2026-09-20', positive: 2, negative: 0, neutral: 0 }
  ], { positive: 2, neutral: 0, negative: 0, unclassified: 4 });

  assert.match(container.innerHTML, /class="trend-bar-group neutral"/);
  assert.match(container.innerHTML, /class="trend-bar empty"/);
  assert.match(container.innerHTML, /中性 0 · 负面 0 · 共 2/);
});

test('概览页面提供中性图例和灰色柱样式', () => {
  assert.match(indexSource, /background:#64748b"><\/i>中性/);
  assert.match(indexSource, /\.trend-bar-group\.neutral \.trend-bar/);
  assert.match(indexSource, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
