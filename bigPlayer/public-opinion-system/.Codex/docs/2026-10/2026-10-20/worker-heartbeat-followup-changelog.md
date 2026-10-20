# Worker 持续心跳及首次连接验收补完

日期：2026-10-20。Worker 修复已发布，本机浏览器回归通过；公司托管仍等待用户在独立 Chrome 完成 SSO，不冒充整体已验收。

## 授权与变更

用户弹窗确认“持续心跳＋保留扫描超时告警＋阶段定位，测试后发布后端”。未推送 Git 或静态托管；未清队列、修改采集范围、延长告警阈值或强杀任务。

- `worker/src/workerScanHeartbeat.js`：每 30 秒刷新心跳，保留真实扫描起点；写入串行，终态等待在途运行中心跳，防止状态倒退；十分钟长扫描保留告警并记录阶段。
- `worker/src/worker.js`：接入健康、恢复、队列、调度、采集、分析入队阶段；采集仅记录 active/waiting 数量，不记录业务内容和凭据；完成/失败/提前退出均收口心跳。
- `worker/test/workerScanHeartbeat.test.js`：长扫描心跳、真实起点与超时、并发写终态顺序、失败恢复、runOnce 集成隔离测试。
- `.tests/.../navigation-timing.cjs`、`trend-performance-browser.cjs`：无登录态浏览器测试使用 `browser.newContext()` 的全新内存上下文，不复用 Cookie，也不关闭加密或安全设置。
- `.tests/.../first-connection-diagnostic.cjs`：仅导航 robots.txt，输出 Chrome netlog 的事件名称和耗时，不输出头部或 Cookie，原始诊断日志已在解析后删除。

## 发布

从实际现役 `release-20261020-facebook-browser-worker-r1` 克隆候选，定点叠加，仅有 `worker/src/worker.js` 与新增 `workerScanHeartbeat.js` 两个包内文件变化。未将脏工作树整体发布。

现役切换到 `E:/CodexData/public-opinion/releases/release-20261020-worker-heartbeat-r1`，manifest 442 文件验证通过。BUILD_SHA 为 `d050b2ec89f9b15a7cbb218ea92db2617eaa0c51441d62ec776181b541075289`。

服务配置保留其他设置，旧 XML 备份为 `PublicOpinionWorker.xml.before-heartbeat-20261020`；通过正常 Stop-Service/Start-Service 开发切换，包权限为 LocalService 只读执行。无采集任务被强杀或删除。

## 验证与实测

- 心跳、租约、公平并发等针对性测试 10/10 通过；现役候选包 runOnce 集成及模块测试 4/4 通过；语法与定点空白检查通过。
- 扩大 Worker 回归原 93 项中 90 通过、3 失败；用内存移除本次心跳改动后的对照同样 3 项失败：deep 告警、TapTap 游标、手动队列时间窗。没有将其描述为全套通过，也未为通过而改无关业务。
- 旧长扫描 04:08–04:21 UTC 的 scheduled_catchup 已自行完成，不是持续死锁。发布后扫描 04:28:34–04:28:36、04:29:34–04:29:35、04:30:34–04:30:35 连续完成，最新心跳年龄 0–4 秒，租约正常释放、catchup 队列为空。
- 04:31:35 UTC 扫描再次完成，随后按数据库 UTC 查询心跳年龄 7 秒；`listWorkerAlerts()` 返回空数组，旧 PID 格式历史记录按已有稳定 Worker 规则排除，不删除历史行。发布后已观察超过两分钟。
- 全新持久化 Chrome 首次等待的 netlog 证据：`COOKIE_PERSISTENT_STORE_LOAD` 2041ms，起于主请求 -1ms，结束于 +2040ms；主请求到 +2040ms 才进入 `NETWORK_DELEGATE_BEFORE_START_TRANSACTION`，发送 +2069ms、响应 +2073ms。等待位于 Cookie 存储初始化，不是服务端查询。HTTP/1.1 对照仍有等待，未以关闭 HTTP/2 冒充根治。
- 改为全新内存上下文后，首轮请求开始 29ms、DOM 1284ms，重复请求开始 3ms、DOM 361ms；完整独立浏览器回归 Hero Clash 折线图 615ms/指标 622ms、X-Clash 折线图 1027ms/指标 1231ms。此数值是本轮实测，不承诺所有网络都相同。
- 两社区 7/15 天切换分别验证 7/15 个日期点，真实今日内容 236/647，无 Console error/warn、无 HTTP 失败。11 秒延迟故障注入仅发一次请求且出图。
- localhost、LAN、外网页面、auth JS、auth/config 全部 200 且结构正确；外网核心数据通过浏览器实际渲染，鉴权未绕过。

## 证据与待完成

截图：`.tests/2026-10/2026-10-20/trend-fixed-100002.png`、`trend-fixed-100016.png`。

公司托管独立可见 Chrome 已打开至 `https://chat.q1.com/login`，请求用户手动 SSO；未导出 Cookie/token，未自动操作认证对话框。登录态内功能尚待验收，不能用跳转成功或 HTTP 200 代替。
