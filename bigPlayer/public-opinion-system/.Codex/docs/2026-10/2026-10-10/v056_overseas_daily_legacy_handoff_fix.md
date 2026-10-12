# 海外生产定时实际失败与最小交接修复

Status: deployed; actual collection QA PASS; daily enabled

## 实际问题

原最终包 Switch 启动共享排除 Worker、海外 preflight 成功，但 Set-ScheduledTask 更新原 InteractiveToken 用户任务时报“未指定的错误”。实际 Windows PowerShell 执行没有中止，却输出 APPLIED。经理已按原 TaskScheduler COM Definition 仅修改 Actions 和 Enabled=false，保持 principal/trigger，再唯一触发原任务。

实际 2026-10-10 北京时间 12:08 RunOnce 的 LastResult=1，daily.log 报 OVERSEAS_PRODUCTION_LEGACY_CHILDREN_REQUIRE_HANDOFF。intent 是北京时间 10/10 02:00，窗口 10/9 00:00–10/10 00:00。失败在 admit 的首个业务 INSERT/UPDATE 前，后续 HTTP/commitPage 尚不可达，不能签抓取成功。

原 parent `3653d4a7-b000-44ee-b60e-0be88f80efa0` 为 queued、epoch0、attempt0。其已存在三个旧随机 ID 子任务，两个 completed_authorized_scope 已有各 21 条 posts、22 条 comments 关联；另一条 failed/SYNC_RUN_POISONED。三子无 owner/lease，source 旧 lease 已过期、海外命名锁为空。之前只确认 parent 活动集合，漏查其历史终态 children，是此次迁移交接未覆盖的实际原因。

## 修改逻辑

- `worker/src/overseasProductionDaily.js`：只对上述固定 parent、固定 slot、三条精确 child/site/status/epoch 允许交接，不放宽任意遗留任务。事务锁定配置、source state、parent、children，确认无活 lease、无其他活动消费者。在任何 Run 写入前，将原 rows、本窗口 88 条 checkpoint 和 86 条关联 fsync 保存于现有 ProgramData 私有 state。
- 复用原三条 child ID；保留原内容、关联、计数和所有旧 checkpoint/cursor。独立 merged feed 的 cursor 不同于旧分 feed，建立新生产 receipt cursor=null、done=false；旧 completed_authorized_scope 不作为新日期窗口成功证据。
- 每页与内容、membership、jobs 同一事务更新 receipt.dailyCounts。父任务聚合本次 dailyCounts，避免旧 run_contents 去重导致计数为零或把旧结果冒称新结果。后续恢复读取已提交 receipt，不重复初始化交接。
- `scripts/overseas-production-switch.ps1`：使用原 TaskScheduler COM Definition 修改 Action，保持 InteractiveToken principal 和 trigger，重新读取 action 验证准确/Disabled 后才报成功。新增 UpdateDaily，确认原任务 Disabled/nonRunning、海外锁为空，仅复制新独立 release 和更新 task action，不停止/重启共享 Worker。
- `scripts/prepare-overseas-production-patch.js`：只准备独立消费者新不可变包，沿用已经运行的五文件排除 release；不是再次 Switch。

## 经理唯一执行入口

