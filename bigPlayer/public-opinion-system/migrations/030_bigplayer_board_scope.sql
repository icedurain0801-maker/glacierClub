-- Snapshots are intentionally nullable for legacy and non-BigPlayer rows.
ALTER TABLE po_sync_runs
  ADD COLUMN IF NOT EXISTS community_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS board_id VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS board_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS run_scope VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS board_run_identity CHAR(64) NULL;
ALTER TABLE po_sync_runs ADD UNIQUE KEY IF NOT EXISTS po_sync_runs_board_identity_uk (board_run_identity);

ALTER TABLE po_contents
  ADD COLUMN IF NOT EXISTS board_id VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS board_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS board_key VARCHAR(32) AS (COALESCE(board_id, 'legacy')) PERSISTENT;

ALTER TABLE po_contents DROP INDEX IF EXISTS po_contents_source_external_uk;
ALTER TABLE po_contents DROP INDEX IF EXISTS po_contents_source_fingerprint_uk;
ALTER TABLE po_contents ADD UNIQUE KEY IF NOT EXISTS po_contents_source_board_external_uk (source_id, board_key, external_id);
-- Distinct external IDs may contain identical text; fingerprints are not identities.
