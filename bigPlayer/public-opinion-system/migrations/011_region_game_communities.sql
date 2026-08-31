-- 区域 / 游戏 / 社区分层（MySQL 8 / MariaDB 10.4+）。
-- 兼容已存在数据：先增加可空归属字段，回填完成后由应用层强制要求 community_id。

ALTER TABLE po_games
  ADD COLUMN IF NOT EXISTS region_code VARCHAR(20) NOT NULL DEFAULT 'domestic';

UPDATE po_games SET region_code='domestic' WHERE region_code IS NULL OR region_code='';

-- 历史库以“冰川大玩家”作为唯一舆情游戏主数据；保留原 ID 归一化名称，避免重建后断开外键。
UPDATE po_games
SET name='超能世界', region_code='domestic'
WHERE name='冰川大玩家'
  AND NOT EXISTS (SELECT 1 FROM (SELECT name FROM po_games) existing_game WHERE existing_game.name='超能世界');

INSERT INTO po_games (id, name, kind, enabled, identifiers, owner_name, region_code)
SELECT '00000000-0000-0000-0000-000000000001', '超能世界', 'owned', 1, JSON_OBJECT(), NULL, 'domestic'
WHERE NOT EXISTS (SELECT 1 FROM po_games WHERE name='超能世界');

INSERT INTO po_games (id, name, kind, enabled, identifiers, owner_name, region_code)
SELECT '00000000-0000-0000-0000-000000000002', 'Last Night', 'owned', 1, JSON_OBJECT(), NULL, 'overseas'
WHERE NOT EXISTS (SELECT 1 FROM po_games WHERE name='Last Night');

UPDATE po_games SET region_code='overseas' WHERE name='Last Night';
UPDATE po_games SET region_code='domestic' WHERE name='超能世界';

CREATE TABLE IF NOT EXISTS po_communities (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'enabled',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY po_communities_game_name_uk (game_id, name),
  CONSTRAINT po_communities_game_fk FOREIGN KEY (game_id) REFERENCES po_games(id),
  CONSTRAINT po_communities_status_chk CHECK (status IN ('enabled','disabled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO po_communities (id, game_id, name, status, sort_order)
SELECT '00000000-0000-0000-0000-000000000101', g.id, '超能世界国服版', 'enabled', 0
FROM po_games g
WHERE g.name='超能世界'
  AND NOT EXISTS (SELECT 1 FROM po_communities c WHERE c.game_id=g.id AND c.name='超能世界国服版');

ALTER TABLE po_sources ADD COLUMN IF NOT EXISTS community_id CHAR(36) NULL;
ALTER TABLE po_accounts ADD COLUMN IF NOT EXISTS community_id CHAR(36) NULL;
ALTER TABLE po_contents ADD COLUMN IF NOT EXISTS community_id CHAR(36) NULL;
ALTER TABLE po_alerts ADD COLUMN IF NOT EXISTS community_id CHAR(36) NULL;
ALTER TABLE po_keyword_rules ADD COLUMN IF NOT EXISTS community_id CHAR(36) NULL;

UPDATE po_sources s
JOIN po_communities c ON c.game_id=s.game_id AND c.name='超能世界国服版'
JOIN po_games g ON g.id=s.game_id AND g.name='超能世界'
SET s.community_id=c.id
WHERE s.community_id IS NULL;

UPDATE po_accounts a
JOIN po_sources s ON s.id=a.source_id
SET a.community_id=s.community_id
WHERE a.community_id IS NULL;

UPDATE po_contents c
JOIN po_sources s ON s.id=c.source_id
SET c.community_id=s.community_id
WHERE c.community_id IS NULL;

UPDATE po_alerts a
JOIN po_contents c ON c.id=(SELECT ac.content_id FROM po_alert_contents ac WHERE ac.alert_id=a.id ORDER BY ac.content_id LIMIT 1)
SET a.community_id=c.community_id
WHERE a.community_id IS NULL;

UPDATE po_alerts a
JOIN po_communities c ON c.game_id=a.game_id AND c.name='超能世界国服版'
JOIN po_games g ON g.id=a.game_id AND g.name='超能世界'
SET a.community_id=c.id
WHERE a.community_id IS NULL;

UPDATE po_keyword_rules r
JOIN po_communities c ON c.game_id=r.game_id AND c.name='超能世界国服版'
JOIN po_games g ON g.id=r.game_id AND g.name='超能世界'
SET r.community_id=c.id
WHERE r.community_id IS NULL;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_sources' AND index_name='po_sources_community_idx')=0, 'ALTER TABLE po_sources ADD INDEX po_sources_community_idx (community_id)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_accounts' AND index_name='po_accounts_community_idx')=0, 'ALTER TABLE po_accounts ADD INDEX po_accounts_community_idx (community_id)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_contents' AND index_name='po_contents_community_time_idx')=0, 'ALTER TABLE po_contents ADD INDEX po_contents_community_time_idx (community_id, published_at)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_alerts' AND index_name='po_alerts_community_status_idx')=0, 'ALTER TABLE po_alerts ADD INDEX po_alerts_community_status_idx (community_id, status, created_at)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_keyword_rules' AND index_name='po_keyword_rules_community_idx')=0, 'ALTER TABLE po_keyword_rules ADD INDEX po_keyword_rules_community_idx (community_id)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='po_sources' AND constraint_name='po_sources_community_fk')=0, 'ALTER TABLE po_sources ADD CONSTRAINT po_sources_community_fk FOREIGN KEY (community_id) REFERENCES po_communities(id)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='po_accounts' AND constraint_name='po_accounts_community_fk')=0, 'ALTER TABLE po_accounts ADD CONSTRAINT po_accounts_community_fk FOREIGN KEY (community_id) REFERENCES po_communities(id)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='po_contents' AND constraint_name='po_contents_community_fk')=0, 'ALTER TABLE po_contents ADD CONSTRAINT po_contents_community_fk FOREIGN KEY (community_id) REFERENCES po_communities(id)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='po_alerts' AND constraint_name='po_alerts_community_fk')=0, 'ALTER TABLE po_alerts ADD CONSTRAINT po_alerts_community_fk FOREIGN KEY (community_id) REFERENCES po_communities(id)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='po_keyword_rules' AND constraint_name='po_keyword_rules_community_fk')=0, 'ALTER TABLE po_keyword_rules ADD CONSTRAINT po_keyword_rules_community_fk FOREIGN KEY (community_id) REFERENCES po_communities(id)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_keyword_rules' AND index_name='po_keyword_rules_game_platform_keyword_uk')>0, 'ALTER TABLE po_keyword_rules DROP INDEX po_keyword_rules_game_platform_keyword_uk', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_keyword_rules' AND index_name='po_keyword_rules_community_platform_keyword_uk')=0, 'ALTER TABLE po_keyword_rules ADD UNIQUE KEY po_keyword_rules_community_platform_keyword_uk (community_id, platform, keyword)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 迁移校验查询：部署脚本应检查结果为 0；应用层在启用新写入链路前也会拒绝未归属数据。
SELECT
  (SELECT COUNT(*) FROM po_sources WHERE community_id IS NULL) AS unassigned_sources,
  (SELECT COUNT(*) FROM po_accounts WHERE community_id IS NULL) AS unassigned_accounts,
  (SELECT COUNT(*) FROM po_contents WHERE community_id IS NULL) AS unassigned_contents,
  (SELECT COUNT(*) FROM po_alerts WHERE community_id IS NULL) AS unassigned_alerts,
  (SELECT COUNT(*) FROM po_keyword_rules WHERE community_id IS NULL) AS unassigned_rules;
