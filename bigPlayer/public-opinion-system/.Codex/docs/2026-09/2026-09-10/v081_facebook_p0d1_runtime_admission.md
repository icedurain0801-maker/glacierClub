---
last_updated: 2026-09-10
status: prepared_not_executed
scope: facebook-p0d1-runtime-admission
owner: 开发负责人
---

# v081 Facebook P0-D-1 运行环境准入变更单

## 结论

P0-D-1 已完成只读核对和非秘密配置合同准备，但高影响变更尚未执行，当前状态为 `BLOCKED_PENDING_ARTIFACT_AND_APPROVAL`。Konga 路由可用；主要阻塞为未版本化发布物、前后端运行版本撕裂、实际部署目录/运行账号/日志入口未确认、缺失可验证的进程守护与回滚制品，以及真实 `.env` 的 TLS 与 Facebook 开关尚未获准整改。

本轮未读取或输出任何 Token、`CREDENTIAL_ENC_KEY` 或其他秘密值；未调用 Facebook；未创建来源、写业务 DB、修改真实 `.env`、启停进程、提交或发布。

## Owner、证据与下一动作

| 项目 | 状态 | Owner | 脱敏证据 | 下一动作 |
|---|---|---|---|---|
| Konga TLS 与域名入口 | PASS | `172.16.0.192` Kong/Konga 运维（具体人员待项目经理指定） | DNS 指向 `172.16.0.192`；响应含 `Via: kong/1.4.2` 和 `X-Kong-*` | 只读导出该 Host 的 route/service/upstream，确认回源 `172.16.2.48:80`、`preserve_host`、健康检查和缓存策略 |
| 本机 HTTP 回源 | PASS | 本机 Apache 运维 | `httpd -S` 显示 `lfy3001.dev.q1op.com:80`；`/api/public-opinion/` 反代 `127.0.0.1:4320`，其余路径反代 `127.0.0.1:8088` | 当前无需修改 Apache；P0-D-3 前复核有效配置和同源 API |
| 静态前端 | PASS 但已提前生效 | 静态资源运维 | `8088` 直接服务 `bigPlayer` 脏工作树；Konga 页面与本地文件哈希一致 | 纳入同一 release manifest，禁止继续以脏工作树作为不可追溯发布物 |
| Server/Worker 运行版本 | MISSING | 主机运维 | Server PID `45732`、collection Worker PID `46764`、analysis Worker PID `22552` 均早于本轮运行文件修改；在线连接器无 `facebook` | 先制备可回滚制品，再在批准窗口有序切换 |
| 发布制品 | MISSING | 开发负责人 + 发布运维 | `main` 与 `origin/main` 同步，但 Facebook 运行文件仍为未提交/脏工作树，无法通过 `git pull` 发布 | 对本轮 allowlist 生成带 SHA256 的候选与旧版 release manifest；不得覆盖其他未提交改动 |
| 实际部署目录与启动身份 | UNKNOWN | 主机运维 | 仅能确认当前进程命令行和 PID；无法从已退出的 Server 父进程恢复其 cwd、启动账号和日志入口 | 回传候选/旧版绝对目录、运行账号、日志绝对目录和 ACL；解析全部占位符后再生成最终执行单 |
| 进程守护 | MISSING | 主机运维 | 未发现 PM2/systemd/正式部署脚本；Server 为人工裸进程；既有 keep-alive 计划任务 disabled 且入口缺失 | 先确认受支持的守护方式、工作目录、日志与启动账号，再批准重启 |
| Facebook 非秘密配置合同 | PREPARED | 开发负责人 | `.env.example` 已声明 disabled 开关、固定版本和超时；不包含 Token | 运维仅在 P0-D-2 资产齐备后修改真实 `.env` |
| TLS 验证 | MISSING | 主机运维 | 仅核对到真实 `.env` 的 `NODE_TLS_REJECT_UNAUTHORIZED` 为不安全的 `0`，未读取其他值 | 获批后删除该键或改为非 `0`；重启后用脱敏探测确认 |
| Meta 测试资产 | MISSING | Meta 资产管理员 | P0-D-0 已确认无测试 source/account/credential/fixture | 按本文 P0-D-2 清单通过安全渠道交接 |

稳定阻塞码：`P0D_RELEASE_ARTIFACT_UNVERSIONED`、`P0D_DEPLOY_PATH_UNCONFIRMED`、`P0D_RUNTIME_SPLIT_BRAIN`、`P0D_PROCESS_SUPERVISOR_MISSING`、`P0D_ROLLBACK_ARTIFACT_UNCONFIRMED`、`P0D_TLS_VERIFY_DISABLED`、`META_TEST_ASSETS_NOT_PROVISIONED`。

## 非秘密环境键合同

