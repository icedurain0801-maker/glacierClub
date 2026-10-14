# 正式六页面社区选择功能验收

- 日期：2026-10-10；测试总监独立浏览器验收。
- 结论：`FORMAL_SIX_COMMUNITY_UI_PASS`，仅六社区选择、地区切换与只读接口范围。
- 实际入口：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html`，全部通过同域侧栏访问；未使用3000预览。

| 正式页面 | 境内三社区 | 境外三社区 | 地区切换 |
|---|---|---|---|
| index.html | 通过 | 通过 | 通过 |
| content.html | 通过 | 通过 | 通过 |
| alerts.html | 通过 | 通过 | 通过 |
| sources.html | 通过 | 通过 | 通过 |
| collection-runs.html | 通过 | 通过 | 通过 |
| keywords.html | 通过 | 通过 | 通过 |

六页面境内选项均为“超能世界国服版 / 圣魂纷争 / 我要当老祖”；境外均为“X-Clash / Last Light / Hero Clash”，加载完成后社区选择器启用，地区、communityId及侧栏链接同步更新。切换异步加载时短暂“暂无可用社区”随后正常加载，不作为持续功能缺陷。

正式`/api/public-opinion/communities?regionCode=domestic`与`regionCode=overseas`两个GET均HTTP200。界面呈现对应三社区；接口保留其他目录记录不是本次前端选择功能缺陷。

进一步实际选Last Light并通过侧栏进入sources：URL communityId为`00000000-0000-0000-0000-000000000102`，页面读取1个账号源，地区/社区显示“境外 / Last Light”、BigPlayer社区、版块100017、已授权。现有“sync run lease lost”历史同步状态如实显示，不据此归因本次静态更新，也不表示本轮定时已经通过。

浏览器期间未发现error级控制台日志。只操作筛选和导航、只读GET；未点击开始同步/新增/删除/保存，不执行上游抓取或AI，不重启或改服务。不补候选hash或旧矩阵。实际定时功能继续另行验收。
