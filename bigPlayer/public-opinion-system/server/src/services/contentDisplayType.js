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

module.exports = { contentDisplayType };
