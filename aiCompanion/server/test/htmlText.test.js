const assert = require('assert');
const { extractImageUrls } = require('../src/services/htmlText');

function main() {
  const urls = extractImageUrls(
    [
      '<img src="/images/poster.png">',
      '<img data-src="https://opsoss.q1.com/community/a.webp">',
      '<source srcset="https://club.q1.com/assets/hero.jpg 1x, https://club.q1.com/assets/hero@2x.jpg 2x">',
      '<img src="data:image/png;base64,abc">',
    ].join(''),
    'https://club.q1.com/pages/info/index?lang=zh-CN',
    ['club.q1.com']
  );

  assert.deepStrictEqual(urls, [
    'https://club.q1.com/images/poster.png',
    'https://opsoss.q1.com/community/a.webp',
    'https://club.q1.com/assets/hero.jpg',
    'https://club.q1.com/assets/hero@2x.jpg',
  ]);

  console.log('htmlText.test passed');
}

main();
