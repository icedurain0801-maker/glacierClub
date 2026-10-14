# 内容详情底部单条处理

Status: released
日期：2026-10-12

## 行为

抓取内容管理的详情抽屉底部固定单条处理表单，正文区域独立滚动。包含处理方式、处理备注、确认处理按钮。选项直接复用批量处理配置：已通知玩家 / 已处理 / 误判不予处理，默认已处理。备注选填，最多 200 个 Unicode 字符，已有备注回填。风险关注、负面、紧急且未删除的内容可处理；无需处理内容不显示表单。

保存复用现有 scoped `/contents/batch-handle` 接口，仅提交当前内容一个 ID。保存期间禁用表单防重复，失败保留输入并显示错误；成功关闭详情、刷新列表与统计。关闭、切换内容或切换社区清理表单，防止旧保存响应影响新详情。

## 文件

- `../admin/PublicOpinion/assets/content-handling.js`：单条表单、选项复用、字符限制、保存与清理生命周期。
- `../admin/PublicOpinion/assets/content.js`：详情绑定、打开/关闭/社区切换清理、刷新列表统计。
- `../admin/PublicOpinion/content.html`：固定底部表单的 flex 布局，详情正文独立滚动。

## 发布

只发布 frontend3001，以最新 `release-20261012-pending-risk-counts-1791797401266` 为基础窄补丁，最终切换至 `release-20261012-pending-risk-counts-1791797401266-single-handling-r1-r2`，保留并行状态统计改动。不更新 API/Worker，不迁移数据。

## 验证

- 现有 `.tests/2026-10/2026-10-12/content_handling.test.js` 6/6 通过，使用隔离 MySQL 验证真实 HTTP 保存/持久化、三种方式、备注限制、审计回滚、归属/删除/风险门禁。
- JavaScript 语法及限定文件空白检查通过。
- 可见 Chromium 实测境外截图同一紧急内容详情：固定底部，默认已处理，与批量选项一致，Unicode 200 字限制通过；长正文滚动时表单位置不变。
- 浏览器拦截保存请求：验证单个正确内容 ID 和社区参数、失败保留草稿、成功关闭刷新、重复保存禁用；未写真实业务处理记录。
- 无需处理内容无表单；浏览器 pageerror=0。
- 证据：`.tests/2026-10/2026-10-12/single-handling-browser.json`、`single-handling-live-footer.png`。
- 发布清单：`v022_single_content_handling_release_manifest.json`。

## 边界

自检保存使用隔离响应和隔离数据库，未对用户真实内容执行处理。线上真实保存沿用已有鉴权、归属、删除和风险校验，以及处理与审计的同事务写入。
