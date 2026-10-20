# 网页业务查询切换 BaaS

Status: completed; deployed-api-and-browser-verified

## 用户要求与实际范围

用户要求“网页查询也走 BaaS”，沿用已授权的直接发布和本机保留后台任务方案。近三天 6097 条内容加 251 条关联上下文已经在 BaaS，此次切换的是网页业务数据的读取来源。

网页继续调用现有 4320 API，经现有 SSO、导航及社区权限校验后，查询内容由 BaaS 私有集合提供。没有将后台委托 Token 发给浏览器，也没有将私有集合改成所有成员可读来代替社区权限。BaaS 前端托管 v1 的既有拒绝状态不变，本次实际发布的是现役本机 API 和 3001 前端。

| 工作 | 完成情况 |
|---|---|
| 云端关联数据补齐 | 社区/游戏目录、来源摘要、账号显示名称、任务状态、处置、优质候选、告警及关联已同步 |
| 查询适配 | games、communities、contents 列表/详情/stats、overview、overview-trend、quality-contents、alerts 已读取 BaaS |
| 自测与真实数据对照 | 29 项定向测试通过；5 个有数据社区计数与原库对齐；详情分类、评论原帖和翻译抽样通过 |
| 发布与实际网页验收 | API r3、前端 r2、SYSTEM 同步任务 r5 已运行；3 个实际外网页面通过 |

采集账号、授权、配置、采集/分析/翻译任务控制和权限规则仍由本机服务管理。网页仍需要本机 API 作为权限与接口适配层；此次没有部署云端自定义 API，也没有完成全部历史业务表的权威数据库切换。

## 修改文件与逻辑

- `server/src/services/baasDataClient.js`：服务端 BaaS 客户端与 DPAPI 解密入口。固定域名/应用，严格 TLS 校验，不回显凭证。
- `server/src/services/baasReadMetadata.js`：白名单导出关联元数据，正文、来源 config、凭据和 raw_payload 不进入元数据集合。按 180000 字节切片，先写不可变摘要 ID 分片，再更新 manifest，避免读到未完整发布的一代数据。
- `server/src/services/baasReadRepository.js`：从 `po_live_contents_v1` 和 `po_read_metadata_v1` 读取，恢复页面字段、类型、原帖关联、有效翻译、分析解释和风险复核口径；实现筛选/排序/分页/统计/趋势、处理状态和告警查询。服务端过滤允许的社区，不依赖前端隐藏菜单；跨社区直接详情也不可见。
- `server/src/app.js`：读请求接入云端查询适配，响应包含 `meta.dataSource=baas`、`coverageFrom` 和 `x-data-source`。跨域响应允许读取来源标记。缓存 key 包含读取后端和社区权限范围。处置/审核仍沿用本机审计事务，之后同步元数据并清除缓存；云端同步失败时明确返回“已保存，待重试同步”，后台任务继续补偿。
- `worker/src/baasLiveWriter.js`：保留新增队列和历史刷新；加入分析、翻译及内容更新时间的优先队列，每轮最多检查 50 个变更内容，成功确认后才推进时间/ID 水位。相关更新时间沿用数据库北京时间墙钟，和发布时间的 UTC 口径分开。每分钟同步元数据，摘要不变时不重复写入。
- `scripts/publish-baas-read-metadata.cjs`、`scripts/refresh-baas-changed.cjs`：初始化关联元数据及优先变更补齐，沿用 `po_baas_live_writer` 命名锁。
- `../admin/PublicOpinion/assets/baas-auth.js` 及 8 个 HTML 的脚本版本：展示云端数据覆盖说明，并更新资源版本。只发布本轮差异，保留当前运行包里的既有来源/钉钉功能。

内容云读结果共享 60 秒进程缓存；初次读使用创建时间顺序、4 路受控分页，后续按更新时间读取增量并保留重叠窗口，每 10 分钟完整回读恢复外部删除。概览和趋势继续共享原有结果缓存。失败不回查本机内容库；未过期缓存仍可复用，过期后的云读失败返回 503。

## 运行发布与凭证

- API：`C:/ProgramData/PublicOpinion/releases/api-release-20261014-baas-cloud-read-r3`，XML 启用 `PUBLIC_OPINION_DATA_READ_BACKEND=baas`。
- 前端：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-baas-cloud-read-r2`。
- 同步任务：`PublicOpinion BaaS New Content Sync`，SYSTEM，每分钟，`release-20261014-new-data-r5`。任务依赖 API r2 中的元数据发布模块，该模块与最终查询 API r3 一致。
- 查询凭证：`C:/ProgramData/PublicOpinion/config/baas-query-token.dpapi`，仍是 DPAPI LocalMachine 密文，仅 SYSTEM、Administrators 和 API 的 LocalService 有读取权限。未进入前端或源码。到期时间仍为 2026-11-13 11:13，需续期；未声称永久自动续期。
- API 和 3001 短暂重启，其他四项业务服务未重启。六项服务全部 Running，同步任务 LastTaskResult=0。
- 旧运行包、原库及切换前 XML/任务配置保留。API 初版准备期间现役包发生变更，最终从新的现役包叠加本轮改动，没有回退其已有功能。

## 自测与验收证据

`node --test server/test/baasReadRepository.test.js server/test/baasAccess.test.js worker/test/baasLiveWriter.test.js .tests/2026-10/2026-10-14/baas-recent-migration.test.cjs`：29 项通过。覆盖社区权限、直接 ID、告警/原帖越界、处理后计数、过期紧急复核、类型、搜索、日期边界、翻译指纹、失败不回退、变更确认水位和分片上限。

`.tests/2026-10/2026-10-14/baas-cloud-read-acceptance.json`：全部 6348 云文档被查询适配读取，范围内 6097 条与原库一致。5 个社区的帖子、评论、关注、紧急及细分计数一致；4 种详情抽样通过。首次加载从 43346ms 降到 14289ms，增量刷新从 8886ms 降到 1111ms。原库持续更新期间曾出现风险计数差异，补齐两条变更并加入优先同步后再次对齐。

`.tests/2026-10/2026-10-14/baas-cloud-query-live.json`：最终发布 API 的 10 项实际查询均 200，响应来源为 BaaS；未登录本机入口返回 401。最终冷启动约 11467ms，缓存后查询约 78–382ms。实际 SYSTEM 同步任务成功，未发生重复写入。

`.tests/2026-10/2026-10-14/baas-cloud-query-browser.json`：实际外网 `https://lfy3001.dev.q1op.com` 的概览、内容、告警页面及 7/30 天切换通过，没有模拟浏览器响应，无 HTTP/脚本错误。初版验收脚本等待到按需求隐藏的空模块，修正为只等待可见模块后通过。

语法、运行包依赖闭包/manifest、空白检查通过。前端发布包不含服务端源码和凭证；真实正文导出/截图保留在仓库根 `.temp/`，未复制进源码或前端包。

## 数据覆盖边界

主体数据从北京时间 2026-10-12 开始，另含必要的较早原帖/父评论；更早日期的 7/30 天区间尚未完整迁移。页面明确提示覆盖范围。后续新增和已迁内容的分析、翻译、处置变化自动同步，受同步批次和查询缓存延迟影响，不声称每次更新即时可见。原库仍保留，后台任务仍运行在本机。
