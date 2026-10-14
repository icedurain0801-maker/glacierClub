---
status: BLOCKED_PRE_RELEASE
date: 2026-09-22
role: development-lead
candidateId: v334c-bigplayer-scheduled-catchup-formal-preflight-20260922-r2
evidenceId: 20260922054331-v334c-bigplayer-scheduled-catchup-formal-preflight-20260922-r2
---

# v334c 发布前只读预检范围纠偏

## 发布前门禁与结果

| 门禁 | 只读证据 | 结果 |
|---|---|---|
| 候选 payload | v337 独立 QA：checksum 19/19、payload 173/173 | PASS（离线闭包） |
| 目标 release 路径 | READY 声明 `C:\ProgramData\PublicOpinion\releases\bigplayer-worker-v334c\worker\src\worker.js`；`Test-Path=False` | BLOCKED；不能称目标路径已就绪 |
| 服务配置与当前 PID | `PublicOpinionWorker.xml` 指向 `worker-release-taptap-20260921-v055-formal1\worker\src\worker.js`；实际 Worker 亦非 v334c，见 v337 QA | 现状记录；发布前不要求 v334c PID |
| DB 配置指纹 | 从 `C:\ProgramData\PublicOpinion\config\public-opinion.env` 仅提取 `DB_HOST`、`DB_NAME` 值用于本机 SHA-256，未输出值或读取 secret 字段。HOST=`12CA17B49AF2289436F303E0166030A21E525D266E209267433801A8FD4071A0`；NAME=`50DDDE421C4C430FA796F9AE3763E4D963234071CAC2F7D8C7010913A2FF4BCB` | 候选 `0123456789abcdef` / `fedcba9876543210` 是占位值，不匹配；BLOCKED |
| rollback 映射 | formal-file-closure 13 个生产/测试 target 带 `payload/` 前缀，10 条生产项为抽象 `restore payload/...`；没有可执行上一版包位置/命令 | BLOCKED |

## 发布后门禁

真实 v334c PID、启动时间、API/Worker 同版 health、下一次定时 Run 窗口与正式 3000 浏览器证据只在受控切换后按 v335 验收。发布前不要求这些运行态证据，也不允许以旧 Worker、mock 页面或静态 READY 冒充。

## 操作边界

本次仅只读检查文件与服务配置。未发布、未切换、未重启、未创建 Run、未写 DB、未访问或探测 3001。候选保持封存；本报告是独立预检结论，不修改候选 manifest/READY。
