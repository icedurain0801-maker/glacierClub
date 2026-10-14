# v049 热修后实际运行定向只读核验

日期：2026-10-10；采样时间：北京时间 12:16:06。结论：本次 partial，不签完整功能 PASS、不签 TLS 正常，不启每日。

| 核验项 | 独立结果 |
|---|---|
| 实际退出日志 | `ER_LOCK_WAIT_TIMEOUT`；日志存在本次 PID36156 的 `NODE_TLS_REJECT_UNAUTHORIZED=0` 警告 |
| 数据库终态 | parent 与三 child 均 partial / ER_LOCK_WAIT_TIMEOUT；不是旧 completed_authorized_scope 成功 |
| 子任务身份 | 沿用原三个 child IDs，parent 下仅三 child，没有另建额外六子 |
| 旧关联 | 私有 handoff 原件 86 行与当前行逐字段一致：7a9/daf 各 21 posts + 22 comments |
| 旧 checkpoint | 私有 handoff 原件 88 行与当前行逐字段一致 |
| site2 本次提交 | receipt.pages=2、done=false；dailyCounts observations=21/inserted=0/changed=21/unchanged=0/stored=21 |
| site9 / site16 | receipt.pages=0、cursor=null、done=false；dailyCounts 全0，不能使用保留的旧 fetched/stored 计数当本次结果 |
| 父统计 | fetched=21、stored=21，仅本次 dailyCounts，不含旧两站计数 |
| 续跑游标 | site2 merged cursor 指向 pageIndex=3/offsetId=40，pagesFetched=2、timeOrderVerified=false；不证明完整回溯 |
| 正式 slot 文件 | 仍 collecting，sentRequests=26、lastCommittedSite=site2、lastCommittedPages=2；26 是末次页提交时保存值，不冒充最终 HTTP 总数 |

site2 本次 21 条 posts 关联及正文/raw_payload 可读，均归 source `081a16d2-5545-4afd-9c65-e04777e4540b`、account `75c8205f-37eb-4bdf-b6a4-f4f502e35658`、game `00000000-0000-0000-0000-000000000002`、Last Light community `00000000-0000-0000-0000-000000000102`。本次 merged feed membership 21 条，feed_metadata 为 endpointKind=merged、boardId=100017、languageId=2、正确 siteId。真实调用已取得并提交数据；独立证据为收据/持久 feed 元数据与内容，不是重新发送上游 HTTP，也不是逐请求完整网络日志。另两语言站未提交新页，不签三站实际接口完整通过。

所选 43 条旧/本次关联内容的现有下游任务可读：analysis 45 completed/2 running/11 pending（包含不同 profile，不能当本次新增完成数）；translation 43 pending。此处仅证明当前任务状态可读取，不签本轮 AI/翻译完成，也不触发或重复收费 AI。

正式私有交接原件：`C:/ProgramData/PublicOpinion/overseas-daily/state/legacy-handoff-1791605644811-b8d4ebd6-15e2-419c-9d1c-9fd74576e47f.json`。

独立只读快照：仓库根 `.temp/qa-v049-daily-handoff-1791605766334.json`；脚本：本目录 `v049_daily_handoff_readonly_qa.cjs`。固定连接 READ ONLY / CONSISTENT SNAPSHOT，查询结束 rollback，退出码0。仅新增 QA 文件，不改业务代码，不触发任务、上游 HTTP 或 AI，不复跑 v045–v047。

交接：经理已设置 STOP、任务保持 Disabled。待仅海外 TLS 修复、排空及经理归档 STOP 后，由经理沿既定 receipt cursor 继续；不重复已提交两页。锁等待具体语句/阻塞者待开发确认，不从错误码推测根因。
