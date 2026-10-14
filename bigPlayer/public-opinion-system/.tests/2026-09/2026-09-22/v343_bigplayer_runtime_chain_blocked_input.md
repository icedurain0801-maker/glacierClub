---
status: BLOCKED_INPUT
date: 2026-09-22
role: development-lead
scope: v343 B-line runtime release input
---

# BigPlayer 真实 release 输入止损记录

## 只读范围

- 仅核对 `C:\ProgramData\PublicOpinion\releases`、服务 XML 和封存候选声明。
- 未访问 3001，未启动/切换/重启服务，未执行真实 Run，未写数据库，未创建候选。

## 结果

`BLOCKED_INPUT`。本轮停止 B 线，不再继续搜索或重试代理。

| 对象 | 期望位置 | 结果 | 缺失项 | 提供方 |
|---|---|---|---|---|
| BigPlayer target Worker | `C:\ProgramData\PublicOpinion\releases\bigplayer-worker-v334c\worker\src\worker.js` | `Test-Path=False` | 目标 Worker 文件、所属 release、commit、SHA-256 | 发布方/项目经理提供真实 BigPlayer release 包 |
| 上一版 rollback Worker | 候选要求的真实上一版 release 下 `worker\src\worker.js` | 未提供 | 上一版 release 绝对目录、Worker 文件、SHA-256、可执行 Copy-Item 命令 | 发布方/项目经理提供 rollback release 对象 |
| formal-file-closure rollback 文件 | 每个生产文件对应上一版 release 的绝对文件 | 候选仅有 `prior release:payload/...` 抽象值 | 逐文件绝对路径、存在性、hash、restore command | 发布方/项目经理提供上一版完整文件闭包 |

## 现有证据

- `C:\ProgramData\PublicOpinion\releases` 中可见多个 release 目录，但没有名为 `bigplayer-worker-v334c` 的目标目录。
- 服务 XML 仍指向旧 TapTap Worker release；不能把旧 release 充当 BigPlayer target。
- 封存候选 `.temp/candidates/v334c-bigplayer-scheduled-catchup-formal-preflight-20260922-r2/rollback-plan.json` 的对象仍为 `prior release:...` 与 `restore ...` 抽象映射，不能计算真实 hash，也不能执行 rollback dry-run。

## 后续输入要求

项目经理/发布方需提供真实 BigPlayer target release 和上一版 rollback release 的绝对路径及文件对象。收到后再重新执行源头初始化器和独立门禁；在此之前不得创建候选或发布。
