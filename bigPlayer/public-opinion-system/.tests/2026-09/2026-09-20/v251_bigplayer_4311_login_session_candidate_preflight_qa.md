# BigPlayer 4311 登录会话服务候选预检报告

- 日期：2026-09-20
- 角色：测试负责人
- CandidateId：`login-session-4311-20260920-1418a`
- 候选目录：`C:\ProgramData\PublicOpinion\login-session-service\candidate-staging\login-session-4311-20260920-1418a`
- 结论：**FAIL，禁止安装、启动及有限真实 run**
- 追加状态：开发已确认该候选曾发生原地 manifest 重写；候选不可变性已破坏，现**永久作废**，不得因后续修复后的 JSON/hash 结果重新放行。

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 外层 manifest SHA-256 | PASS | `C5B09E493B60B1405DF1459AF655527C0CB05B2E23D591C3CCD74B9349CF1AB0`，与交付前后缀一致 |
| WinSW SHA-256 | PASS | `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA` |
| 候选与服务目录 ACL | PASS | 受保护 ACL；仅 SYSTEM、Administrators 全控，LOCAL SERVICE 只读执行 |
| 独立服务与端口 | PASS | `PublicOpinionLoginSession` 未安装；`127.0.0.1:4311` 无监听 |
| XML 隔离与服务账号 | PASS | 仅指向候选目录；未引用 API/Worker；账号为 `NT AUTHORITY\\LocalService` |
| 候选内实际凭据文件 | PASS | 未发现候选内 `.env`；`.env.example` 仅含占位值 |
| manifest JSON 可解析与逐文件校验 | **FAIL** | `manifest.json` 结尾是字面量 `]\\n`，末尾字节为 `5D-5C-6E`；`JSON.parse` 报 `Unexpected non-whitespace character after JSON` |

## 阻断原因

manifest 的内容完整性哈希匹配交付值并不等价于其格式有效。当前 manifest 的尾部把 `\\n` 写成两个文本字符，而不是换行符，导致标准 JSON 解析失败；因此无法安全执行 626 个条目的逐文件哈希核对。

## 执行边界

- 未安装或启动 `PublicOpinionLoginSession`。
- 未修改或重启 API、Worker。
- 未访问或输出托管环境文件中的凭据值。
- 未执行 BigPlayer 有限真实 run，也未触碰本地 3001。

## 退回要求

开发负责人不得在该 CandidateId 上继续修复或复用；必须生成全新 CandidateId，并使用实际 LF/CRLF 或不附加尾部字符的 manifest，重新计算并交付 manifest SHA-256。随后应由测试负责人复验 JSON 解析、全量逐文件哈希、ACL、loopback 端口和服务 XML，复验通过后才能按已授权范围安装并启动独立登录会话服务。
