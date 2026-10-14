# v227 BigPlayer 默认关闭候选观测合同验收

- 测试日期：2026-09-20（北京时间）
- 测试角色：测试负责人
- 验收类型：隔离自动化合同回归
- 真实运行边界：未部署、未重启、未补跑、未运行观测、未解密、未访问 Provider、未写库
- 结论边界：本报告不构成源站漏采修复或线上数据恢复结论

## 验收结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 默认关闭/脱敏候选字段 | PASS | `node --test --test-name-pattern "Q1 candidate observation is opt-in and contains only redacted candidate metadata" server/test/connectorSlice.test.js`，1 passed / 0 failed |
| 精确 source/run 三重门禁 | PASS | `node --test --test-name-pattern "BigPlayer candidate observation requires the exact enabled source and run, and audit failure does not interrupt collection" worker/test/worker.test.js`，1 passed / 0 failed |
| source 或 run 缺失/不匹配 | PASS（由定向用例覆盖） | 不匹配时不产生观测/审计；精确匹配时才下传观测配置 |
| 允许字段 | PASS（由定向用例覆盖） | `endpointKind`、`feedKey`、候选数、`createTime` 有效/窗口内数、首末 `externalId + UTC`、HTTP status，以及外层 `sourceId/runId` |
| 禁止字段 | PASS（由定向用例覆盖） | 不包含正文、Token、Authorization、Cookie、请求/响应头、完整 URL query、原始响应 |
| 审计写入失败 | PASS（由定向用例覆盖） | 测试故意注入 `DATABASE_ERROR`；worker 输出脱敏错误码，单页采集继续完成，checkpoint/Run 不被中断 |
| 语法与空白 | PASS | `node --check server/src/connectors/bigPlayerH5Connector.js`；`node --check worker/src/worker.js`；`git diff --check -- ...` 均通过 |

## 观察到的测试日志

worker 定向测试输出一条：`[worker] BigPlayer candidate observation failed errorCode=DATABASE_ERROR`。该日志来自测试故意模拟的审计失败分支，且对应测试用例通过；不代表真实服务发生数据库故障。

## 未执行项

- 未运行候选观测开关。
- 未访问 Provider/API，不读取凭据，不解密，不写数据库。
- 未验证真实源站 feed、createTime、公开 ID 与线上入库结果。
- 未验证真实同步 Run 或今日内容恢复。

## 结论

默认关闭、精确 source/run 门禁、脱敏字段和审计失败隔离合同 **PASS（隔离自动化）**。该变更不能作为源站漏采修复结论；后续真实观测仍需项目经理单独部署/运行门禁。
