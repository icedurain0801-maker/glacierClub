# v144 父收尾事务 membership 插入竞争

Status: ISOLATED_PARENT_BARRIER_HISTORY_PASS

`scripts/overseas-isolated-parent-checks.js` 的 comment-chain 增加真实 parent.finalize 观察 barrier：全部排序祖先 current FOR UPDATE 完成后，独立连接 INSERT membership。核对连接 ID、锁集合、ER_LOCK_WAIT_TIMEOUT、零插入；夹具 sentinel 触发正常回滚并核父相关五表零写。释放后 INSERT 成功，删除仅本夹具生成的 membership，并继续原正常父终结验证。

员工提供只读 patch 方案，由开发负责人唯一写入。业务 parentStore 未改。五表零写证明来自夹具主动回滚，不能称业务自动拒绝了 membership 漂移。历史链、祖先 UPDATE 并发、认证游标闭环仍未证明；生产 HOLD、国内不动，不执行真实 HTTP/AI/通知或恢复 proof。

开发原件：仓库根 `.temp/overseas-real-db-xRl7rb/result.json`，exit0，owner停止释放。parent连接12、writer连接11，六内容排序锁，timeout后0、释放后1且合成membership清理成功。仍须冻结后独立QA。
