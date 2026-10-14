# 按各社区来源频率设置采集后两分钟检查

Status: 已启用并核验配置，未提交、未推送 Git

## 行为

- 取消海外任务上统一的02:02每六小时附加触发器。每个启用的来源创建独立的 `PublicOpinion Source Check <sourceId>` 任务。
- 从真实 po_sources.frequency_seconds 读取频率。1天：每天02:02一次；6小时：02:02/08:02/14:02/20:02；1小时：每小时02分。TapTap已配置自定义每日时刻时采用该时刻后两分钟，支持跨日。
- 每次检查重读当前频率与生效时间，旧触发器不匹配时点时直接退出。停用/未授权、人工暂停/取消/待验证、已完成、运行中/排队中的来源不重复请求采集。
- 普通来源经现有 requestCollect 入口请求恢复，Worker继续执行原授权和采集准入。Worker服务停止时尝试启动。海外专用来源仍使用原隐藏启动器和独立采集器，保留隔离校验及租约。
- 来源创建、配置保存、PATCH修改后异步同步任务。海外主触发器本身也按自己的配置频率更新。没有每分钟的新检查任务。
- 检查运行中的任务不会中断它，也不是“强制两分钟完成”。超过检查时点后才发生的故障等后续触发处理。调度同步失败时不会阻塞配置保存；需要检查运行日志/实际任务，不能把配置成功视为采集必然成功。

## 文件

- worker/src/sourceCollectionCheck.js：频率、时点及恢复判定。
- scripts/windows-services/source-check-runner.js：来源级检查、任务计划同步、原采集入口调用。
- scripts/windows-services/sync-source-check-tasks.ps1：从计划生成按来源频率的隐藏Windows任务。
- server/src/services/collectionCheckSync.js、server/src/app.js：配置修改后同步任务。
- worker/test/sourceCollectionCheck.test.js、server/test/collectionCheckSync.test.js：频率变化、跨日、重复与运行环境限制。

## 现役与验证

- API运行包 release-20261013-source-check-frequency-r1，从原现役包精确追加同步钩子，保留其他改动。
- 独立检查运行目录 C:/ProgramData/PublicOpinion/collection-check/runtime/，未修改业务频率和历史内容。
- 19项测试通过，语法与空白检查通过。
- 真实数据库7个启用来源生成7个任务。每日源26b47b08...：DaysInterval=1、02:02、无日内重复；六小时来源PT6H。隐藏启动器保留。
- 在非检查时点调用每日源检查返回NOT_CHECK_TIME，没有触发采集。
- 可见Edge真实SSO验证每日源配置页频率86400/1天，详情接口200，无页面脚本错误，不写业务配置。证据 source-check-browser.json/png。
- 没有等待下一02:02/14:02实际触发，不声称新的检查已在生产完成恢复采集。
- 排查中发现海外独立采集日志仍有OVERSEAS_SHARED_EXCLUSION_NOT_ACTIVE（共享Worker再次更新）。本次频率修复不会绕过该阻断，不代表海外采集错误已恢复。

证据位于 .tests/2026-10/2026-10-13/source-check-*；临时部署脚本及API备份在仓库根 .temp/overseas-hidden-launcher/。
