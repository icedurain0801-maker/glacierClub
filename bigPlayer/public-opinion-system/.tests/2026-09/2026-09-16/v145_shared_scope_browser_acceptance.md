# v145 六页共享 Scope 真实浏览器验收

- 环境：`https://lfy3001.dev.q1op.com` 免登录实例，强刷 cachebuster `145`。
- 状态：通过。真实浏览器正常路径、真实目录失败保护和真实响应乱序均已覆盖。

## 已通过

| 项目 | 真实浏览器证据 |
| --- | --- |
| 六页直达 | 已逐页打开 `index.html`、`content.html`、`alerts.html`、`sources.html`、`collection-runs.html`、`keywords.html`；URL 均保留 `regionCode=domestic&communityId=8b1f0000000000000000000000000023`。 |
| 当前 Scope | 概览、内容、告警、关键词页实际显示“境内 / 超能战争”；内容、告警、关键词均呈合法业务空态。 |
| 跨页继承 | Scope 切换后六个侧栏入口均同步生成相同地区/社区参数。 |
| 地区联动 | 从境内切换境外后，页面自动选择有效的 `Epic War`，平台选项同步为境外可用集合，URL 更新为 overseas Scope。 |
| 前进后退 | 后退恢复境内/超能战争，前进恢复境外/Epic War，URL 与选择一致。 |
| 无效社区 | 直达 `communityId=not-a-real-community` 后，真实页面回退至“超能世界国服版”，URL 修正为有效 ID。 |
| 控制台 | 本轮 `lfy3001` 页面 `error` / `warn` 为 0。 |

## 真实边界补测

- 真实零社区环境不存在：目录只读核对为 domestic `23/23`、overseas `21/20`、已启用社区数分别为 `20/20`，免登录权限范围内没有零启用社区。因此不将“目录真实返回零社区”冒充为已发生的后端场景。
- 六页均以 CDP `Network.setBlockedURLs` 阻断真实 `/communities` 请求，不 fulfill 或伪造 payload。每页均进入“当前地区暂无可用社区”不可用态，点击查询后业务读取请求为 `0`，应用无未处理异常。
- 六页均让第一次境外真实目录响应延迟、第二次境内真实响应先返回，再原样透传首次响应。两份响应 body 的 SHA256 分别为 `9b632193e16fff95f472969aa7a406072deb0328eceac7478223fe51b91284e6`（境内）和 `971b5756e4f520bfa0c9671a03f95b16bd05664b24b850f3a2ffb7b7c54e5d23`（境外）；最终 Scope 均保持最新境内选择。
- 边界测试：`node --test .tests/2026-09/2026-09-16/v145_scope_real_edge_browser.test.js`，`2/2` 通过。

## 结论

未发现真实浏览器缺陷。上述“真实零社区环境不存在”已精确记录；目录失败保护采用真实请求阻断验证，乱序保护采用真实响应原样延迟透传验证。v145 可作为全项 PASS 关闭凭据。
