# 候选17测试安全退回及影响核查

Status: NO_GO / investigation-in-progress
Date: 2026-10-09
Owner: 开发负责人

## 已实施

- 工作树 `scripts/freeze-overseas-manual-candidate.js --test` 立即失败关闭，不执行任何测试；旧快照未改动，不能依靠工作树修复保护旧命令。
- v105/v107更正为QA安全退回，撤回整批“完整离线/生产未动”结论。已消息通知QA停止旧命令。
- 员工只读审查三份raw及源码：app.routes独有成功用例证明其before真实测试库DDL/DML已执行，默认3306，URL仅替换schema为public_opinion_test；raw没有实例身份，不能确定历史endpoint。
- 当前项目.env及服务配置脱敏摘要均为127.0.0.1:3306/public_opinion；当前值不等于历史父进程env。冻结包未含.env，父进程继承env仍可能影响目标。
- 新增 `scripts/overseas-test-impact-readonly.js`，只接受显式模式，当前项目配置仅本机3306，直接mysql2只运行SELECT/SHOW，不载入业务Repository/runtimeEnv，不创建或清理fixture；凭据不打印，仅写根.temp诊断证据。待运行，不预写结果。

## 尚未证明

历史实际host/port/serverId/datadir/PID与环境来源无法从旧raw恢复；没有写前基线，不能把当前表元数据/PID连续性视为无修改证明。尚无证据证明public_opinion业务表修改，也不能断言未修改。旧测试的after可能吞cleanup错误，禁止现在补清理或回滚。

## 剩余待办

| 事项 | 状态 |
|---|---|
| 当前实例身份、schema元数据、日志可用性只读核查 | 待执行 |
| 独立离线防护与负测，明确集成NOT_TESTED | 待实施 |
| 新冻结包及安全QA消息交接 | 待执行 |
| scheduled独立工程 | NOT_IMPLEMENTED / 另批 |

本次不生产DDL/DML/重启、不真实HTTP/账号刷新、不commit/push/发版；3306任何库不写，旧证据不删不改。

## 当前只读观察（不是历史连接证书）

第二份只读原件SHA256：`9b014636fe65a41a4e7628102f345a61192ba7025045d1e81f88ed8451c2b369`。

10:59 UTC两次诊断仅SELECT/SHOW，原件根.temp `overseas-test-impact-readonly-XtHzjq/result.json`、`overseas-test-impact-readonly-qVfB3x/result.json`。首次生产表筛选误用无po前缀得到空结果，第二次修正为正式po表名；两份都保留，空结果不当作无生产表证明。

当前127.0.0.1:3306 identity：server_id=1、datadir=`\\xampp\\mysql\\data\\`、MariaDB10.4.14、诊断DATABASE()=NULL（刻意不选择业务库），connections836/837。3306 owner PID5900/mysqld，StartTime2026-10-08 10:00:19；Node19584/19768仍10:02:27/10:02:25。当前public_opinion_test存在，po_sync_runs CREATE_TIME10月9日10:51:27 UTC，多表UPDATE_TIME10:51:30 UTC，与末次开发自测时间附近相符，属当前同实例测试库写入强旁证，但元数据不能精确归属历史连接或每条SQL。

两个schema未见trigger；当前log_bin和general_log均OFF，没有启用或修改日志配置。TABLE_ROWS仅估算，生产表正有运行期变化，不能把UPDATE_TIME视为本候选写入证据。无历史目标日志和写前快照，不能证明生产业务库未变、不能完整恢复测试库变化。已确认测试库写流程成功，应按越界测试事故处理而非PASS。

## 安全runner修复落地

新增不可覆盖 `offline-test-guard.cjs`：mysql2惰性inert pool允许构造/mock替换，但真实query/execute/getConnection立即拒绝；禁止env加载、TCP/TLS连接/listen、UDP/DNS、全部子进程及Worker。ESM内置导出同步。属于可信测试事故防护，不是恶意JS/原生扩展安全沙箱，不能承诺OS级隔离。

专门selftest首轮FAIL：Worker deny箭头不能new，错误是TypeError不是约定拒绝码；修为普通函数，不放宽拒绝。复测26项PASS，无真实连接尝试。freeze safe-v2每文件独立Node进程、no-isolation防node:test自行派子进程；环境白名单，不继承DB/服务/NODE_OPTIONS。所有含子进程/listen/env mock的测试明确NOT_TESTED，不改业务断言、不冒充绿色skip。执行前selftest、精确测试集合、外部SHA与前后inventory必核；旧manifest不能在新runner执行，旧快照依然危险不可运行。新安全包尚待冻结、开发回归和QA。

首安全冻结wAzd6v（878项）前置selftest被正确阻断，尚未业务测试：NODE_OPTIONS双引号内Windows反斜杠被Node当转义，模块路径失效。仅修runner使用正斜杠绝对路径；旧失败包保留，不改guard拒绝，另冻结。

员工只读复审没有常见3306事故路径P0；P1发现q1DailyJob间接child漏排以及catch可能吞guard拒绝假绿。负责人补精确NOT_TESTED、guard进程退出固定脱敏拒绝计数、逐文件TAP汇总，任何拒绝/skip/cancel/未知计数均FAIL，不凭exit0放行。总超时统一保存已执行raw，剩余文件逐项NOT_TESTED。gtxVrY仅上一版回归历史，不作为最终新防护结果，待再冻包。

yFpGfy员工审查追加P1：退出计数listener可能早于后续cleanup，漏记退出阶段被catch拒绝。改为每次deny同步stderr输出固定code（不含SQL/参数），runner看到任意DENIED行即FAIL，退出计数仅辅助。未放开任何IO；yFpGfy历史回归保留，另冻最终包。

新32AVIO安全包878项冻结，128/128离线文件PASS且套件拒绝计数0、18排除NOT_TESTED；原始记录/外部SHA见v109。已真实消息交QA先安全复审，再独立子集/自有SQL矩阵。不将该子集通过解释成历史零写、生产放行或完整manual工程验收。当前影响核查仅能确认测试库写流程及当前旁证，历史目标不可完整追溯；未补清理/回滚/启用日志。4脚本语法检查、定向diff --check exit0，生产进程连续性只是当前观察。
