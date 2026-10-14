# v152 概览方案 3：视觉、排序与自然日联动真实浏览器验收

- 验收日期：2026-09-16
- 验收角色：测试负责人
- 环境：`https://lfy3001.dev.q1op.com` 真实页面与只读 API；未使用 4320/Mock，未启动服务、未写数据库、未触发 Worker。
- 验收范围：概览负面风险视觉、负面/关注双列 Top10 发布时间混排、默认今日/昨日自然日同窗与 Scope/深链回归。

## 结论

**PASS（范围内）**。真实浏览器自动化 3/3 通过，桌面与 375×812 截图复核通过，Console error/warning 为 0。

## 验收结果

| 验收项 | 结果 | 真实浏览器/接口证据 |
| --- | --- | --- |
| 方案 3 负面风险视觉 | PASS | 负面栏标题、查看/全部内容链接、风险标签为深红 `rgb(153,27,27)`；卡片背景为 `rgb(255,247,247)`，含约 3px 深红 inset 左线。 |
| 关注级视觉无回归 | PASS | 自动化将负面样式临时移除后比较几何；关注栏样式快照完全一致。 |
| 布局、尺寸、字段、间距及入口 | PASS | 负面样式前后卡片宽高、padding、margin、gap、文案、href、data-content 全部一致；桌面/375×812 无横向溢出。 |
| 双列统一混排与排序 | PASS | 真实 7 天 API 与页面状态中两列各 10 项，均按 `published_at DESC, id DESC`；两栏均显示“按发布时间倒序”。 |
| 默认今日与自然日边界 | PASS | 无 `period` 参数加载默认“今日”，URL 与深链写入北京时间 `[2026-09-16T00:00:00+08:00, 2026-09-17T00:00:00+08:00)`；边界专项验证半开区间，00:00 不重不漏。 |
| 昨日同窗联动 | PASS | 切换“昨日”后真实 overview 请求包含 `period=yesterday`；指标、趋势、议题、负面、关注、当前告警标签均变为“昨日”，昨日 `publishedTo` 等于今日 `publishedFrom`，窗口恰为 24 小时。 |
| Scope 与刷新、深链 | PASS | 页面刷新保持 `yesterday`；地区与社区切换后仍保持该周期；两个“全部内容”深链携带相同的 `publishedFrom`/`publishedTo`。 |
| 7d / 30d | PASS | 仍为可选周期，未被今日/昨日改动替换。 |
| 浏览器异常 | PASS | 真实浏览器脚本的 pageerror、console error/warning 均为空。 |

## 执行记录

```text
node --test .tests\2026-09\2026-09-16\v152_negative_risk_visual_browser.test.js \
  .tests\2026-09\2026-09-16\v152_overview_yesterday_browser.test.js \
  .tests\2026-09\2026-09-16\v152_overview_day_boundaries.test.js

3 passed, 0 failed
```

截图产物：

- `v152_negative_risk_1440.png`、`v152_negative_risk_375.png`
- `v152_yesterday_1440.png`、`v152_yesterday_375.png`

## 样本限制

本轮在真实 Last Light/BigPlayer 以外的本验收 Scope（境内 BigPlayer、7d/30d）抽查中，双列各 Top10 均为**评论**，未发现可进入双列的帖子、动态或长文本风险样本。因此未把不存在的样本伪造为已验收；当前已验证的实际评论卡片在桌面与移动端文本截断、摘要、类型标签和深链均正常。出现对应真实样本后，应补做非评论与长文本展示复验。
