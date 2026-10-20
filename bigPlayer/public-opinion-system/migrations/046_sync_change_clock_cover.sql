-- Covered timestamp reads avoid fetching content/analysis/translation payloads.
ALTER TABLE po_contents ADD INDEX IF NOT EXISTS po_contents_change_clock_idx (last_seen_at,id), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE po_analyses ADD INDEX IF NOT EXISTS po_analyses_change_clock_idx (analyzed_at,content_id), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE po_content_translations ADD INDEX IF NOT EXISTS po_translations_change_clock_idx (target_language,translation_version,updated_at,content_id), ALGORITHM=INPLACE, LOCK=NONE;
