# scheduled 未知 ACK 后隔离执行设计

Status: IMPLEMENTATION_PENDING / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Owner: 开发负责人

本项沿用已批准 v104 隔离范围，不授生产 HTTP、账号刷新、DDL、服务切换或发版权限。员工只读提出方案，root 唯一写入。

## 最小闭包

仅支持 firstClaim 已提交、epoch1 仍活、尚未开始执行的场景。期望契约由原 durable request 与原 intent 固定 nextOwner 生成；禁止从 DB owner 重建 journal。inspection 与 intent 对账继续只读，不授执行能力。

先实施整个执行期的独占 gate：专用 pinned connection 持有 run/epoch 命名锁，初次执行及恢复必须共用同一锁。每次 dispatch/页面/审计 fence 验连接身份与锁归属；连接失联或 close 永久失败关闭。命名锁只防候选内并发，不宣称 HTTP exactly-once，也不替代数据库租约 fence。

再新增独立 execution-proof 品牌：事务锁完整 batch runs（id 排序）→source/state→identity/sites→manifest/tasks，核 freshFence 及“执行未开始”；journal no-overwrite 发布并 exact 读回，二次 fence、事务明确结束后才发布 proof。提交结束 ACK 不明/文件发布失败无 proof。旧 first-claim 品牌与新 execution-proof 保持分离，内部仅统一可信 context resolver。

## 验证与未完成项

须覆盖新 Node 原 request/intent 恢复 actual factory/runSource 合成主链、两个新进程竞争、gate 失联及 close 后拒绝、queued0/过期/他 owner/父或配置漂移、复制与跨 repo/root、journal 损坏/异内容及发布失败、已有 task/audit/request marker/CP 进度拒绝。

当前仅设计，不宣称 gate 接线、执行恢复或 epoch2 已完成。epoch2 独立 intent/store/proof、已有任务和 checkpoint 接管、旧审计 lineage、父聚合/cursor/shared/AI 保留为后续完整范围。

实施增量：root 根据员工只读建议新增 `server/src/db/overseasScheduledExecutionGate.js`，暂为 `NOT_INTEGRATED`。活动树 G4CVAF 隔离 SQL 核两连接同 run/epoch 竞争、复制品牌拒绝、关闭后永久拒绝、重新领取及12表业务零写通过，自有实例停止/端口释放；仅 gate 工具验证，不证明 factory 单执行或未知 ACK 恢复。审查与失联/并发关闭扩展反例待完成，尚未冻结独立 QA。

复审增量：员工未发现当前原语确定 P1，但指出静默查询无期限及未来 verify→操作之间 close 的集成竞争。root 为 gate 查询和身份核验加固定3000ms等待，超时销毁且不归池；mSHDP0/result SHA `9dfb7f01203168bd38d27af1373a3af464f6647d259a4f4cc07fa28e8b9bee3e`通过新注入GET_LOCK静默等待反例，自有实例停止/端口释放。此为人工注入，不是真实断网。factory全执行期接线、close与在途操作协调仍未实现，不能把gate原语局部PASS称执行恢复。

后续增量状态：gate 增加执行范围与关闭等待、隔离目录及 journal 增加私有位置绑定访问器。五个相关文件语法检查通过，未执行新 SQL/完整链验证。恢复 proof 补丁工具调用被内容安全限制拦截，未成功写入，已停止该部分及相关员工任务；不得以已修改辅助模块宣称 factory 已接线或恢复完成。当前活动树不可冻结为合格交付，旧 mSHDP0/YQr5UJ 结论不扩展到这些新改动；生产继续 HOLD。

## 中断记录核对与更正

可核原始记录仅在本开发负责人会话工具历史中：拟通过 `functions.exec` 调用 `tools.apply_patch` 写恢复 proof；该工具结果为 `Script error: SyntaxError: Invalid or unexpected token`，随后会话出现通用文本 `I'm sorry, but I cannot assist with that request.` 及内容过滤停止重试指示。没有实际 apply_patch 返回的拒绝输出、具体过滤触发理由、自动审批理由或账号权限错误。没有独立落盘的拒绝日志位置；本段是转录说明，不是原始日志。更正此前“补丁工具调用被内容安全限制拦截”的过强归因：可以确认编排脚本未成功执行且后续受到内容过滤限制，具体触发原因未知，不能当作账号权限门禁。未通过重试制造证据。

当前五文件清单（仅新语法检查，不扩展历史 SQL/QA 结论）：

| 文件 | 当前改动与隔离入口影响 |
|---|---|
| `server/src/db/overseasScheduledExecutionGate.js` | 新增 run/verifyExecution/关闭等待；只被 inspection 脚本引用，factory/dispatch/page/audit 尚未接入。EXECUTION_SCOPE_AVAILABLE 只是工具接口标记，不是已装配或放行。新生命周期未运行验证。 |
| `server/src/db/overseasScheduledIsolatedTarget.js` | 私有 WeakMap 由 repo 改为 repo/root/owned，新增位置访问器；现有 target assert 路径因此改变，需回归。访问器尚无调用方。 |
| `worker/src/overseasScheduledRequestJournal.js` | 新增私有位置元数据与访问器，文件格式/读写方法未改；访问器尚无调用方，未证明跨目录组合校验已接线。 |
| `worker/src/overseasBigPlayerRunContractJournal.js` | 新增私有位置元数据与访问器，文件格式/读写方法未改；共享 journal 模块需回归，生产运行未操作。 |
| `server/src/db/overseasScheduledAdmissionStore.js` | 中断补丁没有落地，未新增 prepareExecution/resumeFirstClaimExecution/execution proof；与 YQr5UJ 的差异仅此前 queued pristine 诊断及只读无锁检查，曾有 I7Md6H 验证，不属于本轮仅语法的新实现。 |

只读复审待核风险：gate close 撤销后，在途 verify 的失败处理可能提前 destroy 持锁连接，故不能宣称关闭等待已保证整段操作排空；位置访问器返回副本并不自动完成跨 repo/root 组合授权核验。现有活动树完整入口仍未验证，不冻结合格包、不转交恢复完成结论。后续仅继续允许的既有代码只读审查/记录，不重试被拒部分或委派绕过。
