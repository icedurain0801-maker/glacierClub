# 真实下一槽准入冻结交 QA

Status: ISOLATED_CERTIFIED_REAL_NEXT_SLOT_ADMISSION_PASS

仓库根为 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`；以下 `.temp/` 路径均相对于仓库根。冻结包 `.temp/overseas-qa-scheduled-stage-xTmhjI`，694 files，manifest SHA `e6175eb4e8d2e26f01da03bc112c9cece48264b80e5d3bebaa1ea0d62c8d28e6`。

开发真实自有 DB 验证已 PASS，独立 QA fresh SQL 尚 NOT_VERIFIED，不能以静态预审或开发原件代替。

| 开发原件 | SHA256 |
|---|---|
| `.temp/xTmhjI-dev-preverify.raw.txt` | `9d92ca7750328cdfda24655ba3b5f72c50e771ae5f330399339210bae28e7734` |
| `.temp/xTmhjI-dev-next-slot.raw.txt` | `9c5e0a0ce3a3b5ae4e60e555cfcefc196903e545b9d1662a34c987c92c20a493` |
| `.temp/xTmhjI-dev-postverify.raw.txt` | `9d92ca7750328cdfda24655ba3b5f72c50e771ae5f330399339210bae28e7734` |
| `.temp/overseas-real-db-ENyspX/result.json` | `9b03d2e42b6dab7c6226a59681b331444be9f5f8d76221324805ceb1867767d1` |
| `.temp/overseas-real-db-ENyspX/next-slot-trace.jsonl` | `8600df7c340db41e1b5838d2020aad7131e72ceac9612385943fd8bf5d113ca9` |

前后 verify 均 true/694；mode exit 0。result 为 `PASS_ISOLATED_SCHEDULED_ADMISSION_PARTIAL`，scheduled 为 `PASS_ISOLATED_CERTIFIED_REAL_NEXT_SLOT_ADMISSION`，serverStopped/portReleased=true，productionTouched=false。

真实 DB 从 UTC `2026-10-09T16:27:55.133Z` 等至 `17:00:00.017Z`，观察 66 次，耗时约 32 分 7.6 秒。首批成功父 `726f9a30-d6b3-bb41-c8d0-57d4e850a310`，discovered/stored=2，两站 cursor 为 `16:27:52.434Z`。原 configuration SHA `af3a68950ef0909f0c5592e5e62856b6400a6948308dac28d5f61d4ebc4fc80d`、frequency=3600、scheduleVersion=1 保持不变。同 reader 新 anchor `17:00:00.023Z`，scheduledAt=`17:00:00.000Z`，两站 windowStart=原认证 cursor。新 parent `16275d2d-b30d-3d5a-e1bb-8d2f0f0b3635`，admit batch SHA `62bff7d531943aff4e094c0309577611d618d84eb3a74fac925dc39a8ae3cde9`，当前 state epoch=2；父和两个 child queued/epoch0，两个 manifest admitted。旧 ACK 证据与 config 不变。

六项 anchor 后漂移覆盖：同 cursor 时间换 parent、同时间换 evidence SHA、父 finished_at、child stored_count、父 terminal event detail、membership first_seen_at。每项校验精确错误码、12 表准入零写、完整恢复及同 reader 原认证证据一致。详细标签和错误码保留在 result/trace/raw 中。

## QA 执行

在冻结包工作目录依次执行并直接保存运行时 stdout/stderr：

1. `node scripts/freeze-overseas-scheduled-candidate.js --verify e6175eb4e8d2e26f01da03bc112c9cece48264b80e5d3bebaa1ea0d62c8d28e6`
2. `node scripts/overseas-isolated-mariadb.js --isolated-certified-next-slot`
3. 再执行同一条 freeze verify。

须 fresh 自有实例，启动前核 13316 空闲，每连接核 PID/datadir/schema；只使用 13316/serverId20261036/po_overseas_fixture。原合法 3600 配置与 DB 真实时间，首批 ACK 后等待该实例下一真实槽，不能改 clock/frequency/effective/state 制造槽。开发实例已释放；独立 QA 若 01:00 后开始，下一边界预计为北京时间 02:00，以该实例 DB 时间和 result 为准。完成保存 QA 自己的前后 verify raw、mode raw、result.json、trace 路径与 SHA，并核 owner 停止释放。若中断，真实边界验收如实 NOT_VERIFIED。

## 范围与未完成项

仅验证第二槽准入，`realNextSlotAdmissionVerified=true`，`realNextSlotExecuted=false`，`nextSlotChildrenClaimed=false`，`nextSlotCollectionCompleted=false`。所有 HTTP/AI 合成；不通知、3306、生产 DDL/服务切换、账号刷新、第二消费者或受限恢复 proof。国内和现役服务不动。单进程串行验证不证明多消费者锁序安全。

| 工作 | 状态 |
|---|---|
| 原 3600 配置、真实 DB 下一槽、非 null 认证 anchor/admit | 开发 PASS，独立 QA 待验 |
| 六项认证证据漂移精确拒绝、12 表零写及恢复 | 开发 PASS，独立 QA 待验 |
| 第二槽 claim/采集/终态 | 未执行，不在本单范围 |
| 历史祖先 UPDATE 竞争、全失败/全字段矩阵、translation 预算 | 独立待办，未完成 |
| 生产 state/持久排空/单消费者切换 | 未完成，FULL_RUNTIME_NO_GO/CUTOVER_HOLD |

## 独立 QA 核收

已完整读取 `.tests/2026-10/2026-10-10/v007_real_next_slot_independent_qa.md`，负责人独立重算以下五原件 SHA，全部与报告吻合。QA 保留原 session 4865、原进程与 reader 至真实 UTC `18:00:00.014Z`（北京时间02:00），116 次轮询，exit0；未重启/替代。result/trace 核六精确拒绝、12表零写恢复、同reader非null窗口及 queued 准入，owner停止释放且 productionTouched=false。

| QA 原件 | SHA256 |
|---|---|
| `.temp/xTmhjI-qa-preverify.raw.txt` | `9d92ca7750328cdfda24655ba3b5f72c50e771ae5f330399339210bae28e7734` |
| `.temp/xTmhjI-qa-next-slot.raw.txt` | `2325d7f96434f8f72bf8f8b1f74f0c3568247e83a47d14e964fce41131d808fb` |
| `.temp/xTmhjI-qa-postverify.raw.txt` | `9d92ca7750328cdfda24655ba3b5f72c50e771ae5f330399339210bae28e7734` |
| `.temp/overseas-real-db-JUTuxz/result.json` | `7b549477619b866046d9a946e74c0440262fa6dbe5f2cae61f3c5480c0a59d19` |
| `.temp/overseas-real-db-JUTuxz/next-slot-trace.jsonl` | `a116947e542a3b5ef103722a52e2d2a4f0e2a7bf262b9e0a652881105ba1b571` |

上方“待验/NOT_VERIFIED”保留为交接时的历史状态，本节独立结果替代对应两项准入待验。第二槽 claim/采集/终态、真实 provider/AI/通知、恢复、并发消费者以及生产仍未完成，不能升级发版 GO。
