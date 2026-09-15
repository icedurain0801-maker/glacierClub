# v091 Facebook P0-R3 Konga 映射真实 Fail-Closed 验收报告

- 测试日期：2026-09-10
- 测试角色：测试负责人
- 真实验收入口：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=facebook`
- 测试范围：真实 Konga 页面、真实来源持久化视图、缺部署级凭据时的逐项 fail-closed、调度阻断与本地回归
- 安全限制：未读取或输出真实 Facebook 凭据，未真实调用 Facebook，未重启 Worker，未发版，未改业务代码。

## 结论

- **P0-R3：PASS（真实 Konga 安全创建后 fail-closed 路径）**。
- **缺陷：0 个**。
- **P0-D：NOT ADMITTED**。本报告不代表部署级凭据可用、Page 管理授权、`MODERATE`、Graph API、Worker 镜像、真实采集、AI、DB 内容或 Konga 内容页面闭环通过。

## 实际验收结果

| 检查项 | 结果 |
|---|---|
| 真实 Konga Facebook 来源页加载与目标来源展示 | PASS |
| 页面“检测授权与能力”操作后的 fail-closed 状态 | PASS |
| 真实 API 安全字段回读 | PASS |
| Facebook 定向回归 | 87/87 PASS |
| Facebook 前端表单合同 | 9/9 PASS |
| Server 全量回归 | 336/336 PASS |
| Worker 全量回归 | 173/173 PASS |

## 真实页面与持久化证据

验收对象为 `sourceId=45214733-4f70-4780-b5eb-166e4fdd16ec`。

| 验证项 | 实际结果 |
|---|---|
| Page 地址 | `https://www.facebook.com/LastLightSurvival` |
| source | `enabled=0`，`auth_status=unauthorized` |
| 默认 account | `enabled=0`，`auth_status=unauthorized` |
| `collect_requested_at` | `null` |
| checkpoint | 0 |
| sync run | 0 |
| Page ID | 待识别，未在未授权状态伪造写入 |
| 下次采集 | “授权并启用后计算” |
| 启用开关与开始同步 | 均禁用 |
| 管理员凭据输入 | 页面无 Token、Cookie、账号、密码、expiry 或 credential 控件 |

页面实际执行一次“检测授权与能力”后，主页身份、Page 管理授权、`MODERATE`、帖子、评论、回复六项均独立显示：

`FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED · 请联系运维在服务端配置 Facebook 官方采集凭据后重新检测。`

页面顶部同步阻断说明同时列出六项未通过原因及系统凭据未配置，未泛化为无意义的“未配置”，也未启用来源或生成同步任务。

## 证据边界

- 目标真实来源已在开发返件阶段创建；测试负责人没有删除或重复创建同一 Page 来源，避免污染唯一真实 fixture。真实页面、真实 API 回读与本地 `87/87` 创建/零凭据/六项错误合同共同证明安全创建结果。
- 真实 API 的安全来源响应不返回 credential 布尔汇总字段，符合不回显边界；本报告以页面无凭据输入、来源/账号 API 合同及定向回归证明来源级凭据未写入，不声称读取了任何秘密。

## 下一阶段阻塞

以下外部前置未满足，P0-D 必须持续 `NOT ADMITTED`：

- `FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN` 尚未配置。
- 未提供具备 Page 管理授权和 `MODERATE` 的受权测试 Page、帖子、评论及回复 fixture。
- Worker 仍为陈旧镜像，本轮按门禁未重启。
- 可信候选/回滚制品、固定 Graph API 版本、出网/DNS/TLS、真实 DB/AI/Konga 内容页链路和项目经理批准的真实验收窗口均未齐备。
