# 每日口碑走势缓存及查询优化

Status: released

- 前端按北京时间日期、社区范围、平台、7/30天范围缓存5分钟，内存及sessionStorage复用；反复切换、同一标签页刷新不再请求已加载数据。
- 同范围未完成请求复用，切换范围不取消后重复提交。社区变更使用scope epoch隔离未完成请求；旧结果不能覆盖当前图。
- 缓存到期按数据快照时间计算，避免前后端TTL叠加造成10分钟陈旧；跨北京时间自然日使用新键。
- 服务端按规范社区范围、来源、平台、范围及起始日缓存5分钟，合并同键并发请求；失败不缓存，最大128个条目。
- 查询使用现有po_analyses_sentiment_cover_idx减少分析结果回表；未触发采集、AI或外部平台调用。

## 修改文件

`../admin/PublicOpinion/assets/app.js`：前端缓存、未完成请求合并、过期和社区隔离。
`../admin/PublicOpinion/index.html`：资源缓存版本。
`server/src/app.js`：趋势缓存接线，返回x-trend-cache。
`server/src/db/repository.js`：分析结果覆盖索引。
`server/src/services/trendReadCache.js`：有界缓存和并发合并。
`server/test/trendReadCache.test.js`：命中、并发、TTL、失败重试、容量和键隔离测试。

## 验证

6项自动测试通过（趋势接口、范围与SQL、既有概览回归、缓存）。语法及指定文件空白检查通过。

候选及外网Edge验收：初次7/30天查询、快速切换未完成请求复用、连续8次切换零新增请求、同标签页刷新零新增请求、顶部时间独立、浏览器缓存失效后服务端命中、海外社区重新请求、无pageerror。

外网本次实测首次7天1889ms、首次30天7161ms（含网络），服务端缓存命中543ms；8次缓存切换总计255ms。候选本机服务端命中3ms。这些是本次观测，不保证所有负载下相同耗时。

证据：`.tests/2026-10/2026-10-12/trend-cache-{candidate,live}.{json,png}`。

## 发布

继承最新现役运行包，仅定点修改本轮文件并重写manifest，其他已有改动保留。

- API：`C:/ProgramData/PublicOpinion/releases/release-20261012-trend-cache-1791782011500`，399文件包校验通过，4320实际监听PID49996。
- 前端：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-trend-cache-1791782012259`，36文件包校验通过，3001实际监听PID16604。
- 旧包保留，未推送Git、未发送站内信，未修改Worker。

## 首次查询进一步优化

新增候选迁移 `migrations/034_overview_trend_cover.sql`，计划为po_contents增加非唯一覆盖索引，减少读取大正文记录。已保存变更前表结构到测试证据目录；在线建索引LOCK=NONE、锁等待上限10秒，三次尝试均报ER_LOCK_WAIT_TIMEOUT，索引尚未生效。没有中断占用锁的业务连接，没有删除数据或修改唯一索引。首次无缓存30天查询仍需数秒，缓存命中和切换已优化。
