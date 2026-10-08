# 同快照执行器与生产只读评估设计

Status: approved-approach-pending-spec-review
Date: 2026-10-08

## 目标与非目标

采用独立执行器模块复用 `runSnapshotGate` 与 `snapshotManifest`，在全新本机隔离 MariaDB 上完成完整备份、锁内前后清单、严格恢复及逐对象比较。另提供生产只读评估，形成容量、活跃写入与锁窗口的 `GO/NO_GO` 输入。当前不开放生产执行入口，不停服务、不排空、不持生产锁、不执行生产 dump/restore/DDL/真实 Run。

## 模块边界

1. `server/src/db/snapshotExecutor.js` 负责把身份校验、固定对象全集、连接、dump/restore、artifact 校验、空间检查与进程清理适配为 `runSnapshotGate` 回调。它不自行决定生产准入。输入必须包含预先指定的隔离实例身份（host、port、server_id、datadir、version）、源/恢复库名、不可变对象基线、受限证据目录、工具绝对路径和硬时限；拒绝默认实例、相同源/恢复库、已有非隔离 datadir 或身份不匹配。
2. `scripts/snapshot-executor-isolated.js` 是唯一可运行 CLI：显式 `--isolated` 与专用 433xx 端口，先创建全新 datadir/人工库，再调用执行器；不得接受任意生产连接串或省略模式参数。生产模式在代码级返回固定 `PRODUCTION_EXECUTION_DISABLED`，不尝试连接。
3. `scripts/snapshot-production-readonly.js` 仅使用只读连接和带超时的 `SELECT`/`information_schema`/系统变量查询。输出只含目标身份、表/引擎/估计行数与字节数、活跃事务/连接和调度/租约计数、观测区间的粗粒度写入速率及缺项；不输出凭据、URL、SQL 正文、业务行或进程命令行。不得执行 `COUNT(*)` 全表扫描、锁、DDL、服务控制或备份。

## 执行序列与失败关闭

隔离入口预检端口空闲、可用磁盘、工具版本与目标身份，并创建一次性证据目录。执行器建立独立 owner/watcher/manifest/restore 连接，使用固定对象基线调用 Gate：锁主取得 FTWRL；锁内读取对象全集与源端前清单；以独立连接运行带固定参数的 `mysqldump --single-transaction --quick --routines --triggers --events --hex-blob --no-tablespaces`；验证退出码、stderr、字节数和 SHA256；锁内读取源端后清单并要求逐项相等；解锁后再次校验同一 artifact，向全新隔离恢复库运行无 `--force` 的 mysql 导入；恢复端以同一 Manifest 版本逐表、逐块、逐对象比对。Gate 的任一失败、超时、锁主丢失、dump/restore 非零、hash/对象差异或子进程退出未确认均为 `NO_GO`。

证据只保存脱敏结果、阶段/错误码、身份、耗时、对象数、行数、字节数、artifact 与脚本 SHA256、清理状态。原始 dump 留在受限本地目录，不入 Git、不写聊天；失败时保留用于复核，不自动覆盖旧证据。清理只作用于本次创建且身份核实的子进程、连接和 datadir；不杀未知进程。

## 只读评估与生产窗口材料

只读评估须报告目标库身份、全库对象/引擎清单摘要、`information_schema` 估计规模、最大表及总数据/索引字节、活跃事务时长分布、运行中连接/写入者候选、调度任务与租约现状。至少两次有时间戳的数据库全局写入计数采样用于判断观测窗口内的持续写入；计数只代表采样区间，不当作峰值或停写证明。任何权限不足、目标身份不符、对象类型/引擎不支持、长事务、活跃写入者不明、空间不足或窗口锁预算未批准都输出 `NO_GO` 与缺项。停写顺序建议为：定时任务/API 新准入、主 Worker、分析/翻译 Worker、Discord/导入/手工写入者；每层核对进程、队列、租约、事务，再进入下一层。正式硬时限取项目经理批准值，锁获取与持锁计时分别约束；超时销毁自有锁主并停止候选，失败回退为释放本次锁、停止自有子进程、保留证据与原服务状态，不自动重试或切换。

## 验收

- 单元测试覆盖输入/身份/路径拒绝、生产模式失败关闭、dump/restore 参数、artifact 绑定、取消与清理。
- 隔离端到端在全新本机 MariaDB 验证正常恢复与对象/数据变异拒绝，复用现有七故障和百万行夹具；结果绑定脚本、Gate、Manifest SHA256，确认自有实例停止和端口释放。
- 生产只读评估只检查元数据和状态，敏感内容脱敏；测试负责人独立 QA 后向项目经理提交 `GO/NO_GO` 材料。隔离通过不等于生产 `RESTORE_VERIFIED`。

## 方案取舍

方案 A（采用）：独立执行器和仅隔离入口，正式流程边界清楚。方案 B 扩充现有演练脚本虽改动少，但测试夹具与可执行入口混用。方案 C 接入 API 服务增加权限与运行面，当前无必要。
