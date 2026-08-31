-- P0 管线增量迁移（MySQL 8.0+ / MariaDB 10.4+）
-- 对应设计文档 M1：授权字段、凭据引用表、关键词两级+双口径、分群 webhook 预留
-- 说明：MySQL/MariaDB 的 DDL 不支持事务回滚，故本脚本每条语句均用 IF NOT EXISTS/IF EXISTS 做幂等，
--       任何一步中断后可安全重跑。

-- ① po_sources 补授权与生效时段（Q3、Q5）
ALTER TABLE po_sources
  ADD COLUMN IF NOT EXISTS auth_status    VARCHAR(20) NOT NULL DEFAULT 'unconfigured',
  ADD COLUMN IF NOT EXISTS auth_expire_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS active_window  JSON NULL;

-- ② 凭据引用表（Q3：只存指向密钥库/环境变量的键名，绝不落明文）
CREATE TABLE IF NOT EXISTS po_credentials (
  id              CHAR(36) NOT NULL,
  source_id       CHAR(36) NOT NULL,
  secret_ref      VARCHAR(160) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'unconfigured',
  last_checked_at DATETIME NULL,
  expire_at       DATETIME NULL,
  failure_reason  TEXT,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT po_credentials_source_fk FOREIGN KEY (source_id) REFERENCES po_sources(id) ON DELETE CASCADE,
  UNIQUE KEY po_credentials_source_uk (source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ③ po_keyword_rules 补平台级 + 双口径（Q6、Q7）
--    唯一键改为 (game_id, platform, keyword)；MySQL 唯一键含 NULL 列时多行 NULL 不算重复，
--    故游戏级默认(platform=NULL)可与平台级并存。
ALTER TABLE po_keyword_rules
  ADD COLUMN IF NOT EXISTS platform       VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS trigger_mode   VARCHAR(20) NOT NULL DEFAULT 'aggregate',
  ADD COLUMN IF NOT EXISTS window_seconds INT NOT NULL DEFAULT 1800;
-- 外键 po_keyword_rules_game_fk 复用了旧唯一键 (game_id,keyword) 的 game_id 前缀做索引，
-- 直接删唯一键会报 "needed in a foreign key constraint"。先为 game_id 建独立索引顶替，
-- 外键改用它后即可安全删旧唯一键、建新唯一键。
ALTER TABLE po_keyword_rules ADD INDEX IF NOT EXISTS po_keyword_rules_game_idx (game_id);
ALTER TABLE po_keyword_rules DROP INDEX IF EXISTS po_keyword_rules_game_keyword_uk;
ALTER TABLE po_keyword_rules ADD UNIQUE KEY IF NOT EXISTS po_keyword_rules_game_platform_keyword_uk (game_id, platform, keyword);

-- ④ po_games 预留分群 webhook 引用（Q-钉钉，B 扩展位；NULL=回退全局大群）
ALTER TABLE po_games
  ADD COLUMN IF NOT EXISTS dingtalk_webhook_ref VARCHAR(120) NULL;
