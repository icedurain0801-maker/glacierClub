---
status: blocked
priority: P1
date: 2026-09-21
role: test-owner
topic: taptap-checkpoint-page-budget
---

# TapTap 游标续跑与页预算只读 QA 报告

## 结论

本轮不能给出 `QA_PASS_RELEASE_REVIEW`。固定内存 fixture 与连接器回归通过；涉及真实数据库状态、checkpoint lease、唯一约束和 3000 浏览器 mock 的验收因交测边界不具备而 **BLOCKED**。运行时或数据状态仍待证，不得据此发版。

## 测试边界

- 测试负责人只读验收，不修改业务代码。
- 不写 DB、不创建真实 run、不切换服务、不访问或占用 `3001`。
- 不碰 PID `32020`，不发布、不 push。
- 浏览器验收仅允许 `127.0.0.1:3000` 免登录实例；本轮没有合规固定 mock/fixture，因此未启动服务。

## 已通过

### Worker 固定内存 fixture

命令：

```text
node --test --test-name-pattern="TapTap" worker/test/worker.test.js
```

结果：`2/2 PASS`

- `TapTap 增量 owned_content 在页预算耗尽后从 checkpoint 游标续跑且不重复新增`
- `TapTap 游标续跑不影响回填、其他平台和评论游标`

覆盖结论：`taskKind ||= scope === 'posts' ? 'owned_content' : scope`、页预算耗尽保存 `stage.cursor`、续跑保留 cursor、`posts` 走 `listOwnedContents` 的固定内存语义成立。

### TapTap connector 回归

命令：

```text
node --test server/test/taptapConnector.test.js
```

结果：`19/19 PASS`

覆盖账号分页、cursor account index 校验、无 `accountIds` fail-closed、评论分页、API 错误和 challenge 重试。

## BLOCKED 项

以下项目需要数据库 fixture 或真实运行状态，本轮按边界不得替代执行：

| 项目 | 状态 | 阻断原因 |
|---|---|---|
| active lease 拒绝第二次 claim | BLOCKED | 无 DB fixture；不能创建真实 run |
| lease 过期后的同 cursor 重试 | BLOCKED | 无 DB fixture；不能改变 lease 时间状态 |
| source/account/task/window 唯一约束 | BLOCKED | 无 DB fixture |
| 真实数据重复入库/幂等结果 | BLOCKED | 禁止写 DB |
| `127.0.0.1:3000` 页面验收 | BLOCKED | 未提供固定 mock API/只读 fixture；不得用真实接口替代 |

## 交测缺口与退回开发负责人

请开发负责人补交以下材料后重新排测：

1. READY、manifest/provenance、overlay 清单及 hash。
2. 至少 21 页或等价超过预算的分页 fixture，包含续跑新增页、重复 cursor、空页/异常页、active lease 与过期重试。
3. DB 状态断言：同 identity 不重复拉取/入库，lease 正确释放，过期重试沿用 cursor，cursor 不跨 source/account/task/window 复用。
4. `127.0.0.1:3000` 固定 mock 启动说明，以及桌面和 `375x667` 的页面证据；请求不得命中真实 API、不得产生写请求。

## 证据与完整性

- 活跃 release 全文件 SHA256：`A932A32F55174D1715CFD5EAA36CC57E2668EC03F89D23CAE81078BD3030BF75`
- 当前工作树 `worker/src/worker.js` 全文件 SHA256：`C4C4B9ABE8175F32A1662CA9C1860E43363317AF162621811D2D766...`
- 两者全文件 hash 不同；本报告仅确认上述 TapTap 关键调用链语义与关键测试结果一致，不宣称全文件字节一致。
