# Candidate Loader 区域字段归属 P0 回归报告

- 日期：2026-09-09
- 角色：测试负责人
- 范围：`worker/src/schedulerCandidateLoader.js`、`worker/test/schedulerCandidateLoader.test.js`
- 边界：零数据库 Node 测试；未连接数据库，未改迁移、Worker、legacy 或 3306。

## 结论

**PASS。** 准入 `public_opinion_023_e2e_7e4ed9f5` 的 5A-2 重跑。

## 验证

| 项目 | 结果 |
|---|---|
| loader 专项 | 4/4 通过 |
| 2A-3A 联合回归 | 26/26 通过 |
| SQL 字段归属 | 使用 `g.region_code AS region_code` |
| 禁止错误字段 | 未发现 `s.region_code` |
| 映射 | source 继续读取 `row.region_code` |
| 空白检查 | `git diff --check` 通过 |

修复仅改变候选 SELECT 的字段所属表和稳定别名，不改变 join、候选排序、默认账号语义或 runtime 映射。真实 E2E 库保持 `po_sync_runs=0`，可按 5A-2 范围继续。
