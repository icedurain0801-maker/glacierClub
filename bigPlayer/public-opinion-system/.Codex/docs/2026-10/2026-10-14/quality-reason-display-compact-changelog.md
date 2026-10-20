# 优质内容推荐原因精简

- 日期：2026-10-14
- 状态：候选前端包已验证，待上线
- 范围：仅优质内容管理页面展示；不修改数据库、AI 分析结果或审核状态。

## 修改

- 列表第六列由“推荐理由”改为“推荐原因”。
- 列表仅显示已保存的 `quality_reason` 正文，不显示“推荐原因：”前缀。
- 列表及详情均移除 `analysis_reason`（AI 分析原因）的展示。
- 详情仍保留质量评分和推荐原因，便于审核时理解推荐依据。

## 验证

- `node --check ../admin/PublicOpinion/assets/alerts.js`：通过。
- `node --test .tests/2026-10/2026-10-14/quality-columns.test.cjs`：3/3 通过。
- Edge 可见浏览器隔离验收：列表表头为“推荐原因”，列表和详情均不含 AI 分析原因，且无页面错误。证据：`.tests/2026-10/2026-10-14/quality-reason-display-browser.json`。
- 候选运行包静态文件校验：`release-20261014-quality-reason-compact-r1`，46 个文件通过。

## 上线准备

候选前端包：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-quality-reason-compact-r1`。

当前运行包仍为 `release-20261014-overview-post-id-1791965155412`，切换前需再次核对服务 XML 未被其他发布变更。旧包保留，可回滚。未提交或推送 Git。
