# 统一来源调度：阶段一审查与阶段 0 派单

- Status: in_progress_stage_0
- Priority: P0
- Owner: 项目经理
- Updated: 2026-09-09

## 评审结论

采用扩展 `po_sync_runs` 并新增 `po_source_schedule_state` 的单一事实源路线；不采用仅替换 `listDueSources` 的最小改动路线。

现有常驻 Worker、`dailyRunner` 与 Q1 专属任务存在职责重叠，必须按后续阶段收敛，不能并行继续承担全来源生产调度。

## 本次默认决策

1. 默认账号升级为显式 `default_account_id`，纳入 P0 数据模型。
2. 旧 TapTap `scheduleTime` 在统一调度中不再生效，统一使用北京时间 02:00 固定锚点。
3. 历史 sync run 的触发类型显示为 `legacy`，不伪回填为 `manual`。
4. 两个现有 Windows 计划任务在统一入口通过 BigPlayer+Discord 验收后再禁用；本阶段不改动。

## 阶段 0 范围

- 对账仓库迁移与本机已登记但缺失的 019-022 迁移。
- 保存当前目标文件的 diff/blob 基线，形成可审计清单。
- 确定后续迁移的唯一编号与空库/旧库 reconciliation 策略。

不运行迁移、不写数据库、不启动采集、不访问外部服务、不禁用计划任务。

## 已知工作树风险

`app.js`、`repository.js`、`worker.js`、`dailyRunner.js`、`q1DailyJob.js`、安装器及测试均有大范围既存未提交改动。后续实现必须按文件和 hunk 隔离，严禁覆盖或整体提交。
