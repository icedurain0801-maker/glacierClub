# BigPlayer API 回滚门禁报告

- 日期：2026-09-20
- 结论：**PASS（仅回滚门禁）；迁移/API整体门禁仍冻结**

## 证据

- `PublicOpinionApi.xml` 指向旧稳定 release `release-31135-668-15061`。
- 运行 `app.js` SHA-256：`A211EABEA9798ECF82FFA8DFE12575A0CE08589702C5D306D6E95E9A2384F4AA`。
- API PID `42076`、4320 health `200`。
- `/api/public-opinion/sync-runs` 列表 `200`；旧 run `1a709456-95b3-4df8-9181-0244533c6449` 详情 `200`。
- 4311 PID `39744`、Worker PID `40168` 未变化。

## 仍冻结

生产 `parent_run_id` 尚未迁移；包含 migration、test bootstrap、新 API 的完整候选尚未通过空库/旧 schema 升级、幂等、失败恢复、DDL 锁、schema 版本、69/69 全量回归等整体门禁。因此未进行生产迁移、API 切换或 sync。
