# 国内 2026-10-09 当天漏采：首段隔离补采候选

Status: candidate / 待独立 QA 和经理实际执行，未声称已补采。

## 已复现

经理一次国内首页只读请求捕获于 `2026-10-09T04:31:29.177Z`。首屏16条当天帖子（UTC02:56～04:15）均不存在于目标源数据库。上一run688窗口终点UTC00:00:33（上海08:00:33），现役Connector按半开窗口过滤，不能覆盖这些后发帖子。6小时下一slot上海14:00，不解决当前页面today0。昨天置顶有缺失，历史漏采原因仍未确认。

证据：仓库根 `.temp/domestic-today-recovery-20261009/first-page-readonly-evidence.json`。不保存token、正文或生产原响应到可提交文档。

## 修改与逻辑

- `worker/src/domesticTodayRecovery.js`：仅锁国内source/account/community101/board2/game2131；窗口起UTC10/8 16至固定捕获上界；复用既有事务入库、独立持久checkpoint和共享现役account advisory lock。Connector无时间边界早停，置顶旧帖不请求详情；每页保存完整详情、入队AI成功后才推进cursor，失败可幂等重放。
- `server/src/connectors/domesticTodayDetailConnector.js`：注入冻结现役Connector，不启动worker；完整详情匹配ID，合法纯媒体/opaque复用已审块验证纯函数，原样保存脱敏详情/hash，body为空，明确title-only及媒体未分析。HTTP失败/空内容/错ID不存摘要。
- `scripts/domestic-today-recovery.js`：构建新实际require闭包manifest；经理approved plan/SHA一致方可执行。严格TLS、本机DB与identity检查、现有token不刷新、限页和240秒请求取消。默认首段1页；不调度、不重启服务、不迁移、不push。
- `worker/test/domesticTodayRecovery.test.js`：隔离fixture覆盖范围拒绝、置顶过滤、入库/AI顺序、AI失败重放、摘要拒绝、乱序后页不早停、纯媒体详情。
- `worker/src/domesticTodayRepository.js`：真实schema无board列，新增国内legacy列事务适配，不DDL。按真实source/external唯一键检查目标归属，READ COMMITTED事务锁活checkpoint与目标ID，不做无索引fingerprint扫描；显式写collected_at，保留raw详情/hash/body/删除。真实site注册ID为`site-7586e54f3a0cb84f433d59cf6baa1d4d`，与source.config.siteUrls逐一核对。

## 验证与剩余工作

验证命令：`node --test worker/test/domesticTodayRecovery.test.js`，10/10通过（包括actual冻结现役Connector/legacy事务SQL/offset ceiling不得误completed/无标题富内容不调用AI）。CLI与Repository adapter `node --check`通过。不以隔离fixture通过冒现场完成。

当前执行候选plan：仓库根`.temp/domestic-today-recovery-20261009/plan-first-segment-v5.unapproved.json`；运行111文件SHA绑定，旧plan/v2/v3/v4撤销不可执行。已消息流转测试负责人和项目经理，等待独立QA放行，由经理串行实际执行。无业务代码commit/push，无服务重启，无DB写入。报告区分所有入库ID/AI eligible ID，并列16证据ID及本段missingExpectedIds；首屏重读可能被后发内容挤占，不预先声称16全部入库。立即require闭包已绑定，运行期懒加载依赖覆盖仍由独立QA核验。

审查修正：捕获终点精确锁定`2026-10-09T04:31:29.177Z`；纯媒体标题取真实详情而非列表摘要，无标题/正文仅保存并记录noTextForAi，不入AI队列；SQL字符串published_at按UTC与Date比较，避免重放误记changed；offset ceiling只partial不completed。

独立QA已于本次消息交接给首段条件GO，证据`.tests/2026-10/2026-10-09/v038_domestic_today_first_segment_v5_qa.md`；已再次消息通知项目经理实际执行及只读对账。仍未取得真实补采结果，状态不能改为需求完成。

现场第一段v5在loadEnv后拒绝，未DB/HTTP/输出。经理确认legacy env有TLS=0；v6最小修正仅独立进程在loadEnv前后显式TLS=1，不修改env文件、现役进程或DB target，不降低TLS验证。旧v5不可修改hash后盲执行，需新freeze/QA。

v6经独立QA v039放行后真实执行失败ER_PARSE_ERROR；经理后验cp idle/cursorNULL/items0/无lease、today0，不能仅此推断未HTTP。准确代码缺陷是新增adapter SET cursor未引用MariaDB保留字；现役claim/release正常不改。v8引用`cursor`并添加失败阶段白名单，不输出SQL/message/正文/凭据；新plan-first-segment-v8.unapproved.json取代v1-v7，输出必须新文件，不覆写first-segment-execution.json。等待增量QA/经理真实parser只读验证后再执行。

v8经独立QA v040条件GO及经理MariaDB EXPLAIN只读解析通过后，经理真实执行已inserted16、AI入队16、PARTIAL。证据根`.temp/domestic-today-recovery-20261009/first-segment-v8-execution.json`；原16证据缺926875/926874/926869（被后发3帖挤到下一页），尚未全集/AI分析完成。已消息交经理保持111运行闭包不改，沿相同window/checkpoint/maxPages1仅新output串行下一页；并流转测试真实读回。全分区posts及comments/replies仍未完成。

首段只保证首页posts截至捕获时刻，`PARTIAL_TODAY`不等于当天完成，AI入队不等于分析完成。后续其他分区全部当天posts、comments/replies、独立DB与today页面读回均未完成。不得用旧海外候选或七天回补替代。本候选未真实HTTP/DB写入；经理收到独立QA结果后实际执行。
