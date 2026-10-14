# 海外84原件有限入库与幂等重放独立QA

- 日期：2026-10-10（Asia/Shanghai）；角色：测试总监。
- 结论：`BOUNDED_REAL_SAMPLE_IMPORT_PASS`，仅真实原件有限入库、站点关联、保留旧版本及既有重放证据范围。`SCHEDULED_TAKEOVER_NOT_VERIFIED`、`FULL_CHAIN_NOT_VERIFIED`。
- QA仅执行离线审计、网络/数据库禁用guard下聚焦测试和一次精确只读业务库事务；不再次导入、不执行HTTP/AI、不改业务代码/现役服务/DDL/经理待办。

## 原件与独立证据

路径相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/`。

| 证据 | SHA256 |
|---|---|
| `.temp/overseas-real-sample-import-1791602247059.json` | `74ea03253954be84796995095509a96a831806a14f362dab29350971897752b1` |
| `.temp/overseas-real-sample-import-1791602263429.json` | `b71ef8279b34fd1ff4e3f4c486d960e6b78c0aa8aad1d7103f87a3ce760c9790` |
| `.temp/overseas-sample-inventory-20261010.json` | `0bbee37989150d091b4a2704a7972b2ee1b2b1cd91f127c98ab2a2e27a08a921` |
| `.temp/overseas-sample-inventory-after-20261010.json` | `c8e8a9c54ddb7fd2628383c81fa032880e69a3792236ae7c7e0551a5f6d3fe7b` |
| `.temp/qa-v045-sample-import-1791602803698.json`（独立离线核对） | `09469829ff9d08ae4e6dd098fc2fa8bac8642803b0fe80f7335e55c90c65f7c4` |
| `.temp/qa-v045-sample-import-1791602812998.json`（独立业务库snapshot） | `c779bfdf112d0c8205081fd6497accce257e943901916bea343e3d171465c76d` |
| `.temp/qa-v045-import-session-offline-tests-20261010.txt`（9/9） | `208b7fc67671b4f9db358aa4a721585f041e168e198a55d4480a39061b5f8566` |
| `.temp/qa-v045-contract-web-offline-tests-20261010.txt`（10/10） | `3baf61838bc92a1691b6916e9a2729667f7923b6c478accfbded1150f8cf0a33` |

QA脚本 `.tests/2026-10/2026-10-10/v045_sample_import_independent_qa.cjs` SHA `d0bfe765c3de8232a14ee47e5ea8a1f1f95613ab51c156d59486edbf73b09c97`。读取时 `worker/src/overseasSampleImport.js` SHA `22e4db38b743dbdc0d55424c516dc80059dc58355e3957c399eac2ecf95e2f05` 与两收据 implementationSha256 均一致。

## 真实业务库独立核验

独立reader以一条固定连接开启 REPEATABLE READ / CONSISTENT SNAPSHOT / READ ONLY，只执行SELECT白名单；针对固定source的原始20个externalId、其content IDs及3个run IDs查询，不扫描其他来源。SQL trace保存在独立raw中；结束ROLLBACK并释放连接/关闭pool，退出码0。

| 项目 | 独立结果 |
|---|---|
| 内容身份 | 精确20内容、20唯一externalId；source/account/game/community/fingerprint与导入后inventory一致 |
| 首导入 | 两收据与前后inventory证实9new/11old；真实库当前20身份一致 |
| 旧11内容 | id/归属/body_sha256/raw_sha256/fingerprint与导入前完全一致，独立当前SELECT亦匹配 |
| membership | 当前总81，其中21旧关联、60本批`overseas:<site>:100017:home:merged`关联；三站各20，逐条artifact及observation hash匹配 |
| Run | `94ade4d0-7e06-5748-a02c-99a917eb89a4`、`d439570f-787b-5a9f-a0bb-c30984367c53`、`56a73a2f-b067-5ac4-aa13-208f9051a91e`；均partial/manual、operation=sample_import、fullCollection=false、无活租约 |
| run_content | 60关联，每Run20唯一原始externalId、posts范围且source精确匹配 |
| 既有重放 | 收据新增内容/membership/runassoc为0/0/0，确定性run IDs一致；QA不重复执行写入。无另一次独立写重放，结论是核既有真实重放与真实当前状态 |
| 原jobs | 前后开发inventory中的旧15 analysis/11 translation在所选id/content/fingerprint/status/lease/error字段一致；不是所有列零变化证明 |
| 新jobs | 独立snapshot时9new的18个jobs全部retryable、2099-01-01、HOLD，SQL按NOW计算time_claimable=0；之后开发可精确完成其中3组，不能将该snapshot当永久当前状态 |

## 事务与失败边界

源码审查确认：外层事务固定连接，PageStore facade复用同连接且不提前commit；新内容/jobs future hold、三站membership及partial终态Run同次commit可见，不先暴露queued样本Run。旧行不更新正文版本，repairMissingJobs保留同版本既有任务状态。提交未知销毁连接，回滚失败不继续cleanup SQL。

交接称此前两次errno4025/CHECK失败完整回滚；本轮未取得两失败前后完整业务快照，不单独签“所有表零写”或以该叙述证明全库无变。现有源码回滚路径及一个rollback失败销毁连接负例独立通过，不等同历史事故重演。

## 正式session与env=web

`server/src/connectors/overseasBigPlayerSiteSession.js`读取SHA `41be98c2f415a62b37b9de16b1c8b28e2713d8a600cff3838d6b1d80c402d40b`。独立6项session测试+3项sample测试，共9/9通过，guard拒绝计数为空。社区token默认Bearer上下文校板块、不二次login交换；SDK仅显式tokenKind；账号/来源/板块/站点/原token隔离缓存，错误授权不缓存，scope/URL/跨域/预取消负例通过。

contract journal另10/10独立通过，覆盖原样env=web及hash保留、unknown env拒绝、凭据URL/hash/额外字段拒绝与epoch恢复证据。这里只签源码与离线契约兼容，不表示本轮用正式session新发HTTP成功或完整候选已冻结。

第一次以`--test`启框架被guard拒绝child spawn，2项启动失败，无业务测试执行；改为guard下同进程require选定测试后9/9及10/10通过。保留guard，不放开网络/数据库。

## 现役Worker竞争与海外专属排他证据要求

只读进程命令行确认PID19584入口为 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js`，不据PID推断业务库未变。进一步读取实际release源码：

