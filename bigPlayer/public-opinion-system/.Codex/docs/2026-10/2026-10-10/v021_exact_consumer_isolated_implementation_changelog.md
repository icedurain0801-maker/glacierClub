# v021 海外精确消费者隔离实现变更记录

Status: ISOLATED_IMPLEMENTATION_FIX_READY_FOR_INDEPENDENT_QA_NO_PRODUCTION
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 需求与边界

依据经理派单实现 v020 的最小安全离线候选接口。仅新增内存 repo、合成 provider 接口和离线测试；不接生产、不读取生产、不执行真实 HTTP/token/SQL/AI/通知，不修改现役国内或共享 Worker，不占用 13316，不触碰 9io1Ti/YLd7mL 原冻结包。

## 修改文件

- `worker/src/overseasExactConsumer.js`
  - 严格冻结并品牌化 manifest，绑定 source/account/game/community/platform/window/site/board/contract/auth 版本。
  - 精确 claim 已存在 pending job，核对 content/fingerprint/profile 或 targetLanguage/version、scope 和 lease epoch。
  - global + scope 额度在同一内存串行锁下原子 reserve，竞争只允许单赢家。
  - 每 tuple 单 attempt、`maxRetries=0`；明确区分 `NOT_DISPATCHED` 与 `UNKNOWN_HOLD`，未知状态保留已计费账本且禁止重放/退款。
  - 结果、attempt receipt、job completed 使用可回滚内存事务；提交失败不标 completed。
  - `productionActivationAllowed` 永远为 `false`。
- `worker/test/overseasExactConsumer.test.js`
  - 覆盖 manifest 负例、单次 dispatch、无 backfill 入口、未知/未发送区分、global+scope 竞争、事务失败原子性、translation 精确版本，以及本次退回的四项负测。

## v021 QA 退回修复

- job 的 source/account/game/community/site/board 六项归属字段现在缺失即拒绝，不能以缺省值通过。
- 完成事务重新核对 call 的 manifest/tuple/scope hash 及 job lease epoch，漂移不可 completed。
- 只有明确 `dispatched:false` 才返回 `NOT_DISPATCHED`；timeout 或无发送证据统一 `UNKNOWN_HOLD`。
- reserve 在 claim 前执行；额度拒绝不会留下第二个 running job 或 lease；未 claim 的 reservation 进入不可重放的 `not_dispatched` 账本状态。

## 验证

- `node --test worker/test/overseasExactConsumer.test.js`：10/10 通过。
- `npm --workspace worker test`：已执行，现有 worker 测试通过（输出含既有测试日志，未触发真实 provider/SQL）。
- `git diff --check`：PASS（开发侧已执行）。

## 冻结位置补正

首版冻结曾误放在项目目录 `.temp/overseas-exact-consumer-v021/`，按 AGENTS 规则该位置违规，已保留为历史证据且未覆盖/删除。中间 rootfix 包虽补齐 hash，但扁平布局不能独立复跑，也保留为历史证据。正式候选改放仓库根 `.temp/overseas-exact-consumer-v021-runnable-20261010/`，保留 `worker/src` 与 `worker/test` 相对路径，包含动态 import 闭包、offline guard、聚焦测试原始 stdout、逐文件 source-before/copy-after SHA 和 verify/manifest；历史 615 全量测试 stdout 未保存，正式候选如实标记为未重造。

## 明确未覆盖

内存锁不等同 SQL 行锁；未证明生产预算、现役 advisory/translation 排他、真实 provider/model/金额/token cap、生产 schema/authority/readiness、恢复或服务加载。QA 结论只能是 `ISOLATED_PASS` 或缺陷退回，不能升级为生产 PASS。
