USE ai_companion;

CREATE TABLE IF NOT EXISTS community_sync_image_analysis (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  version_id    INT NOT NULL,
  image_hash    CHAR(64) NOT NULL,
  source_url    TEXT NULL,
  mime_type     VARCHAR(128) NULL,
  analysis_text MEDIUMTEXT NULL,
  is_useful     TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_community_sync_image (version_id, image_hash),
  INDEX idx_community_sync_image_version (version_id, id),
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
