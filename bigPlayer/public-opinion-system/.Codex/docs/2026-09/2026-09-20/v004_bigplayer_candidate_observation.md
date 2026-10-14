# v004 BigPlayer 候选观测（默认关闭）

## 范围

为定位“公开首页有今日帖子、系统未入库”的候选层缺口，增加 BigPlayer Q1 单来源、单同步 Run 的脱敏候选观测。未改变 Feed、时间解析、近一周窗口、去重、频率、入库或同步终态逻辑。

## 启用门槛

默认关闭。仅当以下三项同时满足时，Worker 才会请求并持久化观测：

- `BIGPLAYER_CANDIDATE_OBSERVATION_ENABLED=true`
- `BIGPLAYER_CANDIDATE_OBSERVATION_SOURCE_ID` 精确等于当前 source ID
- `BIGPLAYER_CANDIDATE_OBSERVATION_RUN_ID` 精确等于当前 sync run ID

缺任一项、来源或 Run 不匹配时不会生成观测，也不会增加审计写入。

## 审计字段与边界

每个已匹配的 Q1 Feed 页最多写入一条 `bigplayer_candidate_observed` 审计事件，字段严格限定为：`sourceId`、`runId`、`endpointKind`、`feedKey`、候选总数、`createTime` 有效数/窗口内数、首末 `externalId + UTC 时间`、HTTP 状态码。

不会记录正文、Token、Authorization、Cookie、请求/响应头、完整 URL query 或原始响应。审计写入失败仅输出脱敏错误码，不中断采集、checkpoint 或 Run 终态。

## 验证

- `server/test/connectorSlice.test.js`：默认关闭无观测；开启后仅产生允许的字段，并验证北京时间候选转换为 UTC。
- `worker/test/worker.test.js`：精确 source/run 双匹配才下传观测开关；审计写入失败不影响单页采集。

## 影响与回滚

关闭时无网络、存储或性能影响。开启的单个 Run 每个 Feed 页增加一次小型审计写入，性能影响为额外一次数据库写入；不访问额外 Provider 接口。回滚方式是移除三个环境变量或将总开关设为非 `true`，无需数据迁移或删除审计历史。

本次未部署、未重启、未补跑、未运行观测。
