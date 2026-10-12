# v060 海外 v072 producer overlay 独立定向 QA

日期：2026-10-10。结论：PASS_INDEPENDENT_ISOLATED_OVERSEAS_PARTIAL_SCOPE。16 个独立执行场景通过，生产继续 HOLD。只验本次海外页事务直接受影响范围，不签海外全恢复、翻译闭环或生产DDL。

## 冻结身份与方法

完整候选仓库根 `.temp/risk-normalization-20261010/candidate-overseas-current-intent-v072/`，manifest SHA256 `da01a9d8779ac8f3d9999a977c295cd6a976d55e40c1083286fa040768121c19`。独立逐文件核409文件，执行前后均匹配；manifest中3改基底+5新增依赖、2schema与交接一致。安装基底manifest SHA `02996c9d1522a849266822314d57e9b9d38d6eaf5bfbcb9ad56125202331035e`为冻结引用，不构成loaded进程证明。

schema001 SHA `0475046d63a3f1f7ecf7f87541a72f0484f2373258ddb934eeb569114d99a1de`；schema002 SHA `4d93e759fb949003788ca1250aecd2badb731a47aa7f098960123f3ea8109953`。只在fresh SQL执行，共4张additive InnoDB表。modern/legacy fixture差异单独在QA库构造，与冻结schema及生产DDL区分。

QA脚本：`.tests/2026-10/2026-10-10/v060_overseas_intent_independent_sql.cjs`；隔离工具副本仓库根`.temp/qa-v060-harness/`。复用已审阅初始化、合成fixture、锁观察工具，QA自行写断言，自建实例并直接载入完整冻结runtime。实际函数为 daily.commitPage + fused Repository + worker/src/overseasBigPlayerPageJobs.js；没有复制安装目录或拿8文件员工partial包替代完整候选。

已读v071/v073、开发19case及新增collectSite证据，仅作复现背景，不算QA通过。没有重跑v060风险规则、v065来源、v066/v069旧矩阵，不新增consumer/翻译/Q1功能审查。

## 本轮新增/直接受影响验证点

| QA case | 实际断言 | 结果 |
|---|---|---|
| 1 | legacy无board列 actual页写：外层仅1真实连接、begin1/commit1；SELECT锁suffix一次；正文、intent、分析/翻译队列、membership、run关联、receipt提交，父run仍原owner/running | PASS |
| 2 | modern board_key/id/name及source/account/community保留、现有锁suffix不重复、外层唯一conn | PASS |
| 3 | F2/F1live：旧owner/lease/F1保留，F2与intent持久；重复F2不换generation；同owner仅lease_until/updated_at刷新，proof审计记录差异，intent未ACK、未占成功audit | PASS |
| 4 | 同F2旧job owner/attempts/marker/keywords/retry/completed身份变化逐项拒绝defer，整个page状态零变化 | PASS |
| 5 | capture禁用/范围外、force、manual Q1、NULLowner不能凭空获得proof，明确拒绝且整页回滚 | PASS |
| 6 | translation旧F1active与历史F1marker分别明确拒绝，正文/intent/proof/queue/关联/receipt全部回滚 | PASS拒绝边界 |
| 7 | board、上界exclusive/下界inclusive、siteURLSHA、已有account归属围栏保持 | PASS |
| 8 | detail_enriched正文不被summary_fallback或recoveryContextAncestor覆盖，现有正文指纹/队列/会员关联保持 | PASS，非全祖先矩阵 |
| 9 | proof audit实际INSERT权限拒绝，expected snapshot/body/proof/关联/receipt整页回滚 | PASS |
| 10 | 分析/翻译queue实际权限错误及receipt真实SQL id=NULL触NOT NULL约束失败，整页回滚 | PASS |
| 11 | 实际SQL KILL页conn，在proof后receipt前中止，所有表回滚 | PASS |
| 12 | actual collectSite+词法retry helper，真实source锁timeout有engine原件；rollbackAcknowledged后同已fetch页面唯一重试，fetch1/attempt2/queue1 | PASS |
| 13 | actual conn.commit真实成功，wrapper模拟ACK返回错误：COMMIT_UNKNOWN、destroy、不重复commit、不推进memory receipt；DBreceipt已page1/done，旧receipt再入被fence拒绝 | PASS模拟ACK边界 |
| 14 | F2/F3代次持久；旧receipt不能误写/确认新generation，正确receipt重观察F3不重复job或generation，不ACK分析 | PASS |
| 15 | sameFcompleted缺analysis仍沿旧PageJobs skip；默认capture/defer disabled时safe enqueue的活跃guard仍生效 | PASS现状边界，非缺analysis闭环 |
| 16 | 两schema只CREATE新增表，无ALTER/DROP/TRUNCATE；第四表列为身份前后job JSON，无正文/凭据/成功ACK字段 | PASS |

本轮使用实际SQL函数入口，不使用mock SQL返回代替。collectSite fake connector不发HTTP；词法retry导出只在VM加载冻结原文并附加导出，不改文件、不执行main。ACK返回异常是wrapper模拟，不是真实网络丢包。没有运行app HTTP服务器或把函数验证写成已验生产API。

## 原件与收尾

最终原件：仓库根`.temp/qa-v060-overseas-WHny4J/result.json`，16/16 PASS、exit0；锁证据 `qa_daily_retry_source_lock.engine.txt`，真实等待/阻塞线程及po_source_schedule_state记录锁。SQL端口61685、serverId20261081，fresh-owned身份核对后SHUTDOWN，serverStopped/portReleased=true；另查端口无监听。

首次原件：`.temp/qa-v060-overseas-v2QtHu/result.json`，QA组装脚本漏fixture初始化，ReferenceError h is not defined，0case执行；不是候选功能FAIL。端口61354已核身份shutdown释放，原件保留。修正QA脚本后执行一次完整新增范围，未重复已PASScase。

每轮只创建仓库根.temp的fresh datadir，mysqld显式--no-defaults、event-scheduler=OFF、127.0.0.1绑定、仅fixture表CRUD账号，运行配置仅自建fixture.env，external fetch禁止。未读production.env、未操作生产DB/服务/计划任务、无真实HTTP/AI/采集/通知，未重抓三站。未改业务代码或经理待办，未push/发版，未删原件。语法/空白检查通过。

## 沿用证据、未测范围与回退

沿用旧风险规则、来源及v066/v069已过结论作为背景，本报告不给它们新增覆盖；海外producer结果独立签署。此前三站抓取记录不作为本候选loaded writer证据。

明确未做：全祖先结构/父任务finish聚合回归、所有JOB_FIELDS组合、锁内affectedRows0、后续consumer回放与board/site/date身份、翻译延期/consumer、manualNULL/过期orphan修复、sameFcompleted缺analysis修复、requestId持久幂等、历史独立lane、自动业务日期窗、现役loaded producer/consumer/Q1、translation ACL、实时通知窗口、生产schema与名单、真实定时抓取。它们不因本partial PASS而关闭，也不扩成新测试阻断。

第四表proof不确认分析结果、不占intent成功ACK。MariaDB DDL不随业务事务回滚；关闭开关不撤销无条件safe enqueue守卫，退旧包停止捕获/回放但须保留四表及未消费账本，不执行DROP/自动回退。生产DDL、切换与回退门禁仍由经理控制。翻译active的整页rollback与no consumer wiring使本结果不能称海外全恢复。
