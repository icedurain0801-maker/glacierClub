-- AI quality recommendations and independent manual review workflow.
-- Historical analyses remain unchanged and do not create candidates automatically.

ALTER TABLE po_analyses
  ADD COLUMN IF NOT EXISTS quality_score DECIMAL(5,4) NULL AFTER confidence,
  ADD COLUMN IF NOT EXISTS recommend_home TINYINT(1) NOT NULL DEFAULT 0 AFTER quality_score,
  ADD COLUMN IF NOT EXISTS recommend_pin TINYINT(1) NOT NULL DEFAULT 0 AFTER recommend_home,
  ADD COLUMN IF NOT EXISTS recommend_feature TINYINT(1) NOT NULL DEFAULT 0 AFTER recommend_pin,
  ADD COLUMN IF NOT EXISTS quality_reason VARCHAR(255) NULL AFTER recommend_feature;

ALTER TABLE po_analysis_cache
  ADD COLUMN IF NOT EXISTS quality_score DECIMAL(5,4) NULL AFTER confidence,
  ADD COLUMN IF NOT EXISTS recommend_home TINYINT(1) NOT NULL DEFAULT 0 AFTER quality_score,
  ADD COLUMN IF NOT EXISTS recommend_pin TINYINT(1) NOT NULL DEFAULT 0 AFTER recommend_home,
  ADD COLUMN IF NOT EXISTS recommend_feature TINYINT(1) NOT NULL DEFAULT 0 AFTER recommend_pin,
  ADD COLUMN IF NOT EXISTS quality_reason VARCHAR(255) NULL AFTER recommend_feature;

CREATE TABLE IF NOT EXISTS po_quality_candidates (
  id                     CHAR(36) NOT NULL,
  content_id             CHAR(36) NOT NULL,
  quality_score          DECIMAL(5,4) NULL,
  recommend_home         TINYINT(1) NOT NULL DEFAULT 0,
  recommend_pin          TINYINT(1) NOT NULL DEFAULT 0,
  recommend_feature      TINYINT(1) NOT NULL DEFAULT 0,
  quality_reason         VARCHAR(255) NULL,
  analysis_version       VARCHAR(80) NOT NULL,
  model_name             VARCHAR(120) NULL,
  content_fingerprint    CHAR(64) NULL,
  home_review_status     VARCHAR(20) NOT NULL DEFAULT 'pending',
  pin_review_status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  feature_review_status  VARCHAR(20) NOT NULL DEFAULT 'pending',
  home_adopted           TINYINT(1) NOT NULL DEFAULT 0,
  pin_adopted            TINYINT(1) NOT NULL DEFAULT 0,
  feature_adopted        TINYINT(1) NOT NULL DEFAULT 0,
  reviewer_id            VARCHAR(120) NULL,
  review_note            VARCHAR(1000) NULL,
  reviewed_at            DATETIME NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY po_quality_candidates_content_uk (content_id),
  KEY po_quality_candidates_score_idx (quality_score, updated_at),
  KEY po_quality_candidates_home_idx (recommend_home, home_review_status, updated_at),
  KEY po_quality_candidates_pin_idx (recommend_pin, pin_review_status, updated_at),
  KEY po_quality_candidates_feature_idx (recommend_feature, feature_review_status, updated_at),
  CONSTRAINT po_quality_candidates_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE RESTRICT,
  CONSTRAINT po_quality_candidates_home_status_chk CHECK (home_review_status IN ('pending','accepted','rejected')),
  CONSTRAINT po_quality_candidates_pin_status_chk CHECK (pin_review_status IN ('pending','accepted','rejected')),
  CONSTRAINT po_quality_candidates_feature_status_chk CHECK (feature_review_status IN ('pending','accepted','rejected')),
  CONSTRAINT po_quality_candidates_home_adopted_chk CHECK ((home_review_status='accepted' AND home_adopted=1) OR (home_review_status<>'accepted' AND home_adopted=0)),
  CONSTRAINT po_quality_candidates_pin_adopted_chk CHECK ((pin_review_status='accepted' AND pin_adopted=1) OR (pin_review_status<>'accepted' AND pin_adopted=0)),
  CONSTRAINT po_quality_candidates_feature_adopted_chk CHECK ((feature_review_status='accepted' AND feature_adopted=1) OR (feature_review_status<>'accepted' AND feature_adopted=0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
