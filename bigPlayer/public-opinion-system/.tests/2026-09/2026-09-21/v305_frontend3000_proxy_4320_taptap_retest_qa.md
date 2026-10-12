---
status: passed
priority: P1
date: 2026-09-21
role: test-owner
candidate: v303-frontend3000-proxy-4320
runId: 11dcd45f-6442-4e27-92f3-a8ea12c680f1
---

# TapTap 3000 回源修复最小复验报告

## 结论

PASS。`127.0.0.1:3000` 的 `/health`、TapTap communities 只读 API 和指定 collection-runs 深链均可用，页面数据与 API Run 计数一致。未执行任何写操作。

## 候选完整性

- 候选：`.temp/candidates/v303-frontend3000-proxy-4320`
- release manifest：`release/frontend3001-release-manifest.json`
- 交测 SHA-256：`84F250714FD84AD5BAA07548C0B423FD2CAA8F0238720F19C11EA28C3B276AFF`
- 独立复算：31 个文件，`31 MATCH / 0 MISSING / 0 MISMATCH`。
- 浏览器参考截图存在：`collection-runs.png`。

## API 只读结果

| 请求 | 结果 |
|---|---|
| `GET http://127.0.0.1:3000/health` | HTTP 200；服务 `public-opinion-system-server`，数据库状态 `ok`。 |
| `GET http://127.0.0.1:3000/api/public-opinion/communities?regionCode=domestic&platform=taptap` | HTTP 200；返回 TapTap 范围数据，包含 `00000000-0000-0000-0000-000000000101` 超能世界国服版。 |
| `GET http://127.0.0.1:3000/api/public-opinion/sync-runs/11dcd45f-6442-4e27-92f3-a8ea12c680f1` | HTTP 200；`status=partial`，发现 648、抓取 599、入库 123、新增 3、变更 77、评论 49819。 |

## 3000 浏览器结果

深链：

`http://127.0.0.1:3000/admin/PublicOpinion/collection-runs.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=taptap&sourceId=26b47b08-0a0d-4265-b377-3d313e2f1131&runId=11dcd45f-6442-4e27-92f3-a8ea12c680f1`

页面真实渲染并展开指定 Run：

- 总运行记录：281 条；筛选为 TapTap 舆情监控 / TapTap。
- 指定 Run 状态显示“部分完成”。
- 页面显示：抓取 599、新增 3、变更 77、未变化 519、评论 49819。
- 页面显示 `SYNC_PAGE_BUDGET_EXHAUSTED`，与 API 的 `PARTIAL_SYNC` 计数语义一致。
- 页面显示该站点当前仅提供评论数量，评论内容接口暂不支持；无空白页、脚本错误占位或回源失败。

## 边界确认

- 只使用 `127.0.0.1:3000`，未占用或触碰 3001。
- 未修改 Worker、DB、Run、游标、服务、代码或 SCM 配置。
- 未创建新 Run、未发出写请求、未补抓、未执行历史回算。

## 流转

本项 PASS，可提示项目经理流转下一阶段。剩余风险：本次只验证 loopback 3000 非 SCM QA 进程；生产常驻 3001 的安装、重启与发布仍不在范围内。
