-- Unified source scheduling schema reconciliation (MySQL 8 / MariaDB 10.4+).
--
-- The local migration ledger already contains 019-022 while those files are
-- absent from the repository. This migration therefore repairs their schema
-- effects before adding the scheduler schema. Every DDL step is guarded so a
-- run interrupted by MySQL's implicit DDL commits can be safely retried.
-- Historical directory seed data is deliberately not reconstructed here.

-- --------------------------------------------------------------------------
-- 019/020 schema parity: game/community directory metadata.
-- --------------------------------------------------------------------------

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_games' AND column_name='external_id')=0,
  'ALTER TABLE po_games ADD COLUMN external_id VARCHAR(32) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_communities' AND column_name='managed_by')=0,
  'ALTER TABLE po_communities ADD COLUMN managed_by VARCHAR(80) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_communities' AND column_name='external_id')=0,
  'ALTER TABLE po_communities ADD COLUMN external_id VARCHAR(32) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_games' AND index_name='po_games_external_id_uk')=0,
  'ALTER TABLE po_games ADD UNIQUE KEY po_games_external_id_uk (external_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_communities' AND index_name='po_communities_game_external_id_uk')=0,
  'ALTER TABLE po_communities ADD UNIQUE KEY po_communities_game_external_id_uk (game_id, external_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --------------------------------------------------------------------------
-- 021 schema parity: collection-window checkpoint identity.
-- --------------------------------------------------------------------------

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND column_name='window_start')=0,
  'ALTER TABLE po_sync_checkpoints ADD COLUMN window_start VARCHAR(32) NOT NULL DEFAULT ''''' ,
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND column_name='window_end')=0,
  'ALTER TABLE po_sync_checkpoints ADD COLUMN window_end VARCHAR(32) NOT NULL DEFAULT ''''' ,
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The account FK may currently rely on either legacy composite index. Create
-- and verify a dedicated support index before dropping any legacy index.
SET @checkpoint_account_idx_definition_errors := (
  SELECT COUNT(*)
  FROM (
    SELECT index_name, non_unique,
           GROUP_CONCAT(column_name ORDER BY seq_in_index) columns_list
    FROM information_schema.statistics
    WHERE table_schema=DATABASE()
      AND table_name='po_sync_checkpoints'
      AND index_name='po_sync_checkpoints_account_idx'
    GROUP BY index_name, non_unique
  ) actual
  WHERE actual.index_name IS NOT NULL
    AND (actual.non_unique<>1 OR actual.columns_list<>'account_id')
);
SET @sql := IF(
  @checkpoint_account_idx_definition_errors=0,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_checkpoint_account_index_definition'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND index_name='po_sync_checkpoints_account_idx')=0,
  'ALTER TABLE po_sync_checkpoints ADD INDEX po_sync_checkpoints_account_idx (account_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @checkpoint_account_idx_ready := (
  SELECT COUNT(*)
  FROM (
    SELECT index_name, non_unique,
           GROUP_CONCAT(column_name ORDER BY seq_in_index) columns_list
    FROM information_schema.statistics
    WHERE table_schema=DATABASE()
      AND table_name='po_sync_checkpoints'
      AND index_name='po_sync_checkpoints_account_idx'
    GROUP BY index_name, non_unique
  ) actual
  WHERE actual.non_unique=1 AND actual.columns_list='account_id'
);
SET @sql := IF(
  @checkpoint_account_idx_ready=1,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_checkpoint_account_index_missing'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND index_name='po_sync_checkpoints_identity_uk')>0,
  'ALTER TABLE po_sync_checkpoints DROP INDEX po_sync_checkpoints_identity_uk',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND index_name='po_sync_checkpoints_task_uk')>0,
  'ALTER TABLE po_sync_checkpoints DROP INDEX po_sync_checkpoints_task_uk',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND index_name='po_sync_checkpoints_window_uk')=0,
  'ALTER TABLE po_sync_checkpoints ADD UNIQUE KEY po_sync_checkpoints_window_uk (account_id, task_kind, task_key, sync_scope, root_platform_content_id, window_start, window_end)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --------------------------------------------------------------------------
