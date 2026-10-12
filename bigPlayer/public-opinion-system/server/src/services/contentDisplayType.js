function contentDisplayType(row) {
  const type = row.content_type || 'post';
  if (type === 'comment' || type === 'review') return 'comment';
  if (row.platform !== 'bigplayer_h5' || type !== 'post') return type;
  let raw = row.raw_payload;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  return raw?.type === 1 || raw?.type === '1' ? 'dynamic' : 'post';
}

function bigPlayerContentKindPredicate(kind) {
  if (!kind) return null;
  if (kind !== 'post' && kind !== 'dynamic') {
    const error = new Error('bigPlayerContentKind must be post or dynamic');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  const rawType = "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.raw_payload,'$.type')),'')";
  return `s.platform='bigplayer_h5' AND c.content_type='post' AND ${rawType}${kind === 'dynamic' ? "='1'" : "<>'1'"}`;
}

module.exports = { contentDisplayType, bigPlayerContentKindPredicate };
