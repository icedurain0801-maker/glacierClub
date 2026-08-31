-- 后台配置能力增量迁移（MySQL 8.0+ / MariaDB 10.4+）
-- 对应 v003/v004：凭据支持后台加密写入（AES-256-GCM 密文，明文永不落库）
-- 说明：MySQL/MariaDB 的 DDL 不支持事务回滚，故每条语句均用 IF NOT EXISTS 做幂等，中断后可安全重跑。

-- po_credentials 增加密文列：存 {iv,tag,cipher} 序列化后的 AES 密文，
-- 明文凭据只在服务端内存中出现，绝不入库、不日志、不回显。
-- 保留 secret_ref 作为「外部密钥库/环境变量引用」兼容路径，两者互不冲突。
ALTER TABLE po_credentials
  ADD COLUMN IF NOT EXISTS secret_cipher TEXT NULL;
