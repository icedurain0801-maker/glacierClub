# v052 国内采集调度独立只读诊断

日期：2026-10-10；采样北京时间13:17–13:18。结论：存在独立02任务路径错误、TapTap预算partial、两社区未配置三个不同问题；截至采样未发现已配置大玩家源的到期槽未调度，不签三社区完整覆盖或切换后新槽采集PASS。

| 社区/入口 | 应触发与实际结果 | 判定 |
|---|---|---|
| 超能大玩家共享Worker | frequency21600，上海02/08/14/20；02 run e56e 于02:00:41建/02:01:41开始/02:04:01完成，08 run d783 于08:00:44建/08:01:44开始/08:17:07完成；均completed_authorized_scope | 两槽实际执行，约41–44秒入队、约1分41–44秒开工；14槽未到，不能说后续漏采 |
| 超能TapTap共享Worker | frequency86400；02 run617于02:00:41建/02:01:41开始/02:02:34结束，partial/PARTIAL_SYNC | 具体错误SYNC_PAGE_BUDGET_EXHAUSTED/from200，采集未完整；不是未调度 |
| 圣魂纷争 | community enabled；国内source与account清单无对应行 | 未配置采集，不是已配置run漏领 |
| 我要当老祖 | 同上 | 未配置采集，不证明上游无内容 |
| Windows BigPlayer Q1 Daily 02 | 02:00触发、02:00:01启动cmd、02:00:49 action返回2147942403 | 实际路径错误，不能把LastResult3当正常；此入口与共享run须分开 |

## 真实内容与“没有新数据”口径

固定三个run的run_content JOIN实际内容全部归超能 `00000000-0000-0000-0000-000000000101`。

- 02大玩家：posts changed168/inserted0；comments changed18/unchanged215。08大玩家：posts changed1431/inserted0；comments changed62/unchanged4489。真实关联证明采集和更新发生，但不是新增内容；stored等总量不冒称新增数。
- 08 posts的collected_at范围仍10/8 09:43:18–10/9 20:01:48，本次last_seen更新至10/10 08:06:13；comments last_seen更新至08:17:07。按首次collected_at或发布时间过滤时可能看不到“今天新增”，这是可能的显示解释，未直接核用户当时页面筛选，不能断言UI根因。
- TapTap posts inserted4/changed117/unchanged471；4条新增记录collected_at为今天02:02:13–02:02:30，published_at范围为2023-09-05–2026-10-07，均早于上一日窗口。证实有入库，不证明上游没有新内容，也不签窗口内完整覆盖。
- 精确checkpoint `caebdaf5-25eb-48f2-ae8a-6477de95ed6f`：account `727b1ded-1ac2-4379-b931-93e94a659af3`，site NULL、owned_content/owned/posts、root空，UTC窗10/8 16:00–10/9 16:00，idle/from200/items200、无租约、error为空、updated_at上海02:02:08。本次未续完；下一日槽换窗口，不应假设自动补旧partial。

## 独立02任务Result3

Windows TaskScheduler/Operational 同一instance `{00bbe356-2879-433c-a0e2-d8f7e6f7bb04}` 的200/201事件确认action启动且返回2147942403，即0x80070003/HRESULT Win32 3，系统找不到指定路径。事件102“成功完成”表示任务实例结束，不代表业务成功。

实际action引用用户profile下 `.../project manage/bigPlayer/public-opinion-system/worker/q1-daily.cmd`，以 icedurain 身份执行；当前wrapper按脚本路径计算bigPlayer/logs/q1-daily.log，但该logs目录为空、无此日志。当前q1DailyJob正常统一调度门禁打印UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS并return，不能解释本次路径错误。具体哪一步/哪条路径失败、02时实际脚本版本与账户路径权限仍待开发定位；不执行task或脚本复现。共享02run不是该cmd成功证据，也不能由cmd失败推共享run失败。

## 海外排除切换的独立因果检查

