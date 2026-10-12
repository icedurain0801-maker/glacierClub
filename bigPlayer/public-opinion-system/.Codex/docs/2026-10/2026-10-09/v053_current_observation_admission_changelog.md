# 当前响应共享内容复用准入候选

Status: partial-isolated-candidate / production-NO_GO

- 新增受信loader内部生成WeakMap证明，独立抽详情/评论ID、board、父链、时间与原payload哈希；拒绝外部伪造verified/proof。
- 同ID同fp仅生成reuse决定，保留旧UUID/raw字节哈希，当前site观察独立，不反填历史站点。已知board/core/父链冲突拒绝；正文版本变化暂拒，不伪装unchanged。
- 本阶段只有准入，不插入/更新DB，不以journal自报提交；观察intent/commit/reconcile、关联落库、真实connector原JSON接线和完整E2E仍待后续候选。
- v049冻结继续独立QA；本模块属于下一候选，不扩大生产权限。
- 复用同时核正文/标题/作者与删除状态，防止伪填旧fingerprint掩盖内容变化；原provider raw哈希仍必需。
