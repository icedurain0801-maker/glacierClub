# 全页面社区选择器收窄

Status: FORMAL_SIX_COMMUNITY_UI_PASS，2026-10-10经理无重启更新正式7静态工件，测试总监v047完成正式域六页面独立功能验收；下方历史未交付记录保留，不代表当前状态。

## 2026-10-10 正式交付收口

按v054准备包实施scope.js和六HTML，仅静态文件、无服务重启、无DB/API/Worker/XML改动。正式域及localhost3001读取v148，旧7文件备份保留，原release manifest未重写，包旁implementation.md记录实施。

测试总监v047在真实域https://lfy3001.dev.q1op.com/admin/PublicOpinion/独立验收index/content/alerts/sources/collection-runs/keywords六页：境内超能世界国服版/圣魂纷争/我要当老祖，境外X-Clash/Last Light/Hero Clash；地区切换、URL/侧栏scope同步正常，communities两地区GET200。Last Light sources真实读取1账号源、境外/Last Light/board100017。未点击同步/保存/删除、未抓取或AI，未使用3000预览。接收FORMAL_SIX_COMMUNITY_UI_PASS，此任务完成，不补候选/hash矩阵；历史lease lost不归因静态更新，不签海外定时PASS。

用户直接要求：所有舆情页面右上角社区选择，境内仅保留超能世界国服版、圣魂纷争、我要当老祖；境外仅保留 X-clash、last light、hero clash。按用户顺序展示，英文可按真实社区名称保留规范大小写，不创建假社区。

实现范围：`bigPlayer/admin/PublicOpinion/assets/scope.js` 共用逻辑及所有引用页。概览、抓取内容、通知、账号、运行记录、关键词均一致。读取真实社区身份，不修改 DB 社区、来源、账号、权限、采集、Worker、调度、AI，不删除任何历史数据。

设计：在社区数据进入共享 state、默认选择和渲染前统一按地区白名单过滤及排序；使用真实 id/externalId，兼容核实后的名称大小写。URL/session 指向不在名单的旧社区时回退至本地区可用白名单社区并同步状态，不让隐藏社区查询残留；保留权限/停用限制、空态和请求 epoch 取消机制，不扩展权限或臆造选项。更新所有引用页资源缓存版本。

| 事项 | 负责人 | 状态 |
|---|---|---|
| 截图与共享入口核对 | 项目经理 | 已完成 |
| 真实六社区名称/ID只读映射 | 开发负责人/测试负责人 | 独立实际请求验证通过 |
| 白名单、排序、旧URL/session回退与引用缓存版本 | 开发负责人 | 候选已交付，六页scope v148 |
| 六页切换、深链、缓存、空态及权限独立复跑 | 测试负责人 | 已通过；停用/无权限/空态为隔离验证 |
| 本机实际页面结果核验 | 测试负责人/项目经理 | 3000实际六页两地区12/12通过 |
| 用户正式入口资源交付 | 开发负责人/项目经理 | 未完成；经理确认正式入口仍引用v147，待精确静态工件交付方案 |

交付要求：文件清单/hash及原始验证；独立 QA 不以开发自测判 PASS。新需求是海外重写之外的前端补充，不取消海外重写，不恢复其他旧任务。开发负责人负责分配不冲突文件任务并串行收口。

## 候选流转

开发候选：同目录 `v039_community_selector_manifest.json`（9文件：前端7文件、隔离测试、changelog）；说明 `v038_global_community_selector_changelog.md`。scope SHA256 `0193f49d1a74b5166ffb12d89512567b0635d0e8455ec798931096f337814fb1`。开发报告 node --check、隔离测试4/4、前端diff空白检查通过，均非独立QA结论。

已交测试负责人锁9文件hash并独立复跑，验实际服务响应资源hash和六页面效果，不以磁盘候选替代服务生效证据。当前候选完成/独立QA进行中，本机实际页面生效待验证；未push/发版。

## 独立验收收口

用户追问后经理只读核正式入口：https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html及127.0.0.1:3001/admin/PublicOpinion/index.html均HTTP200、仍引用assets/scope.js?v=147；正式scope.js?v=148虽HTTP200但没有候选白名单中“我要当老祖”字面。3000是QA静态代理，不能代表正式3001入口已接候选。已消息要求开发只读核静态root/release及仅7前端工件的交付路径/影响，不改Worker/DB/采集、不自动重启或发版。此前“本机页面修改与独立验收完成”仅候选/QA预览，正式交付仍欠缺。

证据：`.tests/2026-10/2026-10-09/v061_global_community_selector_candidate_independent_qa.md`，清单v059。结论 PASS_OBSERVED_UI_CANDIDATE：9/9前后hash一致，独立隔离4/4，3000实际服务7/7资源hash一致；六页两地区12/12指定选项/顺序/旧URL回退/v148通过；24/24 scoped API请求使用正确真实ID，地区切换与跨页保留通过。live停用/无权限/空态仅隔离验证，未改生产数据构造场景。候选无DB/Worker改动，未push或发版；UI完成不替代海外采集验收。
