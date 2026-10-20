# 概览与折线图性能修复

日期：2026-10-20。页面功能回归通过；整体服务健康验收仍有下列告警，不宣称全部完成。

续办更新：Worker 持续心跳修复已发布，连续多轮扫描完成、实际告警查询为空；全新持久化 Chrome 的等待已定位到 Cookie 存储初始化，无登录态自测改为全新内存上下文后首次请求约 29ms 开始。公司托管已打开独立可见 Chrome，仍等待用户 SSO。详细文件、发布包、测试和边界见同目录 `worker-heartbeat-followup-changelog.md`；下面“明确剩余项”保留的是上轮历史基线，不能当作最新运行状态。

## 用户确认与实际操作

- 用户弹窗确认推荐方案，以及短暂停止云端同步调度、取消其已核验长SELECT并恢复。
- 第一次在线索引因metadata lock在5秒退出；仅取消符合同步SQL特征且超过60秒的SELECT（连接7893，当时452秒），未取消写入，未停止采集/分析。
- 第二次在线索引安装80.5秒成功；任务在finally恢复启用，最后核对为Running。未清除同步进度、未手动触发补发。
- 迁移044已写入po_schema_migrations；新增索引保留旧索引，不删除数据。

## 文件与逻辑

- `migrations/044_community_aggregate_cover.sql`：community_id,published_at,source_id,game_id,is_deleted,content_type覆盖索引，ALGORITHM=INPLACE,LOCK=NONE，5秒metadata lock等待。
- `server/src/db/repository.js`：仅概览和趋势在社区范围使用新索引；完整范围、参数、关联和删除过滤不变。
- `server/src/services/feedbackTranslations.js`：纯中文主题无需二次模型翻译；全部命中缓存时不等待其他翻译队列。外文继续原翻译逻辑。
- `../admin/PublicOpinion/assets/baas-auth.js`：重GET共享25秒总预算；超时/504不重复执行；短暂503仍可预算内重试；普通GET保持10秒单次恢复，401/403、非GET与调用者取消边界保持。
- 8个HTML仅更新auth脚本版本为20261020-aggregate-budget-r1。本会话未改首页布局/周报文案或app.js业务逻辑。
- 对应测试：overviewTrend、communityOverviewPerformance、queryCounterPerformance、feedbackTranslations，以及`.tests/2026-10/2026-10-20/aggregate-read-budget.test.cjs`。

## 发布与并行改动保护

- API最终：`E:/CodexData/public-opinion/releases/release-20261020-trend-performance-r3`，从当时最新facebook-browser-api-r1定点叠加，不用工作区整体覆盖。manifest最终443文件校验通过。
- 前端先发布本机trend-performance-r2。随后其他开发会话修改并切换到`E:/CodexData/public-opinion/frontend3001/releases/release-20261020-facebook-single-password-r1`；已确认该包包含本次25秒预算策略、脚本版本，manifest50文件通过，并以该实际现役包重跑浏览器。未反向覆盖其他会话改动。
- 本会话新运行包已收敛LocalService只读权限。保留API/front XML备份及旧包可回滚。r1/r2/r3候选不等于均为现役，以当前XML为准。
- 未推送Git、未推静态托管。公司入口浏览器跳转/login，无SSO态，不视为公司托管功能验收完成。

## 结果

- 25项隔离测试通过；语法与定点空白检查通过。
- 同一只读事务快照中，新旧15天逐日数据完全相同。Hero Clash旧1192ms/新50ms，X-Clash旧408ms/新251ms；内容层EXPLAIN为Using index。
- 浏览器三轮Hero Clash/X-Clash、7/15天及回切成功，15/7个日期点正确，无Console error/warn、无HTTP失败。真实API趋势多轮116–1047ms；概览最终约1秒（上一轮393/1038ms），未截断数据。
- 11秒响应延迟隔离浏览器测试：只发1次，成功出图。它是故障注入，不冒充真实接口耗时。
- localhost/LAN/外网页面、auth脚本、auth/config均200且结构正确；内网受保护业务匿名401保持鉴权。外网业务API真实数据验证通过。
- 浏览器结果与截图：`.tests/2026-10/2026-10-20/trend-performance-browser.json`、`trend-fixed-100002.png`、`trend-fixed-100016.png`。

## 上轮剩余项历史基线（最新处理结果见续办记录）

1. 全新Chrome profile首次整页11–13秒，不能拿接口1秒冒充整页耗时。导航实测首轮fetchStart=0.9ms、domainLookupStart=7313.7ms、requestStart=7336.4ms、responseEnd=7356.2ms；主要额外等待位于连接前。重复导航响应182ms、DOM约2.3秒。同页面curl三层3–75ms；br/gzip/identity外网47–73ms。该全新浏览器连接前等待尚未归因，不擅改系统代理/DNS。
2. Worker模式enabled、间隔60000，现役为其他会话facebook-browser-worker-r1。04:08:01 UTC起runOnce未结束，最后核验心跳年龄533秒，超过2分钟告警阈值，租约仍在续期、catchup running=1。未重启/修改Worker；不能判为整体健康。
3. 后台同步长查询仍可能造成共享数据库波动；本次仅按授权取消一条读查询以完成在线索引，不改变同步任务业务或推送范围。任务恢复Running不等于已证明整轮同步成功。
4. API守护最后healthy、failures=0、recoveries=[]；不把开发重启记作运行期自行崩溃。
