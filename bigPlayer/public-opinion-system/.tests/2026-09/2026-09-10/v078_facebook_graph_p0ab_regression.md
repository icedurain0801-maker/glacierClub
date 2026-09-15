# v078 Facebook Graph P0-A / P0-B 独立回归报告

- 测试日期：2026-09-10
- 测试角色：测试负责人
- 限制：未调用真实 Facebook、未启动 Konga 采集、未读写真实 Token 或业务数据。

## 结论

- **P0-A：PASS（代码与隔离合同）**。
- **P0-B：PASS（代码与隔离合同）**。
- **P0-D：NOT ADMITTED**。本报告不代表真实 Graph API、真实数据库、AI 与 Konga 页面闭环通过。

## P0-A 结果

| 检查项 | 结果 |
|---|---|
| Facebook 仅加入来源写平台，不作为社交登录或顺带开放其他平台 | PASS |
| Page URL 规范化及非 HTTPS、非官方域名、userinfo、fragment 拒绝 | PASS |
| Graph 请求固定 `https://graph.facebook.com` 和批准版本 | PASS |
| redirect、最终 URL、paging.next 跨主机/降级/跨版本/跨资源/token query fail-closed | PASS |
| Token 仅进入 Authorization header，错误/URL/响应不泄露 | PASS |
| 账号级凭据、编辑空凭据保留、默认 disabled | PASS |
| Page/posts/comments/replies 四项均为 `authorized_scope` 才准入 | PASS |
| pending Page 身份替换与已绑定 Page mismatch | PASS |

执行结果：P0-A 安全、路由和来源校验组合 **79/79 PASS**；目标 JavaScript 语法检查通过。

## P0-B 结果

| 检查项 | 结果 |
|---|---|
| posts/comments/replies 三层分页和 opaque after cursor 重建 | PASS |
| cursor 跨层级、跨资源、不前进和 paging path 篡改拒绝 | PASS |
| 评论根节点、回复直接父级和深度 2 映射 | PASS |
| reply checkpoint 使用 comments 域与 `facebook_reply` 身份 | PASS |
| 每页提交后推进 checkpoint，失败保留最后安全 cursor | PASS |
| 首页失败为 failed，已有成功提交后失败为 partial | PASS |
| 幂等写入、正文变化进入 AI、未变化不重复入队 | PASS |
| 同账号 run/lease 互斥与授权异常 fail-closed | PASS |

执行结果：连接器、安全、采集合同和 Worker 组合 **125/125 PASS**；目标文件 `git diff --check` 无空白错误，仅有 CRLF 转换警告。

## 剩余门禁

P0-C 地址编辑状态机与表单尚待独立返件验收。P0-D 必须在项目经理确认外部前置齐备后另行派单；此前不得真实调用 Facebook 或 Konga，也不能关闭 v075。
