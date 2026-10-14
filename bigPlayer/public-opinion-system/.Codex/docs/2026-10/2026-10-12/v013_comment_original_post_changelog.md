# 评论查看显示所属原帖

Status: released
日期：2026-10-12

## 需求与结果

首页关注级、负面待处理评论点击“查看”，保留当前评论及其分析，并增加“所属原帖”。内容管理评论详情同步支持。原帖显示正文、作者与平台作者 ID、发布时间、图片及平台原文链接。缺失原帖显示“原帖暂未采集或不可访问”；加载失败明确提示重试。已删除/隐藏的已采集原帖标明状态。

## 文件与逻辑

- `server/src/app.js`：现有只读内容详情响应增加 `originalPost`。评论和回复使用 `root_content_id` 定位帖子，不将父评论当作原帖；查询保持当前范围与评论所属游戏、社区、来源、账号边界。关联原帖不继承列表日期和风险筛选。
- `../admin/PublicOpinion/assets/app.js`：概览详情加载现有详情 API，复用 `PublicOpinionAlertDetail.renderContentNode` 展示原帖；用请求序号阻止旧请求覆盖新选择或已关闭抽屉。
- `../admin/PublicOpinion/assets/content.js`：保留并渲染详情的 `originalPost`，同步增加切换和关闭保护。
- 运行包 `index.html` 与 `content.html` 更新脚本缓存版本。

## 发布

发布时检测到其他任务已更新运行包至 `release-20261012-independent-alerts-r2`，以该最新包为基础克隆，只移植本次相关函数和路由，保留并行已完成修改。API 和 frontend3001 切换至 `release-20261012-independent-alerts-r2-comment-original-r1`。不发布 Worker，不写业务数据、不重判、不补发通知。发布清单见 `v014_comment_original_release_manifest.json`。

## 验证

- Node 语法检查和限定文件 `git diff --check` 通过。
- 隔离详情路由检查：评论/回复根帖、缺失原帖、删除状态、查询归属限制、原帖不受日期/风险筛选通过；无数据库写入。
- 可见 Chromium 对外网 10/11 页面真实点击：关注级评论、负面评论均显示正确 root ID 的原帖与当前评论；内容管理详情通过；延迟旧响应、关闭抽屉、快速切换验证通过。
- 浏览器 pageerror 为 0。截图人工核对：原帖文字、作者信息和图片正常显示。
- 证据：`.tests/2026-10/2026-10-12/comment-original-browser.json`、`comment-original-attention.png`、`comment-original-negative.png`。

## 边界

仅展示系统已采集且符合归属范围的原帖；无根帖关联或原帖不可访问时显示空态，不在查看动作中触发外部采集。
