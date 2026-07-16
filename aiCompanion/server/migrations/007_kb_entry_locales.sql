USE ai_companion;

CREATE TABLE IF NOT EXISTS kb_entry_locales (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  entry_id     INT NOT NULL,
  version_id   INT NOT NULL,
  document_id  INT NOT NULL,
  locale       VARCHAR(16) NOT NULL,
  content      TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_entry_locale (entry_id, locale),
  INDEX idx_entry_locales_ver_doc_locale (version_id, document_id, locale),
  FOREIGN KEY (entry_id)    REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id)  REFERENCES versions(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