-- 022 schema parity: persistent translation queue and results.
-- CREATE TABLE is atomic; rerunning after interruption is safe.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS po_translation_jobs (
  id CHAR(36) NOT NULL,
  content_id CHAR(36) NOT NULL,
  target_language VARCHAR(20) NOT NULL DEFAULT 'zh-CN',
  translation_version VARCHAR(80) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_retry_at DATETIME NULL,
  error_code VARCHAR(120) NULL,
  error_message VARCHAR(500) NULL,
  lease_owner VARCHAR(160) NULL,
  lease_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY po_translation_jobs_content_target_version_uk (content_id, target_language, translation_version),
  KEY po_translation_jobs_queue_idx (status, next_retry_at, lease_until, created_at),
  CONSTRAINT po_translation_jobs_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE CASCADE,
  CONSTRAINT po_translation_jobs_status_chk CHECK (status IN ('pending','running','retryable','completed','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_content_translations (
  id CHAR(36) NOT NULL,
  content_id CHAR(36) NOT NULL,
  target_language VARCHAR(20) NOT NULL DEFAULT 'zh-CN',
  source_language VARCHAR(40) NULL,
  translated_title TEXT NULL,
  translated_body MEDIUMTEXT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  translation_version VARCHAR(80) NOT NULL,
  model_name VARCHAR(120) NULL,
  input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  total_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  translated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY po_content_translations_content_target_version_uk (content_id, target_language, translation_version),
  KEY po_content_translations_fingerprint_idx (content_fingerprint, target_language, translation_version),
  CONSTRAINT po_content_translations_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @invalid_translation_statuses := (
  SELECT COUNT(*)
  FROM po_translation_jobs
  WHERE status NOT IN ('pending','running','retryable','completed','failed')
);
SET @sql := IF(
  @invalid_translation_statuses=0,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_invalid_translation_status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema=DATABASE()
     AND table_name='po_translation_jobs'
     AND constraint_name='po_translation_jobs_status_chk'
     AND constraint_type='CHECK')=0,
  'ALTER TABLE po_translation_jobs ADD CONSTRAINT po_translation_jobs_status_chk CHECK (status IN (''pending'',''running'',''retryable'',''completed'',''failed''))',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --------------------------------------------------------------------------
-- Unified scheduler source configuration.
-- schedule_effective_at is initialized at cutover, so no historical slot is
-- implicitly replayed. default_account_id intentionally has no reverse FK:
-- po_accounts already cascades from po_sources, and repository writes will
-- validate ownership while avoiding a cyclic delete path.
-- --------------------------------------------------------------------------

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sources' AND column_name='default_account_id')=0,
  'ALTER TABLE po_sources ADD COLUMN default_account_id CHAR(36) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sources' AND column_name='schedule_version')=0,
  'ALTER TABLE po_sources ADD COLUMN schedule_version BIGINT UNSIGNED NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sources' AND column_name='schedule_effective_at')=0,
  'ALTER TABLE po_sources ADD COLUMN schedule_effective_at DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sources' AND index_name='po_sources_default_account_idx')=0,
  'ALTER TABLE po_sources ADD INDEX po_sources_default_account_idx (default_account_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE po_sources s
SET s.default_account_id = (
  SELECT a.id
  FROM po_accounts a
  WHERE a.source_id=s.id
    AND a.game_id=s.game_id
    AND a.platform=s.platform
    AND a.enabled=1
    AND a.auth_status='authorized'
    AND (a.auth_expire_at IS NULL OR a.auth_expire_at>UTC_TIMESTAMP(3))
    AND (a.community_id <=> s.community_id)
  ORDER BY a.updated_at DESC, a.id ASC
  LIMIT 1
)
WHERE s.default_account_id IS NULL;

