# 国内静态单点与只读执行器交付

Status: INCREMENTAL_QA_PENDING。最新授权模式为 `current-runtime-protected-readonly`：允许既有运行账号现有权限，不修改账号、不新建/替换账户，固定身份/库/端口与工具SELECT防护不变。下文旧模板和旧SELECT/USAGE账号限制仅为历史记录，已被本文末最新授权增量取代，不是当前阻断。API vgfxk2和静态e7a506不变，尚未生产验收/切换。

## 静态 artifact

现役绝对文件：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/public/admin/PublicOpinion/assets/sources.js`，SHA256 `2dc368b11c7fc54fa948df8eea72b77b9ed9c8644e3631408cd15d3e19440d68`。

定位依据：现役 node PID19768 命令运行该 release 的 frontend3001-server.js；脚本 staticRoot=path.join(__dirname,'public')，动态 fs.createReadStream 读取资产。sources.html 第16行引用 `assets/sources.js?v=209`。所以该文件是服务实际根内资产，不是工作树或历史其他 release。

候选绝对路径：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-pending-bMQyMh/sources.js`，SHA256 `e7a50696141b1455aa44fef4bd2d19cfe7cad29bd00cb2a9421657380976af88`。
同目录 sources.before.js 是现役原字节备份，manifest.json 含完整前后 hash/字节偏移/单点 diff；由 scripts/build-domestic-pending-artifact.js 从现役副本生成，未取工作树整文件。

唯一差异：byteOffset44782 的 pending 过滤后 `.length` → `.reduce((total, item) => total + Number(item.checkpoint_count ?? 1), 0)`。其余字节完全相同。null/undefined 回退1，兼容完整 checkpoint；数字/数字字符串转换求和，0保持0，空数组0；非法数字仍是既有 Number 策略的 NaN，不新增隐式纠错。正式摘要 COUNT(*) 产生正整数；不接收业务接口任意非法值为放行依据。

## 正式只读执行器

