# Last Light 日期风险列表504修复发布

Status: 已发布本机现役，Chrome真实页面验收通过。

## 问题与修复

Last Light昨日概览中的关注级、紧急告警列表请求最终504。API补齐canonical gameId后，实际帖子/评论走listContentTree，MariaDB从来源表驱动，按采集时间索引扫描历史内容，再筛发布时间、风险并排序。初次只修改listContents未覆盖实际树查询，r2补齐后重新验收。

server/src/db/repository.js对有发布时间范围的列表优先使用已有scope/time索引；listContentTree日期列表使用STRAIGHT_JOIN与FORCE INDEX固定contents先驱动。详情ID查询、小范围任务查询和无日期路径保留原行为，不修改风险等级、翻译、评论计数、分页或权限过滤。没有新增数据库结构。

## 发布

- 用户授权：修复然后发布，不上静态托管。
- 现役API：release-20261019-risk-list-date-r2。
- 最终运行包仅修改server/src/db/repository.js及相应manifest；从原现役逐级构建，保留其他未发布工作区改动隔离。
- repository SHA256：77f7aba08165dd44c8e066131ba30f20739f12570bcfeb41c6000a0adafd3503。
- API服务Running，进程命令行指向r2，health返回200。
- 只重启API；未发布BaaS、未推Git、未发送通知。

## 验证

- riskListDatePerformance与queryCounterPerformance共12项通过；语法、空白检查通过。
- 434文件运行包清单通过。
- 包含canonical gameId的真实仓储查询：索引预计扫描约145条，关注/负面查询分别3ms、2ms；原树路径约130ms、129ms（热缓存，仅说明数据库对比，不等于原504端到端时长）。返回ID与数量一致。
- Chrome实际登录后重新加载Last Light昨日：关注帖子200/490ms、紧急区域帖子200/142ms；关注评论200/274ms、紧急区域评论200/130ms。实际DOM已显示内容或正常空结果，没有停留加载中。
- Chrome控制台0 errors、0 warnings；议题图正常。
- 证据：.tests/2026-10/2026-10-19/risk-list-r2-all-tabs.json、risk-list-r2-all-network.txt、risk-list-r2-attention.png、risk-list-r2-negative.png。

## 回退与边界

原现役release-20261019-content-counter-r1和中间r1均保留；服务XML原始备份在仓库根.temp/playwright-mcp-connect/PublicOpinionApi-before-risk-list.xml。回退须正常停止API，恢复核对后的XML并重启、检查health。

本次验证覆盖发生故障的Last Light昨日帖子/评论路径，不宣称所有社区所有接口完成全量验收。/admin/PublicOpinion/目录404为另行记录事项，本次未修改；实际概览入口为/。