-- Existing non-null defaults must be valid. A source without a valid enabled
-- account stays NULL and is rejected later with ACCOUNT_NOT_FOUND.
SET @invalid_default_accounts := (
  SELECT COUNT(*)
  FROM po_sources s
  LEFT JOIN po_accounts a ON a.id=s.default_account_id
  WHERE s.default_account_id IS NOT NULL
    AND (
      a.id IS NULL OR a.enabled<>1 OR a.auth_status<>'authorized'
      OR (a.auth_expire_at IS NOT NULL AND a.auth_expire_at<=UTC_TIMESTAMP(3))
      OR a.source_id<>s.id OR a.game_id<>s.game_id
      OR a.platform<>s.platform OR NOT (a.community_id <=> s.community_id)
    )
);
SET @sql := IF(
  @invalid_default_accounts=0,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_invalid_default_account'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE po_sources
SET schedule_effective_at=UTC_TIMESTAMP(3)
WHERE schedule_effective_at IS NULL;

-- --------------------------------------------------------------------------
-- Unified run ledger. Existing runs are historical legacy evidence.
-- --------------------------------------------------------------------------

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='source_id')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN source_id CHAR(36) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='trigger_type')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN trigger_type VARCHAR(32) NOT NULL DEFAULT ''legacy''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='scheduled_at')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN scheduled_at DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='window_start')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN window_start DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='window_end')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN window_end DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='schedule_version')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN schedule_version BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='attempts')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN attempts INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='next_retry_at')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN next_retry_at DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE po_sync_runs r
JOIN po_accounts a ON a.id=r.account_id
SET r.source_id=a.source_id
WHERE r.source_id IS NULL;

UPDATE po_sync_runs
SET trigger_type='legacy'
WHERE scheduled_at IS NULL
  AND (trigger_type IS NULL OR trigger_type='');

SET @invalid_trigger_rows := (
  SELECT COUNT(*)
  FROM po_sync_runs
  WHERE (scheduled_at IS NOT NULL AND (trigger_type IS NULL OR trigger_type NOT IN ('scheduled','scheduled_catchup')))
     OR (scheduled_at IS NULL AND trigger_type NOT IN ('legacy','manual'))
);
SET @sql := IF(
  @invalid_trigger_rows=0,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_invalid_trigger_slot'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema=DATABASE()
     AND table_name='po_sync_runs'
     AND constraint_name='po_sync_runs_trigger_slot_chk'
     AND constraint_type='CHECK')=0,
  'ALTER TABLE po_sync_runs ADD CONSTRAINT po_sync_runs_trigger_slot_chk CHECK ((trigger_type IN (''legacy'',''manual'') AND scheduled_at IS NULL) OR (trigger_type IN (''scheduled'',''scheduled_catchup'') AND scheduled_at IS NOT NULL))',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @invalid_sync_runs := (
  SELECT COUNT(*)
  FROM po_sync_runs r
  LEFT JOIN po_sources s ON s.id=r.source_id
  LEFT JOIN po_accounts a ON a.id=r.account_id
  WHERE r.source_id IS NULL OR s.id IS NULL OR a.id IS NULL OR a.source_id<>r.source_id
);
SET @sql := IF(
  @invalid_sync_runs=0,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_orphan_sync_run'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='source_id' AND is_nullable='YES')>0,
  'ALTER TABLE po_sync_runs MODIFY COLUMN source_id CHAR(36) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @duplicate_slots := (
  SELECT COUNT(*) FROM (
    SELECT source_id, scheduled_at
    FROM po_sync_runs
    WHERE scheduled_at IS NOT NULL
    GROUP BY source_id, scheduled_at
    HAVING COUNT(*)>1
  ) duplicated
);
SET @sql := IF(
  @duplicate_slots=0,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_duplicate_schedule_slot'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND index_name='po_sync_runs_source_trigger_schedule_uk')>0,
  'ALTER TABLE po_sync_runs DROP INDEX po_sync_runs_source_trigger_schedule_uk',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND index_name='po_sync_runs_source_schedule_uk')=0,
  'ALTER TABLE po_sync_runs ADD UNIQUE KEY po_sync_runs_source_schedule_uk (source_id, scheduled_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND index_name='po_sync_runs_source_trigger_schedule_idx')=0,
  'ALTER TABLE po_sync_runs ADD INDEX po_sync_runs_source_trigger_schedule_idx (source_id, trigger_type, scheduled_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND index_name='po_sync_runs_queue_idx')=0,
  'ALTER TABLE po_sync_runs ADD INDEX po_sync_runs_queue_idx (status, scheduled_at, next_retry_at, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND index_name='po_sync_runs_source_status_lease_idx')=0,
  'ALTER TABLE po_sync_runs ADD INDEX po_sync_runs_source_status_lease_idx (source_id, status, lease_until)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema=DATABASE() AND table_name='po_sync_runs' AND constraint_name='po_sync_runs_source_fk')=0,
  'ALTER TABLE po_sync_runs ADD CONSTRAINT po_sync_runs_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --------------------------------------------------------------------------
