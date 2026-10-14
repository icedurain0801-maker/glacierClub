# 02:00 国内Worker只读巡检

Status: RUNNING_WITH_DATA / PARTIAL_TAPTAP / COMMUNITY_COVERAGE_NOT_VERIFIED

02:04补充：经理定向SELECT（READ ONLY事务）在DB UTC18:04:39读到e56eebe7为completed_authorized_scope，finished_at18:04:01（北京时间02:04:01），discovered1071/stored856、error_code=null、lease_until=null。大玩家02点run已完成，但stored为运行计数，不证明新增856条或三社区覆盖；原异常/归属待独立只读诊断，整体不升级三社区全部健康。

检查时间：2026-10-10北京时间02:00起，实际数据库读样本02:01—02:05。仅SELECT、information_schema及READ ONLY事务（回滚/关闭自有读连接）；未触发抓取、写业务数据/配置、改账号、重启或停止任何服务。读连接加载现役env，未输出凭据。

## 运行态和02点槽

- XML/进程入口：旧v055 formal1 worker/src/worker.js；PID19584，启动2026-10-08 10:02:27。状态目录仍candidate-staging对应data/state。
- DB时钟UTC2026-10-09 18:01:43 / NOW北京时间2026-10-10 02:01:43。活跃heartbeat worker:LIUFUYI-2-48 last_seen_at UTC18:01:41.677、scan running、scan_error=null；历史其他heartbeat不算现役。
- 国内大玩家source 5c21f78d-5f67-4467-963d-dcdeb5e26cab，enabled=1、周期21600。02点run e56eebe7-1280-42eb-9d39-d5d90da0f3eb，scheduled UTC18:00、started18:01:41；首次读running/0，后续读running/discovered168/stored168/error_code=null/lease_until18:07:51。不能在进行中宣布完成，计数不是新增168条的证明。
- schedule state last_scheduled18:00、next_scheduled UTC次日00:00（北京时间08:00），lease_epoch1736；抽样时lease存在。上一20点槽completed_authorized_scope/discovered12211/stored7796/finished UTC12:17:53。
- TapTap 02点run 61726610-541b-439b-bce7-a26dda7bae84 已partial：discovered600/stored121、finished UTC18:02:34，PARTIAL_SYNC，具体SYNC_PAGE_BUDGET_EXHAUSTED/from200。不是国内大玩家run错误，不能混称Worker全故障；不得在本巡检修TapTap。

## 三社区与内容证据

社区ID：超能世界国服版00000000-0000-0000-0000-000000000101；圣魂纷争8b1f0000000000000000000000000001；我要当老祖8b1f0000000000000000000000000022。

指定三社区sources join仅看到超能大玩家源与TapTap；大玩家po_source_sites仅一个enabled/authorized legacy站点，last_error_code=null。尚不能证明圣魂/老祖独立配置或该共享源覆盖两社区，交开发/QA只读追归属。

强制source_collected索引按国内大玩家source、collected_at>=2026-10-09 16:00:00聚合：201内容行，均归超能；MAX(collected_at)=2026-10-09 20:05:21。最近12行是comment。collected_at与run/heartbeat时间写入口径可能不同，时间解释待确认，不能把该阈值计数直接当北京时间今日新增。两次宽社区/总量聚合超时PROTOCOL_SEQUENCE_TIMEOUT，已结束自有连接，不重试全表扫描；未获得圣魂/老祖今日精确总数，不推断真实上游无数据。

## 后续只读跟踪

本单检查结束后删除一次自动化，交既有10-10-08半小时巡检跟踪e56eebe7终态/lease/入库和三社区归属至08:00，不另建监控。开发/QA仅只读诊断TapTap partial及三社区覆盖/时间口径，不改国内/业务库、不触发抓取；若需修复，提交精确影响方案另决定。生产海外HOLD保持，QA13316结果与国内3306数据分离。
