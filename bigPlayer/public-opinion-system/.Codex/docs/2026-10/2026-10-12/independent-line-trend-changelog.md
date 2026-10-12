# 概览独立口碑折线图

Status: released

## 行为

在概览口碑趋势柱状图下新增“每日口碑走势”。默认近7天，可独立切换近30天，含今天，以北京时间自然日统计。顶部日期控件不改变折线范围；区域、社区、平台切换会重新查询。每天展示正向、中性、负面数量，存在未分析内容时增加对应曲线；无数据日期补零。加载失败支持重试，快速切换取消旧请求并阻止过期结果覆盖。

## 文件和逻辑

- `../admin/PublicOpinion/index.html`：折线图区域、范围按钮、响应式样式及脚本缓存版本。
- `../admin/PublicOpinion/assets/app.js`：独立范围状态、SVG折线、逐日补齐、范围及社区切换、取消与超时处理。
- `server/src/app.js`：只读 `GET /api/public-opinion/overview-trend`，复用概览时间解析和规范社区范围解析，规范范围优先于原始参数。
- `server/src/db/repository.js`：单条SELECT按北京时间日期聚合，保留区域、游戏、社区、来源、平台、发布时间及软删除过滤。
- `server/test/overviewTrend.test.js`：查询边界及HTTP契约测试。

## 接口

`GET /api/public-opinion/overview-trend?period=7d|30d&regionCode=...&communityId=...&platform=...`

返回标准 `{ data: { trend: [{date, positive, neutral, negative, unclassified, total}], window: {publishedFrom, publishedTo} } }`。范围可附加现有 `gameId`、`sourceId`。拒绝其他period、自定义日期参数和非法平台；无效社区沿用现有错误处理。只读，不提交同步、分析或写库。

## 验证

- 4项自动测试通过：新增趋势查询/路由及既有未关联告警概览回归。
- JS语法、指定文件空白检查通过。
- 候选与外网Edge验证：7天、30天、顶部日期独立、快速切换、按日合并、缺失日期补零、空数据、国内转海外、560px窄屏；无pageerror。
- 外网实际7天窗口2026-10-06至2026-10-12，30天2026-09-13至2026-10-12。
- 证据：`.tests/2026-10/2026-10-12/independent-trend-{candidate,live}.{json,png}`。

## 发布

基于切换前最新现役包定点修改，保留其他任务已发布内容；API仅两个运行文件改变，前端仅两个运行文件改变，另更新各自manifest。未改数据库、Worker或登录服务，未推送Git、未发送站内信。

- API：`C:/ProgramData/PublicOpinion/releases/release-20261012-daily-trend-1791778873510`，399文件包校验通过。
- 前端：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-independent-line-trend-1791778846400`，35文件包校验通过。
- 发布后确认4320实际监听PID52040及3001 PID41568均运行上述入口；外网页面使用新资产并通过交互验收。
- 旧运行包保留可回滚。

## 发现及处理

直接复用完整概览30天接口时，首次查询包含告警、议题、内容列表等无关聚合，外网返回504。改为专用单查询每日汇总后，外网7/30天均返回200。未改变既有完整概览接口；其历史30天聚合性能不在本轮修改范围。

现有API包校验器白名单未包含现役已存在的032/033迁移文件。临时校验器仅补充这两个已有路径，候选包对比确保迁移及其他继承文件内容完全不变，未执行迁移。
