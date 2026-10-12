-- Cover scoped trend reads without fetching large content payloads.
-- Non-unique index only; no content or analysis data is modified.
ALTER TABLE po_contents
  ADD INDEX IF NOT EXISTS po_contents_trend_cover_idx
    (community_id, published_at, is_deleted, source_id, game_id),
  ALGORITHM=INPLACE, LOCK=NONE;
