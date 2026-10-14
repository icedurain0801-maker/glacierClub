CREATE TABLE IF NOT EXISTS po_content_handlings (
  content_id CHAR(36) NOT NULL,
  handling_method VARCHAR(24) NOT NULL,
  handling_note VARCHAR(200) NOT NULL DEFAULT '',
  handled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (content_id),
  CONSTRAINT po_content_handlings_method_chk CHECK (handling_method IN ('notified','handled','false_positive')),
  CONSTRAINT po_content_handlings_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
