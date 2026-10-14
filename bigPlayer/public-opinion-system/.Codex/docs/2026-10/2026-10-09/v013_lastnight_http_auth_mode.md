# 海外 HTTP 授权分类与显式交换候选

Status: QA_PENDING / NOT_DEPLOYED。

严格 TLS 的 iYBvhz 现场首 context：2026-10-09T02:31:30.928Z–02:31:31.106Z，HTTP401，JSON 解码 SyntaxError，零 Store/AI。这是 HTTP 授权拒绝证据，不是 TLS 失败证据，亦不证明凭据永久失效。

guard 先记 HTTP，401/403 在解码前分类 UNAUTHORIZED/PERMISSION_DENIED 并 abort，不读取或保存响应正文；避免非 JSON 覆盖原授权状态。其他响应保留既有严格 JSON/code0 校验与脱敏 transport 诊断。

已持有公开 bundle SHA256 0fb12f30687683c4d021c993d2ce1b7116f83aa58787d06331774c94aef2bb34：GET login/token 的 Authorization 原 token，code0 成功/code1 TouristLogin。此网页合同支持显式交换接线，但不能证明现有 api_token 适用该交换链；不凭网页合同推翻既有 direct Connector 合同。

最新经理合同核查：旧 Connector authorizationValue 对无 Bearer 值添加 Bearer，对已含 Bearer 值原样保留；独立 runtime 曾所有模式统一覆盖原值，已造成 direct 合同回归。仅海外 runtime 修复：direct 不覆盖任何 Connector headers；site-exchange 才原样覆盖交换返回 token，避免双前缀。国内 Connector 不修改。

既有 CredentialContext 仅解密 api_token active/有效期/AAD，原签发用途仍待确认，root 不查 secret，不猜 SDK token。撤回本轮中间 menAxa site-exchange 模板，未交现场，不执行。最终候选维持 direct-api-token，metadata、同既有 account/identity 待经理绑定；QA 后经理按恢复的原合同仅一次 metadata。401 原因待该次证据，不自动 fallback、交换、刷新或改共享凭据。

严格 TLS/完整 manifest/只读门禁不变。metadata 成功后再选一天单页 collect。Store 补偿、实际 AI、三站全日采集/持久 slot 防重/02 入口未完成，不以 sample 结案。

## 最终冻结与验证

最终候选：仓库根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-jlvSA4`，manifest/plan.unapproved/candidate.cmd，metadata direct-api-token。中间 menAxa 不可现场执行，旧 iYBvhz 证据保留。

Runtime SHA256：c3faa32d7b92aae103c4e472470c60e876a355c78c53185e3f58fd2d994ab0ba。CLI 未变：14f2986254c0441d2bdf5cb0c654bdea3de102a60ca50ff157e5592628cac133。完整依赖以新 manifest 为准。

六组测试命令同 v012，23/23 PASS；语法与限定路径 diff --check 通过。新增非 JSON401/403 零 decode/零下游/零写、无前缀/已有 Bearer/opaque 按原 Connector 合同、exchange fixture 原样返回 token 不双前缀。所有测试为 fixture，不打印真实凭据，不发现场请求；只修海外独立 runtime，未改国内 Connector。

| 工作项 | 状态 |
|---|---|
| HTTP分类/direct合同独立QA | 已交接待结论 |
| 经理原合同单次metadata | 待QA GO |
| 单页collect | 待metadata成功 |
| Store补偿/实际AI | 未交付 |
| 三站全日/slot防重/02入口 | 未交付 |
