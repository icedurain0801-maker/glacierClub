---
last_updated: 2026-09-10
status: ready_for_test
scope: overseas-translation-worker-recovery
owner: 开发负责人
source_task: .Codex/docs/2026-09/2026-09-10/v083_overseas_translation_worker_task.md
---

# v084 境外内容中文翻译工作器实现记录

## 实现结果

- 新增独立 `translationWorker` 入口，启动时加载仓库根 `.env`；未启用或缺少翻译服务配置时不回填、不领取、不外呼。
- 每轮先按 `AI_TRANSLATION_BACKFILL_BATCH_SIZE` 补齐积压任务，再按 `AI_TRANSLATION_JOB_BATCH_SIZE` 领取任务。
- 空标题且空正文直接以 `AI_TRANSLATION_EMPTY_INPUT` 终止，不调用翻译服务。
- HTTP 408、429、5xx 与请求超时可重试；其他 4xx 直接终止；每次实际 HTTP 重试均计入每日调用上限。
- 达到任务最大尝试次数后置为 `failed`，否则按指数退避置为 `retryable`。
- 新增仓储原子完成方法：事务内校验 task ID、`lease_owner`、`running` 状态、租约有效期及内容指纹，再写译文并完成任务；过期或错误 owner 零写入，旧 owner 不覆盖重新认领后的新译文。

## 文件

- `docs/superpowers/specs/2026-09-10-overseas-translation-worker-design.md`
- `server/src/integrations/aiTranslator.js`
- `server/src/db/repository.js`
- `server/test/aiTranslator.test.js`
- `server/test/translationRepository.test.js`
- `worker/src/translationWorker.js`
- `worker/test/translationWorker.test.js`
- `worker/package.json`（仅复用现有 `start:translation` 入口，不归并同文件其他变更）

## 验证

- 语法检查：6/6 文件通过。
- 翻译定向测试：21/21 通过。
- server 全量测试：331/331 通过。
- worker 全量测试：173/173 通过。
- `git diff --check`：通过。
- 测试中的翻译请求全部使用 mock；未连接真实数据库，未启动常驻 Worker，未执行真实积压回填，未调用外部翻译服务。

## 待独立验收与风险

- 测试负责人需独立复验任务状态、退避、最终失败、积压回填、详情译文可见性与租约竞态。
- 真实运行环境的 URL、Token、模型、调用额度及积压费用仍待后续准入，不在本次本地实现范围。
- 常规 due/manual 采集路径的实时入队依赖 `region_code`，现有混杂文件存在字段未透传风险；本单未获准修改 `worker/src/worker.js`，独立 Worker 的每轮 backfill 可最终补偿，但即时性待后续单独修复。
