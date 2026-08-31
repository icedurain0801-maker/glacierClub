-- 账号级凭据模型迁移：移除早期 source 级唯一约束。
-- 同一 source 可拥有多个 credential_type；当前唯一边界由
-- po_credentials_account_type_uk (account_id, credential_type) 提供。
-- 仅调整索引，不删除或改写现有凭据数据；可安全重复执行。
-- 旧 source 唯一索引同时可能被 source_id 外键作为支撑索引，先补普通索引
-- 再删除唯一索引，避免 MySQL/MariaDB 拒绝删除外键所需索引。
ALTER TABLE po_credentials ADD INDEX IF NOT EXISTS po_credentials_source_idx (source_id);
ALTER TABLE po_credentials DROP INDEX IF EXISTS po_credentials_source_uk;
