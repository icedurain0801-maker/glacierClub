# 海外生产定时消费者交付

Status: CODE_AND_PACKAGE_READY_NOT_ACTIVATED；真实定时触发未执行。
Owner: 开发负责人
Date: 2026-10-10

本记录补充并替代 v054 中“生产消费者尚未交付”和必须始终保留排除版的回退口径。六社区正式 UI 已由经理实施并经独立 QA v047 PASS，从剩余工作移除。

## 本次正式代码

| 路径 | 用途 |
|---|---|
| worker/src/overseasProductionDaily.js | 独立生产采集入口；不 import worker.js，不全表扫描，不执行 AI |
| worker/test/overseasProductionDaily.test.js | 02 点时区窗口与分页已提交 cursor 恢复的两项功能自测 |
| scripts/prepare-overseas-shared-exclusion.js | 从现役 v055 构建 5 文件目标采集排除，包括 syncStage 领取 checkpoint 前早拒 |
| scripts/prepare-overseas-production-delivery.js | 组装完整 v055 基底共享 release，以及独立消费者实际依赖和有效 launcher |
| scripts/overseas-worker-switch-gate.js | 只读排空状态；另有明确写入的 acquire/release，仅操作现有 worker_scheduler 租约 |
| scripts/overseas-production-switch.ps1 | 具体排空切换、单次触发、启用、暂停及恢复原服务命令；默认 Status 只读 |

未覆盖或清理历史 dirty 文件；未做 DDL、新库、删除业务数据、push、发版或共享服务切换。

## 可审查完整包

仓库根：`.temp/overseas-production-delivery-1791605078003/`。

- `worker-release-v055-overseas-exclusion-1791605078003/`：原 v055 包的 407 个文件，仅 5 文件采集排除变化，不把整个当前工作树发到共享服务。
- `overseas-daily-release-1791605078003/`：生产入口的 40 个项目依赖、既有 Node 依赖、共享排除门禁和有效 `worker/last-night-overseas-daily.cmd`。
- `PublicOpinionWorker.before.xml`：当前原 v055 服务配置备份。
- `overseas-production-switch.ps1`、`delivery.json`：准确目标与执行入口。

计划目标分别是 `C:/ProgramData/PublicOpinion/releases/worker-release-v055-overseas-exclusion-1791605078003` 与 `C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-daily-release-1791605078003`。目前均未部署，现役海外任务仍指向不存在的旧工作树 .cmd，不能把包内 launcher 已存在说成正式任务已修复。

## 消费者具体行为

北京时间 02 点触发，采集前一日北京时间 00–24 点窗口。例如 2026-10-10 02 点 slot 为 UTC 2026-10-09 18 点，窗口是 UTC 10-08 16 点至 10-09 16 点。02 点前取前一 slot，避免按机器或数据库 session 时区漂移。

固定 source/account/game/community/board 校验、三站 URL/registry 配对；每站正式社区 token session，通过现有连接器读取 merged 首页。每个请求显式携带该站 env/gameId/gameVersion/languageId，站点观察分别入 membership；同一 externalId 仍按社区内容去重。显式 languageId 是候选请求修正，实际接口是否按语言配置返回正确 feed 需那一次真实功能检查，不能把 context200 或三站同 IDs 自动当作证明。此版本范围是三站首页帖子，不冒称评论、关键词、全部历史已同步。

持久目录固定为 `C:/ProgramData/PublicOpinion/overseas-daily/state`，正式安装前不创建；首次 slot intent 写 staging、fsync 后原子不覆盖发布。只有同来源进程持有命名锁才能准入；source lease 与每站 run owner/epoch 联合 fencing，30 秒续有效租约，不复活过期租约。

生产 cursor 在每站 run 的结构化 receipt（既有 error_message 列）保存，与页面内容、run_content、站点 membership、light/zh-CN jobs 同一事务。只在 COMMIT ACK 后推进内存 cursor。进程退出后从生产 receipt 恢复；完成站点跳过，唯一 source/slot 防重复。已详情内容遭遇 summary fallback 时保留详情与对应 fingerprint。同版本已有 HOLD/成功/失败任务不重置；真实新版本按现有唯一共享队列入队。

现场遗留 `3653d4a7-b000-44ee-b60e-0be88f80efa0` 是同 slot queued scheduled_catchup，窗口正好为前一日，已有只读 snapshot 的活动集合仅该 parent。候选会仅在 source/account/trigger/window 一致、旧 parent 无子（或已有本候选确定性三子）且无其他活动采集时原子接管该 parent；不另造第二个 source/slot、不改既有窗口、不删除旧任务。存在 legacy 随机子、其他活动或身份冲突就在任何写入前拒绝，不混造六个子；父聚合固定本候选三 ID。

