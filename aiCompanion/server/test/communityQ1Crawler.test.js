const assert = require('assert');
const {
  buildQ1Context,
  collectImageUrlsFromRichContent,
  isQ1CommunityUrl,
  normalizeRichContent,
  pickPostTitle,
} = require('../src/services/communityQ1Crawler');

function main() {
  assert.strictEqual(isQ1CommunityUrl('https://club.q1.com/?lang=zh-CN'), true);
  assert.strictEqual(isQ1CommunityUrl('https://example.com'), false);

  const ctx = buildQ1Context('https://club.q1.com/?lang=zh-CN&env=web&gameId=2131&gameVersion=2131-CN-ZS');
  assert.strictEqual(ctx.gameVersion, '2131-CN-ZS');
  assert.ok(ctx.loginShellUrl.includes('/pages/user/login/index?'));

  const richText = normalizeRichContent([
    { type: 0, data: '第一行' },
    { type: 1, data: 'https://example.com/a.png' },
    { type: 2, data: 'https://example.com/v.mp4' },
  ]);
  assert.ok(richText.includes('第一行'));
  assert.ok(richText.includes('[图片]'));
  assert.ok(!richText.includes('https://example.com/a.png'));
  assert.ok(richText.includes('[视频]'));
  assert.ok(!richText.includes('https://example.com/v.mp4'));

  const imageUrls = collectImageUrlsFromRichContent([
    { type: 1, data: 'https://example.com/a.png', imageUrl: 'https://example.com/b.png' },
    { type: 1, meta: { originalUrl: 'https://example.com/c.png' } },
    { type: 0, data: 'plain text' },
  ]);
  assert.deepStrictEqual(imageUrls, [
    'https://example.com/a.png',
    'https://example.com/b.png',
    'https://example.com/c.png',
  ]);

  const title = pickPostTitle({
    title: '',
    id: 1,
    content: [{ type: 0, data: '这是自动标题' }],
  });
  assert.strictEqual(title, '这是自动标题');

  console.log('communityQ1Crawler.test passed');
}

main();
