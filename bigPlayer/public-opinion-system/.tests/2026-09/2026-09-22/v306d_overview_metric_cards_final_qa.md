# v306d 概览指标卡片独立 QA

## 结论

**FAIL / NOT_READY_FOR_RELEASE_WINDOW**。

候选静态资产本身边界清晰，但 3000 真实只读入口当前仍挂载 v154 基线资源，无法证明 v306d 候选已生效。

## 通过项

- `public-files.sha256`：`30/30` checksum PASS。
- 候选 `public/admin/PublicOpinion/assets/app.js`：`node --check` PASS。
- 相对冻结基线仅 2 个业务文件发生变化：
  - `public/admin/PublicOpinion/index.html`
  - `public/admin/PublicOpinion/assets/app.js`
- 两个通用 fixture 失败均可在 v303 基线复现，属于既有基线，不是 v306d 新增：
  - `TapTap 已取消同步显示终态并保留取消原因`
  - `stale sources response cannot replace the latest scope result`
  候选与基线均为 `30/32 PASS`、同一失败位置和同一失败断言。

## 浏览器阻断

使用合规 `127.0.0.1:3000` 运行候选浏览器验证脚本，桌面 `1440x900` 与移动 `375x667` 均出现相同结果：

- 脚本资源为 `assets/app.js?v=154`，但实际内容是当前 v154 基线逻辑；
- 四卡值为 `0 / 0 / 9 / 3`，没有候选要求的 `176 / 9 / 24 / 3`；
- `帖子/动态 118`、`评论 58` breakdown 缺失；
- console/page errors、failed requests、bad responses 均为空，布局无重叠且无横向溢出。

这说明 3000 服务可用，但候选没有接入该真实入口，不能把旧的 hermetic evidence 当作今日候选通过证据。

## 证据完整性

本次运行脚本会重写 `verification/browser-verification.json` 和两张截图；重写后它们与 manifest 中固化的 evidence/screenshot hash 不一致。候选 manifest 的静态文件清单仍为 30/30 PASS，但浏览器证据需开发侧重新生成并固化。

## 边界

未访问 3001、未写数据库、未切服务、未发布或 push；测试负责人未修改业务代码。
