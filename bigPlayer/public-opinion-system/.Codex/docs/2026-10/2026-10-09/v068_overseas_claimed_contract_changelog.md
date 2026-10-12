# claim后首次合同与恢复只读管理

Status: isolated-candidate / frozen-developer-38-PASS / runtime-NO_GO

- 新增 `overseasBigPlayerClaimedContracts.js`：合同只能用claim后的真实owner/epoch及精确source/account/site/window构造。首次输入为完整精确合同，不是runId白名单；显式首次权限一次消费，DB attempts=1/live/owner/epoch及完整JOIN验证后创建，失败不自动重试。
- 默认prepare/read仅读取已有同epoch合同；缺证或变更不会捕获后自动create。发布后再次核当前DB，不能凭文件成功启动HTTP。
- 提取具体verifier的只读persisted校验与严格UTC函数复用；仍不代表生产授权。
- worker在leaseGuard开始后、runPagedSource授权/HTTP之前加入可选prepare钩子；preflight把真实leased owner/epoch/window传给合同读取器，不用baseDeps的领取前owner。
- 普通buildDeps不设置此钩子，本批不启用生产。不新增消费者、不改国内/非目标算法。

可信factory实际组装与隔离验证继续补；当前观察持久恢复、完整drain、第二源及真实验收仍未完成。首次权限仅隔离显式输入，不写env、不在重启恢复时重新注入。
