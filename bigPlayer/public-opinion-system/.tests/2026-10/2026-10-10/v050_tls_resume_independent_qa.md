# v050 TLS 热修续跑定向只读核验

日期：2026-10-10；独立采样时间：北京时间 12:19:30。

结论：续跑再次失败，不签三站功能 PASS，不启每日。新日志诊断为 `ER_LOCK_WAIT_TIMEOUT`、stage=`SELECT:po_sources`、connectionId=952，随后进程输出 failed / ER_LOCK_WAIT_TIMEOUT。

该阶段对应 admit 的 loadScope 锁定读取，位于分页调用前；当前源码路径与诊断支持本轮在 admission 阶段阻断，没有新页提交。具体阻塞事务/根因仍待开发确认，不能说已根治。

| 定向核验 | 当前结果 |
|---|---|
| 父与三原 child | 仍 partial / ER_LOCK_WAIT_TIMEOUT，仅三 child |
| site2 | 两页、21 observations/21 changed/21 stored，cursor 仍 pageIndex=3/offsetId=40，done=false |
| site9 / site16 | pages=0、cursor=null、dailyCounts全0、done=false |
| 父统计 | fetched/stored仍21/21，没有新页增加 |
| 旧数据保留 | 86/86旧关联、88/88旧checkpoint逐字段保留 |
| slot文件 | 仍 collecting、末次提交sentRequests=26，不当本轮或最终请求数 |
| 内容/feed | 同上一实跑的43内容、42海外membership可读；不是本轮新增结果 |
| 现有下游 | 所选内容 analysis 47 completed/12 pending、translation 43 pending；仅当前可读状态，不将后台自然变化计为本轮AI实跑通过 |

TLS：经理已安装 patch1791605831784，当前源码在 loadRuntimeEnv 后强制本进程 `NODE_TLS_REJECT_UNAUTHORIZED='1'`。本轮日志没有新的 TLS0 警告；保留的 PID36156 警告属于前轮。由于新轮在 admission 阻断，尚无新 TLS 实际上游请求验证，不能仅凭无警告签 TLS 真实接口通过。

独立只读原件：仓库根 `.temp/qa-v049-daily-handoff-1791605970964.json`；复用定向读取脚本 `v049_daily_handoff_readonly_qa.cjs`，READ ONLY / CONSISTENT SNAPSHOT，rollback，退出码0。与上一已提交结果对照，没有再次触发任务、上游HTTP、收费AI或旧通过用例。

请开发定位 SELECT:po_sources 的真实阻塞；经理保持 Disabled。待修复后仍沿保存的第3页游标续跑，不重抓前两页。
