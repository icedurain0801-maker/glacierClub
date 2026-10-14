# v221 同步任务 Dock 取消真实浏览器回归（3000 Mock）

- 执行时间：2026-09-18
- 环境：`http://127.0.0.1:3000`，本机内存 fixture，`fixture-sync-run-cancelable`
- 安全边界：仅使用 3000 Mock；未访问或占用 3001、4320、数据库、provider、凭据；未发起真实采集、授权或同步。
- 结论范围：本报告不构成任何 3001 线上通过结论。

## 结论

**FAIL（P1）。**

fixture 运行记录与跨页/刷新恢复可用，但真实浏览器中 Dock 的“取消”和“关闭”按钮均未产生预期状态变化：点击后 Dock 仍显示 `同步中 3 / 7`，没有 `cancelled`、没有收起、没有确认弹窗或前端错误提示。因此无法证明取消请求已发出、取消后轮询已停止，亦无法满足关闭只收起的合同。

## 用例结果

| 用例 | 结果 | 浏览器证据 |
|---|---|---|
| 预置 run 可见 | PASS | 来源页出现 `同步中 运行 #fixture-sync-run-cancelable`；运行记录页显示 1 条、`抓取 3`、状态“同步中” |
| 刷新恢复指针 | PASS | 强刷来源页后仍显示同一 run 与 Dock“同步中” |
| 切页恢复指针 | PASS | 切至 `collection-runs.html` 后，列表和 Dock 均显示同一运行中的 fixture |
| 关闭只收起 | FAIL | 点击 Dock“关闭”后 Dock 仍可见，且 run 仍为“同步中 3 / 7” |
| 取消后 `cancelled` | FAIL | 点击 Dock“取消”后状态未变化，仍为“同步中 3 / 7” |
| 取消后停止轮询 | BLOCKED | 取消未进入终态，无法验证轮询停止 |
| 二次取消 409 | BLOCKED | 首次取消未在浏览器中生效 |
| 控制台 | PASS | 最近 50 条 `error`/`warning` 为空 |
| PATCH/POST 网络状态 | NOT OBSERVED | 当前浏览器验收工具仅可读取 Console，不能观察请求状态或响应体；不得以 fixture 自测替代浏览器网络证据 |

## 对照验证

`node --test .tests/2026-09/2026-09-18/v220_acceptance_sync_run_fixture.test.js`：**2/2 PASS**。该结果仅证明 fixture HTTP/内存状态机可用，不能覆盖 Dock 按钮在真实浏览器的事件接线。

## 退回开发负责人

请修复 Dock“取消”和“关闭”的真实页面交互接线，并交付后重启 3000 fixture。复测门槛：

1. 首次取消在浏览器中可见 `cancelled`，随后不再轮询；
2. 关闭立即收起 Dock，不改变 run 状态；
3. 刷新/切页恢复的是同一指针，不得重新挂出被关闭的 Dock；
4. 提供可读的控制请求状态证据，或允许 QA 在受控环境观测。

## v022 修复后复测

- 复测环境：`127.0.0.1:3000`，adapter PID `22496`。
- 结果：**仍为 FAIL（P1）**。
- 深链加载后，UI 与只读 `GET /api/public-opinion/sync-runs/fixture-sync-run-cancelable` 均返回 `cancelled`、`fetched_count=3`，而非交测所述的初始 `running 3/7`；首次取消和轮询停止因此无法重测。
- 在该终态点击 Dock“关闭”后，Dock 仍可见；强刷后仍再次显示“已取消”。未满足“关闭清本地 pointer、仅收起且不被轮询重新挂回”的合同。
- Console 最近 50 条 `error`/`warning` 为空；网络控制请求状态仍为 `NOT OBSERVED`。

## v023 复测（最终本机结论）

**PASS，仅限 `127.0.0.1:3000` 内存 fixture。**

- Fixture reset：`POST /api/public-opinion/fixtures/sync-runs/reset {}` 后，只读 GET 返回 `running`、`fetched_count=3`、`discovered_count=7`，响应标注 `meta.fixture=true` 与 memory-only。
- 首次取消：真实浏览器点击 Dock“取消”后，页面由“同步中 3 / 7”变为“已取消 3 / 7”；等待 2.5 秒后第二次页面快照仍为同一终态，未发生状态回跳，视觉轮询停止通过。
- 终态关闭：点击“关闭”后 Dock 立即消失；URL 移除 `syncSourceId` 与 `syncRunId`。
- 强刷与切页：来源页强刷、再切至运行记录页后均未重新显示 Dock；运行记录保留同一 run 的“已取消”、抓取 3，证明关闭不取消或删除 run。
- Console：最近 50 条 `error`/`warning` 为空。
- localStorage：浏览器验收工具的只读 evaluate 隔离了 `localStorage`，无法直接读取键值；以关闭后 URL 清理及强刷/切页不复挂作为可见行为证据。
- Network：当前工具不提供网络请求状态/响应体观测，记为 `NOT OBSERVED`；不得以此宣称网络层零错误。

本段替代本报告此前 P1 的**本机**结论；不构成 3001 线上 PASS，也不覆盖真实采集、授权、provider、凭据或数据库验证。

## v023 补充回归：运行中关闭

**PASS，仅限 `127.0.0.1:3000` 内存 fixture。**

- reset 后只读 GET 为 `running`、`fetched_count=3`、`discovered_count=7`。
- 真实浏览器在“同步中 3 / 7”状态点击 Dock“关闭”，Dock 立即消失，URL 同时移除 `syncSourceId`、`syncRunId`。
- 强刷后 Dock 未重新挂回；Console 最近 50 条 `error`/`warning` 为空。
- 关闭后的只读 GET 仍返回 `running 3/7`，说明关闭未取消、未删除或改变 run。

## v023 复测准备

- Adapter 已重启为 PID `40592`，只监听 `127.0.0.1:3000`。
- 每次浏览器复测前，执行以下受控内存复位请求；成功响应必须是 `running`、`fetched_count=3`、`discovered_count=7`：

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/public-opinion/fixtures/sync-runs/reset' -ContentType 'application/json' -Body '{}'
```

- Dock 关闭会同时移除 `publicOpinionActiveSyncRun` 及地址栏中的 `syncSourceId`、`syncRunId`，因此强刷不会由来源页恢复逻辑重新挂载。关闭不改变 fixture run 状态。
- 本轮 HTTP 自测：`GET running 3/7` -> `POST cancel cancelled` -> `POST reset running 3/7` -> `GET running 3/7`。
