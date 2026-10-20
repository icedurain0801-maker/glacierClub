# 全社区三页加载优化（阶段记录）

Status: completed-local。用户于2026-10-20明确托管回归移至后续静态托管提交时；本次验收范围为本机全部可见社区。不是静态托管发布记录。

## 已发布

- API：release-20261020-all-community-load-api-r3，由当时最新facebook-images-api-r1定点叠加，保留现役其他功能。API包446文件校验通过。
- 云同步：release-20261020-change-clock-query-r1，保留原entry、投影器、元数据同步，仅替换syncChanged。三个变化时间覆盖索引已安装（046）；筛选干跑106–209ms，旧小批方案435196ms。全部已导入ID范围不变，取各内容最大变化时间后全局排序，成功云写才推进游标。
- 钉钉：release-20261020-member-index-dingtalk-r1，只替换通知关联查询；Worker包428文件校验通过。今天/昨天补推窗口、回执去重不变；未手动发送、未清进度。
- 只读筛选允许前端已有X、Lounge选项返回合法空态，创建采集源和认证准入未放宽。

## 文件与逻辑

- server/src/db/repository.js：列表先选分页ID；筛选阶段使用分析覆盖索引，只有urgent审核分支读取分析JSON；优质内容按社区/date驱动并预分页。
- server/src/app.js：只读平台过滤与sources/content/stats/quality保持一致，不修改写入平台准入。
- worker/src/baasLiveWriter.js：三时钟覆盖索引读取、跟踪ID过滤、最大时钟合并、确认后水位推进。
- worker/src/collectionDingTalk.js：UNION成员查询先定run/parent，再关联四百余万行关联表，保留内容范围和发送窗口。
- migrations/046_sync_change_clock_cover.sql：已安装。
- migrations/047_page_comment_cover.sql、server/test/pageCommentCounts.test.js：下一阶段候选，未安装/未发布。

## 验证

- 定向测试60/60通过；后续评论及质量/推送组合62/62通过。另分页、计数、概览、评论组合19/19通过。非全量npm test。
- 只读一致性对照：普通、urgent、attention列表与树列表ID一致；普通树列表2750→11ms、关注列表895→10ms。优质列表435→18ms，同ID；质量计数51→14ms（当前脚本首轮只对row ID，最终计数值还须扩展比较）。
- 浏览器产物：.tests/2026-10/2026-10-20/all-community-load-browser.json，14个可见社区×三页42用例通过功能检查，含日期、可翻页社区第二页、优质内容页、境内/境外平台空态、邻社区切换。两个列表页并发。
- 性能未通过：r3最慢首屏18212ms，最慢日期切换9358ms；不能把功能通过视为性能达标。
- 公司托管独立Chrome跳/login；MCP浏览器Transport closed，未访问/导出用户现有登录凭据，托管回归未完成。

## 当前运行安全状态

- API/Worker均Running；云同步和钉钉调度恢复原计划。云同步曾确认成功执行，维护时被取消旧读产生ER_QUERY_INTERRUPTED随后已成功恢复。
- 索引047建表元数据锁等待，主动取消自己DDL，未取消写入。当前新索引不存在；r4候选包不得发布。等待用户允许取消核验概览主题/Worker候选长SELECT后重新安装；不清队列、采集不停止。
- 前端未修改/推送静态托管。

## 最终结果（覆盖上述阶段状态）

- 现役API为release-20261020-all-community-load-api-r4，定点叠加社区分页覆盖索引、每页一次评论计数汇总及简单日期统计单聚合。只读取本页帖子ID的评论，保留本地评论与远程engagement的较大值、顶层/回复深度规则及原字符串总数类型。
- 047两个索引已成功安装（4386ms、2354ms），计划任务finally恢复；重试时原长读已结束，没有取消Worker或概览SELECT，没有取消写入。
- 新旧普通/urgent/attention列表、树列表ID及评论字段（值与类型）对照一致；80/80定向测试通过，语法与git diff --check通过。
- 两轮本机浏览器回归完成。最终14社区×三页42/42通过，另56平台切换通过；页面异常和HTTP错误均0，翻页确认实际显示第2页。
- 最终复测最大值：首屏1572ms（内容1572ms、通知952ms、概览1226ms），日期切换949ms，翻页1016ms，切社区223ms，优质内容400ms。首次完整回归最慢概览5067ms；复测不代表永久保证，保留实际第一轮波动证据。
- API/Worker均Running，两个调度Ready；云同步LastTaskResult=0、最近status=success。未新增手动补发、未清同步进度，前端未推静态托管。
- 最终浏览器结果：.tests/2026-10/2026-10-20/all-community-load-browser.json；截图all-community-3-content.png等。公司页独立测试浏览器缺登录态；用户明确本次无需测试，后续提交静态托管时一起验证。未启动新的可见登录窗口。
