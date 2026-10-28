# 任务提交时间混用时区修复

Status: 工作区已实现、隔离验证通过；未切换现役服务。

## 根因与只读证据

数据库 session/global time_zone 均为 SYSTEM，NOW() 与 UTC_TIMESTAMP() 相差 28800 秒。迁移 007 中 created_at、requested_at 默认 CURRENT_TIMESTAMP，而任务 started_at、finished_at 运行路径显式写 UTC。

样本 b4d53815-c80b-4fe2-8165-9b78df129f4b：created_at/requested_at=2026-10-15 14:00:59；started_at=06:02:34；finished_at=06:09:54；scheduled_at=06:00:00。前端按 UTC 解释数据库时间，提交因此被多加八小时。

## 修改

所有 server/src 与 worker/src 中任务 INSERT 显式写入 created_at、requested_at=UTC_TIMESTAMP(3)，覆盖手动、定时、境外现役及恢复/补采路径，不依赖系统或数据库会话时区。

API detail/list 对提交时间晚于开始/完成的历史记录不猜测转换，created_at/requested_at 仅异常字段返回 null，raw_time_fields 保留原始值，并附 timestamp_warning。正确 UTC、未执行记录不改动。详情页显示警示和原始提交值。未进行历史数据库写入或全局时区修改。

## 验证

- syncRunTimes、schedulerRepositoryAdapter、overseasProductionDaily、parentSyncRunProgress 四文件共 26 项隔离测试通过。
- 测试覆盖历史异常、正确 UTC、跨日、未执行、父任务、明确时区偏移、API detail/list 映射、所有现役 INSERT 显式 UTC。
- repository 和 collection-runs.js 语法检查通过，目标 diff 空白检查通过。
- 本子任务未执行浏览器验收或现役切换，由主任务统一进行。

## 运行时闭包

- server/src/services/syncRunTimes.js（新增）
- server/src/db/repository.js
- server/src/db/overseasManualHandoff.js
- server/src/db/overseasScheduledAdmissionStore.js
- worker/src/schedulerRepositoryAdapter.js
- worker/src/overseasProductionDaily.js
- worker/src/lastNightBoundedRecoveryPage.js
- worker/src/lastNightLegacySlotWinner.js
- worker/src/overseasSampleImport.js
- ../admin/PublicOpinion/assets/collection-runs.js

限制：没有逐行历史写入时区证据，不将原始时间直接减八小时；未开始历史记录无法以执行时间证明异常，保持原值。
