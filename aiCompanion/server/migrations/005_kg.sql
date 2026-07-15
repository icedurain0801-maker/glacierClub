USE ai_companion;

-- 实体别名表：查询链路做实体识别时只查这张表(实体主名也会写入一份)。
-- alias 在 version 内唯一，同名歧义交 B 端手动裁决，第一阶段不做消歧。
CREATE TABLE IF NOT EXISTS kb_entity_aliases (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  entity_id  INT NOT NULL,
  alias      VARCHAR(128) NOT NULL,
  source     VARCHAR(16) NOT NULL DEFAULT 'ingest',  -- ingest|manual
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_alias (version_id, alias),
  INDEX idx_alias_entity (entity_id),
  FOREIGN KEY (version_id) REFERENCES versions(id)    ON DELETE CASCADE,
  FOREIGN KEY (entity_id)  REFERENCES kb_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 条目-实体关联：记录每行条目涉及哪些实体，为第二阶段图谱反查条目/融合召回预留。
CREATE TABLE IF NOT EXISTS kb_entry_entities (
  entry_id  INT NOT NULL,
  entity_id INT NOT NULL,
  PRIMARY KEY (entry_id, entity_id),
  INDEX idx_ee_entity (entity_id),
  FOREIGN KEY (entry_id)  REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES kb_entities(id)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bot 级图谱开关(迁移脚本会重跑所有 .sql，用 information_schema 判断保证幂等)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bots' AND COLUMN_NAME='kg_enabled');
SET @sql := IF(@col=0, 'ALTER TABLE bots ADD COLUMN kg_enabled TINYINT(1) NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
