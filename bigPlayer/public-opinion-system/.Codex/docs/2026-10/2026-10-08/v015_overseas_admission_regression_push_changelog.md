# 境外 BigPlayer 离线准入回归提交记录

Status: offline-qa-pass; production-no-go

## 本次提交

- `server/test/repository.test.js`：仅提交境外三站点身份错配拒绝、对齐后保留 legacy 身份与游标、缺 `boardId` 拒绝的三个测试；该文件另有 030 schema 候选改动，仍留在工作树。
- `worker/test/schedulerRepositoryAdapter.test.js`：验证定时入队在站点身份错配时回滚，对齐后生成一个 parent 和三个带板块范围的 child，并保留旧站游标。
- `worker/test/sourceScheduler.test.js`：验证第二境外来源缺 `boardId` 时在原子排程与入队前拒绝。

## 验证与边界

- 测试负责人独立离线 QA：149/149、17/17、20/20 通过；开发侧同三项复跑通过。
- 测试只使用示例域名与模拟数据；本次不提交生产 config/registry、真实 provider 响应或生产证据。
- 不提交 029/030、快照门禁及站点对齐草稿；生产同步、服务切换和真实 Run 继续 `NO_GO`。
