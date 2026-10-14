# v192 PublicOpinionWorker 真实服务与故障恢复：独立回归

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 范围：Worker 真实服务状态、正常启停、精确强杀恢复、MySQL 短断恢复、只读 DB/页面检查。
- 边界：未重启或修改 API；未停用旧任务、删除数据、发布或触发无界补跑。

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| Worker 服务契约 | PASS | Running；`NT AUTHORITY\LocalService`；Automatic Delayed；失败恢复 5 / 30 / 60 秒。 |
| 配置与实时心跳 | PASS | 最新心跳 age 2 秒，`mode=enabled`，`scan_status=running`，无 `scan_error`；build SHA 为 `A106…D4418`。 |
| 正常启停 | PASS | Worker wrapper 正常重启并生成新的 Node 子进程。 |
| 强杀恢复 | PASS | 仅终止已核验的 LocalService Worker Node 子进程；服务自动恢复为 Running，生成新的 wrapper/Node 进程。 |
| MySQL 短断恢复 | PASS | 重启已核验 `mysql` 服务后，API wrapper PID 31216 与 Worker wrapper PID 36600 未变化；4320 DB 状态恢复 `ok`。 |
| 防重复与租约/epoch | PASS | 只读查询 `duplicateSlots=0`；Worker release 阶段 34 项 lease/epoch/duplicate 回归已通过。 |
| 可达性 | PASS | 外网页面、CSS、JS、games API 均 HTTP 200。 |
| 保护项 | PASS | 3001 PID 25008 保持；旧任务仍为 `Ready / Ready / Disabled`；API 未重启。 |

## catchup 观察

被动只读采样显示近 10 分钟有 scheduled/catchup 运行，当前 Worker 正常扫描且无重复 slot。未人为触发 catchup，以遵守“不无界补跑/不额外写入数据”边界；开发验收记录中的有界总数 41 作为既有证据保留。

## 历史 worker_id 告警行评估

当前心跳表共有 6 行，其中最新实例为 fresh，另有 5 行是历次服务重启/强杀演练留下的 stale `worker_id`。这会使基于单行超时的告警产生历史误报。

判定为：**24 小时观察项，不阻断 B1 即时验收。** 理由是最新实例心跳、扫描、DB、服务恢复和重复 slot 均正常，且历史行并未表示当前 Worker 多实例运行或实际采集失败。不得删除或掩盖这些行；应单独立项设计 worker_id 退役/实例归属规则和告警过滤。

## 结论

**PASS（附 24 小时观察项）。** Worker 真实安装与故障恢复通过，可进入 24 小时观察；Worker 历史心跳告警问题需独立跟踪，不应通过删数据处理。
