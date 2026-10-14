---
status: passed
priority: P1
date: 2026-09-21
role: test-owner
candidate: v058d
---

# 负面风险分级三包 v058d 候选隔离 QA 报告

## 结论

PASS。v058d 在候选根内通过自包含 hermetic 验证，可进入下一阶段候选队列；本报告不代表真实 AI、DB、告警、历史回算或发布通过。

## 验收命令

工作目录：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\.temp\candidates\v058d`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-candidate.ps1
```

进程退出码：`0`

最终标记：`HERMETIC_CANDIDATE_VERIFIED`

## 结果

| 检查项 | 结果 |
|---|---:|
| 候选 manifest 文件数 | 729 |
| manifest 初始 hash | `CBFF2341333C2842D49AD1C5FB33693ABDF5E5CF8CFC61686CE7EC454918507A` |
| 候选根内依赖解析 | PASS，`mysql2` 解析到候选根 `node_modules` |
| Node 语法检查 | `5/5 PASS` |
| 定向测试 | `46/46 PASS` |
| 组合回归 | `250/250 PASS` |
| manifest 复算 | PASS，验证前后 hash 不变 |
| READY 声明 | `status=ready`，与 manifest hash 一致 |
| 非风险删除 hunk | `0`，按 READY 声明 |

## 重点用例

- `919167`、`919098` 游戏问题样本升级为 `urgent`。
- 普通 negative 保持最低 `attention`，positive/neutral 规则保持确定性。
- positive、neutral、negative 非法 severity 均记录 `invalid_severity_defaulted`。
- 超长 `analysisReason` 保留完整审计后缀。
- Repository 持久化归一化审计原因。
- Q1 缓存非法 severity 进入共享 normalizer，不被静默预先折叠。
- Worker 保留既有 `analysisReason`，新归一化追加审计且重复归一化幂等。
- 常规 Worker 持久化与告警使用同一归一化等级。

## 约束确认

- 只从 v058d 候选根运行脚本；未使用工作树源码作为被测输入。
- 未启动服务、未切换服务、未调用真实 AI、未连接真实 DB、未发送告警、未执行历史回算、未发布。
- 测试输出中的 `DATABASE_ERROR` 仅出现在候选单元测试的模拟失败场景日志；脚本未建立真实数据库连接。

## 后续边界

真实 AI/DB/告警链路、历史回算与告警 reconciliation/no-notify、阈值误报分布和发布前验收仍保持未测试状态，需另行授权并提供 runId/读模型证据后独立验收。
