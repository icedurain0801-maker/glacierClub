# PublicOpinionApi v053 受控切换失败与回退记录

Status: rolled-back-no-go
Date: 2026-10-09

## 目的与结果

国内“抓取任务记录”接口此前返回 500，服务端日志显示 `Unknown column 'r.community_id'`。`v053-unified-scheduler-index-compat-20260921-qa` 已有隔离兼容测试，但没有当前生产库的真实接口通过证据。本次按已批准的单服务受控切换验证；结果未通过，已立即恢复 `v019`。国内该接口问题仍未解决，整体保持 `NO-GO`。

## 本次操作与核对

- 切换范围仅为本机 `PublicOpinionApi`；未执行 029/030 迁移，未更改数据库、Worker、其他平台服务或生产任务。
- v053 启动后 `/health` 返回 200、数据库状态 `ok`；目标列表及国内来源接口均在 8 秒内超时，触发回退。不能以健康检查通过替代关键接口验收。
- 回退后 `PublicOpinionApi.xml` 与切换前备份 SHA256 均为 `11BA38DBD7559CBDE05A80F5C705A4D6D530FBC058BC77017B660881F79E0BB4`，配置指向 v019。切换前备份路径为仓库上级 `.temp/PublicOpinionApi.pre-v053-20261009.xml`。
- 回退后再次只读核对：`PublicOpinionApi` 为 `Running`、PID `23248`；本机 `127.0.0.1:4320/health` 可达且数据库状态 `ok`。这不证明目标接口已恢复。
- 本会话未执行 DML/DDL；没有数据库审计证据，故不声明“生产数据零写”已被证明。

## 后续门禁

v053 不得再直接切换。`SYNC_RUN_PROJECTION` 同时涉及未落地的 029/030 字段，窄兼容修复须覆盖列表、详情及最新 Run 的所有缺列投影，并在隔离和真实库兼容门禁下重新验收。隔离 fixture 通过不得等同当前生产库通过；任何再次切换、迁移或真实 Run 均需重新派单和授权。
