ALTER TABLE po_sources ADD COLUMN IF NOT EXISTS community_id CHAR(36) NULL AFTER game_id;
ALTER TABLE po_sources ADD INDEX IF NOT EXISTS po_sources_community_idx (community_id);
