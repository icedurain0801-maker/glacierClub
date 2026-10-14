# 统一来源调度：阶段 4A 隔离数据库环境预检

- Status: blocked
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 结论

**无可用隔离环境。**

当前没有能够明确证明为本项目专用、可销毁且与其他数据隔离的 MySQL 8 或 MariaDB 验证环境，因此不得启动 migration 023 的真实空库、旧库或中断重跑测试。

## 只读证据

| 候选 | 身份与版本证据 | 隔离性判断 | 配置来源 | 风险与结论 |
|---|---|---|---|---|
| 仓库 compose | `docker-compose.yml` 仅定义 `postgres:16-alpine`，宿主端口 `5433`，卷 `public-opinion-db` | 仓库专属但引擎不匹配 | `docker-compose.yml` | 023 使用 MySQL/MariaDB DDL，不能用于验证 |
| 本机 Docker | `docker` 命令不存在，无法发现或创建仓库专属 MySQL/MariaDB 容器 | 无候选 | 本机命令元数据 | 不可用 |
| 本机 3306 服务 | PID 5280，`C:\xampp\mysql\bin\mysqld.exe`；二进制输出 `10.4.14-MariaDB`；Windows 服务名 `mysql`，自动启动；监听地址为 `::`、端口 3306 | 无仓库专属名称、端口、数据目录或可销毁边界证明，且监听非 loopback-only | Windows 进程、服务和端口元数据 | 身份/数据归属不明，按生产或未知目标处理，禁止使用 |
| 环境样例目标 | 默认 `127.0.0.1:3306/public_opinion`，用户 `root`；也允许 `DATABASE_URL` 覆盖 | 仅是示例，未声明测试专用实例或数据库 | `.env.example` | 指向现有 3306 的可能性高，不能证明隔离，禁止使用 |

## 迁移入口风险

- `server/src/db/migrate.js` 使用 `mysql2/promise`，会读取运行环境并建立真实连接。
- 默认目标为 `127.0.0.1:3306/public_opinion`；若执行会创建 `po_schema_migrations`、运行 SQL 并登记迁移版本。
- 入口没有“只读探测”或“必须为测试库”的身份门禁，不能用于本轮预检。
- 本轮未执行迁移命令、未认证连接数据库、未创建库表，也未启动 Worker 或采集。

## 下一步可执行方案

1. 另行获批后准备独立 MySQL 8 或 MariaDB 10.4+ 实例，使用项目专属容器名、仅绑定 loopback 的独立端口（例如 `127.0.0.1:13306`）、专用测试数据库与可销毁数据卷。
2. 测试账号只授予该专用数据库权限，不复用本机 XAMPP root 或任何现有环境凭据。
3. 在执行迁移前增加并核验身份标记（实例/数据库名称、容器名、端口、专用账号、可销毁卷），任一项不符即停止。
4. 身份确认后再分别执行空库、受控旧库快照、中断后重跑三组测试，并保留 schema、migration ledger 和失败恢复证据。

## 本轮执行边界

- 仅读取 `docker-compose.yml`、`.env.example`、`server/src/db/migrate.js`。
- 仅读取 Docker 可用性、3306/3307 监听、本机数据库进程/服务和二进制版本元数据。
- 未读取真实环境凭据，未连接任何数据库，未执行任何写操作。
