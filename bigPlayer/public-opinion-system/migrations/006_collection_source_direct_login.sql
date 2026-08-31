-- Collection source, direct login and sync observability foundation.
-- MySQL 8 / MariaDB 10.4+. Statements are intentionally rerunnable.

UPDATE po_sources SET platform='xiaohongshu' WHERE platform='xhs';
UPDATE po_accounts SET platform='xiaohongshu' WHERE platform='xhs';

ALTER TABLE po_sources ADD UNIQUE KEY IF NOT EXISTS po_sources_game_platform_name_uk (game_id, platform, display_name);
ALTER TABLE po_accounts ADD COLUMN IF NOT EXISTS masked_login_identifier VARCHAR(255) NULL;
ALTER TABLE po_accounts ADD UNIQUE KEY IF NOT EXISTS po_accounts_source_platform_identity_uk (source_id, platform, platform_account_id);
ALTER TABLE po_credentials ADD UNIQUE KEY IF NOT EXISTS po_credentials_account_type_uk (account_id, credential_type);

CREATE TABLE IF NOT EXISTS po_account_sessions (
  id CHAR(36) NOT NULL, account_id CHAR(36) NOT NULL, session_type VARCHAR(40) NOT NULL DEFAULT 'direct_login',
  status VARCHAR(20) NOT NULL DEFAULT 'active', masked_login_identifier VARCHAR(255) NULL,
  credential_id CHAR(36) NULL, expires_at DATETIME NULL, last_used_at DATETIME NULL,
  metadata JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY po_account_sessions_account_idx (account_id),
  CONSTRAINT po_account_sessions_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_login_challenges (
  id CHAR(36) NOT NULL, account_id CHAR(36) NOT NULL, challenge_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', challenge_ref VARCHAR(255) NULL,
  masked_login_identifier VARCHAR(255) NULL, expires_at DATETIME NOT NULL, completed_at DATETIME NULL,
  metadata JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY po_login_challenges_account_idx (account_id), KEY po_login_challenges_status_idx (status, expires_at),
  CONSTRAINT po_login_challenges_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_source_capabilities (
  id CHAR(36) NOT NULL, source_id CHAR(36) NOT NULL, capability VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'unknown', detail JSON NOT NULL,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY po_source_capabilities_source_capability_uk (source_id, capability),
  CONSTRAINT po_source_capabilities_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE po_sync_checkpoints ADD COLUMN IF NOT EXISTS task_kind VARCHAR(40) NOT NULL DEFAULT 'sync';
ALTER TABLE po_sync_checkpoints ADD COLUMN IF NOT EXISTS task_key VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE po_sync_checkpoints ADD UNIQUE KEY IF NOT EXISTS po_sync_checkpoints_task_uk (account_id, task_kind, task_key, sync_scope, root_platform_content_id);

CREATE TABLE IF NOT EXISTS po_content_discoveries (
  id CHAR(36) NOT NULL, account_id CHAR(36) NOT NULL, source_id CHAR(36) NOT NULL,
  platform_content_id VARCHAR(255) NOT NULL, content_type VARCHAR(20) NOT NULL,
  root_platform_content_id VARCHAR(255) NULL, status VARCHAR(20) NOT NULL DEFAULT 'discovered',
  payload JSON NULL, first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY po_content_discoveries_identity_uk (account_id, platform_content_id, content_type),
  CONSTRAINT po_content_discoveries_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE CASCADE,
  CONSTRAINT po_content_discoveries_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_sync_run_tasks (
  id CHAR(36) NOT NULL, sync_run_id CHAR(36) NOT NULL, account_id CHAR(36) NOT NULL,
  task_kind VARCHAR(40) NOT NULL, task_key VARCHAR(255) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0, error_code VARCHAR(80) NULL, error_message TEXT NULL,
  started_at DATETIME NULL, finished_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY po_sync_run_tasks_identity_uk (sync_run_id, task_kind, task_key),
  KEY po_sync_run_tasks_account_idx (account_id, status),
  CONSTRAINT po_sync_run_tasks_run_fk FOREIGN KEY (sync_run_id) REFERENCES po_sync_runs(id) ON DELETE CASCADE,
  CONSTRAINT po_sync_run_tasks_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_audit_events (
  id CHAR(36) NOT NULL, game_id CHAR(36) NULL, source_id CHAR(36) NULL, account_id CHAR(36) NULL,
  actor_type VARCHAR(30) NOT NULL DEFAULT 'system', actor_id VARCHAR(160) NULL, event_type VARCHAR(80) NOT NULL,
  outcome VARCHAR(30) NOT NULL DEFAULT 'success', detail JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY po_audit_events_account_time_idx (account_id, created_at), KEY po_audit_events_source_time_idx (source_id, created_at),
  CONSTRAINT po_audit_events_game_fk FOREIGN KEY (game_id) REFERENCES po_games(id) ON DELETE SET NULL,
  CONSTRAINT po_audit_events_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id) ON DELETE SET NULL,
  CONSTRAINT po_audit_events_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
