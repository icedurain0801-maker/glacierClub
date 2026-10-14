# 统一来源调度：阶段 4B 隔离 MariaDB 实例

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 结论

已创建并核验一个可销毁的本地 MariaDB 隔离实例，可供后续 migration 023 空库、旧库与中断重跑验收使用。本阶段未执行任何项目 migration。

## 隔离身份

| 项目 | 核验结果 |
|---|---|
| 引擎 | MariaDB `10.4.14` |
| 进程 | 独立 `mysqld.exe` 进程；创建时 PID 为 `32720` |
| 绑定地址 | `127.0.0.1` |
| 端口 | `43306`；创建前确认空闲，且不使用现有 `3306` |
| datadir | `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\.temp\public-opinion-mariadb-023\data\` |
| server identity | `server_id=423309`；MariaDB 10.4 使用该值及外部 marker 识别本实例 |
| socket | `public-opinion-mariadb-023` |
| 配置 | `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\.temp\public-opinion-mariadb-023\my.ini` |
| pid / log | 同一隔离目录下的 `mariadb.pid` / `mariadb.log` |
| 身份 marker | 同一隔离目录下的 `IDENTITY.txt` |

实例自身查询返回：

- `@@version = 10.4.14-MariaDB`
- `@@port = 43306`
- `@@bind_address = 127.0.0.1`
- `@@datadir` 与上述独立 datadir 完全一致
- `@@server_id = 423309`
- `@@socket = public-opinion-mariadb-023`

## 专用数据库与账号

- 空库名称：`public_opinion_023`
- 专用账号身份：`po_migration_023@127.0.0.1`
- 账号权限仅授予 `public_opinion_023.*`。
- 实例查询确认该库用户表数量为 `0`。
- 凭据文件：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\.temp\public-opinion-mariadb-023\credentials.json`
- 凭据文件已移除继承 ACL，仅当前 Windows 用户 `LIUFUYI-2-48\icedurain` 拥有显式完全控制；本文档不记录或回显密钥。

## 与现有 XAMPP 实例的隔离证据

- 现有 XAMPP 服务继续由 PID `5280` 监听 `:::3306`。
- 新实例由独立 PID `32720` 仅监听 `127.0.0.1:43306`。
- 新实例使用仓库根 `.temp/public-opinion-mariadb-023` 下的独立 datadir、配置、pid、log、socket 和身份 marker。
- 未读取或写入现有 XAMPP datadir，未修改或重启 Windows `mysql` 服务，未连接 3306。

## 本轮执行边界

- 使用 `C:\xampp\mysql\bin\mysqld.exe` 和 `mysql_install_db.exe` 初始化独立 datadir，未注册新 Windows 服务。
- 仅连接 `127.0.0.1:43306` 完成实例身份查询、创建专用空库/账号和空库校验。
- 未执行项目 migration，未启动 Worker、外部连接器或采集。
- 当前实例保持运行，供后续已授权的 migration 023 验收使用。
- 测试负责人完成只读隔离审计，结论为 `PASS`；截至审计时仍未运行项目迁移或 Worker。

## 后续操作要求

1. 后续任务必须先复核端口、datadir、server_id 与 marker 一致，再读取凭据文件连接。
2. migration 023 只能作用于 `public_opinion_023`，不得改用 3306 或其他数据库。
3. 4C 必须在目标库连接中再次验证专用账号权限与库内表数，不能仅沿用本轮结论。
4. 验收结束后使用本实例 root 凭据向 `127.0.0.1:43306` 执行正常 shutdown；确认端口释放后，方可在单独授权下删除整个隔离目录。
