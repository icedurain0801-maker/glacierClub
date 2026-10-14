# 候选17安全runner替代包交接

Status: ISOLATED_MANUAL_PARTIAL_PASS / 18_EXCLUDED_NOT_TESTED / RUNTIME_NO_GO
Date: 2026-10-09

## 独立QA收尾确认

测试负责人v083报告已收回，负责人只读核实原件SHA，未重跑测试或连接数据库。独立128/128文件、974/974用例PASS，拒绝计数0；18排除仍NOT_TESTED。独立fresh13316/serverId20261036 SQL19项局部PASS，serverStopped/portReleased均true。原件 `根.temp/overseas-qa-candidate17-manual-32AVIO/offline-safe-result-1791544304363.json` SHA256 `02147f91cb6b91951b640a7b884a2dc7796d9d555050a6de75d5da18a3e82117`；`根.temp/overseas-real-db-07t9Jn/result.json` SHA256 `381a13df5e14f5e72beec35f7523ceb45798bc69fa9051949236184c42aacfbc`。

独立QA来源 `.tests/2026-10/2026-10-09/v083_overseas_candidate17_safe_runner_independent_qa.md`，QA文件保持测试负责人唯一写入。下文“待QA/正在执行”仅为历史交接记录，由本段最新结果替代。100/1000合成历史封口、10000/10001按固定时间预算partial回滚不代表生产吞吐；非目标仅合成SQL路由。scheduled持久入口/父子slot全链、18项独立隔离、真实HTTP/账号新鲜度/异步AI翻译、生产历史兼容/共享切换及旧测试历史DB归因仍未完成。完整海外与生产不放行，不推送不发版；消息交项目经理登记和派下一批，开发不写经理待办、不擅自运行生产补证。

一句话需求：先独立审查新的离线拒绝防护，再在新冻结包验收manual候选；旧危险命令废弃。

已拍板：仅隔离实施并流转QA，manual/scheduled分批；3306任何库不写、不生产DDL/切换/HTTP/账号刷新/AI消费、不commit/push/发版。明确允许app.routes排除NOT_TESTED，不能把排除算PASS。当前历史影响证据无法证明生产业务库未变；详见v108。

## 唯一新目标

`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate17-manual-32AVIO`

manifest外部SHA256：`f505d89350dd1ac4e69951bdfd2c8808d8a36dbe22434146b1a49085b3e1db8f`；878项，safe-v2，128个测试文件、18个NOT_TESTED文件。原u6AIuO及wAzd6v/gtxVrY/yFpGfy全保留，不混用其结果/runner。

当前快照CWD，先用独立Get-FileHash核清单外部SHA，然后：

```powershell
node scripts/freeze-overseas-manual-candidate.js --verify f505d89350dd1ac4e69951bdfd2c8808d8a36dbe22434146b1a49085b3e1db8f
node scripts/freeze-overseas-manual-candidate.js --test f505d89350dd1ac4e69951bdfd2c8808d8a36dbe22434146b1a49085b3e1db8f
```

请先审源码再决定执行：runner只做fs清单核查与显式Node子进程；不加载业务app或env。子进程环境白名单/固定NODE_OPTIONS，guard先于测试安装；逐文件no-isolation，全部子进程/Worker禁止，常见mysql2/TCP/TLS/listen/UDP/DNS/env接口不可改且拒绝。构造inert pool不连DB，测试自己换stub仍可用；实际SQL被拒绝不是stub逻辑PASS。每次拒绝同步输出固定code，任何DENIED/TAP失败或skip/cancel/未知字段都FAIL；退出汇总作辅助。原始stdout/stderr按流分别收集再拼接，不是严格时间线。guard是可信测试事故防护，非恶意JS/native addon/OS安全沙箱。

18项精确排除见manifest：app.routes真实DB、HTTP路由、runtimeEnv、v019独立release/启动mock、含child或间接child的用例。不得声称这18项通过或已覆盖；v019启动旧独立QA1/1仅旧证据，新包不移用为新结果。部分纯字面合同保守排除，后续独立补证再放回。

## 开发验证

4个新/修改脚本node --check exit0。guard专门26项负测通过，未真实IO；其中23次预期拒绝、3项不可覆盖断言。32AVIO安全套件正在执行，原始结果收齐后追加，不预写PASS。前包gtxVrY129文件128 exit0/1FAIL（q1间接child被拒），仅历史；yFpGfy加计数版本也仅历史，最终新增每次同步拒绝标记。

32AVIO结果已收齐：128/128测试文件PASS、FAIL0、集合内未跑0；18个明确排除仍NOT_TESTED。suite文件拒绝计数均0，无skip/cancel/todo，exit0，878前后inventory一致。原件 `offline-safe-raw-1791544041735.txt` SHA256 `2d441e428bc657f21ffe9147845b70d482c1ef305feb38aa6122ca3540740055`，同戳result.json另核SHA。外部manifestSHA仍吻合。仅安全离线子集开发PASS，不是SQL/集成/独立QA/生产放行。已真实消息流转QA及项目经理，等待独立审查。

精确合计974/974用例；`offline-safe-result-1791544041735.json` SHA256 `41c5daeff11e4207ec952bf88df8cb9560fe8b8e85990232a6539830f5fbf9c1`。不以974替代18未测文件或SQL矩阵证据。

本次没有重跑自有SQL；此前MScMNW SQL19主项/15ledger矩阵仅旧包局部开发证据。QA若安全审查通过，再用本新快照 `node scripts/overseas-isolated-mariadb.js --isolated` 独立fresh13316/serverId20261036/根.temp datadir/PID验证、owned shutdown/端口释放；不继承离线NODE_OPTIONS到SQL流程，不使用3306。开发未把旧SQLPASS移作本包PASS。

## 当前影响证据

根.temp `overseas-test-impact-readonly-qVfB3x/result.json` SHA256 `9b014636fe65a41a4e7628102f345a61192ba7025045d1e81f88ed8451c2b369`。仅当前SELECT/SHOW，当前3306/server_id1/datadir/PID与测试schema写时间旁证；历史raw没有实例证书，当前无binlog/general_log，无写前基线，无法完整归因或证明生产不变。不能再运行旧测试尝试恢复历史目标。

## 请测试负责人做的事

先独立安全审查新runner/guard及26负测（尤其吞错、exit cleanup、误目标、环境泄漏），核18NOT_TESTED范围不移用旧PASS；安全批准后再运行128文件集合及自有13316 SQL矩阵。每项FAIL/NOT_TESTED明确记录，完整手工候选仍需v081矩阵逐行，安全门禁通过不等于功能整批放行。独立前后878hash/外部manifestSHA，原始结果SHA，消息回报开发负责人和项目经理。scheduled NOT_IMPLEMENTED/另批、生产RUNTIME_NO_GO。
