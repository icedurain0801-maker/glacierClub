---
status: waiting_for_developer_handoff
priority: P0
date: 2026-09-22
role: test-owner
topic: v066b-checkpoint-quarantine-95
---

# BigPlayer 95 条 checkpoint quarantine 交接门禁

## 当前核对

- 备份文件：`.temp/v066b-stale-checkpoint-backup-20260922.json`
- `rowCount=95`，`distinctCpIdCount=95`
- 分类：`site_id=NULL` 78，legacy 17
- canonical rows SHA256：`4CD15A013816F62401CD0A19D32756759A94EED825F62E97FEE1E155CC6A10AE`
- 文件 SHA256：`9E3D8BE8D30C3B1DCCD2F6C43617A5B11B2DCB3F4FFA93907F82A6566F1CE574`
- 备份选择条件为已过期 running，当前交接要求 active lease=0。

## 尚未开始

尚未执行 quarantine、条件更新、029、config/registry 对齐或真实 Run；测试负责人没有执行任何写入。

## 开始条件

开发负责人必须提交：

1. 逐 ID compare-and-set 前后快照及 `affectedRows=95`。
2. 更新集合只能命中冻结备份中的 95 个 `cp.id`；任何其他行写入即 FAIL。
3. 每个 `cp.id` 的新状态、cursor、lease_owner/lease_until、error_code 与回滚值。
4. 回滚验证证据、active lease=0、集合守恒 `95/95`。
5. 交接后才能复核 029 ledger 与 config `site-*` / registry `legacy-*` 对齐；任一未满足继续 BLOCKED。

## 拒绝条件

- affectedRows 不是 95，或无法证明逐 ID 命中冻结 hash。
- 出现冻结集合外更新、DELETE、cursor 清空、NULL site identity 批量重键。
- active lease 非 0、029 未登记、config/registry 未对齐。
- 任何条件更新、029、身份修复或真实 Run 在本门禁未通过前提前发生。
