# 境外 X-Clash 开始同步失败修复

Status: API/frontend/worker deployed and verified; collection still running/queued

采集源 `8c690d6e-12ea-4ad3-b434-d941276c4906` 的配置包含 3 个站点，而持久化登记只有第一个站点的 legacy ID。配置中该站点使用新派生 ID，准入检查报 `MULTISITE_SITE_REGISTRY_MISMATCH`，API 未映射该异常，用户看到 500 / internal server error。

## 改动

- `server/src/services/siteRegistryRepair.js` 与 `scripts/repair-source-site-registry.js`：生成带哈希的校正计划，锁定来源、登记和断点，拒绝活动任务、有效租约、身份歧义与启用状态冲突；应用前在仓库根 `.temp/source-site-repair/` 保存备份。
- 已执行校正：保留 `legacy-b65999d6b3a837e58e02efae1e531d42`，仅将配置的首站点 ID 对齐历史身份；补登记语言 9/16 两个现有配置站点。不删除内容、不迁移历史任务、不重置抓取断点、不改变站点 URL、版块、启用状态或凭据。
- `server/src/app.js`：登记冲突映射 409 并返回可操作中文提示，结构未就绪映射 503；保留原有准入检查。
- `../admin/PublicOpinion/assets/sources.js`：遇到同源任务/断点/调度占用时读取该源最新活动任务并打开进度，不重试写接口、不重复创建任务。
- `server/test/repository.test.js`：补齐版块字段模拟结构，让版块保留用例覆盖有对应列的场景；实际旧结构保持兼容，不在本次执行 DDL。

## 验证

校正计划哈希：`402e6c54436e3825853c041d4908d058912763fa8f888fa9932cede1d7d0298e`。提交时的原登记行完全保留。校正后调度器自动创建父任务 `e0f5048b-6e95-44e9-8e57-08134d95893e` 和三个站点子任务，语言 16 已授权范围完成并新增 94 条，原站点已有 79 条变更。

专项测试 9/9 通过：校正规划 3 项、真实 API handler 错误映射 1 项、多站点仓储契约 5 项。候选 API 运行包的 handler 测试通过，API/前端 manifest 检查通过。真实 Edge 候选前端验证三类 409 均打开当前同源任务进度，无脚本错误。

全仓储测试有既有失败：原测试文件在当前工作区代码基线为 151 通过 / 7 失败；本次修正模拟版块字段后为 152 通过 / 6 失败，剩余为已有 checkpoint 身份/窗口用例，未改动对应业务代码。不可将专项通过描述为全量测试通过。

发布仅以当前现役 API/前端 release 叠加上述两个最小补丁；其他工作区改动不提交、不发布。只重启 API 和前端，Worker 不重启，保留回滚 XML。

API/前端正式浏览器验收 4 项通过，包括真实点击返回 200 并创建手动父任务 `4aa135a2-bd15-4355-bbb0-b6e93ba64bd5`。API release `release-20261012-sync-fix-1791808947943`，前端 release `release-20261012-sync-fix-1791809298142` 保留最新用户菜单。

持续观察发现第二个执行缺陷：三个子任务共用一个账号，拿不到账号 advisory lock 的任务已领取租约却直接返回 skipped，等待超时回收，最终可能 SYNC_RUN_POISONED。`worker/src/worker.js` 在该路径通过原 finishOnce/deferSyncRun 使用 owner+epoch fencing 返回 queued，10 秒后重试；零采集、零断点写入。新增隔离测试 2 项和租约回归 10 项全部通过，候选实际 Worker 模块同样通过。Worker 发布以现役运行包补丁此路径，只重启采集 Worker；不修改历史失败任务，不重置断点，不重启分析/翻译 Worker。

首次 Worker 修复在真实运行暴露旧采集审计表不接受 queued 状态；已修正为审计记录 partial，同步任务保持 queued，候选默认 finishOnce 路径测试覆盖这一兼容性。最终 Worker release 为 `worker-release-20261012-account-lock-1791809888195`，manifest 验证通过。2026-10-12T13:02:16Z 开始的新扫描在 13:03:39Z 完成，处理 5 个排队任务；三个新子任务已安全返回 queued / SYNC_ACCOUNT_BUSY，没有新增审计约束错误。

最新只读运行证据见 `sync-recovery-runtime.json`：站点登记为 3 个，真实内容已有新增/变更；手动任务的语言 9 和 16 子任务均完成授权范围采集，各抓取 326 条，首站点仍运行，其余任务排队。这不表示整个历史采集批次已完成，旧失败任务保持原样。正式浏览器后续三类冲突复测通过，使用 skip 标志避免再次真实提交；首次真实点击 200 证据另存 `sync-recovery-browser-submission.json`。
