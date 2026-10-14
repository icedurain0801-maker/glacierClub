# 海外 manual 同连接事务候选

Status: transaction-core-frozen / developer-88-PASS / independent-QA-pending / RUNTIME_NO_GO

新增 Repository 显式 handoffOverseasManualMarker 方法与同连接事务实现。要求先存在完整不可变请求receipt（显式read接口），绑定固定window、全部启用site、board/account/game/community和manifest；不从当前配置捏造点击快照。deterministic run PK固定requestId/source/account/site，逐字段验冲突。全部站点入队并读回后精确CAS清marker，同事务提交；异常回滚，commit未知destroy不盲重试。同request完整重复不复位terminal、不清新marker；部分证据拒绝。

仅使用当前schema已有列，不依赖board/site_url_snapshot迁移，不DDL。普通main和生产路径未接入。receipt接口目前需可信调用者提供，具体持久receipt实现、初次授权跨重启恢复与ACK未知只读reconcile尚未实现，不可声称整链durable/no-loss完成。现marker无版本（迁移004 DATETIME），只能视为合并pending请求，不能承诺每次点击exactly-once。

本批仍待隔离测试、复审、worker failclosed接线及冻结QA。不真实连接数据库，不改现役。

后续进展：同事务补active api_token仅状态/过期/hasCipher检查，不读取密钥；worker带controller的海外marker仅走显式handoff hook，无hook拒绝，不走旧CAS+legacy dispatch；listManualDueSources增加region_code只读投影。故障注入包含多站回滚、ACK未知、重放新marker/terminal、冲突与模拟并发锁，实际调用Repository新事务方法但SQL仍fixture。

员工复审明确剩余阻断：固定窗口仍未证明来自DB时间+各站board游标；receipt.read仍注入接口非可信持久实现，现任意read回调不能作为生产权威。必须补receipt生成时固定DB anchor/游标证据及持久来源/恢复，不能将本候选作为真实清marker许可。fixture并发锁不是MariaDB真实隔离证明。本批仅事务核心局部候选，继续RUNTIME_NO_GO。

验证：新事务9tests+drain7tests为16/16；候选10冻结12tests文件88/88，639份SHA前后一致；git diff --check通过。事务SQL来自实际Repository方法，执行器仍fixture。新增v081 manifest、v082交接，未commit/push。