| 键 | 候选值/约束 | 说明 |
|---|---|---|
| `FACEBOOK_GRAPH_ENABLED` | 资产齐备前 `false`；获批切换时 `true` | 仅 `true`/`1` 启用；不得提前启用 |
| `FACEBOOK_GRAPH_API_VERSION` | `v26.0` | 代码允许 `v23.0`–`v26.0`；本 release 必须显式固定 |
| `FACEBOOK_GRAPH_TIMEOUT_MS` | `15000` | 正整数毫秒 |
| `NODE_TLS_REJECT_UNAUTHORIZED` | 删除或非 `0` | `0` 禁止进入真实 Graph 验收 |
| `PUBLIC_OPINION_CORS_ORIGIN` | 保留既有值；同源页面不依赖跨域 | 若未来直连 `4320`，须另行审查 Konga Origin 白名单 |
| `CREDENTIAL_ENC_KEY` | Server/两个 Worker 运行态使用同一份受控秘密来源且有效 | 秘密值不得进入制品或本变更单；只能做脱敏有效性和一致性检查 |

当前源码中的 Server、collection Worker、analysis Worker 都会调用所加载 release 内的 `server/src/runtimeEnv.js`，该模块解析该 release 根目录的 `.env`。这只能证明加载规则，不能证明不同 release 或进程实际使用同一文件，也不能排除父进程环境覆盖。候选与正式进程必须由运维挂载同一受控秘密来源或用等价的安全注入方式生成 release 根 `.env`；秘密文件不得打入 release artifact、manifest 或日志。启动后仅比较密钥有效性/标识的一致性状态，不读取或输出值。Facebook Page Access Token 不属于环境键，必须只以账号级 `api_token` 加密保存。

## 高影响变更草案（必须再次获批，当前未执行）

### 目标实例

- Server：PID `45732`，`node src/app.js`，监听 `4320`。
- Collection Worker：PID `46764`，`node src/worker.js`。
- Analysis Worker：PID `22552`，`node src/analysisWorker.js`；其会导入 `worker.js`，为消除运行版本撕裂和复核运行态密钥一致性，应纳入同一受控切换。
- 不重启：Python 静态服务 `8088`、Apache、Kong；当前映射已通过哈希与同源请求证明可用。

### 执行前检查

1. 发布运维提供候选/旧版 release manifest、绝对目录、文件 SHA256、启动账号、日志绝对目录和守护方式；当前这些部署参数均为 `UNKNOWN`。
2. 只读确认 `4320` 当前 PID、Worker PID 未变化。
3. 只读聚合确认 active sync run/checkpoint/analysis lease 均为 `0`；检查其他来源当前 active run，禁止在持租约时停 Worker。本轮快照虽为 `0`，执行前必须重查。
4. 避开本机 `02:00` 的 Q1 Daily 与 Last Night Overseas Daily 计划任务窗口。
5. 运维通过受控秘密来源为候选和正式 release 提供根 `.env`，不得把秘密复制进制品；确认 TLS 验证已恢复、三个 Facebook 非秘密键符合合同，三个进程的密钥有效性/标识仅做脱敏一致性自检。

### 待参数化命令模板

当前无法给出无占位符的精确执行命令：候选/旧版 release 绝对目录、运行账号、日志目录和受支持的守护方式均未确认。以下模板只用于说明最终命令的结构；主机运维回传上述参数后，开发负责人必须生成一份全部占位符已解析的最终命令单，再由项目经理另行审批。占位符存在时禁止执行。

```powershell
# 预先创建并核验 <log-directory>；受控秘密来源须已安全挂载为候选 release 根 .env。
$candidateRoot = '<candidate-release>'
$previousRoot = '<previous-release>'
$logDirectory = '<log-directory>'
$node = 'C:\Program Files\nodejs\node.exe'

# 候选 Server：后台运行于备用端口，不触碰 4320；显式记录 PID 和日志。
$previousPort = $env:PORT
$env:PORT = '4321'
$candidate = Start-Process -FilePath $node -ArgumentList 'src/app.js' `
  -WorkingDirectory "$candidateRoot\server" -WindowStyle Hidden `
  -RedirectStandardOutput "$logDirectory\candidate-server.stdout.log" `
  -RedirectStandardError "$logDirectory\candidate-server.stderr.log" -PassThru
if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $previousPort }

# 候选只读门禁：响应须包含 facebook，DB/AI 只输出状态，不输出配置值。
$health = Invoke-RestMethod 'http://127.0.0.1:4321/health'
# 运维在此校验 HTTP 200、DB ok、connectors 含 facebook；失败即停止 $candidate.Id，不进入正式切换。

