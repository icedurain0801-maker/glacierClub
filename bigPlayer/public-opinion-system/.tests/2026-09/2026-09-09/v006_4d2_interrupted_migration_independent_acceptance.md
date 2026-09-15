# 4D-2 中断迁移独立取证报告

- 日期：2026-09-09
- 角色：测试负责人
- 范围：仅 `127.0.0.1:43306` 的 `public_opinion_023_retry_72cad885`、`public_opinion_023_retry_27fb3ffc` 隔离库
- 测试方式：只读 SQL、只读日志与进程状态取证；未执行 migration、Verify、障碍清理或任何业务写入；未访问 3306、Worker、3000 或 3001。

## 结论

1. `72cad885` 的 prepare 首错现场成立：仅 `001_initial.sql` 已入 ledger，库中 9 张基线表；023 未调用，障碍 SQL 未执行，未形成空库，禁止复用。
2. `27fb3ffc` 的真实首次 023 中断现场成立：20 条基线 ledger 完整，023 未入 ledger；两个翻译表、受控残缺 `po_source_schedule_state` 和 11 个 023 早期列已落库。该库处于预期的“部分 DDL 已隐式提交、不可直接重跑”状态。
3. 27 的 definition guard 未能被编排脚本记录为预期失败，不是 guard 未执行的证据。`server/src/db/migrate.js` 的异常路径没有关闭 MySQL connection：023 的 definition guard 抛错后，`main().catch()` 只设置 `process.exitCode`，活跃 socket 继续保持，Node 不退出，PowerShell 无法取得 runner 结果；现场随后被 Ctrl+C 中断。该实现缺陷阻塞 4D-2 的恢复验收。

## 72cad885 只读取证

| 断言 | 结果 | 证据 |
|---|---|---|
| 目标身份 | 通过 | `public_opinion_023_retry_72cad885` / `po_mig_4d2_72cad885@127.0.0.1` / `43306` / server-id `423309` |
| baseline ledger | 通过 | 仅 `001_initial.sql` |
| 基线表数量 | 通过 | 9 张 |
| 023 ledger | 通过 | 0 |
| 023 对象和列 | 通过 | 三张相关表、来源列、运行列均为 0 |
| 残缺障碍表 | 通过 | 不存在 |

结论：与 `prepare-4d2.log` 的首错位置一致。首个 runner 调用可能已写入 001，因此该库必须保持失败现场，不得重跑 prepare。

## 27fb3ffc 只读取证

| 断言 | 结果 | 证据 |
|---|---|---|
| 目标身份 | 通过 | `public_opinion_023_retry_27fb3ffc` / `po_mig_4d2_27fb3ffc@127.0.0.1` / `43306` / server-id `423309` |
| baseline ledger | 通过 | 精确 20 条 001-018（含两个 018） |
| 023 ledger | 通过 | 0 |
| 023 部分 DDL | 通过 | `po_translation_jobs`、`po_content_translations`、`po_source_schedule_state` 均存在；来源/运行相关列数量为 11 |
| 受控障碍定义 | 通过 | 仅 `source_id`、`schedule_version`、`effective_at` 三列，定义与 `obstacle-4d2.sql` 一致 |
| 残留事务/锁 | 通过 | 隔离实例 root 只读查询：目标库当前连接 0、目标事务 0、全局 `innodb_lock_waits` 为 0 |

## 缺陷

| 编号 | 优先级 | 描述 | 复现证据 | 处理要求 |
|---|---|---|---|---|
| 4D2-P0-01 | P0 | 迁移 runner 异常路径不关闭数据库连接，预期失败时 Node 不退出，导致编排无法记录 exit code、stderr 和 definition-guard 结果 | `migrate.js` 仅在成功路径 `await conn.end()`；`main().catch()` 只设退出码。27 已完成 guard 前的全部 DDL，run/runner 日志停在首次 023 调用前 | 开发负责人修复 runner 异常收尾；新建隔离库后完整重做 4D-2。27 不移障、不重跑、不 Verify。 |

## 发版状态

**4D-2 不通过，退回开发负责人。**

当前仅确认两处失败现场与根因。尚未获得“清理唯一障碍后同库重跑 023 成功、ledger 精确 21 条、完整 Verify 通过”的端到端证据，不能签核。