-- Source-level scheduling state and lease fencing.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS po_source_schedule_state (
  source_id CHAR(36) NOT NULL,
  schedule_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  effective_at DATETIME(3) NOT NULL,
  last_scheduled_at DATETIME(3) NULL,
  next_scheduled_at DATETIME(3) NULL,
  last_scan_at DATETIME(3) NULL,
  lease_run_id CHAR(36) NULL,
  lease_owner VARCHAR(160) NULL,
  lease_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lease_until DATETIME(3) NULL,
  last_status VARCHAR(30) NULL,
  last_reason_code VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source_id),
  KEY po_source_schedule_state_next_idx (next_scheduled_at, source_id),
  KEY po_source_schedule_state_lease_idx (lease_until, source_id),
  CONSTRAINT po_source_schedule_state_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO po_source_schedule_state (
  source_id, schedule_version, effective_at
)
SELECT id, schedule_version, schedule_effective_at
FROM po_sources;

-- Fail closed if a partially-created structure has the expected names but not
-- the required scheduler contract. Definition checks deliberately validate
-- type, nullability, default, index uniqueness/order and FK delete behavior.
SET @schema_definition_errors := (
  SELECT COUNT(*)
  FROM (
    SELECT 'po_games' table_name, 'external_id' column_name, 'varchar(32)' column_type, 'YES' is_nullable, '*' expected_default
    UNION ALL SELECT 'po_communities','managed_by','varchar(80)','YES','*'
    UNION ALL SELECT 'po_communities','external_id','varchar(32)','YES','*'
    UNION ALL SELECT 'po_sync_checkpoints','window_start','varchar(32)','NO',''
    UNION ALL SELECT 'po_sync_checkpoints','window_end','varchar(32)','NO',''
    UNION ALL SELECT 'po_sources','default_account_id','char(36)','YES','*'
    UNION ALL SELECT 'po_sources','schedule_version','bigint%unsigned','NO','1'
    UNION ALL SELECT 'po_sources','schedule_effective_at','datetime(3)','YES','*'
    UNION ALL SELECT 'po_sync_runs','source_id','char(36)','NO','*'
    UNION ALL SELECT 'po_sync_runs','trigger_type','varchar(32)','NO','legacy'
    UNION ALL SELECT 'po_sync_runs','scheduled_at','datetime(3)','YES','*'
    UNION ALL SELECT 'po_sync_runs','window_start','datetime(3)','YES','*'
    UNION ALL SELECT 'po_sync_runs','window_end','datetime(3)','YES','*'
    UNION ALL SELECT 'po_sync_runs','schedule_version','bigint%unsigned','YES','*'
    UNION ALL SELECT 'po_sync_runs','attempts','int%unsigned','NO','0'
    UNION ALL SELECT 'po_sync_runs','next_retry_at','datetime(3)','YES','*'
    UNION ALL SELECT 'po_translation_jobs','id','char(36)','NO','*'
    UNION ALL SELECT 'po_translation_jobs','content_id','char(36)','NO','*'
    UNION ALL SELECT 'po_translation_jobs','target_language','varchar(20)','NO','zh-CN'
    UNION ALL SELECT 'po_translation_jobs','translation_version','varchar(80)','NO','*'
    UNION ALL SELECT 'po_translation_jobs','content_fingerprint','char(64)','NO','*'
    UNION ALL SELECT 'po_translation_jobs','status','varchar(30)','NO','pending'
    UNION ALL SELECT 'po_translation_jobs','attempts','int%unsigned','NO','0'
    UNION ALL SELECT 'po_translation_jobs','next_retry_at','datetime','YES','*'
    UNION ALL SELECT 'po_translation_jobs','error_code','varchar(120)','YES','*'
    UNION ALL SELECT 'po_translation_jobs','error_message','varchar(500)','YES','*'
    UNION ALL SELECT 'po_translation_jobs','lease_owner','varchar(160)','YES','*'
    UNION ALL SELECT 'po_translation_jobs','lease_until','datetime','YES','*'
    UNION ALL SELECT 'po_translation_jobs','completed_at','datetime','YES','*'
    UNION ALL SELECT 'po_content_translations','id','char(36)','NO','*'
    UNION ALL SELECT 'po_content_translations','content_id','char(36)','NO','*'
    UNION ALL SELECT 'po_content_translations','target_language','varchar(20)','NO','zh-CN'
    UNION ALL SELECT 'po_content_translations','source_language','varchar(40)','YES','*'
    UNION ALL SELECT 'po_content_translations','translated_title','text','YES','*'
    UNION ALL SELECT 'po_content_translations','translated_body','mediumtext','YES','*'
    UNION ALL SELECT 'po_content_translations','content_fingerprint','char(64)','NO','*'
    UNION ALL SELECT 'po_content_translations','translation_version','varchar(80)','NO','*'
    UNION ALL SELECT 'po_content_translations','model_name','varchar(120)','YES','*'
    UNION ALL SELECT 'po_content_translations','input_tokens','int%unsigned','NO','0'
    UNION ALL SELECT 'po_content_translations','output_tokens','int%unsigned','NO','0'
    UNION ALL SELECT 'po_content_translations','total_tokens','int%unsigned','NO','0'
    UNION ALL SELECT 'po_source_schedule_state','source_id','char(36)','NO','*'
    UNION ALL SELECT 'po_source_schedule_state','schedule_version','bigint%unsigned','NO','1'
    UNION ALL SELECT 'po_source_schedule_state','effective_at','datetime(3)','NO','*'
    UNION ALL SELECT 'po_source_schedule_state','last_scheduled_at','datetime(3)','YES','*'
    UNION ALL SELECT 'po_source_schedule_state','next_scheduled_at','datetime(3)','YES','*'
    UNION ALL SELECT 'po_source_schedule_state','last_scan_at','datetime(3)','YES','*'
    UNION ALL SELECT 'po_source_schedule_state','lease_run_id','char(36)','YES','*'
    UNION ALL SELECT 'po_source_schedule_state','lease_owner','varchar(160)','YES','*'
    UNION ALL SELECT 'po_source_schedule_state','lease_epoch','bigint%unsigned','NO','0'
    UNION ALL SELECT 'po_source_schedule_state','lease_until','datetime(3)','YES','*'
    UNION ALL SELECT 'po_source_schedule_state','last_status','varchar(30)','YES','*'
    UNION ALL SELECT 'po_source_schedule_state','last_reason_code','varchar(80)','YES','*'
  ) expected
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema=DATABASE()
   AND actual.table_name=expected.table_name
   AND actual.column_name=expected.column_name
  WHERE actual.column_name IS NULL
     OR LOWER(actual.column_type) NOT LIKE expected.column_type
     OR actual.is_nullable<>expected.is_nullable
     OR (expected.expected_default<>'*'
         AND TRIM(BOTH CHAR(39) FROM COALESCE(actual.column_default,''))<>expected.expected_default)
);

