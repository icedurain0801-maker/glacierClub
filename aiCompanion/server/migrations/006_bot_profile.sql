USE ai_companion;

SET @has_display_name := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bots' AND COLUMN_NAME = 'display_name'
);
SET @sql := IF(
  @has_display_name = 0,
  'ALTER TABLE bots ADD COLUMN display_name VARCHAR(64) NOT NULL DEFAULT ''陪玩助手'' AFTER version_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_avatar_url := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bots' AND COLUMN_NAME = 'avatar_url'
);
SET @sql := IF(
  @has_avatar_url = 0,
  'ALTER TABLE bots ADD COLUMN avatar_url MEDIUMTEXT NULL AFTER display_name',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