最终热修包：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-production-patch-1791605589877`。

```powershell
$package = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-production-patch-1791605589877'
$switch = Join-Path $package 'overseas-production-switch.ps1'
& $switch -PackageRoot $package -Mode UpdateDaily
# 仅经理在安装成功后按已批准边界唯一触发：
& $switch -PackageRoot $package -Mode RunOnce
# 独立 QA 实际功能通过后，经理才启用日常：
& $switch -PackageRoot $package -Mode EnableDaily
```

不重复 Switch、不运行旧 launcher、不单独触发 AI、不改共享 env/ACL、不做 DDL/删数据。

## 验证与剩余

修改后消费者/打包脚本 JS syntax PASS，PowerShell parser PASS。目标日期 checkpoint 只读聚合确认 88 条均终态、无租约、cursor 空；未写生产、发 HTTP 或付费 AI。旧入库、3 内容 AI/翻译、六社区 UI 的已通过验收不复跑。

经理安装后需要实际原任务抓取、三站 feed/语言归属、生产内容与现有下游可读的独立一次功能验收；partial 不记 completed。共享新 Worker 切换后扫描心跳正常且 scan_error=null，无切换后新错误；尚无切换后国内新采集 Run，因此只确认扫描恢复，不冒称国内采集 E2E 已验。

## 后续实际运行：TLS 与锁等待

经理唯一 UpdateDaily/RunOnce 后，handoff 已成功，snapshot 实际持久保存。首站两页提交成功，receipt.dailyCounts 为 observations21/changed21/stored21；其余两站 pages0。之后报 ER_LOCK_WAIT_TIMEOUT，父子均 partial、owner/lease 空、命名锁空；已提交 cursor 保留。不能称三站同步完成。

同时海外独立进程继承了 NODE_TLS_REJECT_UNAUTHORIZED=0。经理写 STOP 阻止新请求并保留断点，不 kill/重启共享实例。开发新增 loadRuntimeEnv 后进程内强制 NODE_TLS_REJECT_UNAUTHORIZED=1，沿用已验 small-batch 模式，不修改共享 env。

实际锁失败后原阻塞已消失，MariaDB performance_schema=0、历史为空，因此确切失败 SQL 和 blocker 归属待确认。新增仅 verb/table/connectionId 的事务锁错误记录，不打印 SQL 值。页事务明确 rollback 的 ER_LOCK_WAIT_TIMEOUT/ER_LOCK_DEADLOCK 最多两次退避提交同一内存页，不重复 HTTP、不提高原 3 秒锁超时，不重试 COMMIT_UNKNOWN。

TLS/锁恢复最终包：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-production-patch-1791605831784`，基于已装交接包，仅独立 daily release 更新。经理独占 UpdateDaily、核排空后归档 STOP、受控续跑；开发未安装或触发。当前仍无完整三站实际 PASS。

该包实跑在 admit 首个 loadScope 报 transaction_lock_error：SELECT:po_sources、connection952；未进入新 HTTP、无新页提交，独立 v050 确认 cursor 和旧记录保留。具体 blocker 在只读检查前已退出，不能事后断言其身份。loadScope 只核验配置，却以联表 FOR UPDATE 对 source/game/community、account、sites 取排他锁。最小修订改为 LOCK IN SHARE MODE，仍在事务中阻止配置变化，允许其他共享读取；source state/Run owner/epoch fencing 继续 FOR UPDATE。

另外只有 rollback 明确返回成功才标记 rollbackAcknowledged 允许页重试；rollback 失败销毁连接、改 OVERSEAS_PRODUCTION_ROLLBACK_FAILED 并终止，不沿用 lock code 重试。

配置锁与 rollback ACK 修订最终包：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-production-patch-1791605997752`。已交经理核排空后仅 UpdateDaily/续跑，不追加共享重启。TLS 请求实际验证及三站完成仍待此次真实运行。

经理安装并唯一续跑后，实际 daily.log 最终返回 completed、children3、observations63、sentRequests70、aiExecuted=false；slot 已 completed。sentRequests70 是本次续跑进程计数，不代表整个故障历史总请求数。三站最终页数以 DB receipt 为准，slot lastCommitted 字段仅过程提示。独立 QA 收口和经理 EnableDaily 待实际确认，开发未执行启用。

## 最终开发交接

独立 v051 实际功能 PASS：三站各7页/done=true，各21次观察，合计63次观察、21条不同帖子，insert0/changed21。语言归属、入库、既有下游任务接线与可读性通过，旧86关联/88checkpoint保留。经理已 EnableDaily：Enabled=true/Ready/LastResult0，下次上海时间2026-10-11 02:00，action 指向最终独立 release1791605997752。开发未执行服务/任务操作。

实际运行release已只读确认包含 TLS1、配置共享读锁、rollback ACK 才可重试。下一日跳过 completed 旧slot，创建新slot；未为此追加HTTP测试。国内当前扫描心跳正常，未扩称切换后国内采集端到端已验。

21条目标翻译仍 pending/attempt0，不称执行完成。现役 TranslationWorker wrapper14372/node20056 Running，启动日志明确 dailyCallLimit5000/batchSize5，XML从既有共享 env 加载。只读采样间UTC当日调用账3402→3414，五条任务completed、最新2026-10-10 12:30:09；现役继续消费较早积压任务，非无消费者或当前预算耗尽。队列pending约10612，目标等待异步调度；旧priority已completed。未新增消费者、未触发全表/精确AI、未重启或改ACL。当前管理员读取旧translation-release源码Access denied不代表LocalService运行失败，结论由实际进程/启动日志/队列推进支持。若要改变21任务优先级，会影响其他海外积压排序，当前未实施。
