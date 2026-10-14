# 单站任务浮层关闭修复

Status: 已发布并完成可见浏览器自检

## 问题与修改

概览右下角单站任务浮层点击关闭后，任务指针与 localStorage 已清除，DOM hidden=true，但浮层自身 display:flex 覆盖浏览器默认隐藏规则，导致仍然显示。

- `../admin/PublicOpinion/assets/sync-run-dock.js`：添加 `.sync-run-dock[hidden]{display:none}`，让 hidden 状态优先于 flex 布局。
- `../admin/PublicOpinion/assets/scope.js`：更新浮层脚本缓存版本为 `20261012-close`；保留该文件其他已有改动。
- 发布从最新现役前端包克隆，仅替换上述两个文件内的相关片段；API、Worker、数据库未修改。发布清单见 v026_sync_dock_close_release_manifest.json。

## 验证

- 修复前在可见 Chromium 复现：关闭后 hidden=true、display=flex、snapshot=null、storage=null。
- 现有 `node --test ../admin/PublicOpinion/assets/sync-run-dock.test.js`：10/10 通过，含延迟轮询不能恢复已关闭浮层。
- JS 语法与限定路径 git diff --check 通过。
- 发布后可见 Chromium 在外网概览实际点击：关闭后 display=none；刷新保持隐藏；新任务恢复显示；运行中任务可收起；500px 窄屏可关闭。模拟任务隔离验证，未提交任何真实任务控制请求。
- frontend 3001 与 API 4320 健康检查均返回 200。
- 证据：`.tests/2026-10/2026-10-12/dock-close-browser.json`、`dock-close-live.png`。

关闭仅收起任务浮层，不取消后台任务。已打开旧页面需要刷新后使用新样式。
