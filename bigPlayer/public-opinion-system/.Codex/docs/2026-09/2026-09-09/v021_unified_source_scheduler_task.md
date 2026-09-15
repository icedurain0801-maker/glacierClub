# 全社区采集源统一定时调度任务单

- Status: in_progress_design_and_implementation
- Priority: P0
- Owner: 项目经理
- Source PRD: `docs/superpowers/specs/2026-09-09-unified-source-scheduling-design.md`
- Updated: 2026-09-09

## 已拍板范围

- 统一来源级调度：境内/境外、BigPlayer/Discord及后续已接入连接器的平台同规则。
- 北京时间 02:00 固定锚点；按 `frequency_seconds` 产生固定时刻槽。
- 漏多个时刻只补最近一个；02:00 首槽使用前一自然日窗口。
- 授权/连接器/启用状态为硬闸门；同源互斥、失败隔离、幂等入队。
- 未接入连接器的平台必须明确不可调度，不得伪报成功。

## 当前风险与职责收敛

- 当前存在常驻 Worker、`dailyRunner`、Q1 专属外部计划任务，必须明确统一调度器与平台专属任务的职责边界，防止重复触发。
- 工作树已有 worker/server 未提交改动；开发负责人先审查归属，严禁覆盖或夹带无关变更。

## 待办

| 状态 | 事项 | 负责人 |
|---|---|---|
| in_progress | 现状、数据模型、租约/任务唯一键及三类入口职责审查，提出实施拆分 | 开发负责人 |
| pending | 统一时刻槽/准入/漏点/幂等/互斥核心实现及测试 | 开发负责人 |
| pending | 02:00 首槽与常驻/平台专属任务职责收敛 | 开发负责人 |
| pending | 全区域与连接器能力的端到端验收 | 测试负责人 |

## 验收门槛

按 PRD 第 8 节验证时刻槽、全区域、BigPlayer+Discord、漏点补跑、幂等、授权闸门、同源互斥、失败隔离、频率变更及本机端到端证据链。
