# 3000 受控本地真实保存验收环境

Status: prepared_not_armed.

## 设计与写入范围

浏览器始终访问 `127.0.0.1:3000`。3000 适配器仍由静态资源和 fixture 提供所有非保存接口；它新增一个默认关闭的写入门禁，仅能在所有下列环境变量明确配置后，把请求转发到指定的本地环回后端：

- `PUBLIC_OPINION_ACCEPTANCE_WRITE_ENABLED=1`
- `PUBLIC_OPINION_ACCEPTANCE_WRITE_ORIGIN=http://127.0.0.1:4321`（必须精确匹配此值；任何其他主机、端口、3000 或 3001 都拒绝）
- 专用游戏、已启用社区、测试源名称前缀、非生产测试 Token、受控站点主机名。

允许进入实际本地保存链路的只有：

| 方法与路径 | 限制 |
|---|---|
| `POST /api/public-opinion/sources` | 仅 `bigplayer_h5`、专用 community、名称必须使用测试前缀、固定非生产 Token、所有 `siteUrls` 必须属于受控测试主机。浏览器原请求中的 `enabled` 会被桥强制为 `false`、`syncMode` 强制为 `incremental`，服务端返回后再校验实际 game/community。 |
| `GET /api/public-opinion/sources/:id` | 仅已登记的验收源 ID；适配器实际调用本地后端的 `GET /sources?sourceId=:id`，兼容当前服务没有单项 GET 路由的事实。 |
| `PATCH /api/public-opinion/sources/:id/configuration` | 仅已登记 ID；仅基础站点字段，桥强制 `enabled=false`、`syncMode=incremental`，不允许写入凭据。 |
| `DELETE /api/public-opinion/sources/:id` | 仅已登记 ID；调用真实软删除，作为该隔离测试源的终态回滚。 |

所有其他写请求保持 `405 READ_ONLY`，门禁未启用或配置不完整时，上表请求显式返回 `403 ACCEPTANCE_WRITE_DISABLED`，不会假成功。

## 隔离与回滚

实际本地后端必须使用独立的 `public_opinion_acceptance` 数据库和专用测试 game/community。模板见 `bigPlayer/.temp/public-opinion-acceptance-write.env.example`；连接器、登录模拟和统一调度均为关闭状态，因此保存本身不触发采集、授权或同步。

每个成功创建、详情读取或配置保存的验收源都会登记在 `bigPlayer/.temp/public-opinion-acceptance-write-ledger.json`（运行时生成、未纳入版本控制），记录 ID、已剔除 Token/secret/password/cipher 字段的最后服务端响应和回滚动作。后续修改/删除只能针对 ledger 中活跃的 ID。测试结束对每个活跃 ID 调用受控 `DELETE /sources/:id`，服务端会软删除该隔离源；ledger 记录删除时间作为审计证据。软删除不会恢复凭据，故该源只能使用 disposable database 与非生产 Token。

## 启动顺序与门禁

1. 创建专用数据库及专用、已启用 game/community，应用当前 migrations；不得复用 `public_opinion` 或共享库。
2. 从 env example 在仓库外创建实际环境文件，填入专用 DB 凭据和独立加密密钥。
3. 必须通过 `bigPlayer/.temp/start-public-opinion-acceptance-write.ps1 -EnvFile <absolute-env-file>` 启动本地实际服务。它会先以只读连接校验 env 文件不是 reparse 文件、`DB_NAME` 和实际 `SELECT DATABASE()` 都精确为 `public_opinion_acceptance`、端口为 4321、所有连接器和调度均关闭；任一项不能证明即拒绝启动。不得启动 worker。
4. 用同一受控参数启动 3000 adapter，并将 `PUBLIC_OPINION_ACCEPTANCE_WRITE_ORIGIN` 指向 `http://127.0.0.1:4321`。
5. 先确认 3000 静态页面仍是 200，未启用门禁时 `POST /sources` 为 403；获得项目经理后续确认后，才执行新增、保存、刷新回显与删除保存。

本次只完成门禁与模板，不创建数据库、不启动 4321、不启用写入门禁，也未发出真实新增、更新或删除请求。

## 无写入启动/拒绝证据

- `node --check` 已通过 adapter、写门禁与预检脚本。
- 静态门禁契约已通过：仅精确 `http://127.0.0.1:4321` 可被判定为可配置目的地；4322、localhost 等均拒绝；创建/更新 payload 会被规范为 `enabled=false`；ledger 的 Token/password 字段被剔除。
- 以当前项目 `.env.example` 运行预检，因 `DB_NAME=public_opinion` 不等于 `public_opinion_acceptance` 被拒绝，实际服务未启动、未连接数据库。
- 3000 adapter 已在未解锁状态重启（Node PID 23688）：`GET /admin/PublicOpinion/sources.html` 为 200，fixture 详情 GET 为 200，`POST /api/public-opinion/sources` 为 `403 ACCEPTANCE_WRITE_DISABLED`，其他非白名单 POST 为 405。
