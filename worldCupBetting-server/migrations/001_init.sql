-- 2026 世界杯积分竞猜 · 数据库初始化
-- 执行前请先创建数据库：CREATE DATABASE wc2026_betting CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET NAMES utf8mb4;
USE wc2026_betting;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(32) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname    VARCHAR(32) NOT NULL DEFAULT '',
  avatar_text VARCHAR(4)  NOT NULL DEFAULT '',   -- 取昵称首字，前端渲染头像
  points      INT UNSIGNED NOT NULL DEFAULT 500, -- 初始赠送 500 积分
  role        ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  streak      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 赛程表
CREATE TABLE IF NOT EXISTS matches (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  match_date  DATE NOT NULL,
  kickoff_at  DATETIME NOT NULL,
  stage       ENUM('group','r32','r16','qf','sf','3rd','final') NOT NULL DEFAULT 'group',
  group_name  VARCHAR(8) DEFAULT NULL,
  team1_code  VARCHAR(8) NOT NULL,
  team2_code  VARCHAR(8) NOT NULL,
  team1_name  VARCHAR(32) NOT NULL,
  team2_name  VARCHAR(32) NOT NULL,
  venue       VARCHAR(64) DEFAULT NULL,
  odds_win    DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  odds_draw   DECIMAL(5,2) NOT NULL DEFAULT 3.20,
  odds_lose   DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  status      ENUM('pending','finished','cancelled') NOT NULL DEFAULT 'pending',
  score1      TINYINT UNSIGNED DEFAULT NULL,
  score2      TINYINT UNSIGNED DEFAULT NULL,
  result      ENUM('win','draw','lose') DEFAULT NULL, -- 从 team1 视角
  settled_at  DATETIME DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_match_date (match_date),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- 投注表
CREATE TABLE IF NOT EXISTS picks (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  match_id      INT UNSIGNED NOT NULL,
  side          ENUM('win','draw','lose') NOT NULL,
  amount        SMALLINT UNSIGNED NOT NULL DEFAULT 50,
  odds_snapshot DECIMAL(5,2) NOT NULL,
  status        ENUM('pending','won','lost','refunded') NOT NULL DEFAULT 'pending',
  earned        INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at    DATETIME DEFAULT NULL,
  UNIQUE KEY uq_user_match (user_id, match_id),
  INDEX idx_user_id (user_id),
  INDEX idx_match_id (match_id),
  CONSTRAINT fk_pick_user  FOREIGN KEY (user_id)  REFERENCES users(id),
  CONSTRAINT fk_pick_match FOREIGN KEY (match_id) REFERENCES matches(id)
) ENGINE=InnoDB;

-- 积分流水表
CREATE TABLE IF NOT EXISTS point_logs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  delta         INT NOT NULL,             -- 正=增，负=减
  balance_after INT UNSIGNED NOT NULL,
  reason        VARCHAR(64) NOT NULL,     -- 'bet', 'settle_won', 'settle_lost', 'admin_adjust', 'register_bonus'
  ref_type      VARCHAR(16) DEFAULT NULL, -- 'pick', 'admin'
  ref_id        INT UNSIGNED DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 管理操作日志
CREATE TABLE IF NOT EXISTS admin_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id    INT UNSIGNED NOT NULL,
  action      VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) DEFAULT NULL,
  target_id   INT UNSIGNED DEFAULT NULL,
  payload     JSON DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_id (admin_id)
) ENGINE=InnoDB;
