---
version: v038
date: 2026-09-21
scope: 舆情分析系统侧边栏静态资源缓存
status: completed
---

# 舆情分析系统侧边栏缓存版本统一

## 问题

- 舆情六页仍引用旧的命名版本参数，浏览器可能继续命中旧侧边栏 CSS、数据或渲染脚本缓存。

## 修复

- `admin/PublicOpinion/` 下六个工作台页面统一引用 `sidebar.css?v=200`。
- 六页统一引用 `sidebar-data.js?v=200` 和 `sidebar.js?v=200`。
- 仅修改资源查询参数，不修改页面结构、业务逻辑或非舆情页面。

## 验证

- 六页三项资源引用各出现一次。
- `public-opinion-isolation-v036`、`admin-sidebar-v034`、`sidebar-system-split-v037` 在六页中均为零处。
- `git diff --check` 通过。
