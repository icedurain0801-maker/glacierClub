const test = require('node:test'), assert = require('node:assert/strict');
const { frequentFeedback } = require('../src/services/frequentFeedback');
test('sentiment groups count and rank independently, including terms outside the overall top list', () => {
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, body: '匹配等待时间太长', sentiment: 'negative' })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `p${i}`, body: '限定皮肤免费获取', sentiment: 'positive' })),
    { id: 'neutral', body: '匹配等待时间太长', sentiment: 'neutral' },
    { id: 'unknown', body: '匹配等待时间太长' }
  ];
  const result = require('../src/services/frequentFeedback').frequentFeedbackBySentiment(rows, 1);
  assert.equal(result.all[0].count, 7);
  assert.equal(result.negative[0].count, 5);
  assert.equal(result.positive[0].count, 2);
  assert.match(result.positive[0].text, /皮肤/);
  assert.deepEqual(require('../src/services/frequentFeedback').frequentFeedbackBySentiment([]), { all: [], positive: [], negative: [] });
});
test('counts each post/comment once and removes redundant fragments', () => {
  const rows = [{ id: '1', body: '匹配机制不公平，匹配机制不公平' }, { id: '2', body: '匹配机制不公平' }, { id: '2', body: '匹配机制不公平' }];
  const results = frequentFeedback(rows);
  assert(results.some(t => t.text === '匹配机制不公平' && t.count === 2));
  assert(results.every(t => t.count === 2));
});
test('uses full original text without counting authors, and no singleton tags', () => {
  const rows = ['1', '2'].map(id => ({ id, title: '', body: '普通内容', search_text: '\n普通内容\n匹配等待时间太长\n共同昵称' }));
  const results = frequentFeedback(rows);
  assert(results.some(t => t.text === '匹配等待时间太长'));
  assert(!results.some(t => t.text.includes('共同昵称')));
  assert.deepEqual(frequentFeedback([{ id: '3', body: '只有一条反馈' }]), []);
});
test('aggregates exactly the provided filtered range without adding dates', () => {
  const today = [{ id: '1', body: '奖励没有到账' }], yesterday = [{ id: '2', body: '奖励没有到账' }];
  assert.deepEqual(frequentFeedback(today), []);
  assert(frequentFeedback([...today, ...yesterday]).some(t => t.text === '奖励没有到账' && t.count === 2));
});
test('excludes multilingual fillers and greetings while retaining meaningful short nouns and full feedback', () => {
  const texts = ['너무', 'した', 'so', '진짜', 'hi', 'really!', '真的', '所以', '너무!!!', '万圣节', '이벤트', '匹配', '매칭 너무 어려워요', '匹配等待时间太长'];
  const rows = texts.flatMap((body, index) => [0, 1].map(n => ({ id: `${index}-${n}`, body })));
  const results = frequentFeedback(rows, 100);
  for (const text of texts.slice(0, 9)) assert(!results.some(t => t.text === text), text);
  for (const text of texts.slice(9)) assert(results.some(t => t.text === text && t.count >= 2), text);
});
test('generic praise and fragments cannot dominate concrete community subjects', () => {
  const noise = ['不错', '加油', '厉害', '没有', '很好', '坚持', '就是', '一般', '这么', '运气'];
  const rows = noise.flatMap((body, i) => Array.from({ length: 20 }, (_, n) => ({ id: `${i}-${n}`, body })));
  rows.push({ id: 'game1', body: '限定传说皮肤，免费获取立牌' }, { id: 'game2', body: '限定传说皮肤，免费获取立牌' });
  const result = frequentFeedback(rows);
  assert(result.some(t => t.text === '限定传说皮肤' && t.count === 2));
  assert(result.some(t => t.text === '免费获取立牌' && t.count === 2));
  assert(result.every(t => !noise.includes(t.text)));
});
