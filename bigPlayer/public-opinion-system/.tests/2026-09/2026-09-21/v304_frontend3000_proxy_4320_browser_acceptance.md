# v304 Frontend 3000 回源 4320 浏览器验收

- 日期：2026-09-21
- 范围：TapTap 浏览器 QA 的 3000 静态前端、`/api/*` 与 `/health` 反向代理
- 边界：未执行 SCM Apply、安装或服务重启；未控制 `PublicOpinionWorker`；未创建采集 run、写 DB、补抓、修改 TapTap 游标、发布或 push

## 根因与运行态

1. `127.0.0.1:3000` 原由 `.temp/v050_qa_proxy_3000.js` 提供。历史验收记录表明该临时脚本曾固定回源 `127.0.0.1:4321`，而当前实际 API 为 `127.0.0.1:4320`。
2. 旧临时脚本虽已把 `/api/*` 改为 4320，但没有代理 `/health`，实际请求返回 404。
3. `C:\ProgramData\PublicOpinion\frontend3001` 不存在，不是本次 3000 运行态来源；仓库既有 3001 配置默认仍保持 `[::]:3001 -> 127.0.0.1:4320`。
4. 隔离候选位于 `.temp/candidates/v303-frontend3000-proxy-4320/`，配置为 `127.0.0.1:3000 -> 127.0.0.1:4320`。当前临时进程 PID `47824`，未注册为 SCM 服务。

## 修改逻辑

- `frontend3001-server.js` 允许配置端口 3000 或 3001；`/api/*` 与 `/health` 统一代理，且上游仍严格限定为 `http://127.0.0.1:4320`。
- `manage-frontend3001.ps1` 新增受限 `ListenPort` 参数，默认 3001；3000 仅用于隔离 QA，`Apply` 明确拒绝 3000；3000 配置仅监听 `127.0.0.1`。
- `verify-frontend3001-release.js` 校验候选必须包含 `/api/*`、`/health` 与 4320 契约，并拒绝出现 4321。

## 验收结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 新合同测试 | PASS | `node --test .tests/2026-09/2026-09-21/v303_frontend3000_proxy_contract.test.js`，3/3 |
| 既有 3001 零副作用回归 | PASS | `.tests/2026-09/2026-09-17/v193_frontend3001_resident_zero_effect.test.ps1` |
| 候选 manifest | PASS | 31 个文件校验通过；篡改为 4321 的负向测试被拒绝 |
| 3000 `/health` | PASS | HTTP 200，响应包含 `public-opinion-system-server`，实际上游 4320 |
| 3000 TapTap `/api` | PASS | communities 只读 GET 返回 HTTP 200 |
| 3000 深链静态页 | PASS | collection-runs 页面 HTTP 200，包含 `collection-runs.js` |
| 浏览器渲染 | PASS | Chromium 截图显示 281 条运行记录；指定 run 展开显示抓取 599、新增 3、变更 77、评论 49819 |
| 保护项 | PASS | `PublicOpinionApi` 与 `PublicOpinionWorker` 均保持 Running；4320 PID `44892` 未切换；未发出写请求 |

浏览器证据：`.temp/candidates/v303-frontend3000-proxy-4320/collection-runs.png`。

## 过程说明与剩余风险

- 首次启动候选时路径空格未正确加引号，Node 未启动且 3000 短暂未监听；随后使用带引号的已核验绝对路径恢复为 PID `47824`。该失败未触及 API、Worker、SCM 或数据库。
- 当前 3000 是临时 QA 进程，不具备 SCM 自动恢复；机器或进程重启后需由后续授权流程重新启动候选。
- 未执行 `manage-frontend3001.ps1 -Mode Apply`。生产常驻 3001 的安装/重启仍需单独审批。
