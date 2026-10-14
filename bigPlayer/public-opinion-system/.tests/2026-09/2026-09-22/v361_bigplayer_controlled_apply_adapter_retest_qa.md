---
status: pass_readonly_command_review
date: 2026-09-22
role: test-owner
topic: v361 BigPlayer controlled apply adapter 路径修复复测
---

# v361 BigPlayer controlled apply adapter 复测报告

## 结论

**PASS_READONLY_COMMAND_REVIEW**。

默认 `ProductionRoot` 已修正为实际单反斜杠字面量 `C:\ProgramData\PublicOpinion`，并新增默认值与严格比较值一致的离线测试；此前唯一路径门禁缺陷已关闭。

## 复测结果

| 检查项 | 结果 |
|---|---|
| `node --test tests/adapter.test.js` | `4/4 PASS` |
| 候选 checksums | `14/14 PASS` |
| adapter 脚本 hash | `3E5216038CCAFA155823AE3E6269F009A8301C9E7A4D21723F14BCB5403881EF`，匹配交测声明 |
| adapter 测试 hash | `F93461EA43C109EAB5E7AA187A4768959A3CF8839B0DFA167D1DE1C4A69E7494`，匹配交测声明 |
| checksums hash | `3F6182862136DF5821C1B1B00A2CF252E1BC6B85929CD8FE2A85F036A4D01EF2`，匹配交测声明 |
| 默认 Dry run | 通过，`mode=DRY_RUN`、`productionWrites=FALSE` |
| 缺证据 Apply | `FAIL_CLOSED` |
| 错误 v360 evidenceId | 在 Apply 步骤前 `FAIL_CLOSED` |
| 95 基线、v358 Worker、TapTap formal1 rollback | 静态证据门禁保留 |
| 1-7 步骤 | 顺序和 stop 条件保留 |

## 边界

本轮仅审查命令与输入门禁；未运行 Apply，未连接或写生产 DB，未切换/重启 Worker，未执行真实 Run，未访问 3001，未发布或 push。
