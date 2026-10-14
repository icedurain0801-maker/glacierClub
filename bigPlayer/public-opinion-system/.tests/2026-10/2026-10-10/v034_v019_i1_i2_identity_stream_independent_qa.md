# v019 I1/I2 专属隔离合同独立 QA

Status: I1_FIXTURE_IDENTITY_PASS / I2_INTERNAL_STREAM_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

Date: 2026-10-10 (Asia/Shanghai)

## 冻结与执行

| 阶段 | 冻结根（仓库根 `.temp`） | manifest SHA256 | 独立冻结测试 |
| --- | --- | --- | --- |
| I1 | `v019-contract-identity-4BXp0C/` | `7d9f359e043abd4bb773b74fd683867d7fc633a0d44456077ac2e48e98942044` | 6/6，exit 0 |
| I2 | `v019-contract-stream-avtmye/` | `f3f7d90f9596a792bac1f389a680e08a8492fd610fa5ed66c480a14d22cd5c64` | 8/8，exit 0 |

各包前后均以 `node scripts/v019-observation-contract-freeze.js --verify <对应SHA>` 返回 `verified=true, files=5`；两次分别执行精确 `--test <对应SHA>`，`passed=true`、stderr 空，stdout 未见 guard 拒绝标记。每包恰为五文件加 manifest，前后 bytes/SHA 均匹配。共用模块 21225 bytes / SHA256 `a4de4db80c92ad61286f766cd2ee24c52ee7f2af9d07863d9825359f3ce20499`；guard 937 bytes / `2f801b5051c08b93dadfff9322f7cca4090c23234a915b57fd95eef0844208d9`；freeze runner 4407 bytes / `3f00efa2090e7a0d5125d70202b3232a1f7ad6a9a8a338c94262afb499afeecf`；fixture 1470 bytes / `df90cdaa00d33d6027594b9b4bbfdfa7ae0c0d72b8bab5f092fa86821e5c601e`。I1 测试 3880 bytes / `c8a239101a22cae5ccb02578c7aa30435459da85640f1451e0a29de9832f3e53`；I2 测试 5634 bytes / `c05c5c7c26df99845ce6418f75bf5298fe31c166fb6135e5a3369e563c7e32ff`。

开发原件 I1 `.temp/v019-contract-dev-lAmHj1/result.json` SHA256 `5a92726240adce66e35ca8cfd9bb404a7a0f0667d2b425c9f8eccfe8927987e6`；I2 `.temp/v019-contract-dev-P5nBSG/result.json` SHA256 `16b187e21dbffe34dd94fd30a276f89a9b3a39ff37fe79315661b53958b7b6c5`。两者实际 `DEV_TEST_EVIDENCE`，只作对照。本轮独立执行原件分别为 `.temp/v019-contract-dev-YafWIT/result.json` SHA256 `f7e8f14857c1b2d82921cb2e3ded4b4db17ecea5356c7ed02e9d88d37e67cdb7`、`.temp/v019-contract-dev-gm7Eyn/result.json` SHA256 `a0ffc02d2b05eac60ee40ea1491b7edda8168dedb075a43ba8688b2bbfab187b`；runner 固定写 `DEV_TEST_EVIDENCE`，不将字段冒称 QA 签名。

## I1 限定签收

私有 WeakMap 能力不能从空句柄复制；生产签发恒拒，已签能力单次消费。独立负测覆盖 v2 投影/hash、URL registry hash、credential 状态与过期、五个观察版本漂移；嵌套 symbol accessor 全部拒绝且 getter 调用 0。sample 模式拒 unknown；明确允许的 auth-only 模拟仅 9 请求、0 feeds。入口数据快照拒函数、accessor、非普通/继承结构；这不是对恶意 Proxy 的无副作用沙箱。

本签收是 fixture 自有身份绑定，不证明真实 source/account/site HMAC、凭据读取或生产签发。能力自然等待 5 分钟到期未实测，代码的单调 deadline 已审阅但不作为墙钟实测结论。

## I2 限定签收

内部生成并消费固定 GET URL/query/本站 exchange 与后续 session token；独立六类 requestFault（错 token、跨站 token、未知/重复 query、额外 path、section descriptor 篡改）均在第 4 槽整批停止。sample 为 24 槽、三站各 8、exchange 3、feeds 6；调用方不能放大 10s/5min。25ms transport + 25ms chunk 在 40ms 单请求 deadline 下约 46ms 中止、reader 取消；10ms 总 timer 中止首槽。

独立实际流重验单响应恰 1,048,576 bytes 通过，+1 返回 `OBSERVATION_RESPONSE_BYTES_EXCEEDED`；整批恰 8,388,608 bytes 通过，+1 在第 24 槽返回 `OBSERVATION_BATCH_BYTES_EXCEEDED`，失败已读字节计入报告且无后续槽。超限 chunk 已被读取后才拒绝，未保存越界 chunk；不能宣称从未读取越界字节。scope、encoding、UTF-8、JSON、redirect、HTTP 错误均停止且报告未含原站点 ID、URL、token 或内容 ID。摘要 hash 只对非秘密 shape 生成。外部 callback/getter 未执行。

本签收仅限内部合成 ReadableStream。响应 schema 由内部固定生成，未证明任意真实 provider schema 的拒绝完整性；内部 reader.cancel 不等于真实 HTTP 连接 abort，代理、DNS、socket、TLS、secret、SQL、AI 均未验。冻结 guard 是可信测试事故防护，不是恶意 JS 沙箱。I3 身份来源/真实读取与 unknown 能力转换另行门禁，继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`；未启动服务或占 13316，未运行国内入口。

## 独立负测原件

- 根 `.temp/v019-qa-i1-i2-negative-probes.js` SHA256 `fbd4b941f2feeae2b863b0e8111065b513c891898b3272c1399193057a8a78e9`。
- 根 `.temp/v019-qa-i1-i2-negative.raw.json` SHA256 `6444b02072b9567d99f8c2c5f471baef22844150a05caa2daf599f90fc1f9512`；最终独立 I1 3/3、I2 8/8、exit 0。初次运行的 batch 槽位断言将预留正常尾部的 +1 错判为第 8 槽；仅修正自有断言为第 24 槽后重跑，冻结文件未变。此前 NglX6D/eWSenp/qyPcEH 与 Qqqk9O 的结论均未复用。
