# v306d 概览指标卡片最终复测 QA

## 结论

**PASS / READY_FOR_RELEASE_WINDOW**。

## 候选身份

- 3000 返回的 `index.html` SHA-256：`5874B27700227B04422C5F7590CD39AFDAF66470891FB94B6F186FE29510BC7D`，与 manifest 一致。
- 3000 返回的 `assets/app.js?v=154` SHA-256：`F8EEDB46B4EEDEA21956E11B8DFAFD768761B21125E297269E8095E38C1964E4`，与 manifest 一致。
- `public-files.sha256`：`30/30` PASS。
- `app.js`：`node --check` PASS。
- 固定证据 hash 在复测前已核对：browser-verification `1AD32E06585209FEB20AF9A4D98B9AB8876E4BD1E517DDEE67E480CEC9AAD2CA`，manifest `CC7063B0EC22F263CA8D47F052E82464E3F217374E37A4C571EABD44F902890E`。

## 浏览器复验

候选验证脚本通过真实 Chromium 复验：`BROWSER_VERIFICATION_PASS 2/2`。

- 桌面 `1440x900`：四卡 `176 / 9 / 24 / 3`，breakdown `帖子/动态 118`、`评论 58`。
- 移动 `375x667`：四卡 `176 / 9 / 24 / 3`，breakdown 同上。
- 两个视口均无卡片重叠、无横向溢出。
- `consoleErrors`、`pageErrors`、`failedRequests`、`badResponses` 均为空。
- API 仅命中候选脚本声明的 `/api/public-opinion/*` mock 路由；未访问 3001。
- 页面仍使用 `assets/app.js?v=154`，并已通过实际内容 hash 核对，不能仅凭数字放行。

## 只读与副作用

- `HEAD=200`。
- `POST/PATCH/PUT/DELETE=405`。
- 未写数据库，未切换服务，未发布、push 或 tag。
- 3000 适配器 PID `32376`；已通知项目经理在结单后关闭。
