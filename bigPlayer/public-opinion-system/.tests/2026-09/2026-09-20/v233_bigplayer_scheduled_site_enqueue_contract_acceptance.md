# v233 BigPlayer 定时父子原子入队合同验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：A' 第一段隔离 schema/mock 合同
- 边界：未执行真实 027/028 迁移、服务、重启、补跑或发版；不验收实际执行

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 调度/迁移/Worker seam | PASS | `node --test worker/test/schedulerRepositoryAdapter.test.js worker/test/sourceSchedulerRuntime.test.js worker/test/workerUnifiedSchedulerSeam.test.js server/test/bigplayerScheduledSiteMigration.contract.test.js server/test/bigplayerMultisiteMigration.contract.test.js`，45 passed / 0 failed |
| 仓储多站点入队 | PASS | `node --test --test-name-pattern "BigPlayer multi-site manual sync\|manual sync accepts MariaDB" server/test/repository.test.js`，3 passed / 0 failed |
| 028 schema 合同 | PASS | 保留父 `(source_id, scheduled_at)` 唯一 slot；仅允许内部 `scheduled_site` 子 run 使用空 `scheduled_at` |
| 父唯一 slot | PASS | 新 slot 先创建唯一 scheduled parent；重复 slot 复用已有 parent，不新增子 run |
| scheduled_site 子 run | PASS | 多站点事务锁定 source config 与持久 registry，校验一致后按启用站点插入子 run |
| 原子/registry fail-closed | PASS | registry 与保存配置不一致、站点缺失或配置失效时事务失败回滚 |
| state 写入范围 | PASS | `po_source_schedule_state` 仅记录 parent |
| 语法/空白 | PASS | 相关 Worker/Server 文件 `node --check` 全部通过；`git diff --check` 通过 |

## 尚未覆盖

- 父 Run 仍可能被 runnable 查询领取。
- Worker 仍按 `sourceId` 去重，尚未保证同一扫描逐一执行所有子 Run。
- 子 Run 完成后的父状态汇总、来源状态、API/UI 投影、暂停/取消传播尚未实现。
- 未执行真实迁移、真实服务或真实数据库验收。

## 结论

A' 第一段定时父子原子入队合同 **PASS（隔离）**。仅表示入队 schema/mock 合同成立，不表示定时采集链路已可用；第二、三段完成前不得对外宣称可用。
