# 国内读取修复已执行变更记录

2026-10-09；Status: PASS_POST_CUTOVER_DOMESTIC_READ_UI。

用户在项目经理会话批准本次具体执行，并允许既有运行配置账号现有权限，采用current-runtime-protected-readonly。执行人为项目经理，开发未并发生产连接/切换。受保护执行器与QA独立五GET均通过后，经理串行复制395文件新release、修改API XML两字段、只重启API、替换静态单点文件。

现役release绝对路径 `C:/ProgramData/PublicOpinion/releases/v019-read-compat-vgfxk2`；API相对原现役仅app/repository必要读取差异：六缺列兼容、列表先ID分页、latest先ID、来源受控摘要及首错误原因。静态sources仅pending length→checkpoint_count求和；完整checkpoint缺字段仍按1。

| 资产 | 已执行后SHA256 |
|---|---|
| server/src/app.js | 32737749da6217e4e3f12ceeb632d1b1d4328c415682c1602ef73eb3b4193e97 |
| server/src/db/repository.js | f6b73474a329861e12469d58918c5d272478b89fff6f5f606cb59464cef1343e |
| release/package-release-manifest.json（395项） | 2cb014364222f660d07e4c324b4f241a6a6ff1ebe6ace2a62ef4f9f385d45f06 |
| C:/ProgramData/PublicOpinion/services/PublicOpinionApi.xml | b851c079fbc65d3cf1b236ddb73fcd87e94c7a79e02043fbb8f96f79b1a96b0f |
| 现役frontend sources.js | e7a50696141b1455aa44fef4bd2d19cfe7cad29bd00cb2a9421657380976af88 |

XML只arguments/workingdirectory改为新release/server；node executable、LocalService、env保持。除了批准API XML与sources，14基线其余文件未变，三个任务定义未变；Worker PID19960未变。此处是项目经理已执行回执，未另行重连生产验证。

## 证据与验收边界

原始受保护结果绝对路径 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-approval-plan-egMBHN/readonly-result.json`，独立QA同目录qa-readonly-result.json。已读取原报告：两次PASS_READONLY_HTTP且前后hash不变，五GET分别41/932/61/516/1641ms及50/1045/74/637/1434ms。报告保留，不覆盖。

经理切换后回执五GET均200，顺序health/list/detail/latest/sources为45/635/53/473/1742ms；3001实际asset SHA为e7a506...，页面posts262391/pending298、comments244757/pending1072，错误回退可见。以上为阶段计数，不宣称新增入库行数或采集完整。

切后独立UI QA已完成，结论 PASS_POST_CUTOVER_DOMESTIC_READ_UI，窗口已释放。3001禁缓存资产HTTP200与候选hash匹配，真实页面状态、pending、items_fetched及错误回退与4320来源8行摘要一致。列表20项、meta.total=4105，必要字段存在；目标详情在列表中且source/role/status一致，latest属于目标source并在列表中，detail/latest的parent_run_id与parentRunId一致。页面既有pagination_budget失败仍存在，属于采集范围问题，不在本次读取修复内，不隐藏或标成已修复。海外授权/采集/调度/Store/AI未完成，不由国内成功推断海外成功。

QA额外观察窄视口侧栏遮挡，尚不能归因本次补丁，另列响应式待办，不扩大本次修复或改变验收结论。

## 回退资产（未执行回退）

绝对目录 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-cutover-approved` 已核存在：PublicOpinionApi.before.xml、sources.before.js。
原XML SHA11ba38dbd7559cbde05a80f5c705a4d6d530fbcb058bc77017b660881f79e0bb4，原static SHA2dc368b11c7fc54fa948df8eea72b77b9ed9c8644e3631408cd15d3e19440d68；旧API release仍为C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008。

若最终QA出现本单回归，由项目经理按v007批准步骤恢复sources原字节、XML原字节并核旧hash，仅重启API；不碰Worker/任务，不删release/历史数据。旧API读取缺列/性能问题可能仍在，回退不宣称业务完整恢复。

无DDL、push、账号权限改写、海外请求或其他生产改动。本轮仅归档文档，业务包继续冻结。
