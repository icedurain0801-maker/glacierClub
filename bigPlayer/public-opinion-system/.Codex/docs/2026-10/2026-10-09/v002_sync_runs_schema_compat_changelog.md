# 国内 sync-runs 旧 schema 窄兼容候选

Status: isolated-candidate-pending-independent-qa
Date: 2026-10-09

## 需求与边界

现役 v019 的 `GET /api/public-opinion/sync-runs?page=1&pageSize=20` 经测试负责人只读复测仍为 HTTP 500，服务日志报 `Unknown column 'r.community_id'`。本候选只修改 `server/src/db/repository.js` 的运行记录读取投影；不执行 029/030、不切 PublicOpinionApi、不连接或写入生产库、不运行真实采集。快照方案 A 与本缺陷无关。

## 实现

`getSyncRun`、`getLatestSyncRunForSource`、`listSyncRuns` 共用只读 `information_schema.COLUMNS` 探测。仅六个硬编码白名单列按实际存在性生成 SQL：`community_id`、`board_id`、`board_name`、`run_scope`、`site_url_snapshot`、`last_request_at`。缺列返回 `NULL AS` 原有字段别名，存在则读取真实列；账号的 `a.community_id`、027 的 parent/site、023 的 trigger/window、列表分页与作用域过滤保持不变。探测失败直接报错，不以猜测 schema 继续查询。没有更改 Token、Connector、AI、Alert、Worker 或写入路径。

## 开发侧隔离验证

- 语法检查：`node --check` 对 Repository、三个测试文件及隔离 CLI 均通过；`git diff --check` 通过。
- 定向单测：旧 schema 六列全缺、六列全有、部分迁移三组，以及元数据探测失败关闭，4/4 PASS；隔离 HTTP 夹具对 health、来源、运行记录列表/详情/最新接口 1/1 PASS。连接池设置为调用即失败，夹具记录池调用 0。此 HTTP 测试不代表真实生产 API。
- 服务端全量：`npm --workspace server test` 577/577 PASS。完整输出：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/sync-runs-compat-20261009/server-test-final.log`。
- 全新本机 MariaDB 10.4 隔离实例 `127.0.0.1:43321` / `po_sync_run_compat_fixture`：六表人工 schema 故意没有上述六列；旧 `SELECT r.community_id` 负控制得到 `ER_BAD_FIELD_ERROR`。专用只读身份通过 `CURRENT_USER()` 与 GRANT 白名单核对，Repository 对详情、最新、列表发真实 SQL 均成功；列表 2/2、详情 1、最新 1，查询合计 94 ms。实例停止、端口释放。脱敏结果及完整 init/server 日志位于 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/sync-runs-compat-20261009/mariadb-cj9C5s/`；CLI 完整输出为同级 `isolated-final.log`。
- 夹具脚本前几次演练分别因 GRANT 结果解析和预期别名断言错误得到 `NO_GO`；错误及服务日志保留于同级 `mariadb-qI4v3R/`、`mariadb-Ztr2Mf/`、`mariadb-Hx7ALZ/`。修正后仅最后一次结果计为通过；均未使用生产连接。
- 不带 `--isolated` 的 CLI 返回 `PRODUCTION_EXECUTION_DISABLED`。本候选脚本的目标固定为本机 43321，结果声明 `productionTouched:false`；这属于执行边界与脚本证据，不是生产数据库审计证明。

## 冻结与剩余风险

候选文件及 SHA256、五项国内冻结基线、证据哈希见 `v003_sync_runs_schema_compat_manifest.json`。`server/test/repository.test.js` 另有本单开始前的未提交 board-schema 测试改动，本单只局部暂存自己的测试桩 hunk，不会替用户提交其他 hunk。完整工作树文件哈希包含这两处既有改动，QA 须按 manifest 与本地提交分别核对。

本次仅证明隔离旧 schema SQL 可执行；未在当前生产库运行候选，无法排除真实数据量下 8 秒超时、权限或其他兼容问题。独立盲测前不得称 QA PASS；生产仍 `NO_GO`，不得直接切服务或迁移。
