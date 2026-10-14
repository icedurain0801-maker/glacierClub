# BigPlayer 唯一有限 run 验收报告

- 日期：2026-09-20
- 服务恢复：**PASS**
- 采集恢复：**FAIL**
- 运行策略：仅执行一次，未重试、未补跑

## 失败证据

- 唯一 `POST /api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/sync`，body `{"mode":"incremental"}`。
- 创建 run 阶段返回 HTTP `401`，`error=UNAUTHORIZED`，`message=AUTH_REFRESH_FAILED`。
- 未生成新 `runId`，因此不存在本次的 queued/running/terminal、计数或 checkpoint 变化。
- 只读 latest 仍为旧 run `1a709456-95b3-4df8-9181-0244533c6449`，状态 failed，计数 `0/0/0/0`，原因 `LOGIN_SESSION_SERVICE_UNAVAILABLE`。
- 只读 `contents?postId=919716&sourceId=...` 返回 200 且 0 条；未发现 `919716` 入库证据。

## 浏览器验收

3000 免登录内容页已打开并带 `postId=919716` 筛选。页面没有 `919716` 对应行；显示的 4 条为本地验收 fixture，帖子 ID 均为 `-`，不能作为真实采集成功证据。

## 结论与边界

- 4311 服务的 60 秒稳定性此前已 PASS；本次失败发生在登录刷新/创建 run 前，不能归因于内容去重或 checkpoint 逻辑。
- 后续 sync 请求已冻结；等待开发只读诊断和最小修复后重新建立门禁。
- 本次未执行第二次 run、未删除数据、未重启 API/Worker。
