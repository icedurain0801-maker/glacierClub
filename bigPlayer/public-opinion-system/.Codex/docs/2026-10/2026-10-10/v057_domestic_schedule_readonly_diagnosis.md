# 国内未按时采集：实际槽、内容与海外排除回归检查

Status: READONLY_DIAGNOSIS_COMPLETE; no implementation

检查时间：2026-10-10 上海时间13:16–13:21。只执行文件读取、Windows任务/事件/服务查询、定向SELECT及READ ONLY事务；自有事务rollback/关闭。未触发HTTP/入库/AI，未改DB/调度/配置/ACL，未重启服务。新增本文不代表修复或启源授权。

## 实际计划与执行

| 社区/平台 | 实际配置 | 今日合法槽与结果 | 当前结论 |
|---|---|---|---|
| 超能世界国服版 / BigPlayer | source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`，account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`，enabled/authorized，21600秒 | 上海02:00、08:00、14:00、20:00；02点run `e56eebe7-1280-42eb-9d39-d5d90da0f3eb` 02:01:41开始、02:04:01 completed_authorized_scope；08点run `d7830bff-ef41-4ef7-a2a9-821ad4ebc6c4` 08:01:44开始、08:17:07同终态 | 今日已到的两槽有真实内容事务；14点尚未到，未验证切换后14点采集 |
| 超能世界国服版 / TapTap | source `26b47b08-0a0d-4265-b377-3d313e2f1131`，account `727b1ded-1ac2-4379-b931-93e94a659af3`，enabled/authorized，86400秒 | 上海02:00；run `61726610-541b-439b-bce7-a26dda7bae84` 02:01:41开始、02:02:34 partial/PARTIAL_SYNC；下一槽10/11 02:00 | 已启动但没完整抓完，不是漏触发 |
| 圣魂纷争 | community enabled | 对应game/community的source及account均无行 | 未接采集源，不存在可执行槽；不能说上游为空 |
| 我要当老祖 | community enabled | 对应game/community的source及account均无行 | 同上 |
| 其余国内source | 仅另有disabled的SDK fixture与disabled超能tap | 实际loader仍返回，eligibility SOURCE_DISABLED | 不当已启用任务漏采 |

直接加载实际运行release的只读candidateLoader返回4个国内source：2个enabled符合来源/账号归属与授权字段，2个disabled。用现役computeSchedule和明确UTC时间重算，13:19 BigPlayer/TapTap dueSlotAt=null，下一槽分别14:00/次日02:00。connector capability在该离线计算中按既有支持能力提供，仅验证当前来源字段与时间，不冒称实时上游健康探测。

证据：仓库根 `.temp/domestic-current-slot-diagnosis-1791609557067.json`。

## Windows旧国内02任务确有错误，但不是统一Worker槽结果

`BigPlayer Q1 Daily 02` 当前Enabled=true/Ready/Interactive用户icedurain。action为cmd.exe，在用户工作区用嵌套命令设置source后调用 `public-opinion-system/worker/q1-daily.cmd`，WorkingDirectory为空；下一运行10/11 02:00。

TaskScheduler事件107/100/200证明10/10 02:00:01实际启动；02:00:49事件201返回2147942403，即0x80070003/ERROR_PATH_NOT_FOUND。LastTaskResult显示3对应这个系统路径错误，不是q1DailyJob设计的业务exit3。当前源码main仅设错误exit1、缺source dry-run exit2；统一scheduler enabled时旧入口按UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS跳过并正常返回。

同事件错误在可用日志内最早9/25 02:03:23，9/26、27、28、29、30及10/9也有，全部早于此次10/10 12:07海外排除切换。该日志最早样本不是全历史首次故障。当前管理员读取工作区路径存在，icedurain当前ACL有权限；这些事实不能反推当时到底哪个路径失败。没有q1-daily.log，确切失败命令阶段/历史路径上下文待确认，不将嵌套引号、ACL或未登录直接定为原因。

追加身份核对：whoami返回 `LIUFUYI-2-48\icedurain`，与任务用户一致；前文“当前管理员”指本工具执行上下文，不能据用户名目录认定是Administrator账号，也未验证其token与任务Limited完全相同。只读复核task命令前缀（set source、cd原路径、if exist launcher，不call任何业务脚本）退出0，路径解析及launcher当前存在。此结果排除“当前路径必然不存在/嵌套引号必然错误”的断言，但不能复现02点历史任务上下文；具体失败路径仍待确认，不为复现调用旧采集器。

统一Worker真实02/08 Run与旧Windows入口是两条路径：旧任务失败并不否定统一Worker已经提交的内容，也不能把Worker正常当旧任务通过。最小方案是由经理确认统一Worker为国内周期唯一入口后，退役旧重复Windows采集入口或将其改为持久只读状态检查；不直接修旧入口再开启第二采集者。涉及任务配置变更，当前不执行。

## 内容和时间证据

数据库会话NOW=上海13:16:59，UTC_TIMESTAMP=05:16:59，time_zone=SYSTEM。scheduled_at/started_at/finished_at/scheduler lease及heartbeat按UTC写；created_at、run_contents.fetched_at、collected_at、first/last_seen按数据库会话本地值写。pool timezone=Z不会改变NOW。published_at为connector规范化的内容时间，不能把裸数据库字符串直接当上海时间或把last_seen更新当新增。

