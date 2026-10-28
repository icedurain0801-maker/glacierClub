ALTER TABLE po_sync_checkpoints
  ADD INDEX po_checkpoint_summary_cover (account_id,sync_scope,status,items_fetched,last_item_at,error_code),
  ALGORITHM=COPY, LOCK=SHARED;
