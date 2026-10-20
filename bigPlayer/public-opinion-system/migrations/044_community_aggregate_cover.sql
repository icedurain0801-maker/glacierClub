-- Cover community/time aggregations without reading wide content payload rows.
-- InnoDB implicitly includes the content primary key in every secondary index.
SET SESSION lock_wait_timeout=5;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_contents' AND index_name='po_contents_community_aggregate_idx')=0,
  'ALTER TABLE po_contents ADD INDEX po_contents_community_aggregate_idx (community_id,published_at,source_id,game_id,is_deleted,content_type), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
