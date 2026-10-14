# v363 DB 参数契约与运行时状态最终 QA

## 结论

**PASS / READY_FOR_SECOND_APPLY_WINDOW**。

## 独立复测

- `execution-gates.test.js`：`4/4 PASS`，包含正确 DB identity hash、错误 host/name fail-closed、ROW_COUNT/同会话事务与回滚 hash gate。
- `executor.test.js`：`6/6 PASS`，包含 DRY_RUN、fail-closed、故障注入及 mutable runtime state schema。
- `apply-state.json`：schema 仅允许 `candidateId/step/status/updatedAt`，无 password/secret/token/api key 等敏感字段。
- BOM/无 BOM：reader 去除 UTF-8 BOM 后均可解析，回归通过。
- `checksums.sha256`：精确 `425` 条，明确不含 `apply-state.json`，`425/425 MATCH`。
- manifest/provenance/README 均声明 `apply-state.json` 为 mutable、`hashExcluded`、schema-only 校验。

未执行 Apply，未连接或写入生产 DB，未访问 3001。该结论仅授权项目经理在同一已批准窗口发起第二次 Apply，不代表测试负责人自行执行。
