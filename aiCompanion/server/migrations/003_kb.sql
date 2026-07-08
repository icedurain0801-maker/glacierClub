USE ai_companion;

CREATE TABLE IF NOT EXISTS kb_documents (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  name       VARCHAR(255) NOT NULL,
  status     VARCHAR(16) NOT NULL DEFAULT 'uploading',  -- uploading|parsing|done|failed
  row_count  INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_kb_docs_ver (version_id),
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  document_id INT NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending|processing|done|failed
  total       INT NOT NULL DEFAULT 0,
  processed   INT NOT NULL DEFAULT 0,
  error       TEXT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_jobs_status (status),
  INDEX idx_jobs_ver (version_id),
  FOREIGN KEY (version_id)  REFERENCES versions(id)     ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  document_id INT NOT NULL,
  row_index   INT NOT NULL,
  content     TEXT NOT NULL,
  raw_json    JSON NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entries_ver_doc (version_id, document_id),
  FOREIGN KEY (version_id)  REFERENCES versions(id)     ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kb_vectors (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  entry_id   INT NOT NULL UNIQUE,
  embedding  JSON NOT NULL,
  dim        INT  NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vec_ver (version_id),
  FOREIGN KEY (version_id) REFERENCES versions(id)          ON DELETE CASCADE,
  FOREIGN KEY (entry_id)   REFERENCES knowledge_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kb_entities (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  document_id INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  type        VARCHAR(64)  NOT NULL,
  props_json  JSON NULL,
  UNIQUE KEY uniq_entity (version_id, name, type),
  INDEX idx_ent_ver_doc (version_id, document_id),
  FOREIGN KEY (version_id)  REFERENCES versions(id)     ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kb_relations (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  version_id     INT NOT NULL,
  from_entity_id INT NOT NULL,
  to_entity_id   INT NOT NULL,
  relation       VARCHAR(64) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rel_ver (version_id),
  INDEX idx_rel_from (from_entity_id),
  INDEX idx_rel_to (to_entity_id),
  FOREIGN KEY (version_id)     REFERENCES versions(id)     ON DELETE CASCADE,
  FOREIGN KEY (from_entity_id) REFERENCES kb_entities(id)  ON DELETE CASCADE,
  FOREIGN KEY (to_entity_id)   REFERENCES kb_entities(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
