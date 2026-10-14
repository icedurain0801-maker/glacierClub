CREATE TABLE ln_sites (
  source_id CHAR(36) NOT NULL,
  site_id VARCHAR(80) NOT NULL,
  board_id VARCHAR(32) NOT NULL,
  url_snapshot TEXT NOT NULL,
  url_hash CHAR(64) NOT NULL,
  config_hash CHAR(64) NOT NULL,
  PRIMARY KEY (source_id, site_id),
  UNIQUE KEY ln_sites_source_url_uk (source_id, url_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ln_runs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  source_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  site_id VARCHAR(80) NOT NULL,
  board_id VARCHAR(32) NOT NULL,
  site_url_snapshot TEXT NOT NULL,
  window_start DATETIME(3) NOT NULL,
  window_end DATETIME(3) NOT NULL,
  status VARCHAR(24) NOT NULL,
  lease_owner VARCHAR(160) NULL,
  lease_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lease_until DATETIME(3) NULL,
  error_code VARCHAR(100) NULL,
  feed_manifest_hash CHAR(64) NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  UNIQUE KEY ln_runs_slot_uk (source_id, site_id, window_start, window_end),
  KEY ln_runs_status_lease_idx (status, lease_until),
  CONSTRAINT ln_runs_site_fk FOREIGN KEY (source_id, site_id) REFERENCES ln_sites(source_id, site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ln_tasks (
  run_id CHAR(36) NOT NULL,
  task_hash CHAR(64) NOT NULL,
  scope VARCHAR(20) NOT NULL,
  feed_key VARCHAR(500) NOT NULL,
  root_post_id VARCHAR(255) NOT NULL DEFAULT '',
  comment_id VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (run_id, task_hash),
  CONSTRAINT ln_tasks_run_fk FOREIGN KEY (run_id) REFERENCES ln_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ln_pages (
  run_id CHAR(36) NOT NULL,
  task_hash CHAR(64) NOT NULL,
  scope VARCHAR(20) NOT NULL,
  feed_key VARCHAR(500) NOT NULL,
  root_post_id VARCHAR(255) NOT NULL DEFAULT '',
  comment_id VARCHAR(255) NOT NULL DEFAULT '',
  next_cursor TEXT NULL,
  status VARCHAR(20) NOT NULL,
  page_seq INT UNSIGNED NOT NULL DEFAULT 0,
  last_page_hash CHAR(64) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (run_id, task_hash),
  KEY ln_pages_run_status_idx (run_id, status),
  CONSTRAINT ln_pages_run_fk FOREIGN KEY (run_id) REFERENCES ln_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ln_contents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  source_id CHAR(36) NOT NULL,
  site_id VARCHAR(80) NOT NULL,
  board_id VARCHAR(32) NOT NULL,
  content_type VARCHAR(16) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  root_post_id VARCHAR(255) NOT NULL DEFAULT '',
  parent_external_id VARCHAR(255) NOT NULL DEFAULT '',
  title TEXT NULL,
  body MEDIUMTEXT NULL,
  author_name VARCHAR(255) NULL,
  published_at DATETIME(3) NULL,
  source_url TEXT NULL,
  fingerprint CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ln_contents_identity_uk (source_id, site_id, board_id, content_type, external_id),
  KEY ln_contents_published_idx (source_id, published_at),
  CONSTRAINT ln_contents_site_fk FOREIGN KEY (source_id, site_id) REFERENCES ln_sites(source_id, site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ln_run_contents (
  run_id CHAR(36) NOT NULL,
  content_id CHAR(36) NOT NULL,
  scope VARCHAR(20) NOT NULL,
  PRIMARY KEY (run_id, content_id, scope),
  CONSTRAINT ln_run_contents_run_fk FOREIGN KEY (run_id) REFERENCES ln_runs(id),
  CONSTRAINT ln_run_contents_content_fk FOREIGN KEY (content_id) REFERENCES ln_contents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ln_analysis_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  content_id CHAR(36) NOT NULL,
  profile VARCHAR(10) NOT NULL,
  version VARCHAR(100) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  lease_owner VARCHAR(160) NULL,
  lease_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lease_until DATETIME(3) NULL,
  retry_at DATETIME(3) NULL,
  error_code VARCHAR(100) NULL,
  UNIQUE KEY ln_analysis_jobs_identity_uk (content_id, profile, version, content_fingerprint),
  KEY ln_analysis_jobs_claim_idx (status, retry_at, lease_until),
  CONSTRAINT ln_analysis_jobs_content_fk FOREIGN KEY (content_id) REFERENCES ln_contents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ln_analysis_results (
  content_id CHAR(36) NOT NULL,
  profile VARCHAR(10) NOT NULL,
  version VARCHAR(100) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  model_name VARCHAR(160) NULL,
  result_json LONGTEXT NOT NULL,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (content_id, profile, version, content_fingerprint),
  CONSTRAINT ln_analysis_results_content_fk FOREIGN KEY (content_id) REFERENCES ln_contents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
