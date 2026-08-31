-- 后台手动采集入队（MySQL 8.0+ / MariaDB 10.4+）
-- 对应 v004 阶段 A5：采集源支持「立即采集」标记
-- 说明：MySQL/MariaDB 的 DDL 不支持事务回滚，故用 IF NOT EXISTS 做幂等，中断后可安全重跑。

-- po_sources 增加 collect_requested_at：后台点「立即采集」时置 NOW()，
-- Worker 下个 tick 经 listManualDueSources 捞起（绕过 frequency 到期判定），采集后清空。
-- 授权闸门不受影响——未授权源即使被手动请求也不会进 collect（fail-closed）。
ALTER TABLE po_sources
  ADD COLUMN IF NOT EXISTS collect_requested_at DATETIME NULL;
