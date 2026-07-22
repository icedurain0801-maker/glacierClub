USE ai_companion;

CREATE TABLE IF NOT EXISTS community_sync_runs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  version_id      INT NOT NULL,
  trigger_type    VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  status          VARCHAR(16) NOT NULL DEFAULT 'running',
  pages_found     INT NOT NULL DEFAULT 0,
  pages_changed   INT NOT NULL DEFAULT 0,
  entries_written INT NOT NULL DEFAULT 0,
  error           TEXT NULL,
  started_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at     TIMESTAMP NULL,
  INDEX idx_community_runs_version (version_id, id),
  INDEX idx_community_runs_status (status),
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_sync_pages (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  version_id     INT NOT NULL,
  run_id         INT NULL,
  url_hash       CHAR(64) NOT NULL,
  url            TEXT NOT NULL,
  title          VARCHAR(255) NULL,
  content_preview MEDIUMTEXT NULL,
  content_hash   CHAR(64) NULL,
  document_id    INT NULL,
  entry_id       INT NULL,
  last_error     TEXT NULL,
  crawl_status   VARCHAR(16) NOT NULL DEFAULT 'queued',
  last_seen_at   TIMESTAMP NULL,
  last_synced_at TIMESTAMP NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_community_page (version_id, url_hash),
  INDEX idx_community_pages_version (version_id, id),
  INDEX idx_community_pages_run (run_id),
  INDEX idx_community_pages_document (document_id),
  INDEX idx_community_pages_entry (entry_id),
  FOREIGN KEY (run_id)      REFERENCES community_sync_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (version_id)  REFERENCES versions(id)           ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id)       ON DELETE SET NULL,
  FOREIGN KEY (entry_id)    REFERENCES knowledge_entries(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_sync_settings (
  version_id          INT PRIMARY KEY,
  enabled             TINYINT(1) NOT NULL DEFAULT 0,
  run_on_start         TINYINT(1) NOT NULL DEFAULT 0,
  interval_ms          INT NOT NULL DEFAULT 21600000,
  schedule_hour        TINYINT NOT NULL DEFAULT 3,
  schedule_minute      TINYINT NOT NULL DEFAULT 0,
  base_url             TEXT NULL,
  login_url            TEXT NULL,
  auth_check_path      TEXT NULL,
  start_paths          JSON NULL,
  allowed_hosts        JSON NULL,
  auth_cookie          MEDIUMTEXT NULL,
  username             VARCHAR(255) NULL,
  password             MEDIUMTEXT NULL,
  username_field       VARCHAR(128) NOT NULL DEFAULT 'username',
  password_field       VARCHAR(128) NOT NULL DEFAULT 'password',
  extra_login_fields   JSON NULL,
  login_success_text   VARCHAR(255) NULL,
  login_failure_text   VARCHAR(255) NULL,
  auth_check_text      VARCHAR(255) NULL,
  user_agent           VARCHAR(255) NULL,
  request_timeout_ms   INT NOT NULL DEFAULT 15000,
  max_retries          INT NOT NULL DEFAULT 2,
  retry_base_ms        INT NOT NULL DEFAULT 800,
  delay_ms             INT NOT NULL DEFAULT 250,
  max_pages            INT NOT NULL DEFAULT 500,
  max_depth            INT NOT NULL DEFAULT 8,
  min_content_chars    INT NOT NULL DEFAULT 80,
  max_content_chars    INT NOT NULL DEFAULT 20000,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE community_sync_pages
  ADD COLUMN IF NOT EXISTS run_id INT NULL AFTER version_id,
  ADD COLUMN IF NOT EXISTS content_preview MEDIUMTEXT NULL AFTER title,
  ADD COLUMN IF NOT EXISTS crawl_status VARCHAR(16) NOT NULL DEFAULT 'queued' AFTER last_error;

ALTER TABLE community_sync_settings
  ADD COLUMN IF NOT EXISTS schedule_hour TINYINT NOT NULL DEFAULT 3 AFTER interval_ms,
  ADD COLUMN IF NOT EXISTS schedule_minute TINYINT NOT NULL DEFAULT 0 AFTER schedule_hour,
  ADD COLUMN IF NOT EXISTS login_failure_count INT NOT NULL DEFAULT 0 AFTER max_content_chars,
  ADD COLUMN IF NOT EXISTS login_blocked_until TIMESTAMP NULL AFTER login_failure_count,
  ADD COLUMN IF NOT EXISTS last_login_error VARCHAR(255) NULL AFTER login_blocked_until;
