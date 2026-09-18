# v199 PublicOpinion 顶部留白与历史作用域：外网浏览器验收

- 验收角色：测试负责人
- 验收时间：2026-09-17
- 范围：仅前端布局与作用域接线；未修改业务接口、服务、数据，也未 push/发布。
- 结论：**PASS**。

## 缓存版本

外网有效社区作用域下，`index`、`content`、`alerts`、`sources`、`collection-runs`、`keywords` 六页均实际返回并加载：

- `public-opinion.css?v=199`
- `assets/scope.js?v=147`

## 桌面布局

六页标题区均满足以下量测结果：

- 顶部留白为 `22px`；不贴页面顶边。
- 标题区与首个可见主体模块左右边界一致：常规页 `left=246/right=1414`；内容页统计卡组 `left=248/right=1412`。
- 标题区到首个可见模块间距均为 `18px`，无额外底部空条。
- 顶部仅区域、社区两个选择器。

## 375px 布局

- 六页 `scrollWidth=375`，无横向溢出。
- 标题区左右均保留 `12px` 至 `16px` 内边距，选择器换行后仍在视口内。
- 已人工目检内容页桌面、关键词页 375px 截图，留白与主体栅格表现符合门禁。

## 作用域回归

以有效境内社区切换至境外社区后，六页均验证通过：

1. 刷新保留有效 `regionCode=overseas`、`communityId=8b1f0000000000000000000000100013`、`platform=bigplayer_h5`。
2. 后退恢复有效境内三项作用域。
3. 前进恢复有效境外三项作用域。
4. 侧栏跳转至下一舆情页后，仍保留完整境外三项作用域。

浏览器 Console `error/warning=0`，`/api/public-opinion/` 响应 5xx=0，主体页面未见回归。

## 截图归档

六页桌面及 375px 截图共 12 张：

`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\.tests\2026-09\2026-09-17\v199_header_gutter_screenshots\`
