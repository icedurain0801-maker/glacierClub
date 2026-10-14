# scheduled runSource 异常路径独立QA

Status: `ISOLATED_FAILURE_PATHS_PARTIAL_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-y9ZiDA`

## 结论与原件

仅manifest的两条`failureSql`在两个全新自有13316实例顺序独立通过；未重跑旧成功链/76纯测，也未改旧`znyz3f`失败原件。外部manifest SHA256前后`53aca08f0f42ca7af5aa32c6fdaad5f7c6e3f5fe5fc3e5a5e8074588d84f6f43`，`--verify`前后679项一致。

- `--scheduled-budget` exit 0，`PASS_ISOLATED_SCHEDULED_FAILURE_PATH_PARTIAL`：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-N4IZfL/result.json`，SHA256 `0219ba22f6116d8bd6df561ad0bcd73d6e5e831a6b04ac1d24751e502d543554`。
- `--scheduled-transport-error` exit 0，同为隔离异常路径PASS：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-93YhwQ/result.json`，SHA256 `0bdd47c9b61d27f48c7adb86c2f1a595887a2854631cfcf73f5365b6ea7a9e51`。

两结果均记录`serverStopped=true`、`portReleased=true`；每轮之前13316无监听，结束后13316无监听。3306 PID5900、3001 PID19768、Worker PID19584及启动时间前后一致。脚本先核自有`127.0.0.1:13316`/server_id `20261036`/datadir/PID才写合成库，身份匹配才`SHUTDOWN`；收尾最多20秒，停止/端口证据缺失会置NO_GO并exit1。本轮未连接3306或真实HTTP、未消费AI、未动现役国内。`productionTouched=false`不能证明历史DB未变。

## 异常矩阵

| 场景 | 独立状态 | 精确边界 |
|---|---|---|
| provider分页预算耗尽 | PASS_ISOLATED | 合成`pageSize=10000`/预算1，`hasMore`和`nextOffset=1`触发`provider_pagination_budget_exhausted`；child/audit partial，1唯一内容、两类各1 pending job，3 failed CP释放owner/lease且安全cursor offset1；账本未封口，父run/source-state/source全行不变。 |
| feed合成transport抛异常 | PASS_ISOLATED | 三feed异常，child/audit partial，0内容、3 failed CP释放owner/lease且空cursor；父run/source-state/source全行不变。 |
| 上海时区完整runSource | PASS_ISOLATED | 两轮均在`Asia/Shanghai`执行，保留SQL DATETIME CP释放语义；不是生产时区迁移证明。 |
| 正常`pageSize=20`预算、首提交后第二页transport失败 | NOT_TESTED | 本轮预算用10000合成边界，transport错误发生在feed首请求。 |
| epoch2/restart、未知ACK恢复、父聚合/cursor并发、shared scan/permit、AI持久预算通知 | NOT_IMPLEMENTED/NOT_TESTED | 整体`FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。 |

预算offset1、三CP和全行不变由冻结脚本的SQL读取与断言支撑，result摘要只给场景、内容数、CP状态，并未逐行导出原始表快照；不把摘要扩大成未记录的生产证据。后续须新冻结验正常页尺寸和提交后第二页故障，再补余下全链。
