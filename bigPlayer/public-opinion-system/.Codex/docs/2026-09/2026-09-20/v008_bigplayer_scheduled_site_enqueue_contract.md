---
status: verified-in-isolation
scope: BigPlayer 定时多站点 A' 第一段（入队合同）
---

# 定时父 Run 与 `scheduled_site` 子 Run 的原子入队

## 本段变更

- 新增后续迁移 `028_bigplayer_scheduled_site_runs.sql`：保留父 Run 的 `(source_id, scheduled_at)` 唯一频率槽，允许仅内部使用的 `trigger_type='scheduled_site'` 与空 `scheduled_at`。
- 调度 schema 准入要求 028 已记录；迁移执行后复核新的 CHECK 定义。
- BigPlayer 存在多个启用站点时，定时 slot 的原子事务锁定来源配置和持久站点注册表，先创建唯一 scheduled 父 Run，再创建每站一个 `scheduled_site` 子 Run。
- 注册表与保存配置不一致、站点表缺失或配置失效时事务失败并回滚；已有父 slot 只复用既有 parent，不新增子 Run。`po_source_schedule_state` 仍只记录父 Run。

## 隔离验证

```text
node --test worker/test/schedulerRepositoryAdapter.test.js worker/test/sourceSchedulerRuntime.test.js worker/test/workerUnifiedSchedulerSeam.test.js server/test/bigplayerScheduledSiteMigration.contract.test.js server/test/bigplayerMultisiteMigration.contract.test.js
# 45/45 PASS

node --test --test-name-pattern "BigPlayer multi-site manual sync|manual sync accepts MariaDB" server/test/repository.test.js
# 3/3 PASS

node --check worker/src/schedulerRepositoryAdapter.js
node --check worker/src/sourceScheduler.js
node --check worker/src/schedulerCandidateLoader.js
node --check worker/src/worker.js
node --check server/src/db/migrate.js
node --check server/src/db/repository.js
git diff --check -- <本段文件>
# PASS
```

## 未覆盖（不得外推为可用定时采集）

- 父 Run 仍可能被 runnable 查询领取；本段没有改父排除规则。
- Worker 仍按 sourceId 去重，不能保证同一扫描逐一执行所有子 Run。
- 子 Run 完成后的父状态聚合、来源状态、API/UI 投影、暂停/取消传播尚未实现。
- 未执行真实 027/028 迁移、未部署/重启服务、未补跑或发版。
