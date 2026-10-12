# D1/D2/D7 真实海外配置独立只读 QA

Status: READONLY_EVIDENCE_VERIFIED / D2_D7_NO_GO / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 测试负责人

## 范围与原件

- 开发交接：`.Codex/docs/2026-10/2026-10-10/v024_real_d1_d2_d7_readonly_qa_handoff.md`。前一版误写 QA PASS、原件误落 `bigPlayer/.temp`；开发已撤销代签并将旧原件可恢复迁到统一根 `.temp/overseas-d1-d2-d7-legacy-6ZCGUP/`。旧原件不用于本轮当前事实签收。
- 审核定向入口 `scripts/overseas-d1-d2-d7-readonly.js`，SHA256 `C40AF0F300BD6A2FD861DCD96FB30E182D6DD9A3226C4AB7C60ED084CC40F302`：连接固定 `127.0.0.1:3306`/指定 schema，核 server_id=1、MariaDB 10.4.14；`START TRANSACTION READ ONLY` 后仅九条白名单 SELECT，查询 4 秒超时，finally `ROLLBACK`/`connection.end()`；不调用 HTTP、token exchange、AI、DDL、写 SQL 或服务操作。原件默认在仓库统一根 `.temp`。
- 开发脱敏原件 `.temp/overseas-d1-d2-d7-OXr23Q/result.json` SHA256 `59874B07E6852BDAB427DD021B7024D19C90A050CE14DE296D8FBF535829C8B5`；QA 从同一入口独立执行一次，脱敏原件 `.temp/overseas-d1-d2-d7-jGBbsi/result.json` SHA256 `E60A27EDDA0B1BE7B73F282A26BEAAD7B2669C3FAF3D4EFD83ADABC9D7C210A6`。QA exit 0，`READONLY_EVIDENCE_COLLECTED`，`rolledBack=true`、`connectionEnded=true`、原件 `status=NO_GO`。
- QA 当前事实采样：2026-10-10 04:44:38（Asia/Shanghai；原件 UTC `2026-10-09T20:44:38.031Z` 至 `.075Z`）。连接身份只记录 port=3306、server_id=1、版本和已遮蔽 schema，不输出主机名、登录主体明文或凭据。开发与 QA 脱敏事实投影相同，时间戳/文件 SHA 独立。

## 事实与门禁

| 项 | 独立采样结果 | 判定 |
| --- | --- | --- |
| D1 静态自身绑定 | 两个海外 `bigplayer_h5` source 与各自 enabled/authorized 账号绑定一致，active `api_token` 密文仅检查存在性；第二源 credential `last_checked_at` 为空 | 仅静态绑定可核；不证明 token 实际有效、授权交换或站点访问。source 配置整体版本/hash 未由本原件给出，完整 D1 仍待收口 |
| D2 第一源 | 配置 3 站、registry 3 站，site 身份和 URL hash 3/3 对齐；registry 授权 1 authorized、2 unknown | 两站授权合同不明，NO_GO |
| D2 第二源 | 配置 3 站、registry 仅 1 站；URL hash 仅 1/3 对上，site 身份 0/3 对齐；boardId 缺失 | 不可借第一源 board/registry/credential，NO_GO |
| D7 | 环境静态 light/deep/translation model/version 与日调用限额可见；AI usage 本次无行，翻译预算表有历史计数 | 不构成海外 scope cap、金额上限、UTC 账日、失败/重试计费或真实 provider 合同，NO_GO |

原件的能力详情仅输出字段白名单及 `samplePostHmac`，不输出 samplePostId；QA 未读取/输出 token、secret_cipher、密码、连接串、authorization、原始 provider body。固定 HMAC/URL hash 是本地证据关联摘要，不代表匿名公开资料，原件保持在受控 `.temp`。查询白名单的 credentials SELECT 只返回密文存在位，不返回密文正文。

## 结论

本轮只读证据链及上述静态事实独立核实，不能签“真实授权通过”或“生产费用闭包”。`D2_D7_NO_GO`、`FULL_RUNTIME_NO_GO / CUTOVER_HOLD` 保持；不触发 v019 HTTP、账号刷新、采集、AI/翻译、通知、迁移或现役 Worker 切换。D1 尚缺配置整体版本/hash 的可核原件，真实授权成功需另行受控验证。没有修改业务代码、配置、数据或服务。
