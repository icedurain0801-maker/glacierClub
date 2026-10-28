'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FacebookImageAnalyzer } = require('../src/integrations/facebookImageAnalyzer');
const { TypeSafeUrgentReview } = require('../src/integrations/typeSafeUrgentReview');
const { reviewValue } = require('./fixtures/contextualReview');
const env = { AI_ANALYSIS_URL: 'https://fixture.invalid/completions', AI_ANALYSIS_TOKEN: 'fixture', AI_ANALYSIS_MODEL: 'fixture' };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const contents = count => Array.from({ length: count }, (_, i) => ({ platform: 'facebook', media: [`https://scontent.fbcdn.net/${i}.jpg`] }));
function fixture({ invalid = false, failDownload = false } = {}) {
  let active = 0, maxActive = 0, downloads = 0, requests = 0;
  const ai = new FacebookImageAnalyzer(env, {
    loadImageImpl: async url => { downloads++; if (failDownload && url.includes('/0.jpg')) throw Object.assign(Error(), { code: 'FACEBOOK_IMAGE_TIMEOUT' }); await pause(2); return { mime: 'image/png', base64: Buffer.from(url).toString('base64') }; },
    fetchImpl: async (_, options) => {
      requests++; maxActive = Math.max(maxActive, ++active); await pause(10); active--;
      const parts = JSON.parse(options.body).messages[1].content;
      const images = parts.filter(v => v.type === 'image_url').map((v, index) => ({ id: `img${index}`, text: Buffer.from(v.image_url.url.split(',')[1], 'base64').toString(), description: '可见游戏截图' }));
      if (invalid && images.length > 1) images[1].id = images[0].id;
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ images }) } }], usage: { prompt_tokens: images.length * 10, completion_tokens: images.length * 5 } }) };
    }
  });
  return { ai, stats: () => ({ downloads, requests, maxActive }) };
}
test('48 distinct cold images use six batch requests; IDs map even when response order reverses', async () => {
  const { ai, stats } = fixture();
  const result = await ai.analyzeBatch(contents(48));
  assert.equal(stats().requests, 12); assert.equal(stats().maxActive, 6);
  result.forEach((row, index) => { assert.equal(row.status, 'complete'); assert.equal(row.images[0].text, contents(48)[index].media[0]); });
  assert.equal(ai.active, 0); assert.equal(ai.downloadActive, 0);
});
test('invalid duplicate batch IDs isolate to singleton retry rather than cross-link evidence', async () => {
  const { ai, stats } = fixture({ invalid: true });
  const result = await ai.analyzeBatch(contents(8));
  assert.equal(stats().requests, 10); assert.ok(stats().maxActive <= 6);
  result.forEach((row, index) => assert.equal(row.images[0].text, contents(8)[index].media[0]));
  assert.equal(ai.active, 0);
});
test('a failed download never produces normal/complete evidence and does not block other content', async () => {
  const { ai } = fixture({ failDownload: true });
  const result = await ai.analyzeBatch(contents(8));
  assert.equal(result[0].error.code, 'FACEBOOK_IMAGE_TIMEOUT');
  assert.equal(result[0].status, undefined); assert.ok(result.slice(1).every(row => row.status === 'complete'));
});
test('cache uses actual bytes: re-signed identical images reuse OCR, changed bytes do not', async () => {
  let bytes = 'same', requests = 0;
  const ai = new FacebookImageAnalyzer(env, { loadImageImpl: async () => ({ mime: 'image/png', base64: Buffer.from(bytes).toString('base64') }), fetchImpl: async () => { requests++; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"游戏文字","description":"可见游戏画面"}' } }] }) }; } });
  await ai.analyze(contents(1)[0]);
  await ai.analyze({ platform: 'facebook', media: [contents(1)[0].media[0] + '?signature=new'] });
  assert.equal(requests, 1); bytes = 'changed'; await ai.analyze(contents(1)[0]); assert.equal(requests, 2);
});
test('prompt echo is rejected, not cached as successfully read image', async () => {
  const ai = new FacebookImageAnalyzer(env, { loadImageImpl: async () => ({ mime: 'image/png', base64: 'eA==' }), fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"逐字抄录可辨认文字，无法辨认留空","description":"可见画面"}' } }] }) }) });
  await assert.rejects(ai.analyze(contents(1)[0]), { code: 'FACEBOOK_IMAGE_AI_INVALID_RESPONSE' }); assert.equal(ai.cache.size, 0); assert.equal(ai.active, 0);
});
test('independent reviewer combines ten texts while retaining each exact quote/hash and blind inputs', async () => {
  let requests = 0;
  const reviewer = new TypeSafeUrgentReview(env, { fetchImpl: async (_, options) => {
    requests++; const body = JSON.parse(options.body); const input = JSON.parse(body.messages[1].content);
    assert.ok(input.items); assert.equal(input.items.length, 10);
    assert.ok(input.items.every(item => !('firstLevel' in item) && !('level' in item)));
    const items = input.items.map(item => ({ id: item.id, ...reviewValue(item) })).reverse();
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ items }) } }], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } }) };
  } });
  const result = await Promise.all(Array.from({ length: 10 }, (_, i) => reviewer.review(`当前游戏功能让人失望${i}`, { content: { contentType: 'post' } })));
  assert.equal(requests, 1); result.forEach((row, i) => assert.equal(row.quote, `当前游戏功能让人失望${i}`)); assert.equal(reviewer.active, 0);
});
test('review evidence from another batch item is rejected by the unchanged per-item validator', async () => {
  const reviewer = new TypeSafeUrgentReview(env, { fetchImpl: async (_, options) => {
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    const items = input.items.map(item => ({ id: item.id, ...reviewValue(item, { quote: input.items[0].text }) }));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ items }) } }] }) };
  } });
  const results = await Promise.allSettled(['游戏功能失望A', '玩法体验不满B'].map(text => reviewer.review(text, { content: { contentType: 'post' } })));
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.equal(reviewer.active, 0);
});
