-- Authorized additive production migration: only six intent tables; no existing table changes.
CREATE TABLE po_current_analysis_intents (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  content_id VARCHAR(64) NOT NULL,
  analysis_profile VARCHAR(32) NOT NULL,
  analysis_version VARCHAR(64) NOT NULL,
  current_fingerprint VARCHAR(128) NOT NULL,
  previous_fingerprint VARCHAR(128) NULL,
  scope_key CHAR(64) NOT NULL,
  scope_json JSON NOT NULL,
  expected_job_json JSON NOT NULL,
  expected_analysis_json JSON NOT NULL,
  generation BIGINT UNSIGNED NOT NULL,
  applied_generation BIGINT UNSIGNED NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_current_intent_slot (content_id,analysis_profile,analysis_version),
  KEY idx_current_intent_replay (scope_key,analysis_profile,analysis_version,state,updated_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE po_current_analysis_repair_records (
  plan_sha256 CHAR(64) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  record_id VARCHAR(64) NOT NULL,
  intent_id VARCHAR(64) NOT NULL,
  generation BIGINT UNSIGNED NOT NULL,
  disposition VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (plan_sha256,record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE po_current_analysis_intent_audit (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  intent_id VARCHAR(64) NOT NULL,
  generation BIGINT UNSIGNED NOT NULL,
  content_id VARCHAR(64) NOT NULL,
  scope_key CHAR(64) NOT NULL,
  previous_fingerprint VARCHAR(128) NULL,
  current_fingerprint VARCHAR(128) NOT NULL,
  disposition VARCHAR(32) NOT NULL,
  before_job_json JSON NOT NULL,
  after_job_json JSON NOT NULL,
  evidence_id VARCHAR(128) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_current_intent_applied (intent_id,generation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE po_overseas_current_intent_proof_audit (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  intent_id VARCHAR(64) NOT NULL,
  generation BIGINT UNSIGNED NOT NULL,
  content_id VARCHAR(64) NOT NULL,
  site_id VARCHAR(64) NOT NULL,
  previous_job_json JSON NOT NULL,
  current_job_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_overseas_intent_proof (intent_id,generation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE po_current_translation_intents (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 content_id VARCHAR(64) NOT NULL,
 target_language VARCHAR(20) NOT NULL,
 translation_version VARCHAR(80) NOT NULL,
 current_fingerprint VARCHAR(128) NOT NULL,
 previous_fingerprint VARCHAR(128) NULL,
 scope_key CHAR(64) NOT NULL,
 scope_json JSON NOT NULL,
 site_evidence_json JSON NOT NULL,
 expected_job_json JSON NOT NULL,
 generation BIGINT UNSIGNED NOT NULL,
 applied_generation BIGINT UNSIGNED NULL,
 state VARCHAR(32) NOT NULL DEFAULT 'pending',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_translation_intent_slot(content_id,target_language,translation_version),
 KEY idx_translation_intent_replay(scope_key,target_language,translation_version,state,updated_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE po_current_translation_intent_audit (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 intent_id VARCHAR(64) NOT NULL,
 generation BIGINT UNSIGNED NOT NULL,
 content_id VARCHAR(64) NOT NULL,
 event_type VARCHAR(32) NOT NULL,
 scope_key CHAR(64) NOT NULL,
 before_job_json JSON NOT NULL,
 after_job_json JSON NOT NULL,
 evidence_id VARCHAR(128) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_translation_intent_audit(intent_id,generation,event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
