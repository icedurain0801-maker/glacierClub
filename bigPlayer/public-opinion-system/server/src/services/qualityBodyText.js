// Keep JavaScript admission and MariaDB list/count predicates on the same rules.
const REMOVALS = [
  '<!--[\\s\\S]*?-->',
  '<script\\b[^>]*>[\\s\\S]*?</script[ ]*>',
  '<style\\b[^>]*>[\\s\\S]*?</style[ ]*>',
  '<[^>]*>',
  '(?:https?://|ftp://|www\\.)[^\\s<>"\u0027]+',
  '&(?:[a-z][a-z0-9]*|#[0-9]+|#x[0-9a-f]+);',
  '\\s+'
];

function qualityBodyText(body) {
  return REMOVALS.reduce((text, pattern) => text.replace(new RegExp(pattern, 'gi'), ''), String(body || ''));
}

function qualityBodyLength(body) { return Array.from(qualityBodyText(body)).length; }

function qualityBodyLengthSql(column = 'c.body') {
  const literal = value => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  // PCRE and JS agree on these patterns; explicit case-insensitivity avoids collation dependence.
  const text = REMOVALS.reduce((sql, pattern) => `REGEXP_REPLACE(${sql},${literal(`(?i)${pattern}`)},'')`, `COALESCE(${column},'')`);
  return `CHAR_LENGTH(${text})`;
}

module.exports = { qualityBodyText, qualityBodyLength, qualityBodyLengthSql };
