# 运营摘要默认收起

## 最终调整：三行预览

- 用户最终指定收起时显示三行，截断行数改为 3，最大高度同步为 5.7em。
- 同步本地 3001 开发服务，浏览器测试按三行高度验证；展开、收起、刷新和窄屏交互保持一致。未推送静态托管。

## 后续调整：收起时保留两行预览

- 按用户补充要求，默认显示两行摘要，超出内容截断；点击标题栏展开全文，再次点击恢复两行。
- 预览由同一接口摘要填充，切换社区时清空旧预览；展开时隐藏重复预览，正文与统计说明显示完整内容。
- 已同步本机 3001 开发服务，未推送静态托管。
- 浏览器回归通过：桌面/390px 两行高度校验、展开与收起、键盘操作、刷新后两行；无页面脚本异常。截图与测试脚本沿用下方同名文件。

- 日期：2026-10-20
- 范围：前端；不涉及后端、数据库或静态托管发布。
- `../admin/PublicOpinion/index.html`：运营周报卡片改为原生 `details/summary`，默认收起正文与统计说明；标题栏显示日期及展开/收起提示，支持鼠标与键盘。
- `../admin/PublicOpinion/assets/weekly-report.js`：去除原先三行截断和第二层全文展开按钮，展开卡片后直接展示完整摘要。
- 刷新页面恢复默认收起；现有数据加载、错误与重试逻辑保持。
- 已备份并同步上述两个文件到本机 3001 的 `release-20261019-weekly-r2/public/admin/PublicOpinion/`，未推送公司静态托管。

## 验证

- `node --check ../admin/PublicOpinion/assets/weekly-report.js`：通过。
- `git diff --check -- ../admin/PublicOpinion/index.html ../admin/PublicOpinion/assets/weekly-report.js`：通过。
- `node .tests/2026-10/2026-10-20/weekly-report-collapse.cjs`：通过。
- 浏览器地址：`https://lfy3001.dev.q1op.com/?boardId=2`。
- 验证默认收起（含异步加载完成）、点击展开完整正文、再次点击收起、Enter/空格操作、刷新恢复收起及 390px 窄屏切换；未捕获页面脚本异常。
- 截图：同日期 `.tests/` 下的 `weekly-report-collapsed.png`、`weekly-report-expanded.png`、`weekly-report-mobile.png`。
- 公司静态托管线上验收：等待用户明确要求“推送静态托管”后执行。
