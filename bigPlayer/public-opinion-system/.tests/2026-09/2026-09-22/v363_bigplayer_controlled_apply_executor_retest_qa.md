---
status: fail_execution_gate_integrity
date: 2026-09-22
role: test-owner
topic: v363 BigPlayer controlled apply executor 原地收口复测
---

# v363 BigPlayer controlled apply executor 原地收口复测

## 结论

**FAIL，仍禁止真实 Apply。**

本轮修复已补齐静态 hash 检查、identity `UPDATE`、事务回滚入口和故障注入覆盖，但真实执行仍有两个阻断缺陷。

## 阻断缺陷

1. **`affectedRows=3` 读取不可靠。** Step 3 执行 `UPDATE` 后把 `mysql.exe --execute` 的 stdout 最后一行直接转换为整数：`$affected=[int]($out|Select-Object -Last 1)`。对非查询 `UPDATE`，mysql CLI 通常不会在 stdout 返回 affected-row 数字；代码没有执行 `SELECT ROW_COUNT()` 或等价结构化返回，因此合法的 3 行更新可能被判为 0 并触发回滚，无法证明精确 affectedRows 门禁成立。
2. **回滚后 hash 复核缺失。** catch 已复制 rollback XML/EXE/Worker，但没有对恢复目标重新执行 `Sha` 并比较 `$expected.xml/$expected.exe/$expected.rollbackWorker`；交测要求的“恢复并复核源 hash”未闭合。

## 已通过项目

| 检查项 | 结果 |
|---|---|
| `node --test tests/executor.test.js` | `5/5 PASS` |
| 候选 checksums | `426/426 PASS` |
| Worker/rollback preflight hash | 代码中已逐项计算并比较 |
| identity SQL | 已出现明确 `UPDATE`、指定 3 个 legacy ID、`NULL` 保护和历史范围限制 |
| 故障注入 | migration、identity、release 三段均有注入入口 |
| DB rollback / release 删除 / XML-EXE-worker 恢复入口 | 静态存在 |
| 默认 DRY_RUN 与缺 confirmation/evidence 拒绝 | 通过；本轮未执行 Apply |

## 退回要求

开发负责人需将 affected rows 改为结构化可验证结果（例如同一事务内执行 `SELECT ROW_COUNT()` 并严格断言 3），并在 rollback 完成后重新计算目标 XML/EXE/Worker hash 与期望值比较；增加对应离线/故障注入断言后重新交 QA。

本轮未运行 `-Apply`，未连接或写生产 DB，未写 ProgramData，未切换/重启 Worker，未真实 Run，未访问 3001。