- 02点BigPlayer真实401个run_content：168posts changed、18comments changed、215comments unchanged；fetched_at上海02:01:44–02:03:59。全部社区归超能，posts inserted0。存量collected_at不随更新变成今日新增。
- 08点BigPlayer真实5982个run_content：1431posts changed、62comments changed、4489comments unchanged；fetched_at上海08:01:56–08:17:07。全部归超能，posts inserted0；stored6741是既有运行计数，不能说新增6741条。
- TapTap真实592个posts关联：4 inserted、117 changed、471 unchanged，fetched_at上海02:01:42–02:02:32。新增4条的collected_at上海02:02:13–02:02:30，published_at包含历史年份，不当今日新发帖。现役TapTap listOwnedContents按from/accountIdx取页，未使用daily published窗口筛选，当前Run窗口不证明内容都在前一日。

## TapTap partial的确切机制与最小设计

实际run error_message明确：owned_content/owned、SYNC_PAGE_BUDGET_EXHAUSTED，cursor `{version:1,accountIdx:0,from:200}`。精确checkpoint `caebdaf5-25eb-48f2-ae8a-6477de95ed6f` 为idle/items200、无owner/lease，窗口UTC10/8 16:00–10/9 16:00。另一个keyword_search checkpoint已completed/items400，不能代替owned完整性。

现役Worker页预算20，TapTap group接口每页钳制10，因此20页后保存from200并partial，源码不会自动认领partial，下一日创建新窗口checkpoint。现役TAPTAP_MAX_PAGES默认50字段不决定共享syncStage的20页预算，不扩大它冒称可以补完。该状态在海外切换前02点已产生，不归因新五文件排除。

只设计：保留原partial/窗口/checkpoint/cursor，以现有唯一Worker承接该TapTap来源的有限旧窗续页任务，明确最大HTTP/页数/时间和下游入队范围，成功页原子保存，失败不越cursor；不要清旧cursor、不提高全局预算、不借次日checkpoint补旧窗、不新建第二consumer。若要保证前一日范围，需先明确内容时间筛选和排序证明，不能把历史帖子都算前一日新增。实际补采及新增持久工作结构/DDL均不在本次诊断授权内，当前无实现。

## 两社区接线缺项与最小设计

需每社区独立可验证站点URL/registry、对应source/default account的game/community归属、平台/board有效映射、授权材料和有效期、频率/生效点/初始回溯范围。已有圣魂boardId=1文档样例不是社区身份或授权证明；老祖映射待确认。只设计disabled独立配置，材料闭合及验证后再由经理启用；不复制超能source制造跨社区内容归属、不重归旧内容。启源会新增国内HTTP/入库/AI工作量，须明确上限；当前没有写配置或启源。

## 海外五文件回归检查与时序限制

实际PublicOpinionWorker node38428于上海12:07:16启动，入口精确为 `C:/ProgramData/PublicOpinion/releases/worker-release-v055-overseas-exclusion-1791605078003/worker/src/worker.js`。逐文件与旧现役v055 diff仅有固定海外source `081a16d2-5545-4afd-9c65-e04777e4540b` 及其account排除：

1. worker.js的runSource/runPagedSource/syncStage/syncStagePage仅匹配该source；syncStage在checkpoint claim前拒绝。
2. workerScanLease recovery对目标source及所属account排除，running/queued两个OR整体括号正确。
3. repository runnable/manual/legacy due及claim对该source/account排除，国内两source/account不匹配。
4. candidateLoader追加固定source排除，国内真实loader返回不受误过滤。
5. schedulerRepositoryAdapter写前仅拒绝固定海外source，未改国内frequency、slot或lease条件。

当前scan gate owner/lease=null；国内source旧schedule lease过期，无活跃国内queued/running/pausing/cancelling，无残留维护gate阻断。国内BigPlayer next14点、TapTap次日02，过期租约可由合法新槽覆盖，无需为清字段改DB。现役heartbeat completed/scan_error=null和当前scan日志只是循环证据，不能代替切换后采集验收。

本次切换后截至13:21没有到新的国内合法槽，因此不能签“排除版已经实际按槽采集通过”。14点尚未到，未主动触发或新建监控。当前证据未发现五文件误过滤国内，但不把未来槽未验说成排除全部回归。

已证历史迟到：10/8 08点槽run `33b41b44-f48d-4e93-a040-9da88c6a5b1e` 09:41:05建、09:42:07启动、10:02:58完成，迟到约1小时42分；wrapper日志09:40:53启动Worker与其后建槽吻合。此前停机起点/原因及更早缺槽未有完整证据，不能据有限Run记录断言最早全局漏采或把历史缺行当未采集。9/25旧Windows路径错误、10/8迟到、10/10 TapTap partial、两社区未接源是不同事实。

## 交经理的执行顺序（方案，不执行）

1. 先把“国内漏采”明确为具体社区/平台/应执行槽或期待内容时间，保留今日超能已执行与14点未到结论。
2. 独立测试核同source/slot/内容时间与五文件谓词，若自然14点出现实际错误，再按准确reasonCode做最小修复；不盲重启。
3. 清理旧重复Windows采集入口的职责冲突，配置变更由经理决定；不让旧路径修复变成双消费者。
4. TapTap按精确原窗cursor与预算设计有限补完；两未接社区按材料缺项设计接线，均不在只读诊断中执行。
