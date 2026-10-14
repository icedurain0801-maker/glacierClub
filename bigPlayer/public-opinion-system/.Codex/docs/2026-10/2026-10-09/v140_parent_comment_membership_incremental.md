# v140 parent评论链与membership动态插入增量

Status: DEV_SQL_PASS_PENDING_REVIEW

新增正常原firstClaim epoch1两站comment-chain：各post→comment→dynamic reply，四任务封账、三层持久引用正确、六unique links父计数；中间祖先删除事前漂移精确拒绝，父收尾五表零写。原件 `.temp/overseas-real-db-7TdckA/result.json` 已通过六计数，但返回旧empty标签，已修为独立链标签并补graph/task集合断言后需复验。无恢复proof。

锁原语追加READ COMMITTED下distinct writer membership INSERT：依赖实际content外键，在parent内容X锁持有时ER_LOCK_WAIT_TIMEOUT、零membership插入；释放后成功。开发 `.temp/overseas-real-db-JbCFkQ/result.json` 六检查PASS，实例停止释放。仅原语FK竞争，不等parent finalize barrier竞争。

本链新建六内容且history snapshot初始空，不称历史未link祖先parent完整链。历史深度2仅先前锁原语证明。cursor→timeAnchor、全失败/terminal全字段、translation预算逐字段仍未完成。生产持久策略/现役热load/排空演练未交付，生产HOLD国内不动，禁止共享切换/第二consumer。
