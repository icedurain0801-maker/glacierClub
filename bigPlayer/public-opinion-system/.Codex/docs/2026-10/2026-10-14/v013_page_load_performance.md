# 三个页面加载性能优化

日期：2026-10-14
状态：已发布并完成正式页面验收

## 原因与修复

- 抓取账号管理：海外账号列表误用全量检查点查询，改为 getSourceSyncStatusSummary 聚合。X-Clash 原查询 13,760 条、7,496,152 字节、2,323ms；聚合查询 4 条、645 字节、983ms。Last Light 原查询 26,785 条、17,438,671 字节、3,011ms；聚合 7 条、1,322 字节、1,158ms。这是数据库只读查询基线，不等同浏览器整页提速倍数。
- 概览：取消每次请求强制 fresh=1，恢复已有90秒概览缓存；来源名称读取轻量列表，不加载授权凭据和检查点。
- 抓取内容：列表、统计、来源筛选并行加载，来源只读取公开摘要字段。
- BaaS 目录：游戏和社区只读目录块，不再等待内容、分析任务、翻译任务全量数据。
- BaaS 内容：每批从50增至100，保持4并发；超过1MB的响应自动拆分小页，校验完整性不变。
- BaaS 快照：常规60秒TTL之外最多30秒内返回旧快照，同时合并后台刷新；显式失效和状态同步必须等待新数据。普通概览另有原90秒缓存，可能存在缓存滞后；处理操作的原有主动失效逻辑保留。
- 不可变元数据块按内容哈希复用；manifest变化时只下载变化的块，成功读取后清除已不属于当前manifest的缓存块。
- 不改变权限验证、社区范围、处理状态覆盖规则、BaaS失败语义；业务查询不回退本机业务数据。

## 文件

- server/src/app.js：来源聚合、轻量列表。
- server/src/services/baasReadRepository.js：目录、分页、缓存及不可变块复用。
- ../admin/PublicOpinion/assets/app.js：概览缓存与轻量来源。
- ../admin/PublicOpinion/assets/content.js：并行加载与轻量来源。
- ../admin/PublicOpinion/index.html、content.html：脚本缓存版本。
- server/test/baasReadPerformance.test.js、sourceDetailRoute.test.js：回归测试。

## 验证

命令：node --test server/test/baasReadPerformance.test.js server/test/baasReadRepository.test.js server/test/sourceDetailRoute.test.js
结果：28项通过。覆盖目录冷加载与ACL、并发刷新、100条分页、超大响应拆分、显式失效、陈旧上限、失败重试、不可变块更新、海外聚合和来源摘要。
语法检查及限定文件 git diff --check 通过。
运行包验证：API425文件、前端46文件，manifest通过；服务健康接口均HTTP200。

## 正式页面验收

- X-Clash账号：已授权，最近同步2026-10-14 14:18:22，未发起真实同步。
- 超能世界国服概览：今日201条（帖子/动态71、评论130），关注24、紧急4。一次热刷新至主要指标出现902ms，优质内容统计独立加载，不计入该数值。
- Last Light内容：今日帖子/动态9、评论23，类型切换、详情成功。
- 切换X-Clash：283条，第一页50条，未见错误toast。
- 浏览器账号一次热刷新3841ms，内容一次热刷新5910ms；内容第一轮曾10207ms，因此补充不可变元数据块复用。未宣称整页秒开或固定倍数提速。
- 最终版直接API只读验收：社区目录155/68ms，轻量来源1211/1048ms，评论列表117/106ms（两次请求，HTTP200）。接口计时不包括浏览器登录、渲染及公网链路。
- 截图：.tests/2026-10/2026-10-14/page-speed-live.png。

## 发布与边界

API：C:/ProgramData/PublicOpinion/releases/release-20261014-page-speed-r2-1791975833955
前端：C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-page-speed-1791975608753
从现役包克隆，仅修改本轮范围，保留其他会话既有功能；切换前检查服务XML未变化，旧包和XML可回滚。
仅重启API4320及前端3001；未改数据库、未重启Worker、未提交采集或分析任务。
剩余限制：首次启动/定期全量核对仍需下载BaaS内容快照；SSO校验、业务范围解析和公网链路仍影响整页耗时，不能把热缓存API耗时当作所有页面耗时。
