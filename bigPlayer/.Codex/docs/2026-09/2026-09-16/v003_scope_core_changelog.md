# v003 Scope 核心变更记录

日期：2026-09-16

## 第一阶段：共享 Scope 核心

- `scope.js` 改为唯一规范化状态源；`query()` 与 `selected()` 读取内存状态，不再读取页面控件。
- 仅把 `regionCode`、`communityId` 写入 `sessionStorage`；平台仍为当前页面筛选，不跨页共享。
- 初始化和前进/后退均按“合法 URL -> 合法 session -> 地区默认启用社区”规范化，并用 `replaceState` 修正 URL；用户切换使用 `pushState`。
- 地区加载使用 `AbortController` 与 epoch，过期响应不得覆盖新状态；新增 `available()`、`epoch()`、`beginRequest()` 生命周期辅助接口。
- 无启用社区时 Scope 显式标记为不可用，为第二阶段页面停止业务请求并显示空状态提供统一依据。
- 社区归一化加载期间平台控件同步禁用；异常触发的加载中平台事件不会推进 epoch 或取消社区请求，加载完成后自动恢复可用。
- `sidebar.js` 不再自行读取 URL 或 `localStorage` 推导 Scope，改为订阅 `public-opinion-scope-change`，只在舆情六页链接上同步地区与社区。

## 验证

- `node --check admin/PublicOpinion/assets/scope.js`。
- `node --check shared/sidebar.js`。
- `node --test public-opinion-system/.tests/2026-09/2026-09-16/v145_scope_core_behavior.test.js`。
- 行为测试覆盖非法 URL/session 回退、乱序社区响应、加载期间不可用、Scope 变化即时取消业务请求、无启用社区禁用业务请求与 `popstate` 恢复。
