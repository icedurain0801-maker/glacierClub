---
status: pass_quarantine_blocked_next_stage
priority: P0
date: 2026-09-22
role: development-lead
topic: v066b-checkpoint-quarantine-95
---

# BigPlayer 95 条 checkpoint quarantine 结果

## 结果

- 备份文件 `.temp/v066b-stale-checkpoint-backup-20260922.json` SHA256：`9E3D8BE8D30C3B1DCCD2F6C43617A5B11B2DCB3F4FFA93907F82A6566F1CE574`。
- 单次 compare-and-set 事务 `affectedRows=95`；命中范围为冻结 95 个 `cp.id`，无集合外写入。
- after：`95/95` 唯一，`status=failed` 为 95，`error_code=STALE_CHECKPOINT_QUARANTINED` 为 95，`lease_owner/lease_until=NULL` 为 95，active lease=0。
- 95 条的 identity、cursor、window、site、task、root 保留；after canonical full-row SHA256：`A6781C937F79C264EC301B814B778D73F72F409F335BDAD303CD1551AD6F032C`。
- 逐 ID 报告：`.temp/v066b-stale-checkpoint-quarantine-report-20260922.json`，SHA256：`8AA4CAE4C9AEBFB6EAA6CD91303EA4E464B0A517534AF2C4CF02C59AF0832FB8`。
- 回滚脚本：`.temp/v066b-stale-checkpoint-rollback-20260922.js`，`node --check` PASS；未执行回滚。

## 后续门禁

029、config/registry 对齐、真实 Run、服务切换和 3001 均未执行。必须另行完成迁移/身份方案评审与只读复检后，才能提出下一阶段；本结果不构成真实 Run 放行。
