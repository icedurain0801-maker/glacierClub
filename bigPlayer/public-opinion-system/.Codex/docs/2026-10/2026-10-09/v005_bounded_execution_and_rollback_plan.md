# 有界验收与回退计划（未执行）

Status: DOMESTIC_AUTHORIZED_AWAITING_INCREMENTAL_QA。最新国内授权允许现有运行账号既有权限，模式current-runtime-protected-readonly；旧仅SELECT/USAGE账号限制已撤销，保留工具内禁写与固定身份/库/端口。当前准确执行器hash、模板及口径见v007末“最新授权增量”，本文旧权限/等待审批段落为历史方案，不再作国内同类审批阻断。生产由项目经理串行执行，开发不并发连接/切换；海外授权范围不变。

## 已只读核实的现役入口与新增阻断

`C:/ProgramData/PublicOpinion/services/PublicOpinionApi.xml`：id PublicOpinionApi；executable `C:/Program Files/nodejs/node.exe`；arguments 为带引号的 `C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008/server/src/app.js`；workingdirectory 为该包 server。确实直接运行 app，无另一个启动脚本。切换需同时保持 executable、只替换 arguments/workingdirectory 的包路径，不能假设别的入口。

Worker XML 为 `C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml`，SHA82cb2aa0b974c0df980405f3eef379f88c8c59d12d3ef06ab9ad7dc8111acbee；直接运行 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js`，该文件SHAa932a32f55174d1715cfd5eaa36cc57e2668ec03f89d23cae81078bd3030bf75。全程不改动、不重启。健康调度确切资产尚未定位，计划任务名称匹配 PublicOpinion/舆情未返回项目，不据此认定没有调度；它仍是具体执行前待补项。

现役前端进程19768直接运行 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/frontend3001-server.js`；对应 public/admin/PublicOpinion/assets/sources.js SHA2dc368b11c7fc54fa948df8eea72b77b9ed9c8644e3631408cd15d3e19440d68，第390行仍用 `.length`。因此不含 checkpoint_count 补丁，仅API切换会让 pending 偏小。最小方案是从现役静态文件复制候选，只改这一处 reduce(checkpoint_count??1)，另交静态QA/hash及原字节备份回退、另列批准写集合；不替换工作树整份前端。此静态候选本轮未生成或上线。

固定43322正式受保护执行器已产出，最新精确路径/hash及测试见 v007；不能使用旧技术 cjs 覆盖原报告。不现在运行真实DB。现有身份核实计划为使用批准的连接读取 CURRENT_USER()/DATABASE()/@@port 和 SHOW GRANTS，只输出身份和权限种类，不输出密码/连接串；不满足限定只读则停止，不新建账户。

海外真实feed→Store→AI→日调度的独立执行器尚未就绪：目前只有隔离认证源码和registry事务模块，不是可部署Worker。无法保证共享生产Store/AI/调度隔离前，真实抓取入库阶段阻断，不得借国内Worker试验。后续阶段计划必须分别限制固定board100017、单页≤20帖、单根≤20评论、一次≤40入库行、窗口≤120秒、无重试；AI最多5条、外部调用预算明确后才可执行；独立海外调度使用单独进程/lease scope，不接共享国内Worker。写集合/逐行回退需随具体Store候选补齐，不能将本段预算视作实现或授权。

## 国内新包只读复核

目标包为仓库根 `.temp/bigplayer-recovery-20261009/v019-read-compat-vgfxk2`，完整 hash 见 v004。只申请复核固定 `127.0.0.1:3306/public_opinion`；现有连接身份及 SHOW GRANTS 的确切权限待确认，不新建账号，不把 SELECT 正则等同只读权限。身份不满足批准边界则停。

执行器先安装 mysql factory 保护再 require(app)，明确 env 路径，不跑 server main、迁移或 Worker；禁止 execute/getConnection，query 只许可计划中的 SELECT、单语句、8秒超时、connectTimeout3秒、pool1；禁外部 fetch。固定临时 loopback 43322，端口占用停，不探别端口。窗口总上限60秒、逐 HTTP10秒、一次五 GET、不重试：health；国内 sync-runs pageSize20；既有详情 ID68878a64-8601-44ce-91f9-5df034e4fa7e；来源5c21f78d-5f67-4467-963d-dcdeb5e26cab latest；国内 sources。输出状态、计数、耗时、SQL hash，不输出源数据/凭据。

前后 hash 必须实际测量：candidate app/repository/manifest；现役 v019 app/repository/manifest；`C:/ProgramData/PublicOpinion/services/PublicOpinionApi.xml`；现役 Worker manifest/服务配置及健康调度确切文件路径先确认。任何缺失不硬编码 false。仅退出执行器自有 HTTP/Pool，不碰现役。原技术报告保留，新报告独立路径。

## API 切换与失败回退（仅供项目经理确认）

独立 QA 通过且用户具体批准后，目标复制到 `C:/ProgramData/PublicOpinion/releases/v019-read-compat-vgfxk2`，仅改变 `PublicOpinionApi` XML 的 arguments 与 workingdirectory 包路径；保留 node executable、LocalService 身份、全部 env 和其他配置。当前 XML 已知基线 SHA为11ba38dbd7559cbde05a80f5c705a4d6d530fbcb058bc77017b660881f79e0bb4，执行时重测/CAS不符停，不盲用历史值。先保存当前 XML 与 hash，核旧 v019 395文件可用；不改数据库、不运行 DDL、不切 Worker、不动健康调度。

停止/启动仅 API 服务，4320 五 GET 各10秒一次，任一非200/超时/字段计数不符/启动失败立即回退：恢复刚保存 XML 原字节、核 hash、只重启 API，验证 v019 health 与五 GET，保留失败日志。v019 原有读取缺列/性能问题可能仍存在，回退仅保证现役基线，不宣称业务已恢复。目标目录保留供审计，不删。切换本身未授权、未执行。

## 海外真实授权计划（未执行，不替换现役）

先确认 token 种类、现有有效直接 api_token 路径和公开登录合同差异；不得由游客态推断原 token 无效。限定 source081a16d2-5545-4afd-9c65-e04777e4540b、origin https://club-en.q1.com、board100017、languageId2/9/16，不生成 SDK token、不刷新共享凭据。

若获具体交换确认：每站最多一次 login/token GET，10秒，无重试/redirect；严格 code0 才继续每站一次 context、一次 v2 board（不fallback），总最多9请求、90秒。任意游客/401/403/缺token/board不匹配立即停止该阶段并清内存；不执行 feed、comments、入库或调度。交换会在上游生成会话，不能称纯只读；本机写集合仅脱敏结果/脚本hash，不保存 token。退出清内存；撤销上游会话的正式合同待确认，不能保证退出等于上游撤销。

registry 应用另行批准：事务只 UPDATE 固定 source.config、INSERT 两 po_source_sites（auth unknown），无DDL；before 配置原字节、registry/run/checkpoint/lease 快照与 inspectSiteAlignment planHash 绑定批准。同URL保留 legacy siteId，不迁历史 run；before3配置/1registry→after3配置/3registry。回退调用 rollbackLastNightSiteAlignment，输入原 config、当前 after hash、两 insertedSiteIds；新站产生历史时失败关闭，转人工方案，不删历史。后续采集/Store/日调度需另立具体有界验证，不在本计划内。
