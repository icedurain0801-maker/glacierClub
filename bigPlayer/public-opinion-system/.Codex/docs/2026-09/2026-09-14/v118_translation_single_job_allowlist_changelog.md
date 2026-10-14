# v118 翻译单任务 allowlist

## 变更

- `Repository.claimTranslationJobs` 支持 `jobId`、`jobIds`、`contentIds` 严格过滤，并对显式空 allowlist fail-closed。
- `translationWorker` 新增 `runControlled` 受控入口；必须提供非空 job/content allowlist。
- 受控 job 模式跳过全队列补偿，content 模式仅定向补入；默认常规 run 行为保持不变。
- 新增 Repository 与 Worker 定向回归测试，验证 allowlist 隔离和空值拒绝。

## 验证

- `node --test server/test/repository.test.js`：118/118 通过。
- `node --test worker/test/translationWorker.test.js`：13/13 通过。
- 运行配置经拍板增加 `AI_TRANSLATION_MODEL=gpt-4.1-mini`，复用现有 AI 分析 endpoint/token/API 回退，不新增密钥。
- 受控一次性 Worker PID `60504` 仅处理目标 job `cc8ca4f6-a220-4b4a-a6e3-7646c0e50edc`，终态 `completed`；译文已写入：`有人能告诉我为什么我无法在游戏中发送消息或回复吗？感觉有点孤单`。
