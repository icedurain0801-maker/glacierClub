---
date: 2026-09-23
role: test-lead
scope: v363 target-scoped BigPlayer baseline gate
verdict: PASS_GATE_ONLY
environment: isolated candidate tests; no Apply
---

# v363 目标限定 baseline gate 独立 QA

## 结论

**PASS_GATE_ONLY / READY_FOR_QA**。目标 BigPlayer source/account 的 active checkpoint 或 lease 会阻断；目标 expired-only 不阻断并通过结构化 `targetExpired` 字段告警；非目标 Discord/TapTap active 只计入 `nonTargetObserved`，不会误阻断；目标 queued 即使没有 lease 也会阻断；所有边界均使用同一个 DB UTC snapshot。

本结论只表示 gate 候选可进入后续受控流程，不代表批准或执行 Apply。

## 实际命令与结果

```powershell
node --test .temp/candidates/v363-bigplayer-controlled-apply-executor-20260922/tests/execution-gates.test.js .tests/2026-09/2026-09-23/v363_baseline_gate_independent.test.js
```

- 首轮：候选 6/6 PASS；独立用例 4/5 PASS，1 条因 QA 断言把 PowerShell UTC 的 7 位小数与 3 位小数字符串直接比较而失败，时间值一致。
- 修正 QA 断言为时间戳等值后复跑独立用例：5/5 PASS。

```powershell
node --test .tests/2026-09/2026-09-23/v363_baseline_gate_independent.test.js
```

- 5/5 PASS，0 FAIL。

```powershell
[System.Management.Automation.Language.Parser]::ParseFile(...)
git diff --check -- .tests/2026-09/2026-09-23/v363_baseline_gate_independent.test.js
```

- `execution-gates.ps1`、`controlled-apply-executor.ps1` 语法解析通过。
- QA 文件空白检查通过。

## 验收矩阵

| 场景 | 预期 | 结果 |
|---|---|---|
| 非目标 Discord active + 非目标 TapTap queued | 不阻断，`nonTargetObserved=2` | PASS |
| 目标 BigPlayer running，lease 晚于 snapshot | 阻断，`targetActive=1` | PASS |
| 目标 BigPlayer running，lease 早于或等于 snapshot | 放行，`targetExpired=1` | PASS |
| 目标 BigPlayer queued，无 lease | 阻断，`targetActive=1` | PASS |
| lease 等于 snapshot / 晚 1ms | 前者 expired，后者 active；同一 snapshot 判定 | PASS |
| gate 结果缺少 `dbUtc/targetActive/targetExpired/nonTargetObserved` | fail-closed | PASS |

## 静态审查证据

- SQL 先执行 `SET @db_utc=UTC_TIMESTAMP(3)`，同一连接内的三类计数均引用 `@db_utc`。
- 目标匹配同时要求 `source_id` 与 `account_id` 一致。
- `targetActive > 0` 立即抛错；`targetExpired` 和 `nonTargetObserved` 只进入结构化证据。
- `controlled-apply-executor.ps1` 未带 `-Apply` 时在任何 DB/服务动作前退出；本轮未执行该脚本的 Apply 分支。

## 边界

- 未连接或写入生产数据库。
- 未执行迁移、site alignment、release copy、Worker stop/start、真实 Run。
- 未验收 v370。
