# 排空与目录策略增量离线独立 QA

Status: `OFFLINE_DRAIN_DIRECTORY_PASS / SQL_DRAIN_NOT_VERIFIED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 范围

仅在仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-YLd7mL` 执行冻结校验和指定三文件离线测试；manifest SHA256 `8cd2055454032909f71d9fefa7c00d4ef1d01f0d156a9ae59f532002c5eb9763`，703 files。没有运行本包任何 SQL/13316、生产目录/ACL/服务、HTTP/AI、受限恢复 proof 或第二 consumer。另一包 9io1Ti 的原 3600 秒真实等槽进程未中断、未换包。

## 独立原件

下列 `.temp/` 相对于上述仓库根；三个子命令均 exit 0。

| 原件 | SHA256 | 结果 |
|---|---|---|
| `.temp/YLd7mL-qa-preverify.raw.txt` | `9877c58510083178cc805d00a13d944e8cf733dc98076b1e94a26b653f3e8679` | `verified=true, files=703` |
| `.temp/YLd7mL-qa-drain-directory.raw.txt` | `30ea72f6185edd340f3e6192a27d1f2fdfb6a47bcb57825fbe24933730508d51` | 13 pass、0 fail、`OFFLINE_GUARD_DENIALS:{}` |
| `.temp/YLd7mL-qa-postverify.raw.txt` | `9877c58510083178cc805d00a13d944e8cf733dc98076b1e94a26b653f3e8679` | `verified=true, files=703` |

## 结果和边界

- 新排空三项：实际 `runOnce` 的内存 repo/显式 scanLease 模拟阻塞 queue read 和独立 cleanup ticket；close 等待异步 lease 释放、3 个 ticket、cleanup 与 candidate 结束才 `pool.end`。未知 quiescence 的 27 个子例均拒绝关池；quiescence/candidate 两类异常不能穿透到 pool end。ticket 重复 release 不应减负计数。它们是三项测试内的子例，不是 27 个新增顶层测试。
- 原 lifecycle 六项：准入停止、coalesced run、failed scan cleanup、rollback 的保守拒绝、readonly assessment 和非目标 scheduler 引用保持通过。目录四项：伪 production brand 与越界路径在验证前拒绝，隔离策略仅允许已有非链接子项，缺失目录/无 policy fail closed，Journal 只接受精确 branded 注入策略。
- 该测试使用无 query 内存依赖，不含 SQL lease、30 秒续租、真实队列/生产关机路径、ProgramData owner/ACL/fsync/atomic rename 或持久重启恢复。现役共享 Worker 的 shutdown 尚未接此 lifecycle；不能把离线因果闭包称为真实 SQL 排空或生产持久目录完成。

## 结论

只给出 `OFFLINE_DRAIN_DIRECTORY_PASS`。9io1Ti 独立真实下一槽合成执行另立结果，不受本包 PASS 替代。生产入口/持久目录/真实排空和完整 runtime 仍 `NOT_VERIFIED`，整体 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
