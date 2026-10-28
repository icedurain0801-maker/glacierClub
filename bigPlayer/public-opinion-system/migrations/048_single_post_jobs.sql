CREATE TABLE IF NOT EXISTS po_single_post_jobs (
 id CHAR(36) NOT NULL PRIMARY KEY,
 owner_id VARCHAR(191) NOT NULL,
 community_id CHAR(36) NOT NULL,
 source_id CHAR(36) NOT NULL,
 platform VARCHAR(32) NOT NULL,
 kind VARCHAR(16) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'queued',
 input_json LONGTEXT NOT NULL,
 result_json LONGTEXT NULL,
 progress_json TEXT NULL,
 error_code VARCHAR(80) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_single_post_owner (owner_id,created_at),
 KEY idx_single_post_queue (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
