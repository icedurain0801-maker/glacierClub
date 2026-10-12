# D1/D2/D7 有界只读证据 QA 交接

Status: INDEPENDENT_QA_VERIFIED / V2_PROJECTION_QA_VERIFIED / D2_D7_NO_GO / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

## 交接对象

- 变更记录：`.Codex/docs/2026-10/2026-10-10/v023_real_d1_d2_d7_readonly_evidence_changelog.md`
- 定向入口：`node scripts/overseas-d1-d2-d7-readonly.js`
- 历史 v1 投影入口 SHA-256：`8D4E76C0E34579E27FAE660220001257D4987E61DD300B663972C3D9637FFBB1`（投影安全预检退回）
- 当前 v2 安全修正入口 SHA-256：`4A0097D866F6AEAD7D7929F5AA62F8397B4D4A7F3087805E547DA2235B0113EE`；测试负责人离线安全预检已签收，开发补采完成，待独立短读
- 当前 v2 开发脱敏原件：统一根 `.temp/overseas-d1-d2-d7-dJSJqc/result.json`；SHA256 `A687D70E4B8FAD3B289D7AC094EC3223ACDC9405C427A7604A03492421FFB03C`；采样时间 2026-10-10 05:05:56（Asia/Shanghai）
- v2 独立 QA 原件：统一根 `.temp/overseas-d1-d2-d7-5c2nvt/result.json`；SHA256 `8B22721480E4ED35C08AAF482EDC540AE2A9F8568DAECACDE3083067BFEB74D2`；采样时间 2026-10-10 05:06:55（Asia/Shanghai）
- 离线安全原件：统一根 `.temp/v027-projection-fixed-irhVyK/result.json`，SHA256 `8B487FCF0C54E6AE1DAB31EF2E8E11F31A3287F39BCB0415F6CFF4F247B9F0E4`
- 脱敏原件：统一根 `.temp/overseas-d1-d2-d7-OXr23Q/result.json`
- 旧原件可恢复归档：统一根 `.temp/overseas-d1-d2-d7-legacy-6ZCGUP/result.json`
- 独立 QA 原件：统一根 `.temp/overseas-d1-d2-d7-jGBbsi/result.json`
- 独立 QA 原件 SHA-256：`E60A27EDDA0B1BE7B73F282A26BEAAD7B2669C3FAF3D4EFD83ADABC9D7C210A6`
- D1 配置投影补充原件：统一根 `.temp/overseas-d1-d2-d7-cTANaR/result.json`，SHA-256 `7680CDBBBAF4A19F3CD958E6A660C975850329E42BA966F0F09F02CFC0F5AF47`
- D1/v019 绑定记录：`.Codex/docs/2026-10/2026-10-10/v027_d1_config_binding_v019_request_plan.md`
- 补充采样时间：2026-10-10 04:47:42（Asia/Shanghai）
- 独立 QA 记录：[v026_real_d1_d2_d7_readonly_independent_qa.md](../../../../.tests/2026-10/2026-10-10/v026_real_d1_d2_d7_readonly_independent_qa.md)
- 观测时间：2026-10-10 04:34（Asia/Shanghai）
- 固定目标：本机回环 `3306`，MariaDB `10.4.14`，server_id `1`

## 独立 QA 只核四项

1. 只读事务证据：`START TRANSACTION READ ONLY`、查询白名单、`ROLLBACK`、连接关闭；可在同一固定 3306 目标和同一白名单下独立短 SELECT 复核。
2. 脱敏完整性：不包含 token、密码、连接串、secret_cipher、原始 provider body 或 authorization。
3. D1/D2 事实：第一源三站中的两个 `auth_status=unknown`；第二源无 boardId 且 registry 只有一条记录；不得把第一源 board/registry 借给第二源。
4. D7 限制：环境限额与模型版本仅为静态配置，历史翻译计数不等价海外 scope cap/金额/重试费用；结论必须维持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。

离线安全验证已通过：合成嵌套对象、数组、secret、user/comment/post 标识输入后，能力详情仅保留白名单字段，标识转 HMAC；默认输出根解析为统一根 `.temp`。

## 禁止事项

QA 不扩大 SQL 范围，不执行 HTTP/token exchange，不访问或输出密文，不修改业务代码、迁移、服务、现役 Worker 或旧冻结包。QA 结论不得把本证据升级成真实站点授权、真实 provider 合同或生产费用闭包。

## 独立 QA 签收

测试负责人已于 2026-10-10 04:44:38（Asia/Shanghai）使用同一固定入口和白名单独立采样，确认 `READONLY_EVIDENCE_COLLECTED`、`rolledBack=true`、`connectionEnded=true`，并核对开发原件与 QA 原件的脱敏事实投影一致。该签收只覆盖只读证据链；D1 配置整体版本/hash仍未覆盖，D2 两站授权/第二源 board-registry 仍 `NO_GO`，D7 scope cap、金额和失败/重试计费仍未证。不得将静态 `authorized` 状态表述为真实授权成功。
