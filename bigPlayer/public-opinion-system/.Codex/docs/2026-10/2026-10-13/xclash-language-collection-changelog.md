# X-Clash 多语言采集修复

Status: 修复已发布，真实补采验收完成

## 原因与最终口径

旧配置三个地址的 lang 均为 ja-jp。旧采集器只读取 lang，不执行官方 H5 的 languageId 解析，因此三个任务请求了同一日语内容范围。单纯往列表 URL 加 languageId 无法纠正请求头。

上游公开 `/api/club/v1/setting/language` 和官方 H5 初始化代码确认：2=en-US、9=ko-KR、16=ja-jp。修复期间读取到来源配置已更新：三个新站点地址没有 lang，旧登记停用；本次保留该更新，不恢复旧地址或 siteId。

## 修改

- `server/src/connectors/q1LanguageResolver.js`：与官方 H5 一致，通过配置中心将 languageId 解析为 Content-Language，并覆盖缺失或过期的 lang。映射缓存 10 分钟，查询超时 10 秒；无效 ID、缺失语言代码、配置获取失败显式报错，不默认抓取其他语言。不传业务认证凭据给公开语言配置接口。
- `server/src/connectors/bigPlayerH5Connector.js`：各站点的帖子、评论、详情、版块请求共用解析器。国内及不带 languageId 的旧来源保留原逻辑。
- `server/test/q1LanguageResolver.test.js`：新增语言解析与实际连接器请求测试。
- `server/test/bigplayerOverseasAuthorization.test.js`、`server/test/lastNightSiteSession.test.js`：为新增的公开语言配置请求补充模拟数据，保留鉴权、取消、范围检查断言。

## 自测与真实验证

相关 32 项测试全部通过，语法与修改文件空白检查通过。证据：`.tests/2026-10/2026-10-13/xclash-language-tests.txt`。

真实连接器从当前三个无 lang 地址各读取 20 条内容，请求头依次为 en-US、ko-KR、ja-jp；三组 ID 指纹不同，样本 ID 两两交集为零，韩语和日语样本分别包含对应文字，配置中心只调用一次。证据：`xclash-fixed-live-probe.json`。此为真实只读采样，不代表完整覆盖所有历史数据。

## 发布与补采

现役 Worker 与 API 包分别叠加新增解析器和连接器三处接线，未将工作区其他未发布功能复制到运行包。

- Worker：`worker-release-20261013-language-context-r1`，415 文件 manifest 校验通过。
- API：`release-20261013-language-context-r1`，408 文件 manifest 校验通过。
- 两个运行包的实际连接器分别通过 7 项专项测试；服务已切换，API health 返回 200。
- 服务 XML 的 `.before-language-context-r1` 快照与旧运行包保留。
- 前端未修改，不执行 DDL、删除、断点重置、角色权限修改或 Git push。

通过现役 Repository 的原有准入提交一次 bounded backfill，父任务 `4a575849-8b24-4285-9290-a3cf3bd50177`，北京时间 10/11 00:00 至 10/13 17:49:04.863。三个子任务按当前站点快照采集，使用原去重、租约、授权和提交逻辑。范围内新内容会入库并沿用既有后续处理流程。

补采状态及 10/12 各站点入库统计持续保存至 `.tests/2026-10/2026-10-13/xclash-backfill-status.json`；不得将采样成功或任务入队描述为完整补采完成。没有使用真实管理员浏览器保存配置，本次验收以真实连接器和数据库任务关联内容为证据。

## 最终验收（北京时间 18:05）

三个站点子任务均为 completed_authorized_scope，错误码为空。英语范围处理 921 条、韩语 242 条、日语 125 条（运行计数与实际评论正文统计采用现有不同口径）。

10/12 任务关联数据：英语 291 条帖子、606 条评论；韩语 85 条帖子、156 条评论。当天全部有效入库记录共 430 条帖子、990 条评论，修复前为 54 条帖子、227 条评论。

本次补采由旧 Worker Repository 创建 manual 子任务，该版本只自动汇总 scheduled_site 子任务，因此三个实际采集任务完成后父任务仍 queued。使用一次性 `xclash-finalize-parent.cjs` 在事务内锁定本次父任务与全部三个子任务，确认相同来源/账号、授权范围完成、无错误和无租约后，按现有 aggregateParentStatus 汇总并写审计。父任务现为 completed、错误码为空；未修改任何子任务、内容或断点。未扩大修复范围去改动其他历史任务或调度实现。

此次没有覆盖所有历史日期，仅补采指定的 10/11 至执行时刻范围；后续共享采集链路使用官方 languageId 映射。
