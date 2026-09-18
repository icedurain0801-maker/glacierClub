# v198 PublicOpinion 五页顶部统一：浏览器验收

- 验收角色：测试负责人
- 验收时间：2026-09-17
- 范围：顶部 DOM、共享 CSS、缓存版本、作用域联动；未修改主体、接口、server/worker/Windows 服务、生产数据，也未 push/发布。
- 结论：**FAIL**。

## 阻断项

用户已确认并拍板的视觉硬门禁未满足：顶部标题区必须保留四周留白，并与下方主内容卡片栅格左右对齐，且不出现多余底部空条。

本次外网 `content.html` 强刷桌面截图显示：

- 深蓝标题区从主内容左边缘贴至页面右侧，且贴页面顶边；
- 下方统计卡片和内容卡片从更内侧 gutter 开始；
- 两者左右边界不一致，故不符合“以 content 顶部为基准且与主体栅格对齐”的最新验收口径。

因此五个待统一页面不能判定通过，停止后续 PASS 结论。

## 已确认的非阻断事实

- 六页均引用 `public-opinion.css?v=194`，外网强刷为 HTTP 200。
- 六页运行时均渲染深蓝渐变、`8px` 圆角、阴影、白色主标题、浅色副标题；顶部仅有区域、社区两个选择器。
- 375px 自动化检查中页面 `scrollWidth=375`，顶部元素未越界或重叠；浏览器 Console `error/warning=0`、业务 API 5xx=0。

上述结果不能替代视觉硬门禁，故最终仍为 FAIL。

## 作用域补充风险

切换至境外并刷新时，六页均能保持有效的境外 `regionCode/communityId/platform`。但自动化历史回退后，`index.html`、`alerts.html`、`sources.html`、`collection-runs.html`、`keywords.html` 的 `communityId` 变为空字符串；仅 `content.html` 保持完整作用域。该项也不满足本单“前进后退保留有效 regionCode/communityId/platform”要求，应随修复一并复验。

## 复验门禁

开发修复后，必须在外网强刷逐页验收：

1. 顶部四周留白，与主体卡片左右 gutter 对齐，不贴顶、不贴右，且无额外底部空条。
2. 六页桌面与 375px 均无横向溢出；窄屏选择器合理换行。
3. 区域/社区切换、侧栏跳转、刷新、后退/前进都保留有效 `regionCode`、`communityId`、`platform`。
