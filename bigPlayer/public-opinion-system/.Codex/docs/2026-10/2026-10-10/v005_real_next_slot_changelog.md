# 真实自有DB下一槽准入夹具

Status: ISOLATED_CERTIFIED_REAL_NEXT_SLOT_ADMISSION_PASS

新增 `scripts/overseas-isolated-next-slot-checks.js` / `--isolated-certified-next-slot`。员工只读设计、负责人唯一写入。首批两站合成post/membership且父成功ACK注册后，保持原3600配置与自有DB，最多30秒间隔观察DB时间、每次核实例身份/无开放事务，记录不可变配置hash和运行时trace。到下一真实slot以同reader读取非null认证anchor，按当前state epoch和新anchor生成租约，补cursor同时间换parent/hash、父/child/event/membership漂移精确拒绝/12表零写；恢复后正常原子admit。

第二槽仅准入，children仍queued、不claim/采集/终态，不扩称第二批完成。不改clock/frequency/effective/state制造槽。依赖未完成如实NOT_VERIFIED；生产HOLD国内不动，不第二consumer/受限proof，所有HTTP/AI合成。

开发在冻结包 xTmhjI（694 files，manifest SHA `e6175eb4e8d2e26f01da03bc112c9cece48264b80e5d3bebaa1ea0d62c8d28e6`）完成真实边界验证。原 DB 从 UTC `2026-10-09T16:27:55.133Z` 等至 `17:00:00.017Z`（北京时间 10 月 10 日 01:00），66 次 DB 时间观察；config SHA `af3a68950ef0909f0c5592e5e62856b6400a6948308dac28d5f61d4ebc4fc80d`、frequency 3600 不变。同 reader 认证非 null cursor `16:27:52.434Z`，六项 anchor 后漂移精确拒绝、12 表零写、恢复后原认证证据一致。正常第二槽原子准入通过，parent/两 child 均 queued，state epoch 2；第二槽未 claim、未采集、未终态。

开发进程 exit 0，owner 停止并释放 13316，productionTouched=false；前后 freeze verify 均 true/694。运行原件与 SHA 见 `v006_real_next_slot_frozen_qa_handoff.md`。QA 静态预审未见阻断，fresh 真实下一槽 SQL 独立验收仍 NOT_VERIFIED。串行同进程夹具不证明多消费者并发锁序。

已核收独立 QA `.tests/2026-10/2026-10-10/v007_real_next_slot_independent_qa.md`，负责人重算五原件 SHA 与报告全部一致。QA 原 session 4865 保留同进程至 UTC `2026-10-09T18:00:00.014Z`，116 次真实观察，exit0；六负例零写恢复、非 null 原 cursor 的同 reader queued admit 独立 PASS，owner 停止释放。仅局部准入，不执行第二槽采集/终态；完整生产与其余缺口仍 HOLD。
