---
status: pass_quarantine_blocked_next_stage
priority: P0
date: 2026-09-22
role: test-owner
topic: v066b-checkpoint-quarantine-95-independent-retest
---

# BigPlayer 95 条 checkpoint quarantine 独立复测

## 结论

**PASS（仅 quarantine 子项）；029、config 对齐、真实 Run 继续 BLOCKED。**

独立核对确认本次 compare-and-set 只命中冻结的 95 个 `cp.id`，`affectedRows=95`，前后 ID 集合一致，无额外行影响；95 条均进入 `failed / STALE_CHECKPOINT_QUARANTINED`，lease 已清空，active lease=0，identity/cursor/window/site/task/root 保留。回滚脚本路径和语法检查通过，未执行回滚。

## 独立证据

- backup：`.temp/v066b-stale-checkpoint-backup-20260922.json`
- quarantine report：`.temp/v066b-stale-checkpoint-quarantine-report-20260922.json`
- rollback script：`.temp/v066b-stale-checkpoint-rollback-20260922.js`
- backup row count / distinct：`95 / 95`
- report row count：`95`
- `affectedRows`：`95`
- `activeLeaseCount`：`0`
- status：`failed`（95 条）
- error code：`STALE_CHECKPOINT_QUARANTINED`（95 条）
- backup canonical SHA256：`4CD15A013816F62401CD0A19D32756759A94EED825F62E97FEE1E155CC6A10AE`
- after canonical SHA256：`A6781C937F79C264EC301B814B778D73F72F409F335BDAD303CD1551AD6F032C`
- id-set SHA256：`40C936FA49B810923A433FABDFA6F653A172F15BD0FBDE626E45C112F5223649`
- backup file SHA256：`9E3D8BE8D30C3B1DCCD2F6C43617A5B11B2DCB3F4FFA93907F82A6566F1CE574`
- quarantine report file SHA256：`8AA4CAE4C9AEBFB6EAA6CD91303EA4E464B0A517534AF2C4CF02C59AF0832FB8`
- `node --check .temp/v066b-stale-checkpoint-rollback-20260922.js`：PASS

## 独立断言

- backup/report ID 集合差异：`0`
- `identityPreserved=false` 行数：`0`
- after 非 `failed` 行数：`0`
- after 非目标 error code 行数：`0`
- after 仍有 `lease_owner` 或 `lease_until` 行数：`0`
- 测试负责人未执行 DB 写入、回滚、029、config 对齐或真实 Run。

## 下一阶段门禁

本报告只允许流转到 **029 预检**。在项目经理/开发负责人另行交接并通过以下门禁前，仍不得放行：

- 029 已登记且 `po_sync_runs` 具备 `site_url_snapshot`、`last_request_at`。
- config 的 `site-*` 与 registry 的 `legacy-*` 身份完成可审计对齐。
- active Run/lease 重新只读确认为 0。
- 真实 Run 仍需单独建单；本报告不构成 BigPlayer 总任务完成或真实采集通过。
