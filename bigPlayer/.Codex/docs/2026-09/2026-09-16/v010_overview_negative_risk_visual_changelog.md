# v010 概览负面内容风险视觉

日期：2026-09-16
Status: passed_with_real_sample_limits

- 仅调整 `admin/PublicOpinion/index.html` 的概览“负面内容”栏。
- 为该栏增加 `overview-negative-content` 专属类；所有新增视觉规则均以此类为根选择器，不影响关注级内容或其他页面。
- 负面内容卡片使用 `#fff7f7` 极浅红背景与 `inset 3px 0 #991b1b` 深红左侧标识；不改变栅格、尺寸、字段、间距、入口或渲染逻辑。
- 标题、查看动作和“全部内容”使用 `#991b1b`，hover/focus 保持深红反馈；类型标签为 `#fee2e2` 浅红底、深红字；正文基色为 `#1f2937`，摘要为 `#8b6565`。
- 两列均改为按 `published_at DESC, id DESC` 取混排的帖子、动态、评论 Top10；保持原时间窗口、Scope、筛选和详情/全部内容深链，栏内说明统一为“按发布时间倒序”。
- `published_desc` 沿用热点投影和社区关联，保留 `game_name`、`region_code`、`community_name` 等既有归属字段；仅排序从互动量改为发布时间。
- 概览周期新增“昨日”，默认无时间参数按“今日”请求。服务端按北京时间自然日归一：今日为 `[今日 00:00, 明日 00:00)`，昨日为 `[昨日 00:00, 今日 00:00)`；既有 7 天和 30 天口径不变。前端继续使用同一 `/overview` 返回窗口更新所有模块和深链，Scope/社区选择保持原行为。
- 负责人定向验证：昨日边界测试 `1/1 PASS`；概览路由半开区间与全模块同窗集成测试 `3/3 PASS`；最终真实浏览器自测及独立验收已完成。
- 业务改动文件：`admin/PublicOpinion/index.html`、`admin/PublicOpinion/assets/app.js`、`public-opinion-system/server/src/app.js`、`public-opinion-system/server/src/db/repository.js`；未修改共享 CSS、Scope JS 或其他页面，不 push、不发版。
- 必要自测：仓储 `node --test test/repository.test.js` 120/120 PASS；概览路由 `node --test --test-name-pattern='GET /overview' test/app.routes.test.js` 3/3 PASS（独立测试库）；北京时间自然日边界脚本 `v152_overview_day_boundaries.test.js` 1/1 PASS。
- 真实3001浏览器开发自测：`node --test .tests/2026-09/2026-09-16/v152_overview_yesterday_browser.test.js .tests/2026-09/2026-09-16/v152_negative_risk_visual_browser.test.js` 2/2 PASS，桌面1440×900及移动375×812；负面配色、关注栏不变、尺寸/字段/间距不变、两列实际返回10项且发布时间/ID倒序、真实昨日请求和窗口、全部模块日期标签、深链窗口、刷新及Scope保留、Console零error/warn。
- 新增/更新验证文件：上述三份v152脚本及`server/test/repository.test.js`的归属字段、三类型投影、稳定排序SQL和双列Top10断言。SQL合同不替代真实浏览器验收；同时间ID降序由SQL定向断言覆盖。
- 仅重启本机4320 API加载当前代码，最终PID31400；3001代理、数据库和常驻Worker未变。小需求免单独评审，已一次性交测试负责人。
- 独立最终验收：测试负责人通过3001真实页面及只读API验收PASS，自动化3/3 PASS、0失败，桌面/375×812及Console通过；报告：`public-opinion-system/.tests/2026-09/2026-09-16/v152_overview_visual_sorting_daily_browser_acceptance.md`。
- 真实样本限制：当前验收Scope双列Top10均为评论，未独立覆盖帖子、动态与长文本风险卡片；三类型混排及同时间ID降序已有定向合同证据，不外推为这些类型的真实页面PASS。出现对应真实样本后由项目经理安排补验，不制造样本。