- worker.js SHA `a932a32f55174d1715cfd5eaa36cc57e2668ec03f89d23cae81078bd3030bf75`，1296调用全局recover，1298读取runnable队列。
- workerScanLease.js SHA `d979f62d3474d5aaee523dfa098c9bcd64c366e9a9dd8ef9e12242006cee6df4`，23-32的recover SQL不含source排除，过期running/老queued都可能更新epoch。
- release repository.js SHA `d608c1f12dd894697cf7820702542d29634855acb21e17a1955b3e27c517b65c`，1185 runnable查询所有启用来源的leaf，1242 claim仅检查id/account/status租约；不校海外新私有GET_LOCK。AI与翻译旧claim也按retryable退避判断，支持本次future hold防护。

在不改/不重启国内实例前提下，新GET_LOCK、专属source lease、future leaf retry时间或队列后置过滤，均不足以约束现役全局recover。长期持有行锁会阻塞旧全局UPDATE并可能影响其他来源，不可作为已验隔离方案。强占共享worker_scheduler锁同样可能阻碍国内，不可当海外专属排他。

可提交的替代设计必须证明旧消费者对目标来源所有准入、recover、poll、claim及过期路径均不可见/不可写，且不改变国内扫描与定时；或让海外工作不暴露在旧消费者可恢复/认领的状态域，再给持久任务模型、兼容展示、崩溃恢复及实际slot原件。现有代码尚未证明这种不改国内的完整方案成立；不在此授权新库、DDL或部署变更。

## 待验

真实AI/翻译intent/progress/result已出现，正在请求开发正式hash交接；由独立下一报告核3content/6HTTP、usage、6jobs及实际结果持久化，不重复消费。实际scheduled尚未交付完整排他与slot，继续`FULL_CHAIN_NOT_VERIFIED`。