SET @schema_definition_errors := @schema_definition_errors + (
  SELECT COUNT(*)
  FROM (
    SELECT 'po_games' table_name, 'po_games_external_id_uk' index_name, 0 non_unique, 'external_id' columns_list
    UNION ALL SELECT 'po_communities','po_communities_game_external_id_uk',0,'game_id,external_id'
    UNION ALL SELECT 'po_sync_checkpoints','po_sync_checkpoints_account_idx',1,'account_id'
    UNION ALL SELECT 'po_sync_checkpoints','po_sync_checkpoints_window_uk',0,'account_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end'
    UNION ALL SELECT 'po_translation_jobs','po_translation_jobs_content_target_version_uk',0,'content_id,target_language,translation_version'
    UNION ALL SELECT 'po_translation_jobs','po_translation_jobs_queue_idx',1,'status,next_retry_at,lease_until,created_at'
    UNION ALL SELECT 'po_content_translations','po_content_translations_content_target_version_uk',0,'content_id,target_language,translation_version'
    UNION ALL SELECT 'po_content_translations','po_content_translations_fingerprint_idx',1,'content_fingerprint,target_language,translation_version'
    UNION ALL SELECT 'po_sources','po_sources_default_account_idx',1,'default_account_id'
    UNION ALL SELECT 'po_sync_runs','po_sync_runs_source_schedule_uk',0,'source_id,scheduled_at'
    UNION ALL SELECT 'po_sync_runs','po_sync_runs_source_trigger_schedule_idx',1,'source_id,trigger_type,scheduled_at'
    UNION ALL SELECT 'po_source_schedule_state','po_source_schedule_state_next_idx',1,'next_scheduled_at,source_id'
    UNION ALL SELECT 'po_source_schedule_state','po_source_schedule_state_lease_idx',1,'lease_until,source_id'
  ) expected
  LEFT JOIN (
    SELECT table_name, index_name, non_unique,
           GROUP_CONCAT(column_name ORDER BY seq_in_index) columns_list
    FROM information_schema.statistics
    WHERE table_schema=DATABASE()
    GROUP BY table_name, index_name, non_unique
  ) actual
    ON actual.table_name=expected.table_name AND actual.index_name=expected.index_name
  WHERE actual.index_name IS NULL
     OR actual.non_unique<>expected.non_unique
     OR actual.columns_list<>expected.columns_list
);

