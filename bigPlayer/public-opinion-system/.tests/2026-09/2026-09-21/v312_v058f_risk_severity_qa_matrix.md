---
status: prepared
priority: P1
date: 2026-09-21
role: test-owner
candidate: v058f
---

# v058f 风险分级候选 QA 验收矩阵

## 当前状态

`BLOCKED_ON_CANDIDATE_READY_AND_FORMAL_HANDOFF`。当前只完成只读准备，未执行真实写入、`--phase=write`、服务切换、发布或 push。

候选待交测路径：`.temp/candidates/v058f-risk-severity-formal-integration-20260921/`

## 固定基线与硬门禁

| 门禁 | 预期 | 证据 |
|---|---|---|
| 候选 READY | `READY.json` 状态与 manifest SHA256 一致 | 候选根内 manifest/READY |
| 候选隔离 | 被测模块、依赖和测试均解析到 v058f 候选根 | 解析路径 + manifest 复算 |
| 范围保留 | v065c 多站点、`analysisReason`、positive reconciliation、v154 均保留 | baseline diff + 反向回归 |
| 禁止副作用 | DB 写入 0、真实写阶段未执行、服务未切换、通知未发送 | 命令记录、进程/服务快照、DB 只读计数 |
| 3000 门禁 | 仅使用免登录 `127.0.0.1:3000`；不触碰 `3001` | 浏览器 URL 与网络记录 |

## 验收矩阵

| 编号 | 场景 | 验证点 | 必须证据 | 状态 |
|---|---|---|---|---|
| R1 | 风险定向：`919098` | negative + normal 归一化为 `urgent`；升级原因写入 `analysisReason` | 候选测试、只读 DB、3000 API/列表详情 | 待交测 |
| R2 | 风险定向：`919167` | negative + attention 归一化为 `urgent`；升级原因可审计 | 候选测试、只读 DB、3000 API/列表详情 | 待交测 |
| R3 | 普通 negative | 保持 `attention`，不得因互动量或词命中误升为 urgent | API + 只读 DB | 待交测 |
| R4 | Worker 链 | Worker 使用共享 normalizer；持久化与告警使用同一最终 severity；`analysisReason` 保留并幂等追加 | Worker 代码合同、定向测试、候选日志 | 待交测 |
| R5 | Q1 链 | Q1 缓存/分析进入共享 normalizer；非法 severity 不被静默折叠；原因审计保留 | Q1 定向测试、候选日志/只读快照 | 待交测 |
| R6 | positive + normal 拒警 | positive 最终 normal 不新建/关联负面告警，即使命中风险词；通知尝试为 0 | 只读 DB、告警关联、通知/outbox 计数、API | 待交测 |
| R7 | positive reconciliation | 受控 pending/processing 告警可转 `false_positive`；写入系统原因与唯一审计事件 | 受控 runId、只读 DB、audit 记录、API | 待交测 |
| R8 | reconciliation 幂等重放 | 同一 runId 重放不新增告警、不重复审计、不改变已终态、不增加通知/outbox | 首次/重放前后快照、幂等键、audit 计数 | 待交测 |
| R9 | v065c 反向回归 | 多站点父子 Run、站点隔离、站点状态/错误/计数、重复 URL 拒绝等原门禁不回退 | 候选反向测试、只读配置/结果 | 待交测 |
| R10 | v154 反向回归 | 口碑趋势正向/中性/负面并列、`unclassified` 不进分母、中性为 0 保留系列位置 | v154 合同测试、3000 页面只读验收 | 待交测 |
| R11 | v302 simulate | `--phase=simulate` 仅内存模拟；预期 `SIMULATION_PASS`，无 DB/AI/通知副作用 | 命令输出、sideEffects 计数 | 待交测 |
| R12 | 真实 preflight | 固定四样本身份、source/community/platform、当前分析/告警/通知基线一致；只读 DB/API 均可回溯 | `preflight.json`、API 快照、DB 快照 | 待交测 |

## 固定样本口径

| 角色 | externalId | 预期最终 severity |
|---|---:|---|
| fixed_919098 | `919098` | `urgent` |
| fixed_919167 | `919167` | `urgent` |
| ordinary_negative | `6826813` | `attention` |
| positive_reconciliation | `920120` | `normal` |

样本必须保持既有 source/community/platform 范围；缺失、串样本或扩大到历史全量均立即 FAIL。

## 允许执行顺序

1. 候选 READY/manifest/依赖边界检查。
2. 候选 hermetic、Worker/Q1、normalizer、analysisReason、positive reconciliation 合同测试。
3. `v302 --phase=simulate`，确认无副作用。
4. 开发负责人正式交测并明确授权范围后，才可做真实 preflight；真实 write 仍需单独授权，不由本矩阵默认放行。
5. 真实证据齐全后，再做 3000 桌面/移动只读验收与 v065c/v154 反向回归。

## 失败即停条件

- 任一固定样本预期等级不符或 `analysisReason` 审计缺失。
- positive 样本出现新负面告警、通知尝试或 reconciliation 非幂等。
- Worker/Q1 任一链绕过共享归一化。
- v065c 多站点或 v154 已验收行为回退。
- 出现 DB 写入、真实 `--phase=write`、服务切换、历史全量回算或超出授权范围的样本。

任一失败只回传唯一错误并退回开发负责人，不修改业务代码。
