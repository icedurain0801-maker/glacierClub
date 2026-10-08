# 同快照执行器本地候选变更记录

Status: isolated-qa-pass-production-no-go

## 已完成

- `server/src/db/snapshotExecutor.js`：新增仅允许 127.0.0.1 专用 433xx 隔离实例的执行器。生产模式在连接前固定 `PRODUCTION_EXECUTION_DISABLED`；对实例身份、datadir、源/恢复库及固定对象基线做前置校验；将对象全集、同版 Manifest、真实 `mysqldump`/`mysql` 子进程、artifact 字节与 SHA256 校验、空间及清理回调接入 `runSnapshotGate`。子进程不经 shell，错误正文不写入返回值。
- `server/test/snapshotExecutor.test.js`：生产模式零连接拒绝、非法隔离身份/路径零连接拒绝、完整对象类型枚举共 3 项通过。
- `scripts/snapshot-executor-isolated.js`：只接受显式 `--isolated`，固定本机 43317/server_id=20261017 与全新 datadir，生成三表九对象人工夹具，调用正式执行器，验证数据/索引变异拒绝及自有实例清理。
- 正式执行器隔离端到端复验通过：`PASS_ISOLATED_EXECUTOR_E2E`，FTWRL 持有 203 ms，真实 dump 9,067 字节，源端锁内前后与恢复端逐项一致，数据及索引变异均被拒绝，子进程退出确认、实例停止、43317 释放。脱敏结果位于仓库上级 `.temp/po-closeout-20261008/snapshot-executor-isolated-U4ztUN/result.json`，绑定 CLI SHA256 `07873c159b702e06ef7f07110e297d86d6f4183740e7eaf968acf1d072d293c0`、Executor SHA256 `cc8dc27901f71bce3d1ea25c612fba68f6d986b1cb4e4f47a2896ddcb0cd6dbb`、Gate SHA256 `6af1cebf7c665d068a58df2d86463d9a92b36ffe1585d7916b421816d1674f46`、Manifest SHA256 `70491082864b835722abc2b8a1c56899687db57466262ca1a31c0890360a7be4`、dump SHA256 `8498d1adb4e08d07f3a89696cec34bb2387cfc3d84d24f57e73060fb9e8bf003`。人工小夹具不代表生产锁窗口。
- `scripts/snapshot-production-readonly.js` 及其测试：显式只读观察账号、短查询时限、身份核对、聚合规模/事务/连接/租约/写入计数输出；两项假连接测试通过。现场配置仅有现役 root，无独立只读账号，本轮执行在连接前返回 `READONLY_CREDENTIALS_MISSING_OR_INVALID`，脱敏证据为仓库上级 `.temp/po-closeout-20261008/snapshot-production-readonly-1791457288253.json`。未采集新的 DB 表规模、事务与租约，不能沿用旧快照替代。
- 本轮本地审查修正三项边界：GRANT 校验收紧为目标库 `SELECT` 加全局 `PROCESS`；缺失写入计数不再静默按零；隔离 CLI 初始化超时确认自有子进程退出后才返回。修正后只读脚本测试 `3/3` 通过，服务端全量测试 `572/572` 通过。
- `scripts/snapshot-production-readonly.js` 及其测试：显式只读观察账号、短查询时限、身份核对、聚合规模/事务/连接/租约/写入计数输出。现场配置仅有现役 root，无独立只读账号；账号权限标志盘点显示唯一非 root 账号 `pma@localhost` 不具备目标库 `SELECT` 或全局 `PROCESS`，本轮执行在连接前返回 `READONLY_CREDENTIALS_MISSING_OR_INVALID`。脱敏证据为仓库上级 `.temp/po-closeout-20261008/snapshot-observer-account-inventory-1791457492350.json`。未采集新的 DB 表规模、事务与租约，不能沿用旧快照替代。
- OS 只读采样：`PublicOpinionApi`、`PublicOpinionWorker`、`PublicOpinionAnalysisWorker`、`PublicOpinionTranslationWorker` 均 Running；`BigPlayer Last Night Overseas Daily 02`、`BigPlayer Q1 Daily 02` 均 Ready；3306 有监听。此现状不能证明写入已排空。

## 待验证与边界

- 测试负责人已基于冻结哈希独立复验并回报 `PASS_ISOLATED_EXECUTOR_FROZEN_CANDIDATE`：CLI、Executor、Gate、Manifest SHA256 全部匹配；只读脚本测试 `3/3`、服务端全量 `572/572` 通过；43317 隔离 E2E 的真实 dump/严格恢复、artifact 绑定、数据及对象变异拒绝、子进程清理和端口释放通过。此 PASS 仅限隔离范围。
- 正式执行器的正常路径已用真实隔离 dump/restore 跑通；大负载接线、abort/子进程退出故障注入及文件 ACL 仍待验收。
- 生产只读评估缺独立最小权限账号，当前 DB 容量/活跃写入/事务/租约新鲜证据未取得；即使取得两次短时写入采样也不等于已排空。生产锁库、备份、恢复、029/030、排空、切换和真实 Run 均保持 `NO_GO`。
- 供项目经理决策的最小账号方案：单独观察账号仅授予目标库 `SELECT` 与全局 `PROCESS`；凭据通过受控安全注入，禁止写入仓库或日志；观察窗口结束后撤权。当前仅提出方案，未执行 `CREATE USER`、`GRANT` 或 root 正式评估。
- 本候选未推送；先前用户确认的推送只含离线准入回归，不含此模块。

## 待用户明确授权的生产权限方案（仅方案，不执行）

