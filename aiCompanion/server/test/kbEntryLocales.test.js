const assert = require('assert');
const kbEntryLocales = require('../src/services/kbEntryLocales');

function main() {
  const raw = {
    中文: '中文内容',
    英文: 'English text',
    繁中: '繁中內容',
    日语: '日本語',
    韩语: '한국어',
  };

  const extracted = kbEntryLocales.extractEntryLocales(raw);
  assert.deepStrictEqual(
    extracted.map(item => item.locale),
    ['zh-CN', 'en-US', 'zh-TW', 'ja-JP', 'ko-KR'],
    'extractEntryLocales should map configured language columns into normalized locales'
  );

  assert.strictEqual(
    extracted.find(item => item.locale === 'en-US').content,
    'English text',
    'extractEntryLocales should preserve per-locale content'
  );

  const merged = kbEntryLocales.mergeLocaleLists(
    [
      { locale: 'en', content: 'English text' },
      { locale: 'zh-CN', content: '中文内容' },
    ],
    [
      { locale: 'en-US', content: 'Duplicate English text' },
      { locale: 'ja', content: '日本語' },
    ]
  );
  assert.deepStrictEqual(
    merged.map(item => item.locale),
    ['zh-CN', 'en-US', 'ja-JP'],
    'mergeLocaleLists should normalize and de-duplicate locales'
  );
  assert.strictEqual(
    merged.find(item => item.locale === 'en-US').content,
    'English text',
    'mergeLocaleLists should keep the first non-empty locale content'
  );

  const entry = { content: 'default body' };
  assert.strictEqual(
    kbEntryLocales.pickEntryContentByLocale(entry, extracted, 'ja'),
    '日本語',
    'pickEntryContentByLocale should support base language fallbacks'
  );
  assert.strictEqual(
    kbEntryLocales.pickEntryContentByLocale(entry, extracted, 'fr-FR'),
    '中文内容',
    'pickEntryContentByLocale should fall back to the first available locale'
  );
  assert.strictEqual(
    kbEntryLocales.pickEntryContentByLocale(entry, [], 'fr-FR'),
    'default body',
    'pickEntryContentByLocale should fall back to entry.content when no locale rows exist'
  );

  console.log('kbEntryLocales tests passed');
}

main();
