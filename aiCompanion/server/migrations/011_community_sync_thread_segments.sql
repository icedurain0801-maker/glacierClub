USE ai_companion;

ALTER TABLE community_sync_pages
  ADD COLUMN IF NOT EXISTS raw_content MEDIUMTEXT NULL AFTER content_preview,
  ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0 AFTER raw_content,
  ADD COLUMN IF NOT EXISTS useful_comment_count INT NOT NULL DEFAULT 0 AFTER comment_count,
  ADD COLUMN IF NOT EXISTS ignored_comment_count INT NOT NULL DEFAULT 0 AFTER useful_comment_count,
  ADD COLUMN IF NOT EXISTS selected_entry_count INT NOT NULL DEFAULT 0 AFTER ignored_comment_count,
  ADD COLUMN IF NOT EXISTS thread_summary_entry_id INT NULL AFTER selected_entry_count;

ALTER TABLE community_sync_pages
  ADD INDEX IF NOT EXISTS idx_community_pages_thread_summary (thread_summary_entry_id);

ALTER TABLE community_sync_pages
  ADD CONSTRAINT fk_community_pages_thread_summary_entry
  FOREIGN KEY (thread_summary_entry_id) REFERENCES knowledge_entries(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS community_sync_page_segments (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  version_id         INT NOT NULL,
  page_id            INT NOT NULL,
  source_type        VARCHAR(32) NOT NULL,
  source_uid         VARCHAR(128) NOT NULL,
  parent_source_uid  VARCHAR(128) NULL,
  author_name        VARCHAR(255) NULL,
  content            MEDIUMTEXT NOT NULL,
  content_hash       CHAR(64) NOT NULL,
  quality_score      INT NOT NULL DEFAULT 0,
  quality_decision   VARCHAR(16) NOT NULL DEFAULT 'ignored',
  reason_tags        JSON NULL,
  document_id        INT NULL,
  entry_id           INT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_community_page_segment (page_id, source_type, source_uid),
  INDEX idx_community_segments_page (page_id, id),
  INDEX idx_community_segments_hash (version_id, content_hash),
  INDEX idx_community_segments_entry (entry_id),
  INDEX idx_community_segments_decision (quality_decision),
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES community_sync_pages(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
