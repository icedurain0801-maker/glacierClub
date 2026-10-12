---
status: prepared
priority: P1
date: 2026-09-21
role: test-owner
topic: taptap-checkpoint-page-budget
---

# TapTap 游标续跑与页预算独立验收清单

## 边界

本清单只在候选 READY 后执行。测试负责人不修改业务代码，不写 DB，不创建真实 run，不访问或占用 `3001`；浏览器仅允许免登录 `127.0.0.1:3000` 的候选静态/mock 验收。

## 可复用测试

| 类别 | 现有测试 | 验收用途 |
|---|---|---|
| TapTap 专用 | `TapTap 增量 owned_content 在页预算耗尽后从 checkpoint 游标续跑且不重复新增` | 第 N 页预算耗尽时保存结构化 cursor；下次从该 cursor 续跑；已提交内容不重复写入 |
| TapTap 隔离 | `TapTap 游标续跑不影响回填、其他平台和评论游标` | 仅 TapTap incremental `owned_content` 使用续跑语义；backfill、其他平台、comments 保持既有 cursor 行为 |
| 通用游标 | `syncStage keeps one lease across pages and rejects repeated current cursor` | 拒绝循环/原地 cursor，防止无限分页 |
| 提交顺序 | `syncStage waits for page N commit before fetching page N+1` | 每页持久化成功后才取下一页，防止 cursor 跳过 |
| 异常收口 | `syncStage times out a stalled page and releases its checkpoint`、`syncStage releases its checkpoint when the repository rejects a page commit` | 超时/写入失败保留最后安全 cursor，释放 lease，并进入 retryable partial/failed |
| deadline | `late post-deadline fetch does not commit and keeps its checkpoint cursor` | deadline 后不入库、不推进 cursor |

候选交测至少应提供上述两条 TapTap 专用测试的重跑输出；变更若触及共享 `syncStage`，须同时交付通用游标/超时/提交顺序回归。

## 最小 API / 数据合同

全部使用内存 repository、固定 connector fixture 或候选提供的 mock，不连接真实数据库。

1. 首次 incremental owned-content，固定 `pageBudget=20`：第 20 页后持久化 JSON cursor（含版本和 provider offset/account position），状态不得 `completed`。
2. 第二次同 source/account/task/window：connector 的首个请求必须携带该 cursor；已提交的前 20 页不能重复新增；新 cursor 只能前进。
3. checkpoint identity 必须至少包含 source、account、task kind/key 与 collection window；不得复用到另一账号、另一 TapTap source、评论任务、backfill 或其他平台。
4. `hasMore=true` 且页预算耗尽：终态为 `partial` 或候选定义的可重试非成功状态，保存安全 cursor 与稳定 error code；不得 success 0 条。
5. 空页 / malformed cursor / 重复 cursor / connector 超时 / 持久化失败：不得推进 cursor，不得标 completed，lease 必须释放以允许重试。
6. active checkpoint lease：并发第二次 claim 不重复拉取；lease 过期后重试沿用同一 identity/cursor。
7. cursor 最终为 `null` 且 `hasMore=false`：仅在所有页面已提交后可 completed。

## 3000 浏览器口径

仅在候选提供固定 mock API 或只读 fixture 时执行。

- 在 `127.0.0.1:3000/admin/PublicOpinion/collection-runs.html` 查看同一 fixture 的 run 状态、source/account、task/window、checkpoint cursor 与可重试错误。
- 验证 budget 断点显示为可诊断的未完成/部分完成，不显示“成功 0 条”。
- 触发 mock 的 retry/reload 后，确认同一 run/checkpoint cursor 续跑，不出现重复内容计数。
- 页面请求不得命中真实 API、不得产生写请求；控制台错误、404、横向溢出均为失败。

若候选没有 3000 mock/fixture，浏览器项记为 **BLOCKED**，不得把静态页面或真实接口替代为通过证据。

## 拒绝条件

- 缺少 READY、manifest/provenance、overlay hash 或候选依赖闭包。
- cursor 从安全值回退、跳过未提交页、跨 source/account/task/window 复用，或重复新增内容。
- 页预算耗尽、空响应、异常分页、重复 cursor、超时、写入失败仍标 completed/success。
- checkpoint lease 未释放、active lease 下重复拉取，或重试丢失 cursor。
- 用真实 DB/run、`3001`、正式工作树或未声明的服务替代候选 fixture。

## 交测材料

- 候选路径、READY、manifest、provenance、overlay 清单/hash。
- TapTap 专用 `2` 条与共享游标回归输出；若共享路径改动，提供全量 Worker 结果及既有失败分类。
- 固定 fixture：至少 21 页或等价超过 budget 的分页、续跑后新增页、重复 cursor、空页/异常页、active lease 与过期重试。
- 若含前端验收：3000 mock 启动说明、桌面与 `375x667` 截图/DOM 几何、无请求失败记录。
