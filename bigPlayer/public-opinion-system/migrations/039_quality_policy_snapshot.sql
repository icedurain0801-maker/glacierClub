-- Admission policy belongs to the analysis, never to the latest community settings.
SET SESSION lock_wait_timeout=10;
SET SESSION innodb_lock_wait_timeout=10;
ALTER TABLE po_quality_candidates ADD COLUMN IF NOT EXISTS quality_policy JSON NULL;
