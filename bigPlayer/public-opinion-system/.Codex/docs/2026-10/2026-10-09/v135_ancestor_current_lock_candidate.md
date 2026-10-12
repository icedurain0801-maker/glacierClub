# v135 历史祖先 current 锁候选

Status: DEV_PRIMITIVE_SQL_PASS_REVIEW_PENDING

新增 `server/src/db/overseasAncestorEvidenceLocks.js`：有界发现完整root/parent闭包（最多10000行、深度64），全ID排序逐行FOR UPDATE读取current行，重核引用与depth，不自适应追加新锁；逐层scope/非删除/depth/root/post终点验证，循环/断链失败关闭。

ParentStore调用新原语，并将聚合事务明确改READ COMMITTED，避免后续普通终态读取被早先RR快照掩盖；原firstClaim/schema/终态审计不改变。生产入口未接。新增隔离primitive脚本：深度2历史未link三行，旧RR快照下writer先提交删除后current拒绝；锁持有barrier下distinct writer中间祖先UPDATE有限timeout，释放后成功；发现/锁之间引用变动拒绝。尚未执行，不能写PASS。

primitive仅锁与祖先形状验证，不等实际parent comment链完成；membership竞争、完整祖先parent链集成及旧成功矩阵回归仍需验证。QA目前占用integrity验证，本轮不启动13316，先等待其owner释放。

QA明确owner释放后核13316空闲执行：锁原语 `.temp/overseas-real-db-rQ23HJ/result.json` 三项动态真实SQL PASS，distinct连接9/10，历史中间祖先writer锁超时、释放后可更新；旧RR快照下删除current拒绝，发现/锁之间引用变化拒绝。parent非空post回归 `.temp/overseas-real-db-byRalH/result.json` PASS。均停止/释放。仍不证明parent comment祖先图整链或membership竞争；等待复审后新冻结。
