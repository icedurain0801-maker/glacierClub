ALTER TABLE po_analyses
  ADD COLUMN IF NOT EXISTS analysis_level VARCHAR(20) NOT NULL DEFAULT 'light' AFTER content_id,
  ADD COLUMN IF NOT EXISTS analysis_version VARCHAR(80) NOT NULL DEFAULT 'sentiment-v1' AFTER analysis_level,
  ADD COLUMN IF NOT EXISTS content_fingerprint CHAR(64) NULL AFTER analysis_version,
  ADD COLUMN IF NOT EXISTS trigger_reason VARCHAR(255) NULL AFTER content_fingerprint,
  ADD COLUMN IF NOT EXISTS confidence DECIMAL(5,4) NULL AFTER negative_score,
  ADD COLUMN IF NOT EXISTS input_tokens INT UNSIGNED NOT NULL DEFAULT 0 AFTER model_name,
  ADD COLUMN IF NOT EXISTS output_tokens INT UNSIGNED NOT NULL DEFAULT 0 AFTER input_tokens,
  ADD COLUMN IF NOT EXISTS total_tokens INT UNSIGNED NOT NULL DEFAULT 0 AFTER output_tokens;

CREATE TABLE IF NOT EXISTS po_analysis_jobs (
  id                  CHAR(36) NOT NULL,
  content_id          CHAR(36) NOT NULL,
  analysis_profile    VARCHAR(20) NOT NULL,
  analysis_version    VARCHAR(80) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  trigger_reason      VARCHAR(255),
  matched_keywords    JSON NOT NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'pending',
  attempts            INT UNSIGNED NOT NULL DEFAULT 0,
  next_retry_at       DATETIME NULL,
  error_code          VARCHAR(120),
  error_message       VARCHAR(500),
  lease_owner         VARCHAR(160),
  lease_until         DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at        DATETIME NULL,
  PRIMARY KEY (id),
  CONSTRAINT po_analysis_jobs_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE CASCADE,
  CONSTRAINT po_analysis_jobs_profile_chk CHECK (analysis_profile IN ('light', 'deep')),
  CONSTRAINT po_analysis_jobs_status_chk CHECK (status IN ('pending', 'running', 'retryable', 'completed', 'failed')),
  UNIQUE KEY po_analysis_jobs_content_version_profile_uk (content_id, analysis_version, analysis_profile),
  KEY po_analysis_jobs_queue_idx (status, next_retry_at, lease_until, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_analysis_cache (
  cache_key           CHAR(64) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  analysis_profile    VARCHAR(20) NOT NULL,
  analysis_version    VARCHAR(80) NOT NULL,
  model_name          VARCHAR(120) NOT NULL,
  sentiment           VARCHAR(20) NOT NULL,
  negative_score      DECIMAL(5,4) NOT NULL DEFAULT 0,
  confidence          DECIMAL(5,4) NULL,
  severity            VARCHAR(20) NOT NULL,
  topics              JSON NOT NULL,
  summary             TEXT NOT NULL,
  needs_deep          TINYINT(1) NOT NULL DEFAULT 0,
  reason              VARCHAR(255),
  input_tokens        INT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens       INT UNSIGNED NOT NULL DEFAULT 0,
  total_tokens        INT UNSIGNED NOT NULL DEFAULT 0,
  usage_estimated     TINYINT(1) NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cache_key),
  KEY po_analysis_cache_lookup_idx (content_fingerprint, analysis_profile, analysis_version, model_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_ai_usage_daily (
  usage_date    DATE NOT NULL,
  profile       VARCHAR(20) NOT NULL,
  call_count    INT UNSIGNED NOT NULL DEFAULT 0,
  input_tokens  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_tokens  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usage_date, profile),
  CONSTRAINT po_ai_usage_profile_chk CHECK (profile IN ('light', 'deep'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
