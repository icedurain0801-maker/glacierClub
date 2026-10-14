# 统一来源调度：阶段 5A 隔离数据库 E2E

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 5A-0 零数据库 fixture

使用严格 fake connection 组合现有 candidate loader、runtime、repository adapter 与 `runUnifiedSourceSchedulerOnce`。fixture 固定北京时间 02:00 锚点，覆盖单个 BigPlayer Discord 合法来源首次入队、同 slot 第二次 duplicate、授权过期与 capability 不可用两类拒绝原因，并断言 connector/collector 调用为 0、真实数据库命令为 0。未知 SQL 或连接生命周期调用均 fail-closed。

执行结果：`status=PASS`，14 项断言通过，fake query 11 次；首次为 `enqueued`，同 slot 第二次为 `duplicate`，唯一 slot 数量为 1；过期授权返回 `SOURCE_AUTH_EXPIRED`，不可用 capability 返回 `CONNECTOR_CAPABILITY_UNAVAILABLE`；connector、collector 与真实数据库命令均为 0。

测试负责人独立复跑同一 fixture，结论 PASS，并准入后续 5A-1 新 43306 E2E provision。独立报告：`.tests/2026-09/2026-09-09/v010_5a0_zero_db_scheduler_fixture_acceptance.md`。当前仍未创建或连接 5A 数据库，等待项目经理正式派单。

## 5A-1 隔离库 provision 与种子

在 `127.0.0.1:43306` 新建隔离数据库 `public_opinion_023_e2e_7e4ed9f5` 与最小权限账号 `po_e2e_5a_7e4ed9f5@127.0.0.1`。实例身份、server-id、datadir 与 socket 均匹配既定隔离实例。

标准无参数 `server/src/db/migrate.js` 在 120 秒限制内以退出码 0 完成，migration ledger 与仓库实际 20 个 001–018 文件加 023 精确一致，共 21 条；migration 日志 SHA-256 为 `7828df5c96be310fa046377cc6d1d063c44bd6d5a506477733bd3d9f4ac2f807`。

固定种子 SQL SHA-256 为 `c37fc5da3ae0c46521c55621c0996bc3917dfa477833faafc72c8c463ef30145`，事务写入一个 BigPlayer 游戏、一个 Discord 社区、三个来源及其 default account 和 schedule state：

- 合法 `discord` 来源：enabled、source/account authorized 且未过期、86400 秒频率、合法 00:00–03:00 active window。
- 账号过期来源：source authorized，但 default account 在测试锚点前一秒过期。
- capability 后续缺失来源：使用独立 `discord-missing` platform，source/account 均合法，供 5A-2 从 capability map 缺席。

只读核验确认 sources/accounts/schedule states 分别为 3/3/3，scheduled runs 为 0，对象归属关系闭合，schema 权限精确为 `ALTER,CREATE,DELETE,DROP,INDEX,INSERT,REFERENCES,SELECT,UPDATE`。本阶段 `scheduler_invoked=0`、`worker_invoked=0`、`connector_invoked=0`、`collector_invoked=0`，未调用调度或任何外部服务。

测试负责人已对目标身份、21 条迁移 ledger、迁移与种子哈希、三来源归属、scheduled runs、最小权限及零外部调用证据完成独立只读复核，结论 PASS，准入项目经理正式派发的 5A-2。独立验收报告：`.tests/2026-09/2026-09-09/v011_5a1_isolated_e2e_provision_acceptance.md`。

5A-2 前置边界：仅允许在 `127.0.0.1:43306/public_opinion_023_e2e_7e4ed9f5` 调用受控调度 seam；Worker seam 保持关闭，legacy 不切换，不访问 3306，禁止真实 connector 或 collector 调用。当前等待项目经理正式派单，尚未执行 5A-2。

## 5A-2 首次执行（已停止）

