# v022 Q1 provider 分页预算最小修复

- 日期：2026-09-17
- 线别：A1 数据完整性
- 状态：代码完成，未部署、未补跑

## 根因

Q1 feed 的默认页预算复用了通用 HTML crawler 的 `BIGPLAYER_H5_MAX_PAGES=100`。Worker 默认每页 50 条，因此遍历在 offset 5000 提前结束，早于 Q1 provider 已知的 offset 10000 硬上限，并产生 `provider_pagination_budget_exhausted`。失败会中止当次有界采集，留下帖子和评论 checkpoint 待处理。

## 修改

- 未显式设置 `BIGPLAYER_H5_FEED_MAX_PAGES` 时，按 `ceil(10000 / pageSize)` 计算 Q1 feed 的有界页预算。
- 显式 `BIGPLAYER_H5_FEED_MAX_PAGES` 仍保持优先，可配置更严格的 fail-closed 上限。
- provider offset 10000、空页、重复页、游标不推进等既有门禁不变。

## 边界

- 未修改生产配置、服务或数据库。
- 未触发同步、回溯或补跑。
- 生产现有“帖子 2、评论 1072 待处理”不会因本轮代码修改自动变化，需后续部署并经授权执行有界恢复。
