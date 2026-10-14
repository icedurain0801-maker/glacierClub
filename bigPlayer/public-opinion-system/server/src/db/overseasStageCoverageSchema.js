'use strict';
// Explicit isolated installer imports these definitions. Not in migrate.js.
const statements = [
  `CREATE TABLE po_overseas_stage_manifests (
    run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    receipt_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    scope_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    manifest_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    schema_snapshot LONGTEXT COLLATE utf8mb4_bin NOT NULL,
    schema_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    history_snapshot_at DATETIME(3) NULL,history_sealed TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expansion_sealed TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expected_count INT UNSIGNED NOT NULL DEFAULT 0,
    expected_set_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    coverage_status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'open',
    coverage_reason VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    admission_json LONGTEXT COLLATE utf8mb4_bin NULL,admission_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_epoch BIGINT UNSIGNED NOT NULL,updated_epoch BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE po_overseas_expected_tasks (
    run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    task_identity_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    descriptor LONGTEXT COLLATE utf8mb4_bin NOT NULL,
    descriptor_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    origin VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    origin_evidence LONGTEXT COLLATE utf8mb4_bin NOT NULL,
    checkpoint_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    state VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'expected',
    completed_checkpoint_snapshot LONGTEXT COLLATE utf8mb4_bin NULL,
    completed_checkpoint_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_epoch BIGINT UNSIGNED NOT NULL,completed_epoch BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY(run_id,task_identity_sha256),KEY pending(run_id,state),KEY checkpoint_ref(checkpoint_id),
    CONSTRAINT fk_overseas_tasks_manifest FOREIGN KEY(run_id) REFERENCES po_overseas_stage_manifests(run_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`
];
module.exports = { statements: Object.freeze(statements) };
