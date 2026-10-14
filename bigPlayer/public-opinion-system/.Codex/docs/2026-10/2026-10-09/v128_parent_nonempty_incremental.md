# v128 父任务非空增量

Status: DEV_SQL_PASS_PENDING_REVIEW

经理已补收v126/v127，不再重送历史失败消息。新增 `--isolated-parent-nonempty`：正常两个品牌firstClaim epoch1，各一条不同ID/正文/fingerprint的post，两个feed完成、动态comments任务空页完成、封账和绑定终态审计后，父原子聚合 discovered/stored=2。membership metadata漂移精确拒绝并验证父零写。保留原8项CP/owner/cursor/回滚/并发验证。

活动树开发原件：仓库根 `.temp/overseas-real-db-7gxzyT/result.json`，10项检查通过，自有实例停止/13316释放。非空post不代表评论祖先图或真实connector完成，membership并发及祖先并发尚未实测。ParentStore另追加membership范围锁以维持审计证据至COMMIT，追加后需复验再冻结。

剩余独立项：unsealed/failed/manual、缺多child/terminal字段、certified cursor读取接timeAnchor（员工只读设计中）、translation/预算全字段漂移。生产HOLD国内不动，四辅助/受限proof不放行，无真实HTTP/AI/通知，无commit/push/发版。

## 后续开发验证

追加membership范围锁后非空复验 `.temp/overseas-real-db-SZGeo2/result.json` PASS。新增三个真实终态fixture：未封expansion导致audit自动降级partial（sB3CS7）、明确failed（UJQsd6）、awaiting_manual_verification（4KW7EZ）；父均partial且成功cursor零行，state释放。实例均停止释放。这里只证明各一个成功+非成功组合，非全部失败或所有字段矩阵。

certified cursor接线只读方案已收到：需品牌reader绑定原ParentStore历史证据，并同步timeAnchor和admit复核，不能直接相信cursor表或替换生产口径。未开始此项代码，不冒充完成。
