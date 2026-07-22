USE ai_companion;

ALTER TABLE community_sync_settings
  MODIFY COLUMN max_pages INT NOT NULL DEFAULT 0;

UPDATE community_sync_settings
   SET max_pages = 0
 WHERE max_pages = 500;
