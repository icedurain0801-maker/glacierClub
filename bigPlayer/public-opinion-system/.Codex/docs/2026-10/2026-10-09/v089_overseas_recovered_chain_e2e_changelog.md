# 海外恢复factory组合离线E2E与抢先claim证据

Status: frozen / developer-99-PASS / independent-QA-pending / RUNTIME_NO_GO

本批只修改worker/test/overseasBigPlayerMainChain.test.js，业务代码不变。既有actual runSource正路径拆成explicit/recovered/competing-claim三种：recovered先调用真实file receipt.prepare及actual Repository handoff SQL，再经实际reconcile/second READ ONLY/恢复factory，进入actual runSource/Repository claim与renew SQL、真实Journal、connector/PageStore及AI/翻译入队SQL，各1次，单次completed_authorized_scope。SQL/HTTP执行器和终态辅助仍fixture；不是真实MariaDB/AI译文，也非新进程执行。

抢先claim在factory第二读完成后设置other owner并令actual claim CAS返回0；断言零HTTP、零Journal发布、零内容写、零续租/终态写。本fixture证明该拒绝分支，非真实并发数据库隔离。

复现测试执行器错误并修正：恢复run ID仍返回旧identity常量被门禁拒；checkpoint仍用旧窗口被scope门禁拒；只读reconcile rollback误用了写事务fixture备份使内容集合undefined。仅修fixture身份/窗口与只读rollback语义，不放宽业务验证。MainChain12/12通过。

剩余：新进程SQL+runSource执行、多站部分执行恢复、epoch>1持久恢复、现场全入口独占、真实MariaDB隔离/文件故障矩阵、第二源及真实链路仍NO_GO。未动现役、生产或旧快照，未commit/push/发版。

复审与冻结：员工只读无冻结阻断，明确单site组合测试的receipt SQL txn生命周期noop、marker CAS固定成功、claim按模式固定ACK、终态/checkpoint部分stub；此编排fixture不证明MariaDB WHERE/事务/锁。独立manual状态fixture才覆盖回滚/unknown。恢复前重新创建file reader读同receipt而非依赖prepare内存。联合30/30；候选13冻结12文件99/99、641份SHA一致，v090 manifest/v091交接。无业务代码新增修改。
