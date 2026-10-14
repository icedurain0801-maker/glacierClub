-- Reconcile scheduler runtime objects that were added to 023 after some
-- databases had already recorded that migration as applied. Do not remove or
-- replay the historical 023 ledger entry: MariaDB DDL is implicitly committed.

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND column_name='lease_epoch')=0,
  'ALTER TABLE po_sync_runs ADD COLUMN lease_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS po_worker_heartbeats (
  worker_id VARCHAR(160) NOT NULL,
  build_sha VARCHAR(80) NULL,
  mode VARCHAR(30) NOT NULL DEFAULT 'enabled',
  last_seen_at DATETIME(3) NOT NULL,
  scan_started_at DATETIME(3) NULL,
  scan_finished_at DATETIME(3) NULL,
  scan_status VARCHAR(30) NULL,
  scan_error VARCHAR(500) NULL,
  current_scan VARCHAR(255) NULL,
  PRIMARY KEY (worker_id),
  KEY po_worker_heartbeats_seen_idx (last_seen_at),
  KEY po_worker_heartbeats_scan_idx (scan_started_at, scan_finished_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @runtime_schema_errors := (
  SELECT COUNT(*)
  FROM (
    SELECT 'po_sync_runs' table_name, 'lease_epoch' column_name, 'bigint%unsigned' column_type, 'NO' is_nullable, '0' expected_default
    UNION ALL SELECT 'po_worker_heartbeats','worker_id','varchar(160)','NO','*'
    UNION ALL SELECT 'po_worker_heartbeats','build_sha','varchar(80)','YES','*'
    UNION ALL SELECT 'po_worker_heartbeats','mode','varchar(30)','NO','enabled'
    UNION ALL SELECT 'po_worker_heartbeats','last_seen_at','datetime(3)','NO','*'
    UNION ALL SELECT 'po_worker_heartbeats','scan_started_at','datetime(3)','YES','*'
    UNION ALL SELECT 'po_worker_heartbeats','scan_finished_at','datetime(3)','YES','*'
    UNION ALL SELECT 'po_worker_heartbeats','scan_status','varchar(30)','YES','*'
    UNION ALL SELECT 'po_worker_heartbeats','scan_error','varchar(500)','YES','*'
    UNION ALL SELECT 'po_worker_heartbeats','current_scan','varchar(255)','YES','*'
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

SET @runtime_schema_errors := @runtime_schema_errors + (
  SELECT COUNT(*)
  FROM (
    SELECT 'po_worker_heartbeats' table_name, 'PRIMARY' index_name, 0 non_unique, 'worker_id' columns_list
    UNION ALL SELECT 'po_worker_heartbeats','po_worker_heartbeats_seen_idx',1,'last_seen_at'
    UNION ALL SELECT 'po_worker_heartbeats','po_worker_heartbeats_scan_idx',1,'scan_started_at,scan_finished_at'
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

SET @sql := IF(
  @runtime_schema_errors=0,
  'SELECT 1',
  'SELECT * FROM po_migration_026_fail_runtime_schema_definition'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
