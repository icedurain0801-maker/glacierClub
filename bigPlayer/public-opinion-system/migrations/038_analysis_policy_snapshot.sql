-- Preserve the policy of queued work while the community configuration changes.
SET SESSION lock_wait_timeout=10;
SET SESSION innodb_lock_wait_timeout=10;
ALTER TABLE po_analysis_jobs ADD COLUMN IF NOT EXISTS analysis_policy JSON NULL;
