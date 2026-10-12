# Forward锁范围诊断

Status: DIAGNOSIS / AWAITING_READONLY_INDEX_EVIDENCE

## 新候选 AtcaLQ

现场经理已核实际索引均存在：runs source_status_lease/account_status_created；cp site_idx(site_id,account_id,status)。旧OR实际status_lease range rows5（跨source而非全表）；旧cp实际account_idx rows4426；JOIN s/g/c各const1。历史阻塞关系未捕获，仍不推定具体阻塞者。

撤回x5YQo8后续执行（原证据保留），正式新freeze：仓库根 `.temp/bigplayer-recovery-20261009/lastnight-forward-AtcaLQ`；manifest SHA `49238de34dd03273acd5866de7d758d16ec49233fe938b2eb5842a033a12a3fc`；CLI SHA `9470f844722cfb751494babd7e07c6286415f87a638a3277dbaaed0aeb0e1e4e`。旧544未修改，forwardFiles7。新增targetLockQuery适配整个同连接query，覆盖forward与旧page writer全部OR查询。source单PRIMARY FOR UPDATE，game/community普通读取；run拆source/account FORCE INDEX；cp按三站site/account/status FORCE INDEX；事务READ COMMITTED减gap锁，账号GET_LOCK/state fencing不变。错误输出枚举lockStage，不输出SQL参数。索引缺失自然失败，不DDL。

forward/成功/认证/锁适配受影响12项开发测试通过；仍非现场全过程行锁证明，需QA确认SQL范围并经理新inspect/hash条件执行，旧hash不能复用。不改变DETAIL门槛、不退offset0、不杀线程。全部保护/正文/未知COMMIT合同保留。

经理现场：x5YQo8 inspect READY，execute在任何prepared/public前ER_LOCK_WAIT_TIMEOUT；owner1537与cp offset20不变。现役连接9事务锁110754行、0修改，仅说明锁规模，不能证明当前阻塞关系。不杀连接、不重启、不DDL。

当前forward query有潜在扩锁：source JOIN games/communities FOR UPDATE也会锁关联记录；active runs OR(source_id/account_id)选择访问路径不确定，可能大范围扫描；account checkpoints查询若索引缺失可能同样扩锁。仓库迁移定义source_status_lease、account_status_created、checkpoint site/account/status索引，但现场是否有仍待只读SHOW INDEX/EXPLAIN。冻结5文件保持不变。

最小新候选设计：source单表PRIMARY锁，game/community只读并严格scope核验；active run OR拆成两条明确目标source/account索引范围查询；cp按每个目标site/account/status索引查询，不扫描国内；列出实际索引不存在即失败关闭，不自动迁移。旧page writer也有OR locking query，需新独立query适配一起覆盖。现有账号GET_LOCK/source fence仍保留；不靠取消锁换取表面成功。待现场执行计划证据后新freeze独立QA。