每次执行默认最多 84 HTTP、每站最多 10 页；达到预算将已提交页留为 partial，下次从 receipt cursor 恢复，不能将 partial 当日同步完成。该预算可在正式配置中按实际日量调整，本轮没有实际扩量。消费者自身不调用付费 AI，但入队新/变更内容会由现有 AI/翻译服务消费，正式启用决定必须包含这个下游影响，不能沿用本轮仅 3 内容/6 HTTP 的已执行验证预算冒称无限放行。

启用前必须验证实际 Running PublicOpinionWorker 的入口是新排除 release，5 文件匹配且进程晚于工件；不是读取工作树配置。每次 HTTP 前核当前排除版本与 source/child 有效 owner/epoch。STOP 文件阻止新请求；COMMIT_UNKNOWN 优先于 heartbeat 错误，记录待 reconcile，不自动再执行未知提交。

## 排空与一次实际触发命令

以下均以完整包内 PowerShell 脚本执行；只有 Status 本轮已运行。其他模式涉及共享切换或真实外部采集，当前禁止执行，待经理就国内边界变更取得用户决定。

```powershell
$package = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-production-delivery-1791605078003'
$switch = Join-Path $package 'overseas-production-switch.ps1'
& $switch -PackageRoot $package -Mode Status
# 仅在批准共享排空切换后：
& $switch -PackageRoot $package -Mode Switch
# 仅在批准一次实际触发后；触发后立即保持定时 Disabled：
& $switch -PackageRoot $package -Mode RunOnce
# QA 核一次实际抓取、入库、下游可读、社区/语言归属正确后：
& $switch -PackageRoot $package -Mode EnableDaily
```

Switch 先复制不可变完整 release，备份旧任务 XML，为原 task principal 配置仅私有 state/log 目录写权限，不复制密钥、不改原共享 env。当前任务 principal 为 icedurain / Interactive / Limited，仍须以原任务身份实跑验证 env/新 release 读取权限；开发负责人本机 preflight 不代替任务身份。原 task action/workingdirectory 改到新持久 launcher，仍保持 Disabled。

真正停止共享服务前必须 CAS 获取现有 worker_scheduler scan gate，仅在 scan 不活动且所有采集 Run 排空时成功；busy 就退出，不强停。gate 最多 300 秒，切换只修改 PublicOpinionWorker XML 的 arguments/workingdirectory，不重启 API/frontend/AI/translation。共享采集会短暂延后，确切耗时待实际排空确认。此刻只读 Status 看到 scan 空、活动采集 0、海外私有锁空，只是现场状态，不是切换授权。

Switch 中途失败且海外尚未启用时，直接恢复原 XML、启动原 v055，释放 scan gate。切换成功也只做零 HTTP/零写库 preflight，RunOnce 另行显式触发。业务验收只做一次最短真实任务→抓取→生产入库→现有下游结果，接口/功能正确即可，不补 hash/矩阵，不重复已通过 3 条 AI。

## 暂停与回退

```powershell
& $switch -PackageRoot $package -Mode PauseDaily
& $switch -PackageRoot $package -Mode Status
# 海外锁为空、其请求已排空之后，若排除补丁导致国内问题：
& $switch -PackageRoot $package -Mode RollbackOriginal
```

仅海外消费者故障：PauseDaily 禁用目标任务并写 STOP，停止新派发，保留共享排除版和已提交页，不再启动旧海外路径。无需动国内实例。

排除补丁导致国内故障：先 PauseDaily，确认海外进程私有锁已释放；`--retire-overseas` 先持久保存本候选原 Run 状态，然后在目标来源/账号/intent 范围内把 queued/running/pausing/cancelling 转为既有终态 partial，清租约并递增 epoch，保留 cursor、内容、关联和 jobs。这样原 v055 的全局 recovery 不会接着领取新候选 Run；不删除数据、不退休无本候选证据的旧任务。gate 再确认所有采集已排空后恢复 `PublicOpinionWorker.before.xml` 原 v055 并启动。不能坚持保留排除版而阻止国内恢复；恢复原版前必须停海外，避免双消费者。原海外任务保持 Disabled，不立即恢复缺失 .cmd 的 action。若 retirement 提交不明，先只读核收持久 receipt 和 DB 状态，再继续，不能盲目恢复或重发。

STOP 不能自动删除；决定恢复海外时先核排空与唯一消费者，再把 STOP 归档改名保留记录。已完成 slot/cursor/job 不删除、不重跑。提交不明时只读对账 DB receipt 后再人工收口，不能直接解除 commit_unknown。

## 当前验证与剩余工作

完整包 5 个共享文件语法 PASS；独立消费者打包后 dry-run 成功，HTTP0/写库0；PowerShell parser PASS；02 点窗口、已提交分页恢复两项功能自测 PASS。只读排空 Status 成功。上述均不签真实定时 PASS。

剩余只有：国内边界变更的决定、按原任务身份的实际入口权限核验、一次真实定时抓取/入库/下游功能检查、随后启用日常任务。六社区 UI、样本入库、已有 3 内容 AI/翻译不复跑。