项目经理正式派单后创建根临时目录脚本 `.temp/public-opinion-scheduler-5a/e2e-5a2.js`，并先通过 `node --check`。真实连接建立后的身份校验 SQL 在 MariaDB 上失败：`CURRENT_USER() AS current_user` 的别名触发 SQL 语法错误。失败发生在 `runE2E` 调用之前，未执行 scheduler、repository 写操作、Worker、connector 或 collector；按“失败即停”要求未修复、未重跑。失败日志：`.temp/public-opinion-scheduler-5a/e2e-5a2.log`。

项目经理随后派发 5A-2R，仅授权修复身份查询别名并重跑。脚本改为非保留别名 `authenticated_user`；独立只读 identity fixture 验证数据库 `public_opinion_023_e2e_7e4ed9f5`、端口 `43306`、server-id `423309` 全部匹配。完整 5A-2 随后在首次 `runUnifiedSourceSchedulerOnce` 的候选加载阶段返回 `status=failed`，触发 `completed` 断言失败。该阶段尚未进入租约获取或 run 入队，脚本未执行 repository 写操作，也未调用 Worker、connector 或 collector；按“失败即停”再次停止，未继续诊断或重跑。最新失败日志仍为 `.temp/public-opinion-scheduler-5a/e2e-5a2.log`。

## Candidate Loader P0 修复

测试负责人独立只读诊断确认候选 SQL 使用了不存在的 `po_sources.region_code`，而真实字段归属于 `po_games.region_code`；目标隔离库 scheduled run 仍为 0。项目经理正式派单后，先新增 `g.region_code AS region_code` 必须存在且 `s.region_code` 必须缺席的 fake connection SQL 契约，修复前 loader 专项为 `3 passed, 1 failed`。随后仅将生产 SELECT 改为 `g.region_code AS region_code`，候选映射继续使用 `row.region_code`。

修复后 loader 专项为 `4 passed, 0 failed`，2A 至 3A 联合零数据库回归为 `26 passed, 0 failed`。本轮未连接或修改数据库，未重跑 scheduler，未修改迁移、Worker、legacy、3306 或种子；等待独立复核与项目经理后续 5A-2 重跑派单。

测试负责人独立复验 Candidate Loader 字段归属修复 PASS 后，项目经理派发 5A-2RR，仅授权运行既有 `.temp/public-opinion-scheduler-5a/e2e-5a2.js`。脚本通过 identity 与候选加载，但合法来源首次真实入队返回 `status=failed`、`reasonCode=ENQUEUE_FAILED`，未达到预期 `enqueued`，因此按“失败即停”未继续 duplicate、旧 epoch fencing 或额外快照查询。

失败发生在租约获取之后的 enqueue 路径；调度器按既有逻辑已尝试释放租约，但本轮停止后未追加数据库查询，不能将最终数据库状态记为已复核。Worker 未启动，legacy 未切换，未访问 3306，connector/collector 未调用。失败日志：`.temp/public-opinion-scheduler-5a/e2e-5a2.log`。等待项目经理派发只读诊断单。

## Adapter DATETIME(3) P0 修复

测试负责人独立只读诊断确认目标库 run 仍为 0、eligible lease 已释放且 epoch 为 1；enqueue 失败根因为 ISO UTC 字符串直接写入 MariaDB `DATETIME(3)`，strict mode 产生 Warning 1292。项目经理正式派单后，先以 fake connection 建立 ISO 输入到精确 UTC `YYYY-MM-DD HH:mm:ss.SSS` SQL 参数契约，并补充 ENQUEUE_FAILED 脱敏错误证据用例；修复前 adapter/runtime 联合专项为 `8 passed, 5 failed`。

adapter 现已统一规范化 scheduled/window/lease/finalize 的所有时间写入与比较参数，已规范化字符串和 nullable 字段保持兼容；runtime 仅为 ENQUEUE_FAILED decision/evidence 附加受限、脱敏且截断的数据库 error code/message，既有失败隔离不变。子代理审查发现非 URI driver 错误的连接信息脱敏缺口后已补齐。最终联合专项为 `14 passed, 0 failed`，完整调度相关零数据库回归为 `112 passed, 0 failed`。本轮未连接数据库，未修改迁移、Worker、legacy、3306 或种子；等待独立 QA 后再由项目经理派发真实 E2E 重跑。

