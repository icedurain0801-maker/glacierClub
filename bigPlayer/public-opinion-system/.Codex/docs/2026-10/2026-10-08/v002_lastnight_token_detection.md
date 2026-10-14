# Last Night 欧美 BigPlayer Token 检测路由修复

Status: pending-independent-qa

## 只读复现与原因

- 4320 运行旧部署 `v018-boardid-api-20260924123123`，不是上一单的 Git 提交；旧版和当前候选都只把 `club.q1.com` 识别为 Q1 来源。
- 只读来源查询确认 Last Night 来源 `081a16d2-5545-4afd-9c65-e04777e4540b`，社区 `00000000-0000-0000-0000-000000000102`，boardId `100017`，域名 `club-en.q1.com`；Token 已配置、无账号密码，来源与账号均未授权。未读取或输出 Token。
- `accountHealth` 因 `isQ1Source=false` 进入通用 `requestJson`，默认请求 `/internal/opinion/posts?limit=1`。
- 2026-10-08 无凭据公开 GET：上述错误路径返回 HTTP 200、`text/html; charset=utf-8`、3494 bytes、HTML 非 JSON；正式 `/api/club/v1/auth/user/context` 无凭据返回 401。未调用本系统 POST check-auth，也未进行真实 Token 探测。
- `requestJson` JSON 解析失败即产生 `MALFORMED_RESPONSE`；新离线回归在修复前 0/4 通过，正例重现该错误。没有证据支持修改欧美 schema 解析或增加 HTML 回退。

## 修改逻辑

- 精确识别 `club-en.q1.com` 为 Q1 来源，走 context → 配置 board → JSON feed 的既有协议。
- Q1 请求目标及响应 URL 必须与来源 origin 相同，禁止国内/境外之间相互转发凭据；HTTPS、固定域名、端口限制保持。
- 环境允许域名配置、boardId 必填、凭据优先级、401/403 失败关闭不变。不改其他平台，不更新配置、授权状态或采集数据。

## 验证与边界

- 定向回归 76/76 通过；`npm test` Server 518/518、Worker 277/277 通过，退出码 0。日志位于仓库根 `.temp/po-closeout-20261008/lastnight-targeted.log` 和 `lastnight-full.log`。
- 冻结 connector、新增测试及本文档后交独立 QA；不复用上一单放行结论。
- 成功响应 fixture 仅验证代码路由，不证明真实欧美 Token 有效或上游 schema 已通过实测。
- 真实授权检测会向境外 API 发送已配置凭据并更新本地授权状态，需单独授权；生产部署、服务替换和真实采集均不在本单执行范围。
