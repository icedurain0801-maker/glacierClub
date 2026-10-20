-- Prefix narrows nonempty error messages without indexing or exposing full text.
-- Existing long HASH unique keys require MariaDB COPY for this table.
ALTER TABLE po_sync_checkpoints
  ADD INDEX po_checkpoint_error_summary_idx (account_id,error_message(1),sync_scope,root_platform_content_id,id),
  ALGORITHM=COPY, LOCK=SHARED;
