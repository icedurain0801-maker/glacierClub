# v009 BigPlayer 定时多站点父 Run 聚合合同

- 日期：2026-09-20
- 范围：A' 第二段，仅隔离 repository 合同；未执行真实数据库、迁移、服务操作或补跑。

## 变更

- `finishScheduledSiteRun` 在同一事务中以 child 的 `lease_owner + lease_epoch + lease_until` 围栏完成终态更新。
- 锁定同一 `parent_run_id` 的全部 child 后，最后一个终态 child 聚合父 Run：
  - 任一成功且任一失败：`partial`；
  - 全部失败：`failed`；
  - 计数为各 child 的 `discovered_count`、`stored_count` 之和；
  - 失败 child 的错误证据汇总到父 Run。
- 父 Run 更新只接受尚未终态的父记录；重复 finalize 或旧 owner/epoch 均不会再次聚合。

## 验证

- `node --test --test-name-pattern "finishScheduledSiteRun|finishSyncRun preserves|finishSyncRun returns" server/test/repository.test.js`：4/4 通过。
- `node --check server/src/db/repository.js`：通过。
- `git diff --check -- server/src/db/repository.js server/test/repository.test.js`：通过。
- 全量 `server/test/repository.test.js`：138 项中 136 通过，已有两项 checkpoint identity 测试失败（#58、#85），与本切片无关，按负责人指令未改动。

## 未覆盖/后续

- 未连接真实 MySQL/MariaDB；只使用隔离事务 mock 合同。
- API/UI、pause/cancel 传播仍不属于本切片。