# 正式切换仅在候选通过、Worker 无活跃租约且获再次批准后执行。
Stop-Process -Id <confirmed-collection-worker-pid>
Stop-Process -Id <confirmed-analysis-worker-pid>
Stop-Process -Id <confirmed-server-pid>
$server = Start-Process -FilePath $node -ArgumentList 'src/app.js' `
  -WorkingDirectory "$candidateRoot\server" -WindowStyle Hidden `
  -RedirectStandardOutput "$logDirectory\server.stdout.log" `
  -RedirectStandardError "$logDirectory\server.stderr.log" -PassThru

# 正式 Server 的 4320 健康门禁通过后，才依次后台恢复 analysis 与 collection 消费者。
$analysis = Start-Process -FilePath $node -ArgumentList 'src/analysisWorker.js' `
  -WorkingDirectory "$candidateRoot\worker" -WindowStyle Hidden `
  -RedirectStandardOutput "$logDirectory\analysis.stdout.log" `
  -RedirectStandardError "$logDirectory\analysis.stderr.log" -PassThru
$collection = Start-Process -FilePath $node -ArgumentList 'src/worker.js' `
  -WorkingDirectory "$candidateRoot\worker" -WindowStyle Hidden `
  -RedirectStandardOutput "$logDirectory\collection.stdout.log" `
  -RedirectStandardError "$logDirectory\collection.stderr.log" -PassThru
```

候选验证完成后必须停止候选 PID，确认 `4321` 释放。正式 Server 必须在已恢复/删除 `PORT` 临时覆盖的环境中启动。每一步都要记录 PID、启动时间、工作目录、运行账号和日志路径；任一步门禁失败即停止后续动作并进入回滚。

### 影响范围

- Server 切换期间 `4320` 和 Konga 同源 API 会短暂不可用；静态页面仍可打开但动态请求可能失败。
- Collection Worker 切换会中断到期扫描；持有其他平台 source lease 时停止可能造成 retry/partial，必须先等租约释放。
- Analysis Worker 切换会暂停约 31,012 条 pending 分析任务的消费；另有 translation pending `71`、retryable `9,142`，不得清理或修改状态。执行前重新统计。

### 回滚

1. 本变更不修改 Apache/Kong。Server 候选仅在 `4321` 做预检，不承接正式流量；正式切换后若健康失败，停止新 PID，并从已确认的 `<previous-release>\server` 在原 `4320` 端口恢复。
2. Collection/analysis Worker 停止新 PID，并从 `<previous-release>\worker` 以原命令恢复；旧制品未确认前禁止停止任一旧 Worker。
3. 将 `FACEBOOK_GRAPH_ENABLED=false`；不删除来源、凭据、checkpoint 或业务数据。
4. 回滚后核对 Konga API、旧连接器列表和非 Facebook 任务租约。

## P0-D-2 Meta 资产交接清单

| 资产/证明 | Owner | 安全交接要求 | 完成标准 |
|---|---|---|---|
| 经授权测试 Meta App | Meta 资产管理员 | 仅提供脱敏 App 标识与授权范围证明 | 可证明该 App 获准用于测试 Page |
| 测试 Facebook Page | Meta 资产管理员 | 提供 HTTPS Page URL；Page ID 由 Graph 能力检测确认 | 与产品指定 Page 一致 |
| 最小权限 Page Access Token | Meta 资产管理员 + 运维 | 只经安全注入接口写入账号级 `api_token`；开发/测试不读取明文 | API 只返回 configured/status/expireAt 脱敏摘要 |
| Graph API 版本 | Meta 资产管理员 + 运维 | 与 `FACEBOOK_GRAPH_API_VERSION=v26.0` 对齐 | 版本在代码白名单且已明确固定 |
| 权限范围 | Meta 资产管理员 | 提供 Page、posts、comments、replies 四能力所需权限的脱敏清单 | 四能力检测均为 `authorized_scope` |
| Fixture | Meta 资产管理员 | 验收窗口至少 2 个帖子；每帖至少 1 条顶层评论和 1 条回复 | 时间窗、帖子数、层级关系可由 Graph 脱敏核验 |
| 出网/TLS | 网络运维 | 允许到 `https://graph.facebook.com`，保持系统 TLS 校验 | DNS/TLS 成功且无 `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| 验收窗口 | 项目经理 + 运维 | 避开日常任务；明确开始/结束、值守人与回滚人 | P0-D-3 可在窗口内进行一次受控真实闭环 |

P0-D-2 完成后，项目经理再派 P0-D-3 脱敏只读复核；复核通过前不得创建真实来源或调用 Facebook。

## 本轮文件变更与验证

- 修改 `.env.example`：新增 Facebook Graph 非秘密配置合同，默认 disabled，不含 Token。
- 新增本变更单。
- `git diff --check -- .env.example .Codex/docs/2026-09/2026-09-10/v081_facebook_p0d1_runtime_admission.md`：PASS（仅有工作区换行提示，无错误）。
- `.env.example` 还包含其他任务的既有未提交改动；后续若获准提交，只能按 hunk 隔离本轮 Facebook 行，禁止夹带。
