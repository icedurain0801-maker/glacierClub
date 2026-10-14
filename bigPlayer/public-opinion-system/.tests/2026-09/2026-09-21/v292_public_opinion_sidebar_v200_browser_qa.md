---
status: failed
priority: P1
date: 2026-09-21
role: test-owner
---

# PublicOpinion 六页侧边栏与静态资源版本验收

## 结论

**FAIL，退回开发负责人。** 六页页面和后台菜单结构可加载，但交测要求的统一 `v=200` 静态资源版本未生效。

## 浏览器证据

3000 免登录浏览器新标签：`62` 至 `67`，逐页打开：

- `index.html`：概览
- `content.html`：抓取内容管理
- `alerts.html`：舆情通知管理
- `sources.html`：抓取账号管理
- `collection-runs.html`：抓取任务记录
- `keywords.html`：监控关键词设置

浏览器观察结果：

- 六页均返回并渲染后台页面；
- 侧边栏包含分析/采集后台菜单及六页链接；
- 未发现“大玩家原型”或 C 端导航；
- 当前页标题与页面内容匹配；
- 页面右侧/主体数据区域未见结构性破坏（本机 API fixture 显示社区加载失败，属于既有数据源阻塞）。

## 失败项

六页 HTML 实际引用仍为旧版本：

| 资源 | 实际引用 |
|---|---|
| `sidebar.css` | `v=public-opinion-isolation-v036` |
| `sidebar-data.js` | `v=admin-sidebar-v034` |
| `sidebar.js` | `v=sidebar-system-split-v037` |

交测要求为六页统一引用 `sidebar.css?v=200`、`sidebar-data.js?v=200`、`sidebar.js?v=200`，当前不满足。

## 边界

- 仅使用 3000 浏览器只读验收；
- 未触碰 3001、4320、数据库、provider 或 Worker；
- 未修改业务代码。

## 退回要求

请将六页统一资源引用更新为 `v=200` 后重新交测，并再次提供六页浏览器记录。
