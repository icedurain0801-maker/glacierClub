-- BigPlayer H5 多站点兼容底座（MySQL 8 / MariaDB 10.4+）。
-- 仅增加可回滚的结构与存量 baseUrl 回填，不修改历史 run/checkpoint 状态。

CREATE TABLE IF NOT EXISTS po_source_sites (
  id CHAR(36) NOT NULL,
  source_id CHAR(36) NOT NULL,
  site_id VARCHAR(120) NOT NULL,
  url TEXT NOT NULL,
  url_hash CHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  auth_status VARCHAR(24) NOT NULL DEFAULT 'unknown',
  capabilities JSON NOT NULL,
  last_error_code VARCHAR(80) NULL,
  last_error_message TEXT NULL,
  last_checked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY po_source_sites_source_site_uk (source_id, site_id),
  UNIQUE KEY po_source_sites_source_url_hash_uk (source_id, url_hash),
  KEY po_source_sites_source_enabled_idx (source_id, enabled),
  CONSTRAINT po_source_sites_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 存量 BigPlayer source 的单一 baseUrl 迁移为稳定 legacy 站点；非 BigPlayer 或空 URL 不产生站点。
INSERT IGNORE INTO po_source_sites (
  id, source_id, site_id, url, url_hash, enabled, auth_status, capabilities
)
SELECT UUID(), s.id,
       CONCAT('legacy-', LEFT(SHA2(TRIM(JSON_UNQUOTE(JSON_EXTRACT(s.config, '$.baseUrl'))), 256), 32)),
       TRIM(JSON_UNQUOTE(JSON_EXTRACT(s.config, '$.baseUrl'))),
       SHA2(TRIM(JSON_UNQUOTE(JSON_EXTRACT(s.config, '$.baseUrl'))), 256),
       COALESCE(s.enabled, 1), COALESCE(s.auth_status, 'unknown'), JSON_OBJECT()
FROM po_sources s
WHERE s.platform='bigplayer_h5'
  AND JSON_UNQUOTE(JSON_EXTRACT(s.config, '$.baseUrl')) IS NOT NULL
  AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(s.config, '$.baseUrl'))) <> '';

ALTER TABLE po_sync_runs
  ADD COLUMN IF NOT EXISTS parent_run_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS site_id VARCHAR(120) NULL;
ALTER TABLE po_sync_runs
  ADD INDEX IF NOT EXISTS po_sync_runs_parent_site_idx (parent_run_id, site_id),
  ADD INDEX IF NOT EXISTS po_sync_runs_site_status_idx (site_id, status);
ALTER TABLE po_sync_runs
  ADD CONSTRAINT po_sync_runs_parent_fk FOREIGN KEY (parent_run_id) REFERENCES po_sync_runs(id) ON DELETE SET NULL;

ALTER TABLE po_sync_checkpoints
  ADD COLUMN IF NOT EXISTS site_id VARCHAR(120) NULL;

-- 将旧 checkpoint 归属到 source 的 legacy 站点；无法匹配的记录保留 NULL 以兼容历史数据。
UPDATE po_sync_checkpoints cp
JOIN po_accounts a ON a.id=cp.account_id
JOIN po_source_sites ss ON ss.source_id=a.source_id
SET cp.site_id=ss.site_id
WHERE cp.site_id IS NULL AND ss.site_id LIKE 'legacy-%';

ALTER TABLE po_sync_checkpoints
  ADD INDEX IF NOT EXISTS po_sync_checkpoints_site_idx (site_id, account_id, status);

-- 站点进入 checkpoint identity；site_id 可空以允许旧数据安全读取和渐进回填。
SET @drop_window_uk := (
  SELECT IF(COUNT(*) > 0, 'ALTER TABLE po_sync_checkpoints DROP INDEX po_sync_checkpoints_window_uk', 'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND index_name='po_sync_checkpoints_window_uk'
);
PREPARE stmt FROM @drop_window_uk; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE po_sync_checkpoints
  ADD UNIQUE KEY IF NOT EXISTS po_sync_checkpoints_site_window_uk
    (account_id, site_id, task_kind, task_key, sync_scope, root_platform_content_id, window_start, window_end);

-- run 的 site_id 由应用层使用 po_source_sites.site_id 赋值；旧 run 保持 NULL，不重写历史审计。
