# v145 六页 Scope 开发验证返件

Status: ready_for_qa
日期：2026-09-16

## 入口与实例

实例：`https://lfy3001.dev.q1op.com`，本机3001代理到4320真实API；不使用Mock替代真实数据。

六页入口均位于 `/admin/PublicOpinion/`：`index.html`、`content.html`、`alerts.html`、`sources.html`、`collection-runs.html`、`keywords.html`。

## 已完成

- 页面请求沿用已PASS的单一Scope核心，注入当前地区/社区、取消过期读取，保留原有响应结构和业务合同。
- 切换刷新本页列表、指标、候选；关闭旧详情/进度/向导，清理跨社区无效来源及运行ID。
- 共享仅地区/社区，平台和其他页内筛选不跨页统一；侧栏六页链接实时携带共享Scope。
- 无启用社区显示明确空状态，不发业务API；合法URL优先、session继承、前后退恢复由核心处理。
- 六页资源版本145；移动主区不被固定侧栏横向挤压，桌面保持原样。

## 验证命令

- `node --test .tests/2026-09/2026-09-16/v145_scope_core_behavior.test.js`：4/4。
- `node --test .tests/2026-09/2026-09-16/v145_scope_pages_browser.test.js`：localhost 2/2。
- 设置 `SCOPE_TEST_BASE=https://lfy3001.dev.q1op.com` 后执行同一浏览器测试：外网2/2，Console零error/warn，无API HTTP错误。
- `npm --prefix server test`：404/404。
- 六页JS语法检查及按文件 `git diff --check`：通过。

## 待独立验收与限制

- 测试负责人须独立强刷六页，复验互跳/直达/前后退/地区社区隔离/快速切换/空社区及375x812、1440x900。
- 无社区与乱序响应采用浏览器拦截/行为fixture验证；真实后端不删除或停用社区来构造场景。
- 本轮只做读取和导航验证，未点击采集、删除、规则保存等写操作，未修改对应业务逻辑。
- 无真实同步任务时，展开详情Scope由统一传输行为测试覆盖；测试负责人有可用任务样本时补实际展开验收。
- 不push、不发版；独立浏览器PASS并返项目经理前，不标记业务完成。

## 非Mock真实边界场景

- 目录只读查询：domestic 总23/启用20，overseas 总21/启用20。地区控件仅允许这两项，当前免登录环境没有零启用社区的合法权限范围。
- 可执行入口：`node --test .tests/2026-09/2026-09-16/v145_scope_real_edge_browser.test.js`，默认访问真实lfy3001，开发运行2/2通过。
- 场景一：CDP `Network.setBlockedURLs` 仅阻断真实 `/communities` 请求，静态资源继续真实加载；六页均显示不可用并且点击查询不发业务请求，应用未产生未处理异常。浏览器预期网络失败日志属于注入故障证据，不作正常场景Console零错误声明。
- 场景一覆盖边界：证明真实接口失败后的不可用/禁请求分支；不能声称验证真实接口返回零社区。零集合本身仍有行为fixture证据，不删/停真实社区制造空集合。
- 场景二：Playwright路由调用 `route.fetch()` 访问真实接口，持有第一次overseas响应直到第二次domestic真实响应到达，再 `route.fulfill({ response })` 原样透传；不构造json/body，不更改status/header/payload，控制的是延迟。六页响应顺序均[2,1]，输出真实body SHA-256，最终domestic/社区/URL不被旧响应覆盖。
- 修复过程中发现空URL偏好误匹配候选空字段，已最小修复并补非首项session行为测试，核心5/5。
