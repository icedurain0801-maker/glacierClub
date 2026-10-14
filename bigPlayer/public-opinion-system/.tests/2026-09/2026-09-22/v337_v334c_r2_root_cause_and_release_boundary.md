# v334c-r2 预检失败根因与最小修复范围

## 结论

v334c-r2 判定 `FAIL/BLOCKED`，不是候选离线代码或哈希本身失败，而是正式发布预检证据无法证明目标运行实例已接入候选版本。冻结包保留，不原地重签，不继续创建候选。

## 根因

1. **Worker 路径不可达**：候选声明的 Worker path 在当前主机不存在；现场实际仍是 `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe`。因此不能证明候选 Worker 已部署、正在运行或加载了目标 commit。
2. **3000 入口未闭合**：`127.0.0.1:3000` 当前未监听；已有页面 URL 带旧 `qa=v306c`，不能作为 v334c 同版用户路径证据。不能启动代理或用历史页面伪造通过。
3. **DB 指纹为占位值**：候选中的 DB host/name 指纹不是现场只读采集值，不能证明 Worker/API 连接到目标数据库。不能用占位 fingerprint 代替真实配置核对。
4. **同版运行态证据缺失**：没有同一 UTC evidenceId 下的 Worker PID、启动时间、真实路径、source commit、API/Worker health/ready 闭环。因此不能把离线测试通过升级为发布 READY。

## 最小修复范围

- 修正候选预检输入，使 Worker path 指向实际部署包；发布前只能用只读方式确认服务配置/服务注册、进程路径和版本文件，不启动或切换服务。
- 在允许的发布窗口完成实际 API/Worker 同版部署后，采集真实 PID、启动时间、进程路径、source commit 和 health/ready 响应，并绑定同一 evidenceId。
- 从目标运行实例只读获取 DB_HOST/DB_NAME 的非敏感指纹；仅记录 hash/指纹，不记录连接串、密码、token 或密文。
- 确认 `127.0.0.1:3000` 已由正式同版入口提供服务后，再执行 GET/HEAD-only 浏览器验收；不得用旧 `qa=v306c` 页面、mock 或 3001 替代。
- 不修改 scheduled_catchup 业务代码，不做数据库迁移/写入，不创建真实 Run；运行态修复完成后才进入发布后 v335 验收。

## 发布前与发布后边界

### 发布前允许的真实只读核对

- 服务注册/配置中目标 API、Worker 的实际安装路径、账号、端口和版本文件。
- 进程是否存在及其命令行路径、PID、启动时间；与候选 source commit 对照。
- 只读 health/ready、版本/evidenceId 响应。
- DB_HOST/DB_NAME 非敏感指纹是否与目标实例一致；不得读取 secret/token。
- `3000` 是否监听、入口是否为目标同版路径；若未监听保持 BLOCKED，不启动代理。

### 发布后 v335 验收

发布后才允许在同一 evidenceId 下核验：

- API/Worker 同版 health、版本和进程路径。
- 下一次正常 scheduled Run 的 `scheduled_at`、`started_at`、`window_start`、`window_end`。
- posts/comments 使用同一半开窗口，详情拆分帖子数、真实评论正文数、回复数和声明评论数。
- `127.0.0.1:3000` 桌面与 375px GET/HEAD-only 浏览器证据、console/network 摘要。

在上述运行态证据闭合前，状态保持 `FAIL/BLOCKED`；不得发布、切换、重启、真实 Run 或 DB 写入。
