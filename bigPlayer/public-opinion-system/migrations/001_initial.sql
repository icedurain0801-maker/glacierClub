-- 舆情分析系统 · 初始表结构（MySQL 8.0+）
-- 字符集统一 utf8mb4；UUID 由应用层生成（CHAR(36)）；JSON 用原生 JSON 类型

CREATE TABLE IF NOT EXISTS po_games (
  id          CHAR(36) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  kind        VARCHAR(20) NOT NULL,
  enabled     TINYINT(1) NOT NULL DEFAULT 1,
  identifiers JSON NOT NULL,
  owner_name  VARCHAR(80),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT po_games_kind_chk CHECK (kind IN ('owned', 'competitor'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_sources (
  id                CHAR(36) NOT NULL,
  game_id           CHAR(36) NOT NULL,
  platform          VARCHAR(40) NOT NULL,
  source_type       VARCHAR(20) NOT NULL,
  display_name      VARCHAR(120) NOT NULL,
  enabled           TINYINT(1) NOT NULL DEFAULT 0,
  frequency_seconds INT NOT NULL DEFAULT 3600,
  config            JSON NOT NULL,
  last_success_at   DATETIME NULL,
  last_error        TEXT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT po_sources_type_chk CHECK (source_type IN ('official_account', 'keyword', 'owned_community')),
  CONSTRAINT po_sources_game_fk FOREIGN KEY (game_id) REFERENCES po_games(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_contents (
  id           CHAR(36) NOT NULL,
  game_id      CHAR(36) NOT NULL,
  source_id    CHAR(36) NOT NULL,
  external_id  VARCHAR(255) NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  author_name  VARCHAR(160),
  title        TEXT,
  body         MEDIUMTEXT NOT NULL,
  published_at DATETIME NULL,
  source_url   TEXT NOT NULL,
  engagement   JSON NOT NULL,
  fingerprint  CHAR(64) NOT NULL,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT po_contents_type_chk CHECK (content_type IN ('post', 'comment', 'video', 'review')),
  CONSTRAINT po_contents_game_fk FOREIGN KEY (game_id) REFERENCES po_games(id),
  CONSTRAINT po_contents_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id),
  UNIQUE KEY po_contents_source_external_uk (source_id, external_id),
  UNIQUE KEY po_contents_source_fingerprint_uk (source_id, fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_analyses (
  id              CHAR(36) NOT NULL,
  content_id      CHAR(36) NOT NULL,
  sentiment       VARCHAR(20) NOT NULL,
  negative_score  DECIMAL(5,4) NOT NULL DEFAULT 0,
  severity        VARCHAR(20) NOT NULL,
  topics          JSON NOT NULL,
  matched_keywords JSON NOT NULL,
  summary         TEXT NOT NULL,
  model_name      VARCHAR(120),
  analyzed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT po_analyses_sentiment_chk CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  CONSTRAINT po_analyses_severity_chk CHECK (severity IN ('normal', 'attention', 'urgent')),
  CONSTRAINT po_analyses_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE CASCADE,
  UNIQUE KEY po_analyses_content_uk (content_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_alerts (
  id              CHAR(36) NOT NULL,
  game_id         CHAR(36) NOT NULL,
  severity        VARCHAR(20) NOT NULL,
  alert_type      VARCHAR(40) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  trigger_detail  TEXT NOT NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending',
  assignee_id     VARCHAR(120),
  resolution_note TEXT,
  ding_talk_status VARCHAR(30) NOT NULL DEFAULT 'not_sent',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at     DATETIME NULL,
  PRIMARY KEY (id),
  CONSTRAINT po_alerts_severity_chk CHECK (severity IN ('normal', 'attention', 'urgent')),
  CONSTRAINT po_alerts_status_chk CHECK (status IN ('pending', 'processing', 'resolved', 'false_positive')),
  CONSTRAINT po_alerts_game_fk FOREIGN KEY (game_id) REFERENCES po_games(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_alert_contents (
  alert_id   CHAR(36) NOT NULL,
  content_id CHAR(36) NOT NULL,
  PRIMARY KEY (alert_id, content_id),
  CONSTRAINT po_alert_contents_alert_fk FOREIGN KEY (alert_id) REFERENCES po_alerts(id) ON DELETE CASCADE,
  CONSTRAINT po_alert_contents_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_collection_runs (
  id               CHAR(36) NOT NULL,
  source_id        CHAR(36) NOT NULL,
  status           VARCHAR(30) NOT NULL,
  started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at      DATETIME NULL,
  discovered_count INT NOT NULL DEFAULT 0,
  stored_count     INT NOT NULL DEFAULT 0,
  analyzed_count   INT NOT NULL DEFAULT 0,
  alerted_count    INT NOT NULL DEFAULT 0,
  error_code       VARCHAR(80),
  error_message    TEXT,
  PRIMARY KEY (id),
  CONSTRAINT po_collection_runs_status_chk CHECK (status IN ('running', 'success', 'failed', 'partial')),
  CONSTRAINT po_collection_runs_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_keyword_rules (
  id              CHAR(36) NOT NULL,
  game_id         CHAR(36) NOT NULL,
  keyword         VARCHAR(120) NOT NULL,
  group_name      VARCHAR(80) NOT NULL,
  severity        VARCHAR(20) NOT NULL,
  threshold_count INT NOT NULL DEFAULT 1,
  enabled         TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT po_keyword_rules_severity_chk CHECK (severity IN ('attention', 'urgent')),
  CONSTRAINT po_keyword_rules_game_fk FOREIGN KEY (game_id) REFERENCES po_games(id),
  UNIQUE KEY po_keyword_rules_game_keyword_uk (game_id, keyword)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX po_contents_game_time_idx ON po_contents(game_id, published_at);
CREATE INDEX po_contents_source_time_idx ON po_contents(source_id, published_at);
CREATE INDEX po_alerts_game_status_idx ON po_alerts(game_id, status, created_at);
