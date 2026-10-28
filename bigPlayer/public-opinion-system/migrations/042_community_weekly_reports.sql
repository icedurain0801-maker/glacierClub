-- 独立周报队列，不改采集、分析或处理状态。所有时间存 UTC。
CREATE TABLE IF NOT EXISTS po_weekly_reports (
  id CHAR(36) NOT NULL PRIMARY KEY,
  community_id CHAR(36) NOT NULL,
  community_name VARCHAR(160) NOT NULL,
  week_start DATETIME NOT NULL,
  week_end DATETIME NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  stats JSON NULL,
  summary TEXT NULL,
  snapshot_ready TINYINT NOT NULL DEFAULT 0,
  merge_level INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  retry_at DATETIME NULL,
  error_code VARCHAR(80) NULL,
  generated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY po_weekly_community_week (community_id,week_start),
  KEY po_weekly_queue (status,retry_at,scheduled_at),
  CONSTRAINT po_weekly_community_fk FOREIGN KEY (community_id) REFERENCES po_communities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS po_weekly_report_parts (
  report_id CHAR(36) NOT NULL,
  merge_level INT NOT NULL,
  sequence_no INT NOT NULL,
  input_text MEDIUMTEXT NOT NULL,
  summary TEXT NULL,
  PRIMARY KEY (report_id,merge_level,sequence_no),
  CONSTRAINT po_weekly_parts_report_fk FOREIGN KEY (report_id) REFERENCES po_weekly_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS po_weekly_report_call_budget (
  budget_day DATE NOT NULL PRIMARY KEY,
  calls INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
