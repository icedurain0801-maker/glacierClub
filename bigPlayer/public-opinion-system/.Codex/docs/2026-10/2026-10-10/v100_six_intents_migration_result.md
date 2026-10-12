# 六表精确迁移与配置就绪结果

Status: EXECUTED_SIX_EMPTY_TABLES_SWITCHES_DISABLED_INDEPENDENT_QA_PENDING

本记录更新 v098 的 schema 阻断状态。用户在项目经理会话确认六表 DDL；本会话已核该原始确认。随后经理明确本阶段两个开关保持 `enabled:false`，不启用新链路。当前仅 schema/config 就绪，境外定时恢复仍未验收。

## 已执行范围

2026-10-10 18:32:12，在 API 现役配置指向的生产库精确创建以下六表：

- `po_current_analysis_intents`
- `po_current_analysis_repair_records`
- `po_current_analysis_intent_audit`
- `po_overseas_current_intent_proof_audit`
- `po_current_translation_intents`
- `po_current_translation_intent_audit`

各表定义和索引来自冻结 v097 的三份已验 schema，六表均为 0 行，原有 33 张 `po_` 基础表定义逐一核验不变（比较排除并发合法 AUTO_INCREMENT 值）。无原有数据回填、无真实采集、AI 或通知，执行器不启动或重启服务。

原配置仅追加两行：

```dotenv
PO_CURRENT_ANALYSIS_INTENT_CONFIG={"enabled":false}
PO_CURRENT_TRANSLATION_INTENT_CONFIG={"enabled":false}
```

写入前检查这两键不存在，并对原配置 SHA 作再次比较；写入后核完整字节一致。原始配置字节作为前缀保持，其他配置项未修改。配置前 SHA256 `a1d8ed681765d989a8c7a14e312dd1caa74c8f8a9d96298e30f102227d5c5952`，后 SHA256 `56182482ead213d48231cf7c24db8b64e2db512243f772a9fd6d9426e749e9c7`。

## 工件与回退

正式 SQL：`v099_six_intents_authorized_migration.sql`，SHA256 `ecffbe7ba114a0987f2cf0e9baf8fe32a7ad2dabf6abe8057f3978f6a85467f9`。

仓库根 `.temp/risk-normalization-20261010/migration-six-intents-v099/attempt2/` 保存：

| 工件 | SHA256 |
|---|---|
| `result.json` | `8e16f04af6d0ad9b6c57e3f828ce899423aadbc27ba8c5bf2d1a9df32bb706f4` |
| `execute.cjs` | `a37266f83b8b550f60dd768ab710e88cddd1295a45c77a49740719b1a1ea1083` |
| `six-definitions-after.json` | `11050ae518d971a481e242f505ee07a0bdc1079a1f0112a7e1090fd00d9a6658` |
| `base-definitions-before.json` | `7e222f4d8620a2bc8eaa85e0b8b465c4717fafe26d56aa5dadd9ef1b3a22b5bc` |
| `base-definitions-after.json` | `13c6363198edceef1a98450b2bcc65669e50351b191b835ef1a7f429956e9404` |

迁移前已保存全部原有表定义、原配置 `environment-before.bin`、精确 SQL、配置 staging 和 `rollback-plan.md`。含配置字节工件仅存 ignored `.temp/`，不提交、不回显。DDL 非事务，因此每成功一个表立即保存独立 receipt；失败时不自动删除或无条件重跑。

回退方式是恢复原配置字节并保留新增空表惰性结构，不自动 DROP 表。删表需要另外的明确授权，且须核表为空、定义与来源匹配。没有伪称 DDL 可以事务回滚。

第一次尝试因 Windows 文件写入 CRLF 导致预计算 LF SHA 与实际字节 SHA 不符，在读取配置或连接数据库前拒绝，`created=[]`。失败原件保留在上一层 `result.json`；按实际 SQL 原字节 SHA 重新冻结 `attempt2` 后执行成功，没有对生产重复建表。

## 仍需完成

v097 已获独立限定 QA 6/6 一次 PASS：`.tests/2026-10/2026-10-10/v067_current_unified_release_independent_qa.md`。本次真实 DDL 与配置另交独立只读 QA 核定义、索引、空表、原有结构和配置字节。候选 PASS 不代签生产迁移。

旧任务技术禁止再起、实际准入与排空、同连接双 gate、main/loaded receipt、Translation 完整回退或受控 stop-only 仍未完成；启用需另给精确 scope。生产服务切换和境外定时恢复尚未完成，不能因六表就绪宣告修复。