项目经理已确认当前不存在可复用的最小权限观察账号；创建账号会改变生产权限，因此本节只提供待审批脚本和验收条件，不包含真实用户名、密码或生产连接信息。

### 账号生命周期

```sql
CREATE USER 'po_snapshot_observer_<ticket>'@'127.0.0.1' ACCOUNT LOCK;
-- 仅在已证明不把口令写入 SQL/审计的受控凭据 API 中设置口令；
-- MariaDB 10.4 参数化 SET PASSWORD 与 ALTER USER ... IDENTIFIED BY ? 已在隔离环境返回 ER_PARSE_ERROR，当前不得执行生产替代语句。
ALTER USER 'po_snapshot_observer_<ticket>'@'127.0.0.1'
  PASSWORD EXPIRE INTERVAL 1 DAY;
GRANT SELECT ON `public_opinion`.*
  TO 'po_snapshot_observer_<ticket>'@'127.0.0.1';
GRANT PROCESS
  ON *.*
  TO 'po_snapshot_observer_<ticket>'@'127.0.0.1';
-- 仅在口令已安全设置后解锁：
ALTER USER 'po_snapshot_observer_<ticket>'@'127.0.0.1' ACCOUNT UNLOCK;
SHOW GRANTS FOR 'po_snapshot_observer_<ticket>'@'127.0.0.1';
-- 观察窗口结束后执行：
REVOKE SELECT ON `public_opinion`.*
  FROM 'po_snapshot_observer_<ticket>'@'127.0.0.1';
REVOKE PROCESS
  ON *.*
  FROM 'po_snapshot_observer_<ticket>'@'127.0.0.1';
DROP USER 'po_snapshot_observer_<ticket>'@'127.0.0.1';
```

执行约束：账号仅允许本机连接，用户名必须绑定工单和失效时间；密码只通过受控进程环境/凭据管道注入 `PO_READONLY_DB_*`，不得写入仓库、命令行参数、日志或证据文件。授权前后均需保存脱敏 `SHOW GRANTS` 结果，并由脚本门禁验证目标库 `SELECT` 与全局 `PROCESS` 恰好存在且没有全局 `SELECT`、`INSERT`、`UPDATE`、`DELETE`、`CREATE`、`DROP`、`ALTER`、`GRANT OPTION` 等额外权限。

### `PROCESS` 风险与替代

全局 `PROCESS` 可让观察账号看到实例内其他数据库的线程、事务和部分 SQL 元数据；即使脚本只输出聚合值，也扩大了生产信息暴露面。若项目经理不接受该范围，可改为不授予 `PROCESS`，仅使用目标库 `SELECT` 查询本库规模、租约和写入计数，并将进程/事务可见性标记为缺项；不得通过 root、绕过脚本门禁或读取其他库来补齐证据。无论采用哪种方案，缺少必需权限都必须保持 `NO_GO`，不能把缺失值当作零。

### 负权限验证

在任何生产只读评估前，使用独立连接执行 `SHOW GRANTS` 并让 `scripts/snapshot-production-readonly.js` 拒绝以下任一情况：账号为 root 或其他管理员、目标库 `SELECT` 缺失、全局 `PROCESS` 缺失（若选择 PROCESS 方案）、出现任意写权限/DDL 权限/全局 `SELECT`/`GRANT OPTION`、凭据来自未批准变量。验证失败时必须在连接业务查询前返回 `READONLY_CREDENTIALS_MISSING_OR_INVALID`，且不产生生产证据。

### 隔离生命周期兼容性结论

`scripts/snapshot-production-readonly-isolated.js` 在 MariaDB 10.4.14、43318 隔离实例上验证了 `ACCOUNT LOCK`：锁定账号在设置口令前登录被拒绝，证明不存在可登录的无口令窗口；随后尝试通过客户端参数化设置口令（`SET PASSWORD` 与 `ALTER USER ... IDENTIFIED BY ?`，SQL 文本均不含口令）时，MariaDB 均返回 `ER_PARSE_ERROR`。未改用明文 SQL、默认口令或弱随机兜底，脚本以 `PASSWORD_INJECTION_UNSUPPORTED` 失败关闭并确认实例、账号和端口清理。最新脱敏证据目录为仓库上级 `.temp/po-closeout-20261008/snapshot-readonly-lifecycle-DZnFJ5/`，结果仅包含阶段、错误码、`productionTouched:false`、实例停止和端口释放；未包含口令或完整 SQL。结论：在找到能证明口令不进入 SQL/审计的受控注入 API 前，不得申请或执行生产账号创建与授权。

候选威胁模型：明文 SQL/客户端命令行会把口令暴露给 SQL 审计、general log、进程列表或 shell 历史；直接更新 `mysql.user` 需要系统表写权限并绕过正常授权审计；使用 root 冒充观察账号会掩盖真实最小权限边界；无口令解锁会产生可登录窗口。上述路径均排除。MariaDB 10.4 客户端预处理只绑定数据参数，不能绑定账户认证属性，因此不能作为安全口令注入 API。

### 不扩大权限的安全替代

在不创建账号、不增加授权的前提下，只能使用现有已批准服务身份执行脚本允许的目标库聚合查询；脚本必须把 `CURRENT_USER()`、TCP 来源、角色状态和现有授权作为前置门禁，任何 root、继承角色、额外全局/库权限或缺失 `PROCESS` 的情况均失败关闭。该替代无法补齐跨库进程可见性，也不能证明生产排空，因此输出仍为 `NO_GO`，并且不生成正式生产规模证据。最短下一步是由项目经理确认是否存在已批准的受控凭据注入 API；在确认前保持当前候选冻结，不创建生产账号、不授权、不执行正式只读评估。
