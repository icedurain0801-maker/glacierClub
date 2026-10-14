# 5A-2R 候选加载失败独立只读诊断报告

- 日期：2026-09-09
- 角色：测试负责人
- 目标：`127.0.0.1:43306/public_opinion_023_e2e_7e4ed9f5`
- 边界：只读 SQL 与脚本审查；未重跑 scheduler，未修改数据库、业务、迁移、Worker、legacy 或 3306。

## 结论

**FAIL，退回开发负责人。** 候选加载 SQL 的字段归属错误导致 job 在入队前返回 `CANDIDATE_LOAD_FAILED`。

## 独立复现

将 `schedulerCandidateLoader.js` 的完整候选查询原样以目标最小权限账号执行，结果：

```text
exit_code=1
ERROR 1054 (42S22): Unknown column 's.region_code' in 'field list'
```

schema 只读查询确认：

```text
po_games|region_code|varchar(20)
```

`po_sources` 不含 `region_code`。当前 5A 种子 `po_sync_runs` 数量仍为 0，说明失败发生在 candidate loader，尚未进入 lease 或入队写操作。

## 最小修复范围

仅修改 `worker/src/schedulerCandidateLoader.js`：

```sql
-- 当前错误
s.region_code,

-- 最小修正
g.region_code AS region_code,
```

不修改 schema、种子、023、Worker seam、legacy 或外部连接器。修复后可在当前仍未写入的 `7e4ed9f5` 重新执行完整 5A-2；先复跑零数据库 fixture 与候选 loader 单元测试。