绝对路径：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system/scripts/domestic-readonly-executor.js`。
最终 SHA256 `41f440ddd91e066dcdb3feb61d639683ccca73933ad072e617eb35561b7b6fb5`（仅调整现有账号权限授权模式；旧42c542/faccc/b0a9版本不再用）。

默认拒绝执行。准备命令 `node scripts/domestic-readonly-executor.js --approved-readonly <绝对批准计划json>`，本轮未运行。计划包含 approved/executorSha256/envFile/output/expectedIdentity/baselineFiles/expectedBefore：身份由用户批准后具体填写，不生成账户、不默用root。明确env仅DB_HOST127.0.0.1/DB_PORT3306/DB_NAMEpublic_opinion，无DATABASE_URL；固定candidate manifest校验。baseline inventory强制含新app/repo/manifest、现役app/repo/manifest、API XML、Worker XML/入口及现役sources，另加入保活任务定义文件。

在 require(app) 前拦截 mysql factory/global fetch；构造阶段DB query禁止，运行阶段 SELECT单语句且拒绝锁、outfile、sleep/benchmark等；无getConnection/execute。显式受控pool connectTimeout3秒、query8秒、pool1，真实身份查询3秒、SHOW GRANTS3秒。允许现有账号既有权限，不以grants具备写权限拒绝；只校验批准expectedIdentity/public_opinion/3306，主入口绑定127.0.0.1。工具仍禁写，不输出权限原文或凭据。计划基线按expectedBefore CAS校验，不覆盖既有输出。

只监听127.0.0.1:43322；占用停。五GET原白名单每次≤10秒、一次、无重试；五次总窗口≤60秒，结果仅状态/耗时/计数/SQLhash；不保存完整payload。拒绝其他方法/路径、禁外部fetch、不运行server main/Worker。退出仅关闭自有HTTP/Pool，实际前后hash写独立新报告。失败不得解释为生产已修改/未修改，依真实hash结果判断；报告存在即停止防覆盖。

离线 `node --test server/test/domesticReadonlyExecutor.test.js` 3/3 PASS：固定43322五GET+guard pool、hash不变、写查询/额外权限拒绝、static单字节span及完整/摘要计数语义。原日志仓库根 `.temp/bigplayer-recovery-20261009/domestic-executor-static-final.log`。这是fake pool HTTP，不是真实DB权限验收。node --check脚本/候选静态通过。

## 保活/健康调度只读基线

计划任务 `\\BigPlayer Keep Server Alive` 当前 Disabled，trigger Enabled/Interval PT5M；action wscript.exe 指向仓库 public-opinion-system/scripts/run-hidden.vbs，文件不存在。任务定义绝对资产 `C:/Windows/System32/Tasks/BigPlayer Keep Server Alive`，SHA256 `29205e3a3dba82b65c73df4d654800d074bfb472e962f9c90096a831b5de3b73`。记录此状态，不修复/启用/删除任务；不能称它当前有效巡检。其余健康调度需项目经理依据当前任务 inventory确认，禁止本单恢复任何旧自动化。

## API + 静态最小切换/回退写集合（供一次最终确认）

1. 只读验收/独立静态QA通过后，先保存现役API XML原字节、现役sources原字节，逐项CAS基线；不符停。验证新包395清单，复制到 `C:/ProgramData/PublicOpinion/releases/v019-read-compat-vgfxk2`，目标预存在则停，不覆盖；不跑迁移。
2. 唯一服务配置写文件 `C:/ProgramData/PublicOpinion/services/PublicOpinionApi.xml`，只改 arguments→带引号的新包server/src/app.js、workingdirectory→新包server；executable `C:/Program Files/nodejs/node.exe`、LocalService、env和其他字节逻辑保持。旧SHA11ba38dbd7559cbde05a80f5c705a4d6d530fbcb058bc77017b660881f79e0bb4，按实际执行前再核。仅停止/启动PublicOpinionApi，停止/启动各≤20秒，失败立即回退；不碰Worker/Translation/Analysis/保活任务。
3. 另一个写文件仅上述现役sources.js：从批准artifact原字节替换，前SHA2dc368...、后SHAe7a506...。前端按请求读磁盘，不需重启前端。sources.html/query不修改。浏览器需禁缓存重载；如不能确认当前内容hash与正确计数则失败，不靠旧缓存放行。
4. 切换后4320五GET各≤10秒、总≤50秒，非200/超时/计数契约错立即回退；通过3001同源读取sources.js核新SHA，再来源UI用API摘要计算pending/checkpoint_count、items_fetched和error展示逐项比较，不新增DB/上游写请求。UI10秒内不能确认即NO_GO并回退。API健康不能替代四个业务读取。
5. 失败恢复：先恢复sources原字节并核旧hash，再恢复API XML原字节并核旧hash，仅重启API（停止/启动各≤20秒），health≤10秒及原五GET记录基线（原缺列/性能可仍失败，不谎称恢复业务）。整个回退预算≤100秒，失败升级项目经理，禁止循环重试/扩范围。保留新release、报告与备份供审计，不删除数据。前后Worker XML/worker.js和任务定义hash必须不变。

实际切换尚无自动执行脚本，此处为确切步骤/预算和写集合，须项目经理组织批准并执行发版；开发本轮仅提供candidate/只读工具，不越权发版。海外Store/AI独立接线未完成，不是国内前置，也不宣称已交付。

## 最终未批准模板与任务基线

未批准计划绝对路径：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-approval-plan-F9015Y/plan.unapproved.json`，approved:false，expectedIdentity:null。明确envFile为 `C:/ProgramData/PublicOpinion/config/public-opinion.env`，14实际存在文件的expectedBefore完整值已只读采集并写入模板；唯一输出为同目录 readonly-result.json。包含10必需文件、三个任务定义和存在的q1-daily.cmd。两缺失入口以entryExistence=false记录而不伪造hash。模板不批准且不填具体身份时拒绝执行，不会读env/DB。身份从既有env的DB_USER配置来源核验，但未输出/推测其值；CURRENT_USER()及权限仍待批准的限定只读检查，不新账户、不降为root。

任务只读事实（2026-10-09，北京时间）：全部TaskPath为 `\\`。

| TaskName | 状态 | LastRun / NextRun / Result | 定义SHA256 |
|---|---|---|---|
| BigPlayer Last Night Overseas Daily 02 | Ready | 10-09 02:00 / 10-10 02:00 / 1 | 4b882d0a4ea94d90407389d2fb5b414cd515cf7c77b877d4719171e55e2eddcd |
| BigPlayer Q1 Daily 02 | Ready | 10-09 02:00 / 10-10 02:00 / 3 | f03af0334154cace609c76d2f8e57c6e2944d0f9b86b978becfa1fbf5bea736f |
| BigPlayer Keep Server Alive | Disabled | 09-07 19:34:34 / 10-09 09:54:54 / 0 | 29205e3a3dba82b65c73df4d654800d074bfb472e962f9c90096a831b5de3b73 |

LastNight Execute C:/Windows/System32/cmd.exe；Arguments 为现任务原文 `/c "C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\worker\last-night-overseas-daily.cmd`（只读返回原文未见尾引号，不擅自修正）；WorkingDirectory为项目public-opinion-system。入口不存在，不能认定是LastResult1唯一原因。
Q1 Execute cmd.exe；Arguments原文 `/d /c "set Q1_SOURCE_ID=5c21f78d-5f67-4467-963d-dcdeb5e26cab&&cd /d "C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer"&&call public-opinion-system\worker\q1-daily.cmd"`，WorkingDirectory空；入口SHA8d787151197ac9c9c5426368d16117eb06734caa4657062c90f62bab9187ae12。KeepAlive action见上，WorkingDirectory空。只比较任务定义hash/状态；自然LastRun/NextRun/次数推进不算配置变化，不能以daily非零判断主Worker停机。

