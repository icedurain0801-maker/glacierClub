# 真实下一槽准入后合成执行增量

Status: DEV_REAL_NEXT_SLOT_SYNTHETIC_EXECUTION_PASS_QA_PENDING_FULL_RUNTIME_HOLD

## 授权与范围

接项目经理02:30派单和用户隔离实施/流转QA决定。仅当前模型，员工只读交付patch，开发负责人审核并唯一写入。不改需求、生产DDL、ProgramData/ACL、服务、国内Worker，不真实HTTP/AI/通知/账号刷新，不第二consumer，不使用或替代被停止的恢复/progress proof。FULL_RUNTIME_NO_GO/CUTOVER_HOLD。

## 接线方案

新增独立 `--isolated-certified-next-slot-execution`，保留旧准入mode和既有冻结原件。新fresh自有13316/serverId20261036/po_overseas_fixture，原frequency3600配置、真实UTC DB时钟、同一进程/实例/品牌cursorReader。从原首批两个非空子任务与父终态开始，等待真实下一边界，六项漂移准入零写恢复后取得新parent及两个queued0 child。

不从已结束实例的JSON恢复request或proof。仅本次同进程返回的nextRequest沿原store.firstClaim取得epoch1，publish原证明并调用隔离factory→实际runSource→合成connector normalization/page事务→子终态，最后新parent.finalize用同reader认证新window-end cursor。不存在父续租、epoch2或恢复入口。任一失败如实记录，实例owner关闭释放；不换旧证据充数。

## 验收口径

两站使用不同合成post/comment/reply ID，新发布时间位于各自新窗口；历史首批root评论请求回空，不删历史内容绕过补漏。按新run links限定内容、任务、checkpoint、audit、pending analysis/translation jobs，不能沿用旧helper全库四条断言。要求每站4唯一内容/links及各4 pending jobs，任务总数以实测输出且全部completed/manifest sealed。旧批run/tasks/checkpoints/content/links/membership/audit/event行指纹前后相等；source/state/success cursor为合法可变项，单独核新父终态和认证结果，不要求reader仍返回旧cursor。

每条连接先核PID/datadir/schema，池包装在finally恢复。记录原配置SHA、真实等槽clock/trace、原始firstClaim、同reader新认证、计数和停止释放证据。真实槽执行的是合成传输链，必须明确realHttpExecuted=false、aiExecuted=false；不称真实两站/三站采集或完整runtime完成。

## 执行顺序

| 项目 | 当前状态 |
|---|---|
| 安全接线只读设计 | 已审核可行 |
| 员工最小patch、root串行写入 | 已完成，六文件语法检查exit0 |
| 语法/最小离线验证、新冻结 | 六文件语法exit0；9io1Ti/701 verify及11offline PASS |
| 空闲核验后fresh真实等槽及合成执行 | SiyM8M真实03:00跨槽，两站4/4父8/8合成执行开发PASS |
| 原件SHA/计数/owner释放核验 | result/trace重算一致，serverStopped/portReleased=true，listener0 |
| 冻结交测试负责人独立QA | 正式交接文档v016，等待独立QA |
| 回报项目经理 | 已报实施状态，验收待回报 |

当前本增量仅开发PASS，尚无独立QA；既有预算、祖先竞争和终态局部独立PASS不替代它。持久排空、生产规模账本、真实HTTP/AI及生产切换仍未完成。未commit/push/发版。

本项即时变更记录：新增 `scripts/overseas-isolated-next-slot-execution.js`；next-slot/parent/scheduled checks和MariaDB runner新增专属mode，freeze新增文件与命令。员工提交只读patch，root审核并apply_patch；业务请求语言参数不作虚假断言：仅授权请求核gameId/gameVersion/languageId（无env），业务请求四context键缺省且合成每站token绑定。此证明不说明真实上游分站。原准入mode返回字段不变。

复审纠偏：manifest持久值为sealed，completed_authorized_scope仅是run/返回终态；断言现核sealed及history/expansion双封口。工作树最小离线controlled manifest和scheduled batch共11项PASS/exit0，无guard denial，尚不是冻结独立QA或SQL执行证据。

冻结：仓库根 `.temp/overseas-qa-scheduled-stage-9io1Ti`，701 files，manifest SHA `26bc8801a1123f839c43b00e5b0d4b833e4aa4ca096b3a515a3dcaa5ecba1faf`；冻结verify及相同11offline已通过。开发exec session73852未结束，自有`.temp/overseas-real-db-SiyM8M`/PID46008，UTC18:37:23.312开始真实等UTC19:00，原frequency3600。QA已收到待验预告且要求不启动SQL，释放后另正式交接。stdout目前是工具原始流，不能冒称另有重定向raw文件；同实例trace JSONL与最终result均由runner原生生成。

完成记录：exec73852 exit0，UTC19:00:00.023跨槽、47polls、1359369.3138ms等待；六漂移准入零写恢复，两站原firstClaim epoch1执行实际runSource合成connector，各4unique links/contents、6tasks（含1history空评论任务）、4pending analysis及4pending translation，父8/8且同reader新cursor认证。旧批指纹 `06ce39790edeb57a5a9e05971a5d0b3ce244af4aa1fba4a2f3de1c62f90725be` 未变。result SHA `ccbfbe3700e24f63cb4048f68db834a44339ca8a208b72f635c7c9db84146b9a`；trace SHA `5e52f09d5a4054a75619a6555c0f6bf2a5f8d67e364f323f0fb3074689bd65c7` 与result字段匹配。serverStopped/portReleased=true、productionTouched=false、端口listener0，后verify701通过。只有synthetic execution=true，realHttp/AI/recovery/production均false。
