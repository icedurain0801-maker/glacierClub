# 抓取内容管理：纯图片图标与悬停预览

Status: local frontend published and resource verified; BaaS unchanged

## 行为

- 纯图片帖子、动态和评论使用图片图标，多图显示数量；悬停、聚焦或点击可预览大图。
- 预览浮层挂载 body，避免表格溢出裁剪；位置限制在窗口范围内，多图可在浮层内滚动。
- 移出、Escape、页面滚动、翻页或页面离开时关闭并清理。
- 有正文及真正的空内容保持原显示。图片仅悬停后加载，失败显示明确提示。
- 支持 media 数组、JSON 数组和正文中的图片 URL，拒绝非 HTTP(S) URL 与带凭据的地址，正文保持 HTML 转义。
- 现有 BaaS 列表投影不含 media：仅对可视区域缺少文字且没有 media 字段的记录，最多并发两个请求调用现有带社区权限的详情 API 确认，不阻塞列表首屏；失败不影响列表。没有增加写库或外发消息行为。

## 文件

- `bigPlayer/admin/PublicOpinion/assets/content-image-preview.js`：识别、图标和预览交互。
- `bigPlayer/admin/PublicOpinion/assets/content-image-preview.css`：图标与浮层样式。
- `bigPlayer/admin/PublicOpinion/assets/content.js`：接入行渲染及清理。
- `bigPlayer/admin/PublicOpinion/content.html`：加载模块、样式并更新资源版本。

## 验证

`node .tests/2026-10/2026-10-20/content-image-preview.cjs` 使用隔离浏览器、模拟图片和模拟详情；覆盖单/多图、正文/空内容、URL过滤、悬停与聚焦、移入浮层、加载失败、重渲染清理及旧投影补查。

新增 JS 和 content.js 语法检查通过。

## 本机发布

用户明确要求只发布本机。基于现役 `release-20261020-single-post-layout-front-r1` 的 content.js/content.html 应用最小补丁，避免覆盖工作区尚未发布的其他修改；候选包位于仓库根 `.temp/content-image-local-20261020`，使用同一隔离浏览器脚本复测通过。

更新现役目录4项静态文件，没有重启服务。备份及部署hash清单：`E:/CodexData/public-opinion/audit/content-image-local-1792492434242/deployment.json`。从 `127.0.0.1:3001` 读取4项资源均为200，SHA256均与候选包一致。

真实本机页面浏览器验证：新模块及CSS已加载，无页面JS异常；独立浏览器没有可用社区，未将该结果当作真实Facebook图片数据验收。图片交互通过隔离候选包测试；截图 `content-image-local-published.png`。未提交BaaS托管、未修改后端或Worker、未推送Git。
