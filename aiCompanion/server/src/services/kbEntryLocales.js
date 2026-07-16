const db = require('../config/db');

const LOCALE_FIELD_DEFS = [
  { locale: 'zh-CN', label: '中文', keys: ['中文', '简中', '简体中文', 'Chinese (Simplified)', 'Simplified Chinese'] },
  { locale: 'en-US', label: '英文', keys: ['英文', '英语', 'English'] },
  { locale: 'zh-TW', label: '繁中', keys: ['繁中', '繁体', '繁体中文', 'Traditional Chinese', 'Chinese (Traditional)'] },
  { locale: 'ja-JP', label: '日语', keys: ['日语', '日文', 'Japanese'] },
  { locale: 'ko-KR', label: '韩语', keys: ['韩语', '韩文', 'Korean'] },
];

const LOCALE_ALIAS_MAP = new Map([
  ['zh', 'zh-CN'],
  ['zh-cn', 'zh-CN'],
  ['zh-hans', 'zh-CN'],
  ['cn', 'zh-CN'],
  ['en', 'en-US'],
  ['en-us', 'en-US'],
  ['en-gb', 'en-US'],
  ['zh-tw', 'zh-TW'],
  ['zh-hant', 'zh-TW'],
  ['tw', 'zh-TW'],
  ['ja', 'ja-JP'],
  ['ja-jp', 'ja-JP'],
  ['jp', 'ja-JP'],
  ['ko', 'ko-KR'],
  ['ko-kr', 'ko-KR'],
  ['kr', 'ko-KR'],
]);

const FIELD_KEY_TO_LOCALE = new Map();
LOCALE_FIELD_DEFS.forEach((item) => {
  item.keys.forEach((key) => {
    FIELD_KEY_TO_LOCALE.set(String(key || '').trim().toLowerCase(), item.locale);
  });
});

function isBlank(value) {
  return String(value == null ? '' : value).trim() === '';
}

function normalizeLocale(locale) {
  const normalized = String(locale || '').trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return '';
  return LOCALE_ALIAS_MAP.get(normalized) || normalized;
}

function getLocaleDefinition(locale) {
  const normalized = normalizeLocale(locale);
  return LOCALE_FIELD_DEFS.find(item => item.locale === normalized) || null;
}

function isLocaleFieldKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return FIELD_KEY_TO_LOCALE.has(normalized);
}

function dedupeLocales(locales) {
  const byLocale = new Map();
  (Array.isArray(locales) ? locales : []).forEach((item) => {
    const locale = normalizeLocale(item && item.locale);
    const content = String(item && item.content || '').trim();
    if (!locale || !content || byLocale.has(locale)) return;
    const def = getLocaleDefinition(locale);
    byLocale.set(locale, {
      locale,
      label: def ? def.label : locale,
      content,
    });
  });

  return LOCALE_FIELD_DEFS
    .map(item => byLocale.get(item.locale))
    .filter(Boolean)
    .concat(
      [...byLocale.values()].filter(item => !LOCALE_FIELD_DEFS.some(def => def.locale === item.locale))
    );
}

function extractEntryLocales(raw) {
  if (!raw || typeof raw !== 'object') return [];

  const locales = [];
  LOCALE_FIELD_DEFS.forEach((def) => {
    const matchedKey = def.keys.find(key => !isBlank(raw[key]));
    if (!matchedKey) return;
    locales.push({
      locale: def.locale,
      label: def.label,
      content: String(raw[matchedKey]).trim(),
    });
  });

  return dedupeLocales(locales);
}

function mergeLocaleLists(primary, fallback) {
  return dedupeLocales([...(Array.isArray(primary) ? primary : []), ...(Array.isArray(fallback) ? fallback : [])]);
}

async function loadLocalesByEntryIds(entryIds) {
  if (!Array.isArray(entryIds) || entryIds.length === 0) return new Map();

  let rows = [];
  try {
    [rows] = await db.query(
      `SELECT entry_id, locale, content
         FROM kb_entry_locales
        WHERE entry_id IN (${entryIds.map(() => '?').join(',')})
        ORDER BY id ASC`,
      entryIds
    );
  } catch (err) {
    console.error('[kbEntryLocales] load locales failed:', err.message);
    return new Map();
  }

  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.entry_id)) map.set(row.entry_id, []);
    map.get(row.entry_id).push({
      locale: normalizeLocale(row.locale),
      content: String(row.content || '').trim(),
    });
  });

  for (const [entryId, locales] of map.entries()) {
    map.set(entryId, dedupeLocales(locales));
  }

  return map;
}

function pickEntryContentByLocale(entry, locales, preferredLocale) {
  const normalizedPreferred = normalizeLocale(preferredLocale);
  const localeItems = dedupeLocales(locales);

  if (normalizedPreferred) {
    const exact = localeItems.find(item => item.locale === normalizedPreferred);
    if (exact) return exact.content;

    const baseCode = normalizedPreferred.split('-')[0];
    const compatible = localeItems.find(item => String(item.locale || '').split('-')[0] === baseCode);
    if (compatible) return compatible.content;
  }

  if (localeItems.length > 0) return localeItems[0].content;
  return String(entry && entry.content || '').trim();
}

module.exports = {
  LOCALE_FIELD_DEFS,
  normalizeLocale,
  isLocaleFieldKey,
  extractEntryLocales,
  mergeLocaleLists,
  loadLocalesByEntryIds,
  pickEntryContentByLocale,
};
