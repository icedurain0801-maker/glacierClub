# 抓取详情只显示新增成功内容

Status: 开发、隔离测试及真实浏览器验收通过；经用户批准已切换本机前端。

## 口径与修改

- 详情列表仅展示本次run成功入库的 inserted/created/new 关联；排除 changed/updated/unchanged、失败及未知状态。
- 帖子/动态和评论正文切换均应用同一过滤；已加载数量只统计过滤后的新增内容。
- 任务整体抓取统计继续保留，详情说明明确其与列表的口径。无新增时显示对应的“本次没有新增成功的帖子或动态/评论”。
- 改动：../admin/PublicOpinion/assets/collection-runs.js、assets/source-sync-progress.js、collection-runs.html。
- Progress控制器通过可选itemFilter过滤展示；原始分页游标仍使用未过滤的响应推进，跳过只有变更的页，防止漏掉后面的新增和游标停滞死循环。其他调用方不启用过滤。
- 更新这页两个JS的缓存版本，未改变采集、分析、数据库数据和API契约。

## 验证

- `.tests/2026-10/2026-10-15/collection-run-new-content.test.cjs` 与原source-sync-progress.test.js：6项通过，包括模拟HTTP接口分页、全变更空列表和默认调用方兼容。
- 两个JS语法检查与相关路径git diff --check通过。
- 浏览器运行最新前端JS（只隔离替换鉴权/数据源，不修改业务JS）：23条帖子包含20变更3新增，实际只展示3条新增；评论包含变更与新增，实际只展示1条新增；无新增run显示空状态。浏览器错误日志为空。
- 截图：`.tests/2026-10/2026-10-15/collection-run-new-only-browser.png`。
- 临时测试站位于Git根 `.temp/collection-run-new-only-20261015`，监听127.0.0.1:8771，不连接真实数据库，不启动采集、不发通知。
- 候选：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261015-run-new-only-r1`，从现役sso-recovery-r1克隆，仅替换上述3文件；47文件manifest校验通过。

## 本机切换与真实验收

- 用户批准后，PublicOpinionFrontend3001 已切换到 release-20261015-run-new-only-r1，服务 Running，auth/config HTTP 200。旧 release 与服务 XML 备份保留。
- 浏览器访问 club-opinion.q1.com，确认两个 JS 均加载 20261015-new-only-r1。
- Last Light 真实任务 92978df8-ffe2-4d1e-9227-b991e8555108：23 条帖子中仅显示 3 条新增，20 条变更不显示；57 条评论正文点击展开全部后仅显示 1 条新增，显示“已加载全部新增成功内容”。
- 真实任务 c9fd598b-4363-4c46-ab33-365ced42e87d：帖子新增 0、变更 1，帖子与评论均显示对应的无新增成功内容空状态。
- 浏览器控制台 error 日志为空。截图：`.tests/2026-10/2026-10-15/collection-run-new-only-real-posts.png`。
- 未修改数据库，未启动真实采集或发送通知；未发布 BaaS 静态托管，未提交/推送 Git。
