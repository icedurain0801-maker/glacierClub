# 候选17 manual 冻结 QA：全量离线命令安全阻断

Status: `PREHASH_875_MATCH / STARTUP_1_PASS / OFFLINE_NOT_RUN_UNSAFE_TARGET / SQL_NOT_RUN / RUNTIME_NO_GO`
Owner: 测试负责人
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate17-manual-u6AIuO`
Handoff: `.Codex/docs/2026-10/2026-10-09/v107_overseas_manual_candidate17_final_qa_handoff.md`

## 结论

清单全量`--test`会包含真实数据库集成用例 `server/test/app.routes.test.js`。其连接目标未限制为新自有合成13316实例，默认可连127.0.0.1:3306的`public_opinion_test`；当前任务禁止对3306任何库写入。因此QA未执行全量`--test`，也未启动隔离SQL脚本。开发报告的1161/1161、19主项/15矩阵及原始哈希仅属开发证据，不能记作候选17独立PASS。

## 已执行的安全检查

- 独立`Get-FileHash`确认`manual-freeze-manifest.json` SHA256为`4d6b0ffc24adcca7d3cf5e67262c56a882acb26face3a7e52782031e0e30279e`；冻结`--verify`返回875项。875项逐文件/两条workspace junction前后哈希均匹配，链接仅指向本快照`server`/`worker`，无额外reparse point。
- 开发原始`offline-raw-1791543181905.txt`及`overseas-real-db-MScMNW/result.json`的SHA分别匹配交接的`bb4ee59400e652181d028ebf5a0e784fe77cfc12ae78c59b5cb0d43028750f89`、`5e3f6226c970353fc9ea60ebbd65542dbba2886e4eabe7bf9f2cec9cadd785ac`；哈希只证明原件一致，不证明安全或独立结果。
- 开发原始离线输出的`app.routes` CORS测试（第291行）及删除源测试（第724行）均为`ok`，汇总1161/1161、0 fail；结合源码的`before` DDL/DML，这支持测试库写入流程在开发复跑中成功执行过。raw未记录实际DB host/port/server_id/datadir/PID，不能定位实例，也无证据断言`public_opinion`业务库发生修改。
- 额外零副作用startup用例仅在本进程设置`PO_ISOLATED_CANDIDATE_ROOT`后独立运行，`1/1 PASS`、exit 0。它拦截DB、外部I/O、listen和timer，不代表全量测试安全。
- 13316测试前后均无监听；3306/PID5900、3001/PID19768、Worker PID19584及三个启动时间前后相同。QA未连接生产DB、未运行DDL/DELETE、未起新数据库或服务。

## 精确安全缺陷

1. `scripts/freeze-overseas-manual-candidate.js`的`testFiles()`收集所有server测试（仅排除v019及外部UI契约）；`test()`以继承环境的Node子进程运行，不设置独立DB地址/库身份门禁。`app.routes.test.js`被纳入143个文件。
2. `app.routes.test.js`在加载时调用`runtimeEnv.loadRuntimeEnv()`：服务模式可读取`PUBLIC_OPINION_ENV_FILE`指定文件，非服务模式读取快照`server/.env`（如存在）；该文件是否在开发运行时存在、外部环境具体值均待开发脱敏证据，不据此猜实际连接。
3. 测试将`DB_NAME`设为`public_opinion_test`；有`DATABASE_URL`时保留其中host/port/user并仅覆盖URL pathname；无URL时采用`DB_HOST`或127.0.0.1、`DB_PORT`或3306。`Repository`构造时URL优先，否则同样默认3306。测试`before`先`SELECT DATABASE()`核库名，却未核端口、server_id、datadir或自有PID。
4. 库名检查后执行多张表`CREATE TABLE`、`ALTER TABLE`、`CREATE INDEX`，以及`INSERT`、`UPDATE`和按固定ID/前缀的`DELETE`；`after`清理也包含多表删除。直接SQL未见`CREATE/DROP DATABASE`、`USE`或显式跨库限定名，但不能据此保证连接权限、触发器或其他模块无跨库影响。尤其清理固定ID/前缀可能碰既有测试库行。
5. `sourceDetailRoute`、`syncRunRouteCompatibility`等HTTP路由测试使用stub repo且监听随机本机端口；`lastNightBoundedRuntime`、`lastNightAuthorizationCheck`、`lastNightOverseasDailyJob`的已审子进程是缺计划拒绝/明确禁生产/干跑。针对143文件的定向搜索未发现第二个与`app.routes`同样直接执行DDL的用例，但动态导入和整个执行图未获独立安全证明，不能作为全量放行依据。

## 阶段矩阵

| v081验收项 | 候选17独立状态 |
|---|---|
| 外部锚/875冻结文件/仅两条限定junction | PASS |
| 额外startup无DB/外部I/O/监听/定时器 | PASS（仅此测试） |
| 清单精确全量离线1161项 | BLOCKED_UNSAFE_TARGET；未执行 |
| manual实际入口、账本、audit、recovery、预算/并发、非目标SQL、scheduled拒启的fresh隔离SQL | NOT_TESTED；安全门禁阻断后未启动 |
| 后哈希、13316及生产进程连续性 | PASS（未执行全量/SQL前提下） |
| scheduled完整父子/slot链及真实上游/异步/生产迁移 | NOT_IMPLEMENTED/NOT_TESTED；不属于manual局部PASS |

## 退回条件

开发负责人先提供开发自测的脱敏目标证据（实际host、port、server_id、`DATABASE()`、datadir/PID及环境来源；不打印secret），供QA只读评估是否曾触3306/`public_opinion_test`/`public_opinion`。在身份未明前不连接、清理、回滚或重跑旧测试。新冻结包须在测试入口硬拒绝非自有隔离目标并提供拒绝测试，或明确排除该集成用例并标`NOT_TESTED`，不把减少的总数伪作全覆盖。旧包与失败原件保留。QA只在新清单安全审查通过后独立复跑；真实采集和生产始终`RUNTIME_NO_GO`。
