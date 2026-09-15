# BigPlayer 两地生产同步准入独立只读复核

- 日期：2026-09-11
- 测试角色：测试负责人
- 范围：境内/境外生产同步准入阻塞、手动同步 schema 合同、误触发核对
- 边界：只读检查；未执行 migration 023、未重启 Worker、未启用来源、未读取/修复 secret、未写库、未启动同步、未发版或 push

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| migration 023 生产准入 | FAIL | v096 记录 ledger 无 023、`po_source_schedule_state` 不存在、必需列/索引缺失；稳定码 `UNIFIED_SCHEDULER_SCHEMA_NOT_READY` |
| Worker 制品/模式 | FAIL | PID `46764`，启动时间 `2026-09-07 20:20:28`；早于统一调度提交；v096 记录模式未设置、60 秒旧 tick；稳定码 `WORKER_RUNTIME_STALE` / `UNIFIED_SCHEDULER_MODE_UNSET` |
| 境内来源 | FAIL | source `5c21f78d-5f67-4467-963d-dcdeb5e26cab` 为 `enabled=0`，`SOURCE_DISABLED` |
| 境外来源 | BLOCKED | source `081a16d2-5545-4afd-9c65-e04777e4540b` enabled，但全局 schema/Worker/凭据门禁未通过 |
| 凭据运行态 | FAIL | v096 仅确认元数据 active/未过期/密文非空；近 48 小时真实 run 持续 `CREDENTIAL_NOT_FOUND`，不可据元数据放行 |
| 运行任务证据 | BLOCKED | v096 记录境内 1299 次、境外 2800 次失败 run，采集/写入计数均为 0；未满足受控同步条件 |
| 手动同步代码合同 | PASS | `server/test/repository.test.js` + `app.routes.test.js` 定向 19/19 通过；覆盖 `source_id`、`trigger_type='manual'`、重复复用、disabled/授权/竞争/lease/schema fail-closed、reset |
| 目标代码语法 | PASS | `server/src/db/repository.js`、`server/src/app.js` `node --check` 通过 |
| 本轮误触发真实同步 | PASS（未触发） | 仅执行只读文件/进程检查和本地合同测试；未调用同步入口、未写生产库、未启用来源 |

## 代码合同核对

当前工作树代码的手动入口已通过 `enqueueManualSourceSync` 收口：

- INSERT 显式写入 `source_id`、`account_id`、`trigger_type='manual'`、`sync_mode`。
- 仅允许已启用、已授权来源及默认账号；disabled、旧/不可验证 schema、活动 run/checkpoint/lease 均稳定 fail-closed。
- 同一 source/account/mode 的活动 manual run 重复请求复用，不新增任务。
- `startSourceSync` 与 `resetSourceSync` 均进入同一事务准入路径。

## 缺陷分级

- P0：0 个新增代码合同缺陷；生产准入硬阻塞仍存在。
- P1：0 个新增代码合同缺陷。
- P2：0 个阻断项。

## 结论

**代码合同：PASS。生产同步准入：FAIL / NOT_ADMITTED。误触发真实同步：未发生。**

在 migration 023、可信新 Worker、显式调度模式、来源启用状态、默认账号/凭据主体和真实授权均完成核验前，禁止两地同步；不得宣称 8/9 号数据已恢复。

## 引用证据

- `.Codex/docs/2026-09/2026-09-11/v096_bigplayer_production_sync_admission_blocked.md`
- `.Codex/docs/2026-09/2026-09-11/v092_bigplayer_schedule_p0_incident.md`
