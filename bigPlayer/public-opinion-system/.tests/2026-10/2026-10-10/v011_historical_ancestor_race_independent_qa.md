# 历史 ancestor UPDATE 与实际 parent.finalize 竞争独立 QA

Status: `ISOLATED_HISTORICAL_PARENT_ANCESTOR_RACE_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 范围

对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-kT62iM` 的专属 `--isolated-parent-historical-race` 执行一轮独立 fresh SQL。Manifest SHA256 `1a064d1049d0f1cabca59de35c43b3c6e920275f14e82314e399d14955ea3820`，698 files。只用自有 MariaDB 13316/serverId20261036/`po_overseas_fixture`，不运行旧 PASS 矩阵、通用 `--isolated`、一小时下一槽、受限恢复 proof、真实 HTTP/AI、生产 3306 或第二 consumer。国内不动。

## 原件

以下 `.temp/` 路径相对于上述仓库根。前后 verify 和专属 mode 均 exit 0，验前及结束时 13316 无监听；新实例 `serverStopped=true`、`portReleased=true`、`productionTouched=false`。

| 原件 | SHA256 | 核验 |
|---|---|---|
| `.temp/kT62iM-qa-preverify.raw.txt` | `e05fbf38383c98acd0c45bf1b048405acd87435dfad4bf74658c65e989181caf` | `verified=true, files=698` |
| `.temp/kT62iM-qa-historical-race.raw.txt` | `fa3385647289d5c211c4e9b6ec157a13e802c027cd4ae3a83c5517451ba95828` | `PASS_ISOLATED_HISTORICAL_PARENT_ANCESTOR_RACE` |
| `.temp/overseas-real-db-gBtwXZ/result.json` | `0861904a2ad544dee4976be021371df3a77a3282cd105c36f8ef3ee6184344be` | 原结构化证据；独立于开发原件 |
| `.temp/kT62iM-qa-postverify.raw.txt` | `e05fbf38383c98acd0c45bf1b048405acd87435dfad4bf74658c65e989181caf` | `verified=true, files=698` |

## 三道实际父事务 barrier

1. `actual_parent_finalize_before_sorted_locks`：父连接 9、distinct writer 连接 12。discovery 六 ID 完整且有序；目标 `fc8fb4cb-fa68-4982-be30-0e892b768749` 是四条历史 depth1 祖先之一，不是两条新 depth2 reply。writer 在父排序锁前实际提交 `is_deleted=1`；父以 `OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT` 业务拒绝。父五表 before/after SHA 相同。
2. `actual_parent_finalize_all_sorted_locks`：`lockedIds` 与 discovery 六 ID 的完整排序序列相等。distinct writer 的真实 UPDATE 为 `ER_LOCK_WAIT_TIMEOUT`，其事务内及回滚后 `is_deleted=0`。父随后由 `fixture_sentinel` 主动触发回滚，父五表哈希相同。**不能写成 timeout 本身令父业务拒绝**。
3. `after_actual_parent_rollback_release`：锁释放后 writer 再次实际提交 `is_deleted=1`；未拦截父 finalize 对新漂移返回 `OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT`，父五表哈希仍相同。writer 变更的历史内容本身不属于父五表零写断言。

随后恢复正常父完成 `completed_authorized_scope`，两子成功，`discovered=2/stored=2`、两条成功 cursor；四历史祖先、两新 reply、当前批两 unique links 的数量原件均明确。`normalParentFinalizeVerified=true`。三 barrier 的父前后 SHA 均一致，连接身份检查包含于专属 mode。

## 结论

本批仅证明自有隔离实例中实际 parent.finalize 的历史祖先 distinct UPDATE 竞争、锁序与漂移拒绝，不以锁 primitive 替代。第二槽执行、预算语义缺口、持久排空/真实 provider/AI/通知、恢复及生产单消费者切换未因此完成。整体仍 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`，不授权生产激活或发版。
