# 推荐原因生成、历史补齐与操作栏去重

- 日期：2026-10-14
- 状态：已实施并完成可见浏览器验收
- 用户授权：修复生成/保存链路；仅为截图中的帖子 928246、927929 补生成原因，不改变推荐结果和审核状态；去掉操作栏重复推荐类型文字。

## 原因与修改

TypeSafe 原先仅返回推荐概率，`qualityReason` 写入固定占位文案。情感/风险说明不能解释内容的推荐价值。

- 新增 `server/src/integrations/typeSafeQualityExplanation.js`：使用既有 AI 配置，根据原文和已判定推荐类型生成简体中文价值说明及连续原文依据。独立校验原文引用、语言、长度和响应；不改变风险、推荐及审核结论。较长引用须先全文匹配原文，再截取前 60 字展示。
- 修改 `server/src/integrations/typeSafeAnalyzer.js`：推荐项必须成功生成原因，失败进入既有任务重试路径；不再写入占位理由。新增解释版本进入缓存键，避免命中旧占位缓存；记录解释元数据及 token 用量。非推荐内容不增加此调用。
- 修改 `../admin/PublicOpinion/assets/alerts.js` 与 `alerts.html`：移除操作栏的重复类型标题，保留所有操作按钮，通过 aria-label/title 说明按钮所属推荐类型；更新资源版本。
- 新增 `server/test/typeSafeQualityExplanation.test.js`：生成契约、虚构引用/无效响应、结果隔离、失败重试入口、缓存更新、按钮可访问名称验证。

## 历史数据影响

仅更新两条内容在 `po_quality_candidates` 和 `po_analyses` 的 `quality_reason`。事务内校验正文哈希及原推荐/审核状态，更新后逐字段比较，确认质量分、情感、风险、推荐类型和审核字段不变。生成结果分别说明第 33 关阵容配置和尼拉技能/养成搭配的参考价值，引用真实原文。

两条内容快照及最新推荐元数据已同步至 BaaS。同步前取得现有云写入锁，未修改同步任务自身状态文件。

## 发布与验证

- 基于发布时最新运行包分别克隆，仅应用本次相关片段；API、Worker、前端均已加载新代码。
- 并行发布期间运行包继续更新，最终实际运行路径及文件哈希见 `quality-reason-active-runtime.json`，初始补丁清单见 `quality-reason-release-manifest.json`。
- 发布中 API 曾出现缺少 `chineseExplanation.js` 的依赖错误；最终现役包已包含该依赖，API/Worker 分析器实际加载检查通过，服务均运行。未将中间启动结果作为最终成功依据。
- 生成/风险二次复核/前端/TypeSafe 回归 32 项通过；推荐相关仓储测试 6 项通过。相关 JS 语法及限定文件空白检查通过。
- 可见 Edge 打开真实 `club-opinion.q1.com` 页，未模拟接口：两条记录列表及详情显示具体原因和原文；操作栏无重复“首页推荐”，保留采纳/忽略/撤销及查看详情；页面无脚本错误。未执行真实审核操作。
- 证据：`.tests/2026-10/2026-10-14/quality-reason-browser.json`、同名 PNG、`quality-reason-backfill.json`、`quality-reason-cloud.json`。

后续推荐项会增加一次 AI 解释调用，失败时按现有分析任务机制重试。未回填其他历史记录，未提交/推送 Git。
