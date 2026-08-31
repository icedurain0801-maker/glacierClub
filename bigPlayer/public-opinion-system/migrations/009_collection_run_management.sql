-- Collection run management indexes and compatibility fields for MariaDB 10.4+.
ALTER TABLE po_sync_runs ADD INDEX IF NOT EXISTS po_sync_runs_created_id_idx (created_at, id);
ALTER TABLE po_sync_run_contents ADD INDEX IF NOT EXISTS po_sync_run_contents_content_run_idx (content_id, run_id);
ALTER TABLE po_contents ADD INDEX IF NOT EXISTS po_contents_parent_root_idx (root_content_id, parent_content_id);
ALTER TABLE po_audit_events ADD INDEX IF NOT EXISTS po_audit_events_event_time_idx (event_type, created_at);
