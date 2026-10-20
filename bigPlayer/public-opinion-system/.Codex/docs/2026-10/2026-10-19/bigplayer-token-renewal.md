# BigPlayer Token 自动续期

Status: candidate_verified_browser_blocked（未切换现役）

## 用户已确认

保存 Token 时调用 `GET /api/club/v1/login/token` 换取新 Token，加密保存；后台在到期前再次换取；失败保留原凭据并提示重新授权；账密模式保持原流程。用户允许对所测社区进行真实换取和凭据更新，不触发采集或通知。不推 Git、不发布 BaaS。

## 实现逻辑

- `server/src/services/bigPlayerTokenRenewal.js`：限制 HTTPS 和既有三个 BigPlayer 域名；请求不跟随重定向；15秒超时；原始请求地址和凭据不进入错误日志。
- 换取前后均向平台查询认证上下文，验证同一账号、目标版块权限、非游客身份，以及新 Token 的有效期。JWT 到期声明只用于调度，不替代远程权限验证。无法确认时拒绝覆盖。
- 使用现有账号 advisory lock；持久化阶段按来源、账号、凭据加锁，检查来源配置、账号元数据及原加密凭据未被并发修改，再原子更新 Token 和来源/账号有效期。
- 每小时检查一次启用社区的启用账号；距离过期不超过24小时才换取。检查发生在调度准入之前，独立于社区采集频率，不生成采集或通知任务。失败保留 Token 及授权状态，记录安全的失败编号并在账号列表提示；下次小时检查重试。
- 明确记录 `metadata.bigplayerAuthMode`。Token 模式不再被保留的旧账密抢占；旧账密模式保持原路径。旧配置无此标记时，有有效账密则沿用账密，否则按 Token 模式处理。
- `app.js` / `repository.js`：创建和保存 Token 时先换取；编辑页保存时原子写入授权方式和有效期。留空保留已有 Token 的编辑保存，也执行验证换取。
- `sourceAuthorizationCheck.js`：检测回执绑定授权方式；检测过程仍不替换生产凭据。
- `sources.js` / `sources.html`：保存和检测传入所选方式；显示自动续期说明和失败提示，更新资源版本。

## 真实验证

详见 `.tests/2026-10/2026-10-19/token-renewal-live.json`。只更新一个海外 BigPlayer 测试账号的 Token，没有修改授权方式、采集频率、通知设置。

- 旧有效期：2026-10-22 19:42:30（北京时间）。
- 连续换取、身份和目标版块权限验证成功。
- 最终 Token 加密保存并重新读取成功，有效期：2026-10-29 16:43:02（北京时间）。
- 国内 `club.iyogames.cn` 另做了不落库的连续换取验证，身份一致且非游客。
- 真实诊断使用 `node --use-system-ca`，未关闭证书验证；诊断报告不包含 Token、账号身份或密钥。

## 验证结果

| 验证 | 结果 |
|---|---|
| API 候选包相关测试 | 46/46 |
| Worker 候选续期测试 | 19/19 |
| 工作区调度及扫描租约回归 | 28/28 |
| 前端语法与 Worker 模块依赖加载 | 通过 |
| 真实 Token 连续换取、保存和读取 | 通过 |
| 实际浏览器页面操作 | 未完成：浏览器工具仅返回 MCP Apps，0个页签；重连后结果相同 |
| 现役常驻自动续期 | 未切换 |

测试覆盖：游客、身份变化、目标版块丢失、无效/过期/缩短有效期、非白名单站点、跨域重定向、网络异常脱敏、并发配置变化回滚、未到续期时间、账密模式不变、小时检查节流，以及 HTTP 保存回执与加密保存。

## 最小候选包

基于服务 XML 当前实际运行包生成，只提取本次补丁，不将整个工作区覆盖现役。

- API：`E:/CodexData/public-opinion/releases/release-20261019-token-renewal-api-r5`
- Worker：`E:/CodexData/public-opinion/releases/release-20261019-token-renewal-worker-r5`
- 前端：`E:/CodexData/public-opinion/frontend3001/releases/release-20261019-token-renewal-front-r5`
- 构建和补丁记录：`.tests/2026-10/2026-10-19/build-token-renewal-candidate.py`、同目录 `*-r5.patch`。
- 现役 Worker 的连接器直接读取 Token，本次保留其实现；工作区/API 中的账密优先连接器增加所选方式分支。未带入其他调度或连接器改动。
- 运行包已补齐新增服务所依赖的 `tokenExpiry.js`。依赖目录复用原包，不更新依赖。

## 剩余事项和边界

1. 浏览器连接恢复后，使用候选前端验证 Token 模式、检测授权、保存回显和续期失败提示。
2. 页面验收通过后，再按用户既有要求弹窗确认 API、Worker 和前端的现役切换；保留当前版本回退。
3. 切换后再验真实页面及接口。当前仅真实测试账号已续期，不代表常驻机制已生效。
4. 平台撤销 Token、账号被停用、权限变化、长期停机超过有效期仍可能需要重新授权；不能承诺永久免登录。