SET @schema_definition_errors := @schema_definition_errors + (
  SELECT COUNT(*)
  FROM (
    SELECT 'po_translation_jobs' table_name, 'po_translation_jobs_content_fk' constraint_name,
           'content_id' column_name, 'po_contents' referenced_table_name, 'id' referenced_column_name, 'CASCADE' delete_rule
    UNION ALL SELECT 'po_content_translations','po_content_translations_content_fk','content_id','po_contents','id','CASCADE'
    UNION ALL SELECT 'po_sync_runs','po_sync_runs_source_fk','source_id','po_sources','id','RESTRICT'
    UNION ALL SELECT 'po_source_schedule_state','po_source_schedule_state_source_fk','source_id','po_sources','id','CASCADE'
  ) expected
  LEFT JOIN information_schema.key_column_usage columns_used
    ON columns_used.constraint_schema=DATABASE()
   AND columns_used.table_name=expected.table_name
   AND columns_used.constraint_name=expected.constraint_name
  LEFT JOIN information_schema.referential_constraints relations
    ON relations.constraint_schema=DATABASE()
   AND relations.table_name=expected.table_name
   AND relations.constraint_name=expected.constraint_name
  WHERE columns_used.constraint_name IS NULL
     OR columns_used.column_name<>expected.column_name
     OR columns_used.referenced_table_name<>expected.referenced_table_name
     OR columns_used.referenced_column_name<>expected.referenced_column_name
     OR relations.delete_rule<>expected.delete_rule
);

SET @schema_definition_errors := @schema_definition_errors +
  (SELECT COUNT(*)=0
   FROM information_schema.table_constraints
   WHERE constraint_schema=DATABASE()
     AND table_name='po_translation_jobs'
     AND constraint_name='po_translation_jobs_status_chk'
     AND constraint_type='CHECK');

SET @schema_definition_errors := @schema_definition_errors +
  (SELECT COUNT(*)=0
   FROM information_schema.table_constraints
   WHERE constraint_schema=DATABASE()
     AND table_name='po_sync_runs'
     AND constraint_name='po_sync_runs_trigger_slot_chk'
     AND constraint_type='CHECK');

SET @sql := IF(
  @schema_definition_errors=0,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_schema_definition'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The intentionally missing table names below make any failed precondition or
-- definition check abort before migrate.js records 023 as applied.
SET @schema_contract_errors :=
  (SELECT COUNT(*)=0 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_games' AND column_name='external_id')
  + (SELECT COUNT(*)=0 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_communities' AND column_name='managed_by')
  + (SELECT COUNT(*)=0 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_communities' AND column_name='external_id')
  + (SELECT COUNT(*)=0 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND column_name='window_start')
  + (SELECT COUNT(*)=0 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_sync_checkpoints' AND column_name='window_end')
  + (SELECT COUNT(*)=0 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='po_translation_jobs')
  + (SELECT COUNT(*)=0 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='po_content_translations')
  + (SELECT COUNT(*)=0 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_sources' AND column_name='default_account_id')
  + (SELECT COUNT(*)=0 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_sources' AND column_name='schedule_effective_at')
  + (SELECT COUNT(*)=0 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='source_id' AND is_nullable='NO')
  + (SELECT COUNT(*)=0 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND index_name='po_sync_runs_source_schedule_uk')
  + (SELECT COUNT(*)=0 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='po_source_schedule_state');
SET @sql := IF(
  @schema_contract_errors=0,
  'SELECT 1',
  'SELECT * FROM po_migration_023_fail_schema_contract'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
