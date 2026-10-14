# 海外新主链接管方案（只读准备）

Status: DESIGN_ONLY / PRODUCTION_NO_GO

## 现役事实

`PublicOpinionWorker` PID19584 使用 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1`。
worker.js SHA256 `a932a32f55174d1715cfd5eaa36cc57e2668ec03f89d23cae81078bd3030bf75`；workerScanLease.js `d979f62d3474d5aaee523dfa098c9bcd64c366e9a9dd8ef9e12242006cee6df4`；repository.js `d608c1f12dd894697cf7820702542d29634855acb21e17a1955b3e27c517b65c`。
以上为调查时现役哈希，最终操作前须重新验证完整旧/候选依赖闭包。

现役入口：worker.js 初队列1298–1307、marker1308–1313、legacy due1316–1329、manual poll1353–1365、claim1062/1084；workerScanLease.js23–33全局过期恢复。scheduler sourceAllowlist 仅管生产任务，不管这些消费入口。账号锁晚于claim，全局扫描锁会阻塞国内。sharedDeps常驻无热加载，删除工作树或改独立env不改变PID行为。

## 推荐：唯一共享消费者内路由

优先评估保持一个采集消费者，由可信身份将 overseas+bigplayer_h5 路由至新海外session/当前数据库存储适配/评论补漏，国内及其他平台保持原依赖与算法。新adapter不另起进程/timer/scan，不全局替换共享repo或connector，海外失败不回退旧链且不得拖垮其他源。

这是待批准共享接线，不是已完成接管。仍需替换共享build、回归调度/claim/lease/checkpoint及负载，当前PID不可热接线。海外补漏增加查询与并发占用，须压测其他来源等待/吞吐；不得擅改国内并发。

备选双消费者须将上述所有入口（包括清marker之前、scheduler和recovery）用同一归属合同双向隔离；新海外使用专属锁。仅新allowlist、精确run claim、账号锁、私有trigger均不成立。

## 身份与准入

run→account→source→game/community可信JOIN，检查source/account game/community/platform一致；site/board/URL/window与不可变合同一致。诊断LEFT JOIN保留缺失行，准入只接受完整一致身份。
归属三态：明确海外bigplayer、明确既有链、身份无效。NULL、未知枚举、关联缺失/矛盾不默认国内，不claim、不清marker、不恢复，记录脱敏错误。due/manual当前未投影region，不能直接用对象字段排除。

实际库run无JSON或board/siteURL列。新主链只能使用有效字段及外部持久化不可变run合同、内容raw证据，不DDL、不用当前config补历史身份。第二源缺board/registry且Token上下文401，仍未完成，不自动刷新或借第一源board。

## 收口、影响及回退

服务stoptimeout=60秒不是安全收口保证：worker.js1419–1421信号处理直接pool.end/exit，没有inflight drain；manual poll还可继续领取。等待与暂停时长待确认，不能承诺固定分钟数。
受控切换前需另批drain/维护方案：停止新scan/scheduler/poll领取并保留请求，在途页事务完成、lane/inflight为零、owner/epoch租约安全收口后再停旧，确认不会自动重拉、零消费者，再启冻结候选。当前不执行。
全共享采集在替换启动期间暂停；API、analysis、translation不重启，仍须观察其影响。延迟=收口+启动验证+积压消化，具体SLA待规模评估。

硬触发：跨scope写入、缺列SQL、重复消费者、身份/租约fencing失效立即停止新增领取；国内/其他平台回归失败、健康失败或超过已批准负载阈值触发回退评估。
回退先收口候选、零消费者，再恢复经哈希验证旧build；不删数据/run、不改历史主键、不DDL。旧build会重新领取海外，须预先QA过海外隔离/暂停合同，否则不能盲目全范围回退，需停止采集等待处置。回退操作仍另需授权。

## QA与指标

隔离矩阵覆盖四入口+scheduler+recovery、目标/非目标/NULL/矛盾身份、两源三站token隔离、缺board/registry/401、事务回滚/去重/父链、上下文不计新增且不入AI翻译、国内及其他平台原SQL/行为、drain与回退。海外负载下国内不饥饿。
前后按region/platform/source同口径观察build/PID/heartbeat、scan时长、队列最老等待、active/expired lease/attempts/poison、401/403/schema/scope、stored/discovered/gap、国内吞吐、AI翻译积压、DB连接/锁/死锁/事务耗时。阈值由经理与QA基于实际基线确认，不虚构。

本轮未编辑现役release/XML/env/DB、未停止重启进程、未启动新消费者。旧代码删除依最新决定停止，本轮实际删除为空。
