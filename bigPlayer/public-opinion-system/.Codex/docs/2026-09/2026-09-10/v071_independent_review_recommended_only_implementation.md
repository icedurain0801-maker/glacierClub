---
last_updated: 2026-09-10
status: implemented_pending_qa
scope: independent-review-recommended-only
owner: 开发负责人
source_task: .Codex/docs/2026-09/2026-09-10/v070_independent_review_recommended_only_task.md
---

# v071 独立审核仅展示系统推荐项实施记录

## 实施结果

- 优质内容列表、详情和审核响应将推荐及采纳字段归一化为 JSON boolean，并显式返回只读 `canReview`。
- 风险告警列表、详情和处置响应新增 `independent_reviews`；按告警关联内容逐候选返回，无候选固定为空数组，列表采用批量查询避免 N+1。
- 风险告警和优质内容的列表、详情共用同一前端渲染规则：仅严格 `=== true` 的推荐项可见，顺序固定为首页推荐、栏目置顶、加精，全空显示 `--`。
- 删除独立审核中的 `AI 建议` / `AI 不建议`，历史状态不能让未推荐项重新出现。
- `canReview=false` 时保留推荐类型和审核状态但隐藏操作；请求锁按 `candidateId:type` 隔离，失败前不修改本地状态，PATCH 仅提交当前类型字段。
- 未修改 AI 推荐算法、推荐结果、历史审核数据、审核语义或既有权限判定。

## 变更文件

- `server/src/db/repository.js`
- `server/src/app.js`
- `server/test/app.routes.test.js`
- `server/test/repository.test.js`
- `../admin/PublicOpinion/assets/alerts.js`
- `../admin/PublicOpinion/alerts.html`
- 仓库根 `.tests/2026-09/2026-09-10/independent-review-recommended-only.test.js`

## 验证结果

- `node --check`：目标 JavaScript 文件通过。
- 前端 PRD 7.1–7.10 定向测试：6/6 PASS。
- `server/test/app.routes.test.js` 与 `server/test/repository.test.js`：131/131 PASS。
- 目标文件 `git diff --check`：通过；`alerts.html` 文件末尾空行已修正。

## 交付注意

- 当前仓库存在大量用户已有未提交改动，本次未覆盖、清理或重写无关文件。
- `../admin/PublicOpinion/` 当前整体未跟踪；仓库根 `.tests/` 被 `.gitignore` 忽略。后续如需提交，必须由有授权的流程按明确文件路径处理，不能依赖普通 `git add` 自动纳入。
- 本次未 commit、未 push、未合并、未发版；待测试负责人按 PRD 7.1–7.10 独立回归。
