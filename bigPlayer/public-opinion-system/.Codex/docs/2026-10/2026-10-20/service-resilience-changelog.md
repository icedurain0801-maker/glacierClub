# 本机服务反复中断与分层恢复

## 已确认事实

- API 日志出现 `COMMUNITY_PROVIDER_UNAVAILABLE` 和 `Pool is closed`。
- Windows 服务包装日志记录 2026-10-20 北京时间 10:47、10:49、10:54、10:57 的停止/启动操作，不能将这些事件统称为进程自行崩溃。
- 本会话于 10:56:42 执行了一次已说明影响的后端切换。10:57:20、10:57:55 的停止并非本会话守护触发；守护恢复次数为 0。
- 读取其他会话任务记录确认：`【独立】开发1` 执行 API 重启；`【独立】开发3` 在同一时段切换前端版本。没有向其他会话发送消息或指令。
- 具体截图那一次请求的原始响应尚未留存，不能把所有报错都断言为同一根因。可确认并发服务操作造成中断，且旧停机逻辑会提前关闭数据库池，放大失败。

## 修改

- `server/src/serviceLifecycle.js`：就绪检查三秒超时、合并并发数据库检查；停机先停止接收并等待 HTTP 连接排空，再关闭数据库池，二十秒后强制关闭剩余连接。
- `server/src/app.js`：接入 `/readyz` 和正确的停机顺序。
- `server/src/services/communityProvider.js`：上游失败按 5/30/60 秒退避，恢复后重置；保留现有本地规范目录回退与权限边界，不延长旧授权缓存。
- `../admin/PublicOpinion/assets/baas-auth.js`：登录配置最多四次尝试，业务 GET 最多三次；仅对网络错误及 500/502/503/504 重试。401/403不重试，写操作不自动重放，调用方取消信号保留。
- 各 HTML 入口升级鉴权脚本版本；前端仅本地同步，不发布静态托管。
- `scripts/windows-services/api-health-guard.ps1`：每分钟就绪及登录配置检查，连续三次失败才恢复；十分钟冷却、每小时最多两次；不操作 Worker 或数据库，数据库端口不可用或服务非 Running 不重启；单实例互斥，记录持久状态。
- `scripts/windows-services/verify-api-release.js`：补齐构建脚本早已打包的 `shared/weeklyReport.js` 白名单，解决现有构建与验证规则不一致。

## 发布与验证

- 后端包：`E:/CodexData/public-opinion/releases/release-20261020-resilience-r1`，以旧现役运行包为基底，只叠加本次后端模块和 app 接线，避免整包带入其他工作区未发布改动。
- API XML 回退备份：`E:/CodexData/public-opinion/services/backups/PublicOpinionApi.before-resilience-20261020.xml`。
- API 437 文件 manifest 生成与复验通过。
- Windows 计划任务：`PublicOpinion API Health Guard`，SYSTEM 每分钟执行；实跑退出码 0，状态 healthy，恢复次数 0。
- 17 项隔离测试通过，覆盖停机顺序、就绪超时和恢复、上游退避及现有目录安全回退。
- 浏览器故障模拟：登录配置前两次503后第三次恢复；业务 GET 第三次恢复；403仅一次请求；匿名写请求被401阻止，没有发送真实写请求。
- 守护隔离模拟：六次失败检查仅触发一次模拟恢复，冷却期禁止再次恢复，无真实重启。
- localhost / LAN / 外网页面、鉴权脚本和登录配置返回200；三层 `/health` 数据库均为ok。匿名localhost/LAN业务请求按现有鉴权返回401，外网公共社区及采集源摘要返回真实data结构。
- 浏览器最终验证：本地 Hero Clash 近七天概览成功加载，页面无脚本异常、无5xx。截图 `.tests/2026-10/2026-10-20/resilience-local-hero-clash.png`。
- Worker 只读检查：当前稳定 worker mode=enabled，心跳年龄43秒，最近scan completed，租约owner为空，epoch=29722；queued scheduled_catchup=1；未重启或触发Worker。历史旧worker记录保留，未清理。
- 公司托管入口 `https://chat.q1.com/apps/public-opinion` 已浏览器打开，但新隔离会话重定向 `/login`；未验证登录后管理功能，不宣称线上完整通过。

## 剩余限制

- 自动重试和守护无法阻止其他开发会话主动 Stop/Restart 服务；需要统一串行发布/重启入口，当前未替用户指挥其他独立会话。
- 前端所在运行包由另一会话切换为 `release-20261020-weekly-two-lines-r1`；已核对当前鉴权脚本为本次恢复版，不覆盖该会话首页标题与预览行数决定。
- 当前登录后的采集源完整管理视图以及公司托管登录后回归仍待具备已登录浏览器会话后完成；匿名接口通过不能替代这两项。
