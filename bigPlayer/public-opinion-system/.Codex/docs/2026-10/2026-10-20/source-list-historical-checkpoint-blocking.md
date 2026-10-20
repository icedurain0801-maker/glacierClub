# 采集源列表历史检查点阻塞修复

Status: deployed, 2026-10-20

Last Light/X-Clash抓取账号管理持续显示加载。只读排查：Last Light listSources约114ms、H5摘要约50ms，Discord getSourceSyncStatusSummary长时间未返回；诊断主动取消，没有触发采集或授权。X-Clash listSources约2ms、账号查询约1ms，其摘要具体耗时未确认。管理列表以Promise.all等待全部平台账号及历史检查点摘要，一个慢摘要会阻塞全列表；前端loadSources无超时，持续加载。

server/src/app.js的sourceWithAccount增加listOnly，管理列表返回账号、凭据状态和能力，但不读取历史检查点，最近同步继续使用listSources的recent_sync_*字段。历史摘要保留独立详情sync-status请求，不丢弃历史数据。assets/sources.js增加12秒列表超时、主动取消前次请求、旧响应隔离及失败提示。sources.html更新资源版本20261020-list-no-checkpoints-r1。

11项来源详情/摘要隔离测试通过，包含有账号时不读取历史检查点；Chromium隔离交互测试覆盖超时退出加载、刷新恢复、Last Light/X-Clash切换、旧响应不覆盖。语法及空白检查通过。实际现役包在执行期间切换为release-20261020-facebook-browser-api-r1和frontend release-20261020-facebook-browser-r1，按相关片段更新并保留其他修改；API正常重载后Running。线上sources.html/JS均HTTP200并包含新版本。登录后的完整真实页面请求仍未验收，已有查询Token401问题不通过绕过鉴权处理。备份/诊断及浏览器脚本在仓库根.temp/frequent-feedback-20261020。

本次根治列表等待历史摘要问题；Discord历史摘要查询本身仍待单独优化，详情独立加载可能超时，前端已有8秒提示。未变更数据库、采集调度、授权或钉钉发送。
