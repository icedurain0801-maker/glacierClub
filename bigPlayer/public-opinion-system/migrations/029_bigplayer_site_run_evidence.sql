-- BigPlayer per-site run evidence. This candidate migration is not executed by QA.
ALTER TABLE po_sync_runs
  ADD COLUMN IF NOT EXISTS site_url_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_request_at DATETIME(3) NULL;

ALTER TABLE po_sync_runs
  ADD INDEX IF NOT EXISTS po_sync_runs_site_request_idx (site_id, last_request_at);

-- Historical rows remain NULL: current registry URLs and updated_at are not
-- valid substitutes for immutable run-time evidence.
