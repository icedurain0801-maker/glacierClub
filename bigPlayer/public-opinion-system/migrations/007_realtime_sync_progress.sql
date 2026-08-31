-- Realtime sync run progress and stable run/content associations.
-- MySQL 8 / MariaDB 10.4+. Statements are intentionally rerunnable.

ALTER TABLE po_sync_checkpoints DROP INDEX IF EXISTS po_sync_checkpoints_identity_uk;
ALTER TABLE po_sync_checkpoints ADD UNIQUE KEY IF NOT EXISTS po_sync_checkpoints_task_uk (account_id, task_kind, task_key, sync_scope, root_platform_content_id);

ALTER TABLE po_sync_runs
  MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'queued',
  MODIFY COLUMN started_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS fetched_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inserted_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS changed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unchanged_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS lease_until DATETIME NULL;

ALTER TABLE po_sync_runs ADD INDEX IF NOT EXISTS po_sync_runs_account_status_created_idx (account_id, status, created_at);
ALTER TABLE po_sync_runs ADD INDEX IF NOT EXISTS po_sync_runs_status_lease_idx (status, lease_until);

CREATE TABLE IF NOT EXISTS po_sync_run_contents (
  sequence_no BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id CHAR(36) NOT NULL,
  content_id CHAR(36) NOT NULL,
  change_type VARCHAR(20) NOT NULL,
  sync_scope VARCHAR(20) NOT NULL DEFAULT 'posts',
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sequence_no),
  UNIQUE KEY po_sync_run_contents_association_uk (run_id, content_id, sync_scope),
  KEY po_sync_run_contents_run_sequence_idx (run_id, sequence_no),
  CONSTRAINT po_sync_run_contents_run_fk FOREIGN KEY (run_id) REFERENCES po_sync_runs(id) ON DELETE CASCADE,
  CONSTRAINT po_sync_run_contents_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
