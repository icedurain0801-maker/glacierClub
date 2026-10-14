---
last_updated: 2026-09-10
status: blocked
scope: facebook-p0d1a-candidate-artifact
owner: 开发负责人
---

# v082 Facebook P0-D-1a 候选制品构造阻塞记录

## 结论

按“不得夹带脏工作树其他改动”的门禁停止构造。当前无法生成可证明仅包含 v075 P0-A/B/C 的完整候选制品，也无法生成可执行的候选前回滚制品；因此未在 `.temp/` 生成候选目录或冒充可部署的 manifest，未运行所谓候选测试。

本轮未修改真实 `.env`，未读取或输出任何秘密，未启停 Server/Worker，未调用 Facebook，未写业务 DB，未提交、部署或发布。

稳定阻塞码：

- `P0D_CANDIDATE_BASELINE_UNAVAILABLE`
- `P0D_CANDIDATE_HUNK_MIXED`
- `P0D_FRONTEND_IMMEDIATE_BASELINE_UNAVAILABLE`
- `P0D_ROLLBACK_BASELINE_INCOMPLETE`

## 基线证据

- 当前 `HEAD`：`6787afb41af11857c78264ddb2d80fc59635fcd6`，早于多轮 v075 前置功能，不可直接作为候选前 release。
- 最近可用 tracked 快照：`stash@{0}` / `da01f1849181ad10447427d8b731db77d4b64743`，创建于 2026-09-09 16:04；可为部分后端文件提供参考，但仍早于后续统一调度、任务隔离和独立评审等既有功能，不能认证为完整 v075 紧前 release。
- 前端旧快照：`stash@{4}^3` / `b4d5d3b1955fe6c2814e192a3b1eed5dff059920`，创建于 2026-09-09 12:14；包含三个前端文件，但时间过早且不是 P0-C 紧前快照，只能作为历史参考。
- 运行进程仅保留已加载代码，未发现可安全读取的源码快照、制品或 manifest；禁止以内存 dump 恢复，以免泄露秘密。
- 未发现匹配的 VSS、VS Code History/Backup 或 P0-A/B/C 补丁文件。

## 精确文件结论

| 路径 | v075 内容 | 结论 |
|---|---|---|
| `server/src/connectors/facebookGraphConnector.js` | P0-A/B Graph 安全、授权、三层分页 | 新文件，可整文件纳入未来候选；v075 前状态为不存在 |
| `server/src/connectors/externalConnectors.js` | Facebook import、registry、export | 可恢复：`stash@{0}` 已含 Discord，当前相对其仅增加 Facebook import、registry、export；该单路径可用当前文件作为候选输入 |
| `server/src/services/sourceValidators.js` | Facebook 平台白名单、主页 URL 校验与规范化 | 可恢复：`stash@{0}` 已含欧美源合同，当前相对其仅增加 Facebook 校验与导出；该单路径可用当前文件作为候选输入 |
| `server/src/app.js` | Facebook 范围、能力、凭据、授权、启用和同步门禁 | 阻塞：当前相对 `stash@{0}` 为 `133+ / 48-`，至少混有 v075 前的 Facebook 只读筛选接线和 v071 独立评审；v079 文件清单又漏列该必要运行文件，无法由记录重建已验收树 |
| `server/src/db/repository.js` | Facebook 换主页/换 Token 的事务化失效状态机 | 阻塞：当前相对 `stash@{0}` 至少混有 v056 分析 claim 隔离、v071 独立评审，再叠加 v079；无 P0-C 紧前权威 blob |
| `worker/src/worker.js` | Facebook 回复断点、分页提交计数、partial 和授权失效处理 | 阻塞：当前相对 `stash@{0}` 还混有 v031 统一调度 seam；无 v075 紧前权威 blob |
| `../admin/PublicOpinion/assets/scope.js` | P0-C 权限摘要接线（旧快照已含 Facebook 筛选） | 阻塞：只有 9 月 9 日早期历史快照，不是 P0-C 紧前权威父 blob |
| `../admin/PublicOpinion/assets/sources.js` | Facebook 表单、创建、同步和安全换绑交互 | 阻塞：文件整体未跟踪，并混有 H5、TapTap、Discord、同步进度等历史实现；无 P0-C 紧前父 blob |
| `../admin/PublicOpinion/sources.html` | Facebook 抽屉样式与资源版本接线 | 阻塞：文件整体未跟踪，压缩样式行还与既有样式混合；无 P0-C 紧前父 blob |
| `.env.example` | P0-D-1 的 Facebook 非秘密键合同 | 可单独按 hunk提取，但不属于 P0-A/B/C 运行制品；当前整文件还混有其他任务改动 |

## 为什么不能手工摘行后宣称候选通过

v078/v080 的通过结果对应当时完整工作树。`app.js`、`repository.js`、`worker.js` 中的 Facebook 改动与其他功能存在共同函数、导入导出和控制流依赖；仅按关键词摘行无法证明语义等价，也无法复用原 `79/79`、`125/125`、`320/320` 结论。直接复制当前整文件则确定夹带其他任务改动，违反本单门禁。

## 解锁条件与 Owner

| Owner | 必须提供 | 下一动作 |
|---|---|---|
| 项目经理 / 发布负责人 | 确认的 v075 紧前完整 release 或每个混杂文件的权威父 blob/补丁 | 固定来源引用、文件清单和 SHA256，禁止只给口头版本 |
| 各前置需求负责人 | `app.js`、`repository.js`、`worker.js` 在 v075 开始前的已验收快照 | 与当前 v075 差异重放后重新跑全部组合测试 |
| 前端发布负责人 | 三个 P0-C 前端文件的紧前快照，或批准以完整当前前端制品作为新的联合 release | 未获得前不得生成“仅 v075”前端候选 |
| 主机运维 | 当前线上 Server/Worker release 目录与对应制品 SHA256 | 用于生成可执行 rollback manifest；不得以进程内存替代 |

若项目经理决定把当前相互依赖的多轮改动作为一个新的联合 release，应另行明确扩大范围并重新执行完整回归；不得继续沿用“仅 v075 候选”的名称和既有测试结论。

## 本轮验证

- 两个本地子代理分别完成范围混杂审查和回滚基线审查，结论一致为 `BLOCKED`。
- 未构造候选，故 `node --check` 与 Facebook 组合测试按门禁未执行，不能报告为候选验证结果。
- 本记录仅说明阻塞，不是 release manifest 或部署授权。
