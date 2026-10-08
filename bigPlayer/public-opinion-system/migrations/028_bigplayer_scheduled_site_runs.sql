-- BigPlayer scheduled multi-site child run contract.
-- Parent keeps the existing source+scheduled_at slot; children are internal
-- scheduled_site rows with a NULL slot and a mandatory parent/site identity.

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema=DATABASE() AND table_name='po_sync_runs'
     AND constraint_name='po_sync_runs_trigger_slot_chk' AND constraint_type='CHECK')=1,
  'ALTER TABLE po_sync_runs DROP CONSTRAINT po_sync_runs_trigger_slot_chk',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE po_sync_runs ADD CONSTRAINT po_sync_runs_trigger_slot_chk CHECK (
  (trigger_type IN ('legacy','manual','scheduled_site') AND scheduled_at IS NULL)
  OR (trigger_type IN ('scheduled','scheduled_catchup') AND scheduled_at IS NOT NULL)
);

-- Existing historical rows keep their original trigger/slot values.  A child is
-- inserted only by the scheduler transaction after the parent slot has won.
