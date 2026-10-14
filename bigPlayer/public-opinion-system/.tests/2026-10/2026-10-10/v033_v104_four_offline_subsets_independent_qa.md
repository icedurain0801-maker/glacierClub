# v104 四组无端口离线子集独立 QA

Status: FOUR_OFFLINE_SUBSETS_PASS / ORIGINAL_18_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

Date: 2026-10-10 (Asia/Shanghai)

## 冻结与独立执行

- 冻结根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-v104-offline-PPamKx/`；manifest SHA256 `77818cb67c47e51df0f6bd570122e4ec433ca2fb9f36ab78e42e7afcb4430e62`。开发原件 `.temp/v104-offline-dev-eUWoTb/result.json` SHA256 `e9d627b712fd9723b03457053e00be79fc79baa0bd695528a105a335e943e7cb`，实际 `DEV_TEST_EVIDENCE`、34/34、unchanged=true；不代独立签收。
- 独立审阅冻结 runner/guard、inventory verifier 与四专用测试。manual 原型/内存事务和真实合成 receipt 文件读回的 13 项断言保留；scheduler mode 仅 2 项纯函数；023 迁移只读 SQL 文本 15 项；UI 只读冻结 `sources.js` 文本 4 项。未运行原恢复、Progress、child、shared 入口或原 18 个排除文件。
- 冻结 cwd 精确执行 `node scripts/v104-offline-subset-freeze.js --verify 77818cb67c47e51df0f6bd570122e4ec433ca2fb9f36ab78e42e7afcb4430e62`、`node scripts/v104-offline-subset-freeze.js --test 77818cb67c47e51df0f6bd570122e4ec433ca2fb9f36ab78e42e7afcb4430e62`、后置同一 `--verify`，全部 exit 0；前后均 `verified=true, files=675`。
- 本轮测试 runner 生成 `.temp/v104-offline-dev-H8WRL7/result.json`，SHA256 `36500979a4d679d36ed57f0e3b0117f3af817eec28a6f6ab52dd6e3174d65fa2`。此原件虽由独立 QA 执行，runner 的固定 `kind` 仍为 `DEV_TEST_EVIDENCE`，不将字段冒称为 QA 签名。实际 `# tests 34`、`# pass 34`、`# fail 0`、`OFFLINE_GUARD_DENIALS:{}`、stderr 空、runner 判定 passed/unchanged=true。
- 另独立按 manifest 核 673 个普通文件 SHA256，差异 0；两处 workspace link 分别指向同一冻结根的 `server`、`worker`，并由 runner 完整校验。冻结 UI 资产 `contract-assets/bigPlayer/admin/PublicOpinion/assets/sources.js` 为 124667 bytes / SHA256 `e7a50696141b1455aa44fef4bd2d19cfe7cad29bd00cb2a9421657380976af88`，与 manifest 及来源读取相符。

## 结论边界

本 PASS 只证明**四个明确列出的无端口离线子集**在上述字节冻结和事故预防 guard 下通过。manual 使用内存 Repository fixture，不是实际 SQL/事务或跨进程恢复；023 和 UI 是文本合同，不是 DDL/readiness 或浏览器验收；mode 纯函数不证明 shared Worker/CLI/legacy gate。runner 的固定 `spawnSync` 只是编排受 guard 的测试进程，不是业务 fresh-process 证据。原 18 项历史状态仍为 `NOT_TESTED`，不能以这 34 项替代。

测试 guard 无拒绝记录；本轮未占 13316 或其他端口，未运行真实 SQL、HTTP/token/provider/AI、DDL/ACL、服务、生产配置或国内入口。真实身份/transport I1-I3 另单，继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`，不得以外围补验放行采集或生产。
