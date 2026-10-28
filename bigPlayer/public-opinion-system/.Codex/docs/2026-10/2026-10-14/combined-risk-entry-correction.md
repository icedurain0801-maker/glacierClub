# 恢复负面与紧急合并入口

Status: released-and-accepted
Date: 2026-10-14

## 用户明确口径与修正

用户指出“负面待处理和紧急告警是合成一个的”。此前实现将入口合并误解为风险等级合并，错误拆出独立 L2 入口；本次修正该界面和查询契约。

内容管理仅保留“关注级内容”和“紧急告警”两个风险入口。统一的紧急入口是待处理风险队列，包含 L2 negative 和通过独立复核的 L3 urgent。详情仍如实显示实际等级，不将 L2 写为 L3，独立 AI 复核、正文指纹、具体原因、原文依据、入库与通知硬门禁保持不变。未经复核的历史 L3 仍不进入该队列。

`riskMode=negative` 兼容为同一合并队列，旧负面深链激活紧急入口；`riskMode=urgent` 同样读取合并队列。显式不带 riskMode 的 `severity=urgent` 仍只读取复核 L3。SQL 在分页和计数前筛选 L2 或复核 L3，避免仅前端拼接导致遗漏、重复或数量不一致。负面/紧急两个兼容统计键均返回同一队列数，页面只展示一次，概览入口与内容列表一致。

## 文件与逻辑

- `shared/riskModes.js`：合并成员集合与兼容映射。
- `server/src/db/repository.js`：在合并队列中仅对实际 urgent 分支要求复核证明。
- `../admin/PublicOpinion/content.html`、`assets/content.js`：移除独立负面卡片、旧链接进入紧急入口；更新缓存版本。
- `../admin/PublicOpinion/index.html`：合并队列对应概览标题恢复“紧急告警内容”。`alerts.html` 仅更新共享契约缓存版本。
- `server/test/urgentSecondaryReview.test.js`、`pendingRiskCounters.test.js`、`repository.test.js`：同步合并入口口径，保留 L3 写入防绕过验证。
- `.tests/2026-10/2026-10-14/combined-risk-browser.cjs`：隔离接口与真实可见 Edge 验收。

## 验证与发布准备

专项 19/19 通过，相关仓储筛选/树/计数与活动告警 3/3 通过；语法与空白检查通过。隔离 loopback HTTP API + 可见 Edge 验证单一入口、合并数量、旧负面深链、L2/L3 真实标签、排除未经复核 L3、具体原因和引用、390px 移动视口，无页面异常。

两个候选基于准备时现役 API 和前端包克隆，仅叠加本次差异，不发布工作区其他登录改动。候选 API manifest 418 文件、前端 46 文件校验通过；实际候选模块专项 19/19 与实际候选前端 Edge 验收再次通过。现役服务配置未变，切换脚本 dry-run 通过。

初版准备后现役配置变化，未切换旧候选；重新基于最新现役入口克隆并完整复验，保留新来源详情/API 配置拆分相关变更。最终候选包：`C:/ProgramData/PublicOpinion/releases/release-20261014-combined-risk-api-r2`、`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-combined-risk-front-r2`。原配置和只切换 API/前端的回滚脚本在仓库根 `.temp/urgent-release-20261014/combined-*`，不提交认证或配置快照。

用户弹窗批准“现在切换并验收”后，发布前重新核对 XML 一致性及两包 manifest，切换 API/前端成功。Worker 未切换。API/前端均 Running，正式 HTTPS 前端健康检查返回 200，最终 XML 指向本次 r2 候选。

正式地址可见 Edge 验收通过：真实登录、旧 negative 深链激活 urgent、无独立 negative 入口、合并列表/统计、精确 ID 搜索、L2 真实标签与原原因、详情及概览“紧急告警内容”通过。未替换业务页面/API/SDK，无缓存 SDK 路由，无页面异常或业务接口错误。验收脚本最初残留对被删除卡片的断言，修正后完整运行通过。

2026-10-06 至 2026-10-15 零点、境内社区 101、bigplayer_h5：post=1533、comment=4754、attention=448、合并 urgent=17，negative 兼容键=17。合并列表包含截图 928054 和 6888507，两者仍存 L2 negative，详情保留原原因；不带 riskMode 的 severity=urgent 查询仍仅允许复核 L3。当前历史无有效复核 L3，正向复核门禁由隔离测试验证，没有主动触发真实历史重分析。

证据：`.tests/2026-10/2026-10-14/combined-live-acceptance.json`、`combined-live-list.png`、`combined-live-detail.png`、`combined-live-overview.png`。没有触发处理、历史写库、补发通知；Git 未提交、未推送。后续回滚需先核对当前配置，避免覆盖其他发布。
