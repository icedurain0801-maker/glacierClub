# BigPlayer 帖子详情正文补全独立盲测报告

- 日期：2026-09-11
- 测试角色：测试负责人
- 范围：帖子 `916457` 详情补全、媒体合并、降级保护、取消与凭据安全
- 边界：仅本地/隔离测试；未执行真实同步、历史回补、migration、Worker 重启、来源启用、删数据、发版或 push

## 执行结果

| 检查 | 结果 |
|---|---:|
| 详情核心定向测试 | 10/10 PASS |
| Server 全量 `npm test` | 362/362 PASS |
| 目标文件语法检查 | PASS |
| `git diff --check` | PASS（仅 LF/CRLF 提示） |

## 验收覆盖

- 帖子 `916457` 使用固定 `/api/club/v1/auth/post/?postId=<id>&source=0` 详情请求，保持列表顺序。
- 完整正文补全成功；媒体采用列表与详情并集并去重。
- 详情 HTTP/JSON/结构失败时保留列表摘要，并写 `_contentIntegrity.status='summary_fallback'` 与稳定错误码。
- 已有 `detail_enriched` 时，后续摘要降级不会覆盖正文、媒体或 raw payload。
- null/空字符串详情字段不覆盖列表元数据；窗口时间固定使用列表 `createTime`。
- raw payload 递归剔除 authorization/sessionId/apiKey/credential/bearer/privateKey 等敏感字段。
- 取消信号向上抛出；内部 worker pool 广播 sibling abort、停止继续领取；外部 signal 不被误 abort。
- 401 刷新复用显式 account/credentialContext；详情并发上限固定为 4。

## 缺陷分级

- P0：0
- P1：0
- P2：0

## 结论与外部边界

**代码合同：PASS，缺陷 0。** 帖子详情补全、降级保护、取消和凭据安全均通过独立回归。

生产仍为 `NOT_ADMITTED`。本地合同不代表真实同步或历史数据恢复；生产侧仍需按既定门禁完成 migration、Worker/来源/凭据授权核验，并经单源受控同步验收后，才能确认 8/9 号数据状态。
