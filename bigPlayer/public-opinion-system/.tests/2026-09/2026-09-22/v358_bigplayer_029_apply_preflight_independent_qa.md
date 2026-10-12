---
status: PASS_PREFLIGHT_ONLY
role: 测试负责人
scope: v357 BigPlayer 029 受控 apply 生产前预检包
date: 2026-09-22
---

# v358 BigPlayer 029 apply preflight 独立 QA

## 结论

**PASS_PREFLIGHT_ONLY**。

预检包在默认模拟模式和缺少生产输入时按预期 fail-closed；未执行生产 apply。该结论不等于 migration 已应用或 Worker 已切换。

## 核验结果

| 检查 | 结果 |
|---|---|
| `node --test tests/preflight.test.js` | 2/2 PASS |
| 默认 PowerShell 预检 | exit=0；`workerEvidence=BLOCKED_INPUT`；`applyMode=SIMULATION_ONLY` |
| 显式 `-Apply` 缺 DB/Worker 输入 | exit=1；唯一错误为 `FAIL_CLOSED: explicit Apply requires DatabaseDsn, WorkerReleaseRoot, WorkerManifestPath and WorkerServiceXmlPath` |
| 95 条 checkpoint | rowCount=95、distinct ID=95；脚本校验冻结文件 SHA 与 metadata 一致 |
| 029 schema 断言 | `site_url_snapshot`、`last_request_at`、`po_sync_runs_site_request_idx` 均有断言 |
| same-URL 影响 | repair plan 精确 3 对；要求 affectedRows=3 |
| legacy/NULL 保护 | 计划明确保留 legacy ID、禁止历史 NULL 批量补 site-* |
| 最近 7 天 | 半开区间 `[windowStart, windowEnd)`，上界重复内容排除 |
| rollback stop conditions | hash/count/identity mismatch 时先恢复 schema evidence，立即停止 |
| checksums | 16 entries，0 missing/hash failure |

## Worker 证据边界

本轮未提供正式 Worker release root、manifest、XML 外部路径；默认输出 `workerEvidence=BLOCKED_INPUT` 是预检包的正确 fail-closed 行为。脚本具备路径提供后的 Worker 文件/manifest/XML hash 校验分支，但本轮未伪造路径或替代资产。

## 安全边界

未连接生产 DB、未执行 DDL/config/run/checkpoint/Worker 修改、未重启、未执行真实 Run、未发布、未 push、未访问 3001。