最后执行器/static测试3/3日志根目录 `.temp/bigplayer-recovery-20261009/domestic-executor-static-final2.log`。默认无参数执行确认为PRODUCTION_EXECUTION_DISABLED；未运行批准模式。执行前实际逐395项hash校验；前后hash变化抛BASELINE_CHANGED非零，不得进入切换。

五GET只读报告仅证明HTTP与计数，字段/UI验收必须另做：来源scope/status/count/items_fetched/error_message存在性，list分页total/items与detail/latest id/role一致、缺列alias为null；在禁缓存开发者工具重载sources.html后，以缓存禁用fetch `http://127.0.0.1:3001/admin/PublicOpinion/assets/sources.js` 原字节计算SHA应为e7a506...，核状态优先级与API摘要逐scope pending求和、items_fetched求和和首个error展示；不保存错误正文。HTTP200不能代替此项。版本query v209不改，若禁缓存后仍旧hash/字段不符立即按上述回退。

海外入口调查：正式 lastNightOverseasDailyJob.js --execute 仍 require('./worker')/buildDeps，并走shared scheduler/runSource/analysis，不能直接补cmd启动它而声称已隔离；其SHA0addb8bed5e20e88ca9cfaa22d83178951077f1812096393073a6438acc34b6f。lastNightIsolatedExecutor仅导出executeIsolatedFixture、无真实CLI，SHA3d3aeb15121dbec0462b6bc3ead22a3bc01f1a91014262b77d8c3566fcb3c3ce。恢复cmd必须等独立海外真实执行器候选具备，或候选cmd仅dry-run并默认非零拒执行；不能将Ready任务指向隔离库/共享国内Worker硬接上线。既有任务本轮保持原状，海外入口候选另单交QA，不作为国内前置。

## 执行器故障增量

2026-10-09仅改执行器/测试，不改API和静态artifact。main入口计算60秒deadline；同步批准/395验证后检查剩余预算，runProtected沿用同deadline，从身份查询开始所有异步验证/GET/body/HTTP关闭/DB清理均race deadline。超时abort自身fetch、关闭自有HTTP、销毁mysql2自有pool连接，不操作现役连接或进程；清理挂起也不能无限等待。同步文件读取无法被同线程timer抢占，其完成后预算检查，不能将此实现称为OS级强制60秒杀进程。失败报告保留；baseline drift抛BASELINE_CHANGED，超时抛READONLY_DEADLINE_EXCEEDED，CLI catch均非零。

新未批准模板为根目录 `.temp/bigplayer-recovery-20261009/domestic-approval-plan-kE0nMF/plan.unapproved.json`，approved:false、expectedIdentity:null，绑定最终42c542... hash与14实际基线；旧F9015Y模板保留但不可用于新执行器。唯一结果路径为新目录 readonly-result.json。

`node --test server/test/domesticReadonlyExecutor.test.js` 6/6通过，日志根目录 `.temp/bigplayer-recovery-20261009/domestic-executor-deadline-faults.log`。新增有意漂移（只mock读取、不修改基线）、身份查询挂起、清理挂起、自有销毁计数及子进程退出码1。API已通过范围未重跑；默认/真实批准模式均未用于生产。

## 最新授权增量：现有账号受保护只读

用户在项目经理会话直接授权撤销账号必须仅SELECT/USAGE的条件；不重新请求同类批准。仅移除verifyIdentity的grants权限排他判断，保留非空expectedIdentity及身份/库/端口硬绑定；main必须plan.authorizationMode=`current-runtime-protected-readonly`。grants仍可读取但不持久化。全部SQL/启动防写、无外部/多语句、395项清单、baseline/CAS、deadline和非零退出保持。

新模板绝对路径 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-approval-plan-egMBHN/plan.unapproved.json`：approved:false、expectedIdentity:null作为待经理填入已实测身份的模板，非新的审批请求；authorizationMode已明确，14项actual expectedBefore，新独立output同目录readonly-result.json。项目经理依据已有授权/新hash独立QA填入身份并串行执行，开发不并发生产连接/切换。旧kE0nMF模板保留不用。

增量日志根目录 `.temp/bigplayer-recovery-20261009/domestic-current-runtime-permissions.log`，6/6 PASS，覆盖既有ALL/write/GRANT OPTION账号允许、错identity/database/port或空expectedIdentity拒绝，SQL写/execute仍拒绝；漂移/超时既有回归继续通过。API/静态已过业务测试未重跑。此授权不表示账号本身被降权，也不声称数据库用户只读。
