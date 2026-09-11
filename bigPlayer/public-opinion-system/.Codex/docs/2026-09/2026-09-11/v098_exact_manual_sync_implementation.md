---
date: 2026-09-11
status: ready_for_qa
scope: exact-manual-sync
owner: 开发负责人
---

# v098 精确手动同步实现记录

## 已完成

| 模块 | 提交 | 变更 | 验证 |
|---|---|---|---|
| Repository / migration contract | `03eb170` | manual run 单事务准入、活动 run/checkpoint/scheduler lease 互斥、legacy 入队收口、pre-023 兼容、source 默认账号与 schedule state 初始化合同 | Repository `101/101`；migration contract `15/15`；独立审查 PASS |
| API | `06bec3e` | sync/reset 仅接受普通 JSON 对象，不接受 body 替换 source/account/scope；disabled source 不自动启用；稳定返回 run 身份、状态与复用结果；补齐 `CREDENTIAL_SECRET_MISSING` → HTTP 401 | app routes `51/51`；独立审查 PASS |
| Scheduler lease | `ae83b0f` | lease 获取在同一条件更新中拒绝同源 queued/running run，防止 scheduled 与 manual/legacy 双 active run | scheduler adapter `11/11`；独立审查 PASS |
| Worker fallback | `ebd89ea` | 无 unified scheduler slot 的兼容路径显式使用 `trigger_type='legacy'`，继续走统一入队边界并保留 source 身份 | Worker `72/72` |

## 安全边界

- 未执行生产 migration、Worker 重启、来源启用、真实同步、数据回补、发版或 push。
- 未读取、输出或修改生产凭据；仅校验凭据元数据合同。
- 派单前已存在的工作树改动保持未暂存，提交仅包含任务 baseline 之后的补丁。

## 待完成

- 测试负责人盲测与回归。
- 项目经理验收返件。

## 开发侧最终验证

- `server/test/repository.test.js`：`101/101`。
- `server/test/app.routes.test.js`：`51/51`。
- `worker/test/worker.test.js`：`72/72`。
- `worker/test/schedulerRepositoryAdapter.test.js`：`11/11`。
- `server/test/unifiedSchedulerMigration.contract.test.js`：`15/15`。
- `node --check`：API、Repository、Worker、scheduler adapter 均通过。
- `git diff --check`：通过（仅现有 CRLF 提示，无空白错误）。
- 暂存区为空；派单前的 Repository/Worker 脏改仍保留在工作树且未被提交。