## 5A-2RRR 最终重跑（已停止）

Adapter P0 独立 QA PASS 后，项目经理派发真实 E2E 重跑。由于前次 enqueue 失败已使 eligible lease epoch 增至 1 且释放，执行前仅将根临时 harness 的预期基线调整为初始 1、首次 2、同槽第二次 3。

真实运行中 identity、candidate load、首次 scheduled 入队、固定 slot、run ID、trigger 与 lease epoch 2 断言均已通过；过期账号来源的 `status=rejected`、`reasonCode=ACCOUNT_AUTH_EXPIRED` 也已通过。随后 harness 断言 rejected decision 的 `runId` 应为 `undefined`，而 runtime 按统一映射返回 `null`，导致断言失败并按门禁立即停止。失败发生在首次有效 lease 的正常释放之前，未执行同槽 duplicate、旧 epoch renew/finalize 或最终快照查询。当前数据库可能已存在 1 条 queued run 且 lease 仍有效，须由后续只读诊断确认；本轮未启动 Worker，未切换 legacy，未访问 3306，connector/collector 未调用。失败日志：`.temp/public-opinion-scheduler-5a/e2e-5a2.log`。

## 5A-2RRR Resume（PASS）

测试负责人独立确认中断快照仅有 run `5a200000-0000-4000-8000-000000000001`，状态 queued；eligible source 的有效 token 为 owner `scheduler-e2e-5a2`、epoch 2。项目经理随后派发阶段化续跑，明确禁止重放 first stage。

根临时 harness 将 rejected decision 的规范 `runId` 断言改为 `null`，并新增 `--resume`：先核验冻结 run/token，再用 epoch 2 正常释放；随后仅调用一次 scheduler，固定 slot `2026-09-08T18:00:00.000Z` 返回 `duplicate / SLOT_ALREADY_EXISTS`，数据库仍唯一一条 run，lease epoch 增至 3 且 duplicate 路径正常释放。使用首次旧 epoch 2 的 renew/finalize 均返回 false，操作前后完整 run/state 快照不变。

过期账号来源稳定返回 `rejected / ACCOUNT_AUTH_EXPIRED`，缺 capability 来源稳定返回 `rejected / CONNECTOR_NOT_FOUND`，两者均无 run。执行证据为 `first_stage_replayed=0`、`scheduled_run_count=1`、`lease_active=0`、`stale_renewed=0`、`stale_finalized=0`、`stale_snapshot_unchanged=1`、`connector_calls=0`、`collector_calls=0`、`worker_started=0`、`legacy_switched=0`、`port_3306_touched=0`。

执行日志 `.temp/public-opinion-scheduler-5a/e2e-5a2.log` SHA-256 为 `C01CFDD13F624E8D300663F4974E52DCE88E466C438BF38AF2662294FC1F23AA`。随后 `--verify-only` 复核 PASS：读取 2 次、写入 0 次，run 仍唯一、epoch 3、无活动 lease、connector/collector 为 0；只读日志 `.temp/public-opinion-scheduler-5a/e2e-5a2-verify.log` SHA-256 为 `8C0768E29FA8A90C211FD6788C24621FC7AE4CBD9DD564C6E327E8A6BA314D79`。当前等待测试负责人最终独立复验。

测试负责人最终独立只读验收结论 PASS：唯一 queued scheduled run 保持不变；eligible source epoch 为 3 且无活动 lease；两个 rejected 来源均无 run、epoch 为 0；旧 epoch fencing 日志通过；verify-only 为 read 2 / write 0；外部调用、Worker、legacy 与 3306 访问均为 0；目标进程、事务及锁等待均为 0。验收报告：`.tests/2026-09/2026-09-09/v017_5a2rrr_resume_final_acceptance.md`。
