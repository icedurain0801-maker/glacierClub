# Last Night 方案 A：隔离执行器候选

Status: isolated-fixture-pass-production-no-go
Date: 2026-10-08

## 本次变更

- `worker/src/lastNightIsolatedExecutor.js` 只接受 `isolated-test` 和真实 `LastNightIsolatedStore` 的隔离测试实例；生产模式及注入共享 store 在任何 I/O 前失败关闭。顺序为冻结三站、采集、消费独立 outbox。没有装配共享调度、Worker 或生产凭据。
- `worker/src/lastNightIsolatedPipeline.js` 恢复分页时累计已持久化 `pageSeq`，显式失败重试不会重新获得整段页数预算。测试拆开失败 Run 与 401 Run，避免测试状态污染。
- `scripts/lastnight-isolated-db-e2e.js` 仍是唯一可运行入口，仅 `--isolated` 可启动。关闭前复核本次子进程 PID、独立 datadir/pid_file、43319 端口、server_id 和版本；身份不符不发 `SHUTDOWN`。扩展为全新隔离库三站帖子、评论、回复及 light/deep outbox 夹具。
- 独立身份单测覆盖 PID、datadir、pid_file、端口、server_id、版本错配；端口被其他进程占用时实测非零 `EADDRINUSE`，未进入实例创建或关闭。
- 43319 夹具由 root 仅建库建表，再创建实例内专用 `po_lastnight_writer_fixture@127.0.0.1`，只授予 `ln_last_night.*` 的 `SELECT/INSERT/UPDATE/DELETE`。Store 在每次连接上核 `CURRENT_USER()` 和 `SHOW GRANTS`；兼容 MariaDB 的单引号/反引号账号表示，拒绝跨库、全局 DML、`GRANT OPTION` 和明文密码形式。
- Store 增加 `renewRunLease`，按 owner、epoch 和未过期租约做条件更新；pipeline 在页面请求前后及 Run 完成前续租。隔离库实测旧 epoch 续租被拒绝；单次请求超 300 秒仍失败关闭。
- 独立 schema 新增 `ln_tasks` 及 Run 的 feed manifest hash；发现 feed、帖子、回复目标时分别持久登记任务，页面写入必须先有任务。`finishRun` 核对全部登记任务有完成页，隔离库实测未完成任务被拒绝。
- 独立子进程提交评论第一页后以退出码 77 异常退出；仅在 43319 测试库中注入租约过期，再用新 Store owner 接管，从持久 `c2` 游标恢复并完成三站 Run 和 AI outbox。
- Store 逐 item 核 source/site/board、评论父帖与半开发布时间窗；缺时间戳、混站/混板、窗外内容均失败关闭。隔离事务注入混站及时间窗上界，游标未推进。

## 验证

- `node --test scripts/lastnight-isolated-db-e2e.test.js worker/test/lastNightIsolatedExecutor.test.js worker/test/lastNightIsolatedPipeline.test.js worker/test/lastNightIsolatedStore.test.js`：7/7 PASS；`npm --workspace worker test`：294/294 PASS。
- `node scripts/lastnight-isolated-db-e2e.js`：非零，`PRODUCTION_EXECUTION_DISABLED`。
- `node scripts/lastnight-isolated-db-e2e.js --isolated`：最小权限账号下 14 条隔离内容、14 个任务、28 个 job/result、三站 Run、事务回滚、混站与窗外拒绝、旧 epoch 拒绝、未完成任务拒绝和跨进程评论游标恢复均 PASS；`serverStopped=true`、`portReleased=true`。`CURRENT_USER=po_lastnight_writer_fixture@127.0.0.1`，`SHOW GRANTS` 2 条，最小权限解析通过；不输出密码或 GRANT 原文。当前原始隔离证据：仓库上级 `.temp/po-closeout-20261008/lastnight-db-e2e-L2js2X/result.json`。先前 root/`isolatedTest` 结果已被此结果取代。
- `git diff --check`、入口语法检查 PASS；未连接 3306，未改共享表、服务、任务或生产配置。

## 冻结 manifest

以下为本次候选 SHA256，独立 QA 只能按完全一致的文件复验；任一文件变化须重出证据。

```text
worker/src/lastNightIsolatedPipeline.js       B94E4FEA3D7F8CC97C9D936F1D4E3439DD6CBF5872F8B18725EABC80604204B4
worker/src/lastNightIsolatedStore.js          DA19E14AFDED0CEF974AC916F43676F8588CF0C0EAC17F864C7EA1942CFDDC75
worker/src/lastNightIsolatedExecutor.js       68960C281FE7E1630EA935E52CC734A89660FFFCC0A696666978A220066594A6
worker/test/lastNightIsolatedPipeline.test.js 02EBFBC072FECBD62CBCFED1ED24CDDEAAADDCEBBD06F80DE3BB569E408E3C31
worker/test/lastNightIsolatedStore.test.js    F9CC00FF8FBD2911DE9851474DE25073C16E7B60E8C90D59E092BA1FD037E44F
worker/test/lastNightIsolatedExecutor.test.js B52F5C1579B79FCA1344CB7259A6CDAF3B7E8EE80ED147261A3F43A9A246EAB0
worker/sql/lastNightIsolatedSchema.sql        7DD04B0606CF638D1A86B7A3876D7F03350D0289CD9B8CCC11CB0FCB47E4BD45
scripts/lastnight-isolated-db-e2e.js          649429F61E57966240EB53E1B71EF5C0E3D1C6146FF9FD9F90B7EFF3F46D3DE0
scripts/lastnight-isolated-db-e2e.test.js     CC78215C9EFDCD8C756F259B65B1ADBD05961EDECF6537DB74030A41129E50FE
scripts/lastnight-isolated-crash-child.js     59692A64F402D07F23457BCB04C62F062879873A185531008BCCE74C001BC9FC
result.json (lastnight-db-e2e-L2js2X)          E65C0435AFE0055A05359336A81663B5D31411838A4AE79889E3761CA313D585
```

## 剩余门禁

本阶段不是生产候选。隔离库最小权限、短请求续租、持久任务账本和一次跨进程崩溃恢复已验证，但生产 3306 专用只读账号/GRANT、长请求续租、真实登录/API、异步真实 AI、后台只读检索及真实规模 P95/P99 均未闭环；本阶段整体 `NO_GO`，不得部署或发版。规模评估见 `v024_lastnight_production_scale_readonly_assessment.md`。
