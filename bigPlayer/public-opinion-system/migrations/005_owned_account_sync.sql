-- 第一阶段自有账号同步底座（MySQL 8 / MariaDB 10.4+）。
-- 所有变更均可重复执行；历史 source_id 与旧 repository API 保留。

CREATE TABLE IF NOT EXISTS po_accounts (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  source_id CHAR(36) NOT NULL,
  platform VARCHAR(40) NOT NULL,
  platform_account_id VARCHAR(255) NOT NULL,
  account_name VARCHAR(160) NOT NULL,
  account_type VARCHAR(20) NOT NULL DEFAULT 'official',
  profile_url TEXT,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  auth_status VARCHAR(20) NOT NULL DEFAULT 'unconfigured',
  auth_expire_at DATETIME NULL,
  last_full_sync_at DATETIME NULL,
  last_incremental_sync_at DATETIME NULL,
  metadata JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT po_accounts_game_fk FOREIGN KEY (game_id) REFERENCES po_games(id),
  CONSTRAINT po_accounts_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id),
  UNIQUE KEY po_accounts_game_platform_identity_uk (game_id, platform, platform_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 每个存量 source 回填一个默认账号。platform_account_id 使用 source id 作为稳定迁移占位，
-- 后台绑定真实平台账号后再更新，不会与同游戏其他 source 冲突。
INSERT IGNORE INTO po_accounts (
  id, game_id, source_id, platform, platform_account_id, account_name,
  account_type, enabled, auth_status, auth_expire_at, metadata
)
SELECT UUID(), s.game_id, s.id, s.platform, CONCAT('legacy-source:', s.id),
       s.display_name, 'official', s.enabled,
       COALESCE(s.auth_status, 'unconfigured'), s.auth_expire_at,
       JSON_OBJECT('backfilledFromSource', TRUE)
FROM po_sources s
LEFT JOIN po_accounts a ON a.source_id=s.id
WHERE a.id IS NULL;

ALTER TABLE po_credentials
  ADD COLUMN IF NOT EXISTS account_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS credential_type VARCHAR(40) NOT NULL DEFAULT 'api_token';
ALTER TABLE po_credentials ADD INDEX IF NOT EXISTS po_credentials_account_idx (account_id);
ALTER TABLE po_credentials ADD CONSTRAINT po_credentials_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE CASCADE;
UPDATE po_credentials c JOIN po_accounts a ON a.source_id=c.source_id SET c.account_id=a.id WHERE c.account_id IS NULL;

ALTER TABLE po_contents
  ADD COLUMN IF NOT EXISTS account_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS platform_author_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS root_content_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS parent_content_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS platform_parent_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS content_depth TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_payload JSON NULL,
  ADD COLUMN IF NOT EXISTS first_seen_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at DATETIME NULL;
ALTER TABLE po_contents DROP INDEX IF EXISTS po_contents_source_fingerprint_uk;
ALTER TABLE po_contents ADD INDEX IF NOT EXISTS po_contents_account_time_idx (account_id, published_at);
ALTER TABLE po_contents ADD INDEX IF NOT EXISTS po_contents_root_idx (root_content_id, parent_content_id);
ALTER TABLE po_contents ADD CONSTRAINT po_contents_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE SET NULL;
ALTER TABLE po_contents ADD CONSTRAINT po_contents_root_fk FOREIGN KEY (root_content_id) REFERENCES po_contents(id) ON DELETE SET NULL;
ALTER TABLE po_contents ADD CONSTRAINT po_contents_parent_fk FOREIGN KEY (parent_content_id) REFERENCES po_contents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS po_sync_checkpoints (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  sync_scope VARCHAR(20) NOT NULL,
  root_platform_content_id VARCHAR(255) NOT NULL DEFAULT '',
  `cursor` TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  sync_mode VARCHAR(20) NOT NULL DEFAULT 'incremental',
  last_item_at DATETIME NULL,
  items_fetched INT NOT NULL DEFAULT 0,
  error_code VARCHAR(80) NULL,
  error_message TEXT NULL,
  lease_owner VARCHAR(160) NULL,
  lease_until DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY po_sync_checkpoints_identity_uk (account_id, sync_scope, root_platform_content_id),
  CONSTRAINT po_sync_checkpoints_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_sync_runs (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  sync_mode VARCHAR(20) NOT NULL DEFAULT 'incremental',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  discovered_count INT NOT NULL DEFAULT 0,
  stored_count INT NOT NULL DEFAULT 0,
  error_code VARCHAR(80) NULL,
  error_message TEXT NULL,
  PRIMARY KEY (id),
  CONSTRAINT po_sync_runs_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