读取真实服务XML，action指向共享排除release1791605078003，WORKER_MODE与UNIFIED_SOURCE_SCHEDULER_MODE均enabled。对比旧正式release与新release五文件（worker.js、workerScanLease.js、schedulerCandidateLoader.js、schedulerRepositoryAdapter.js、repository.js）：新增过滤/guard均针对海外source `081a16d2-5545-4afd-9c65-e04777e4540b` 及其accounts，不匹配国内大玩家 `5c21...` 或TapTap `26b...`；扫描gate的acquire/renew/release未变。

两个只读快照gate owner/lease均NULL，epoch18179推进至18180，心跳completed/errorNULL，13:14–13:17真实日志连续scan_completed。源码runOnce finally释放自有token（非leaseLost），当前无持续scan gate阻塞证据。国内source租约已过期，当前不存在国内queued/running run或manual marker；expired source lease不是当下未到期14槽的阻塞证据。

schedule明确：大玩家last00:00UTC/next06:00UTC=上海08/14；TapTap last10/9 18:00UTC/next10/10 18:00UTC=上海10/10 02与10/11 02。截至13:18切换后尚无新的国内到期槽可验，不能用旧08成功证明新release14槽正常，也不能把02独立任务错误归因12:07补丁。当前没有补丁导致国内漏槽的实际因果证据。

## 时区与诊断缺口

DB NOW=13:18:44、UTC_TIMESTAMP=05:18:44。scheduled/start/finish/lease字段使用UTC，created/collected/last_seen等现有字段使用本地会话时间；published_at为连接器写入时间，不对所有历史字段统一加减8小时。关联内容当前last_seen可能被后续run更新，不能冒称02run当时最后更新时间。

给开发的精确缺口：定位02独立cmd路径错误；解释TapTap旧窗partial与窗口外内容处理；若用户指特定新增帖，需经理提供社区/帖子ID及页面筛选口径后对照持久内容，当前不请求上游。若要验切换后的下一合法槽，另由经理安排14槽只读验收，不自行trigger或建立监控。

原件：仓库根 `.temp/qa-v052-domestic-schedule-1791609446754.json`（清单）与 `.temp/qa-v052-domestic-schedule-1791609525352.json`（附实际关联与checkpoint）。脚本 `v052_domestic_schedule_readonly.cjs`，两次定向READ ONLY/CONSISTENT SNAPSHOT/rollback，退出码0。Windows事件、实际action与五文件差异为本次只读工具输出。未修改业务/DB/config，未补采/HTTP/AI、重启或完整矩阵。

## 追加独立核收

- 历史Windows事件201独立检索亦找到10/9 02:00:46同一任务action返回2147942403；该路径错误至少前一天已存在，早于10/10 12:07海外排除切换。当前管理员能读工作区文件不证明02时icedurain身份能读，也不定位当时具体失败路径。旧任务当前workingDirectory为空、action含嵌套引号；仅作为开发待定位点，不直接断言引号就是根因，不默认建议恢复为第二采集消费者。
- 实际部署TapTap connector的group feed每页强制最多10条；worker buildDeps默认pageBudget20，服务XML未指定SYNC_PAGE_BUDGET/TAPTAP_PAGE_LIMIT。owned本窗items200/from200与该预算一致；历史进程环境没有独立快照，不把当前默认当历史配置的完整证明。预算用尽保存idle/cursor并返回未完成，由run的实际PARTIAL_SYNC进一步证实。
- 同account/精确窗口/keyword_search另有checkpoint `45798d72-b336-46da-964d-1333ed8b6f91`，completed/items400/cursorNULL/无租约。keyword完成不能抵消owned预算partial；新日换窗口不自然补旧窗。
- 附加keyword首次SELECT因PowerShell解释cursor标识符引号返回ER_PARSE_ERROR；改为精确身份SELECT后成功，未产生业务写入。附加检查没有重跑任务。

诊断已收口：目前已配置源不存在已到期却完全无run的槽证据；独立旧task有历史路径错误，TapTap有实际partial，圣魂/老祖缺配置。用户指哪条“新数据”仍需具体内容及筛选口径对照，不能签三社区全覆盖或上游零新帖。
