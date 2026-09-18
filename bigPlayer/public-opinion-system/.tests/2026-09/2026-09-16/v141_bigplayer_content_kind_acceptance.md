---
date: 2026-09-16
status: blocked
scope: 抓取内容管理 BigPlayer 帖子/动态分类与类型筛选
owner: 测试负责人
---

# 测试结论

结论：部分通过，整体阻塞，不能作为完整通过结论。BigPlayer 动态分类、动态展示、类型筛选控件、TapTap/Discord 隐藏及筛选清空均符合要求；当前真实浏览器样本未出现有真实标题的帖子，无法盲测“有标题=帖子”以及三个空标题原始值（`null`、空串、纯空白）分类。

## 已验证

- 真实页面：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html`，已强制刷新。
- BigPlayer 下“全部分析等级”右侧可见 `全部类型 / 帖子 / 动态`，选项值为 `'' / post / dynamic`。
- 当天 BigPlayer 帖子页的首批真实记录均显示类型“动态”；包括 ID `918470`、`918469`、`918468`，内容列未显示“（无标题）”。
- 动态详情 ID `918470` 标题显示“动态”，原文内容为“有点东西”，未出现“（无标题）”。
- 选择“动态”后显示上述动态记录；选择“帖子”后当前加载页显示“暂无匹配内容”。该筛选为本页客户端筛选，页面总数仍为 `76`，未误作后端总量。
- 切换 TapTap 后类型控件隐藏，URL 自动清除 `bigPlayerContentKind`，列表恢复 TapTap 两条真实帖子。
- 切换境外 Discord 后类型控件保持隐藏，URL 不含 `bigPlayerContentKind`。
- `lfy3001` 控制台未发现 error/warn。
- 只读核对 `admin/PublicOpinion/assets/content.js`：`bigPlayerContentKind` 只用于 `filterBigPlayerContentKinds(state.contents)`，构造 `/contents` 请求的 query 未添加该字段；未新增服务 API 参数。

## 未验证/阻塞

- 当前日期 `2026-09-16`、超能世界国服版、BigPlayer 的两页样本均未返回有真实标题的帖子，故无法验证“有真实标题=帖子”与“帖子”筛选命中真实标题记录。
- 页面不回显原始 `title` 字段，无法仅通过浏览器区分 `null`、空串、纯空白三种输入；仅能确认现有无标题样本均渲染为“动态”。
- 历史 BigPlayer 的同规则未取得可区分样本。

## 需要开发负责人补充

请提供可在真实页面稳定访问的 BigPlayer 有标题帖子，以及 `null`、空串、纯空白各一条可识别样本/定位入口。补齐后由测试负责人继续盲测，不改变服务 API 或采集数据。
