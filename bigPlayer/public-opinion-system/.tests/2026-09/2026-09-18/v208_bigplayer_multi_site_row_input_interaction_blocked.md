# BigPlayer H5 多站点逐行 URL 交互验收

验收时间：2026-09-18（Asia/Shanghai）
结论：**FAIL / 未准入**

## 已拍板口径

- BigPlayer H5 站点地址不得使用 `textarea`；每个链接必须是一行独立的 `input[type=url]`。
- 每行必须有序号、URL 输入框和可用的删除入口；至少保留一行。
- 新增自动聚焦新行；长 URL 保持单行并可横向滚动。
- 重复、非法、缺参数须逐行提示。
- 保存后，有效 URL 数必须等于 Worker 子任务数；批量授权/能力检测、手动/定时同步不得回归。

## 实机浏览器证据

- 环境：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&sourceId=5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- 采集源：境内 / 超能世界国服版 / BigPlayer 社区 / 大玩家H5社区。
- 打开“管理”抽屉后，页面只显示一个“站点地址 *”字段：`input`，ID 为 `cfgBaseUrl`，值为单条 `https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN`。
- 页面没有 `textarea`，但也没有逐行 URL 控件、序号、行删除、添加站点按钮或逐行校验提示。

## 验收矩阵

| 项目 | 结果 | 依据 |
|---|---|---|
| 无 textarea | PASS（仅当前旧表单） | 页面为单个 `cfgBaseUrl` input |
| 每链接独立 URL 行 | FAIL | 只有一条单字段，不能配置多链接 |
| 序号 / 删除 / 至少留一行 | BLOCKED | 未渲染行结构，无法执行 |
| 新增后自动聚焦 | BLOCKED | 未提供新增入口 |
| 长链接横向滚动 | BLOCKED | 未提供逐行控件 |
| 重复、非法、缺参数逐行提示 | BLOCKED | 未提供逐行校验呈现 |
| 保存与 Worker 子任务数一致 | BLOCKED | 未能保存多个有效链接；禁止为验收触发真实采集 |
| 批量授权、能力检测、手动/定时同步不回归 | BLOCKED | 多站点主交互未到位，不进行会产生真实任务的操作 |

## 退回条件

开发完成并部署逐行 URL 交互后，测试将以至少三条 URL 复验：新增/自动聚焦、逐行校验、删除下限、长 URL 展示、保存回显；随后仅在项目经理授权的有界测试窗口内，核对有效链接数与 Worker 子任务数一致及其余能力不回归。

本次未 POST、未启动采集、未改写历史 run、未修改业务代码。
