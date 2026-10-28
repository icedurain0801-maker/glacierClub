# 境内大玩家采集源详情加载修复

Status: 已发布、可见浏览器验收通过

## 问题与修复

`club-opinion.q1.com` 登录、采集源列表正常，指定来源详情持续加载。可见 Edge 复现详情超时，单独真实只读请求约21.7秒返回502 UPSTREAM_UNAVAILABLE。列表使用状态汇总，详情却通过 `getSyncStatus` 读取全部历史检查点。

修改 `server/src/app.js` 的 `sourceWithAccount`：境内 bigplayer_h5 的详情与列表均复用 `getSourceSyncStatusSummary`。返回按同步范围/状态聚合的全量计数、抓取数量、最近时间和错误信息。前端现有逻辑支持 checkpoint_count；不分页截断历史总数。不修改其他平台或独立检查点读取接口。

发布从最新现役 `release-20261014-urgent-review-api-r1` 克隆，只替换上述条件，保留其他并行变更。重启 PublicOpinionApi，未修改数据库、未重启 Worker、未操作来源授权或采集。清单见 source-detail-summary-release-manifest.json。

## 验证

- `node --test server/test/sourceSyncSummary.test.js` 通过；JS语法和限定路径空白检查通过。
- 使用现有授权 Edge 配置启动可见浏览器，访问用户完整深链，基础配置、授权工作区、同步能力与控制、推送配置正常渲染；关闭按钮实际点击通过。
- 修复后详情返回200，约2027ms，5011字符，8条汇总涵盖90673条历史检查点。
- API健康检查200。
- 证据：`.tests/2026-10/2026-10-14/source-detail-restored.json`、`source-detail-restored.png`。

列表的 `provider_pagination_budget_exhausted` 属于既有采集任务结果，与本次详情加载故障分开；本次未改变采集规则。
