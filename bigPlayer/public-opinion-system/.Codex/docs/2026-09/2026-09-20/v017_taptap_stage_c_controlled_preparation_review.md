# TapTap C 阶段受控候选创建：只读复核与阻塞

状态：只读审查完成。本轮未写 `C:\ProgramData`、未创建候选、未运行真实 preflight。

## 修正后的顺序

发布门禁顺序应为 **A → C → B → D**：

| 阶段 | 目的 | 写入范围 | 弹窗要求 |
|---|---|---|---|
| A | `.temp` 隔离候选、fake/语法验收 | 仅仓库 `.temp` | 已完成 |
| C | 创建不可变候选 release、候选 XML/WinSW 工件、snapshot | 仅批准的 ProgramData candidate/staging/audit 路径 | 可与 B 合并为一次“只创建候选 + 真实只读 preflight”限域弹窗 |
| B | 以 C 产物和当前 Worker/API 做真实只读 preflight | 无写入；SCM query 与只读 DB readiness | 使用上述同一弹窗，限定命令、操作者、时间窗 |
| D | 单次 Worker-only 切换 | 仅 Worker wrapper/XML/服务；可能自动 Worker-only rollback | 必须单独新弹窗 |

## 可复用脚本与其精确行为

| 脚本 | 可复用部分 | 实际写入/副作用 | C 阶段结论 |
|---|---|---|---|
| `prepare-worker-preflight.ps1 -Mode Preflight` | `.temp` 的构建、WinSW 固定 hash、XML/ACL/manifest/readiness 合同 | 仅仓库 `.temp`，完成后清理 | 仅 A，已可隔离验收 |
| `prepare-worker-preflight.ps1 -Mode Apply` | 构建 Worker release、渲染 XML、ACL、`verify-worker-release.js`、`validate-artifacts.ps1` | `RuntimeRoot`、`ReleaseBase`、`ServiceRoot`、`LogRoot`、`DataRoot`；失败会删除本次 artifact/release | 不是完整安全 C 入口 |
| `install-services.cmd /apply PublicOpinionWorker` | 复用上述 Apply 后执行 install | 会进入服务安装，属于 D | C 阶段禁止 |
| `verify-worker-only-cutover-plan.js` | 已有候选/回滚/API 的只读核对 | 无写入 | B 可复用，但不生成 snapshot |
| `worker-only-controlled-cutover.js --preflight` | 实际参数、manifest/hash、SCM query、DB readiness | 无写入 | B 可复用，但要求已有 snapshot |

若未来批准使用现有 `prepare-worker-preflight.ps1 -Mode Apply`，其**拟议绝对路径形状**只能是：

```text
RuntimeRoot = C:\ProgramData\PublicOpinion\releases\worker-release-taptap-<不可变-id>
ReleaseBase = C:\ProgramData\PublicOpinion\releases
ServiceRoot = C:\ProgramData\PublicOpinion\candidate-staging\worker-release-taptap-<不可变-id>\services
LogRoot     = C:\ProgramData\PublicOpinion\candidate-staging\worker-release-taptap-<不可变-id>\logs
DataRoot    = C:\ProgramData\PublicOpinion\candidate-staging\worker-release-taptap-<不可变-id>\data
ConfigFile  = C:\ProgramData\PublicOpinion\config\public-opinion.env
```

它可避免写活跃 `services\`，并会生成候选 `PublicOpinionWorker.exe/.xml`。但这只是路径设计，
**当前不得执行**；还必须以项目经理登记的 `<不可变-id>`、批准的干净 TapTap-only checkout 的
commit/SHA-256、以及固定 WinSW hash 为输入。共享脏工作树不能充当 `AppRoot`。

候选 XML 必须由 `prepare-worker-preflight.ps1` 内的 `render-config.ps1` 生成，并由
`validate-artifacts.ps1` 复核：id=`PublicOpinionWorker`、entry 指向候选 release 的
`worker\src\worker.js`、`BUILD_SHA` 等于候选 manifest hash、LocalService、无 API/3001 参数、
ACL 合同通过。不得手工复制/改写 XML。

## 使 C 阶段可执行的精确阻塞

目前**没有一条现成受控命令**可以同时完成以下 C 合同，因此不能向项目经理提供可直接执行的
C 命令：

1. 从批准的干净 TapTap-only checkout/hash 构建候选；
2. 只写上述 candidate/staging/audit 路径，绝不触碰活跃 `services\`；
3. 生成并原子持久化 `verified-snapshot.json`（当前 Worker/API wrapper/XML hash、候选 manifest
   hash、`service=PublicOpinionWorker`）；
4. 在失败时**保留**候选和脱敏审计证据，不自动删除；
5. 在成功后输出唯一、可传递给 B 的参数清单。

现有 `prepare-worker-preflight.ps1 -Mode Apply` 缺少第 3、4、5 项：它不生成 CLI 所需 snapshot，
且 catch 分支会删除本次 artifact/release。`worker-only-controlled-cutover.js` 只验证 snapshot，
不创建它。`install-services.cmd /apply` 又把 C 与 D 混在同一服务安装流程。因此不能靠手工
复制、PowerShell 拼接或修改现有路径绕过。

## B 阶段的可弹窗材料（待 C 补件后）

同一限域弹窗可授权“仅 C + B”，但前提是先补齐上述受控 C 入口。弹窗需明确：

- 允许创建的精确 ProgramData candidate/staging/audit 路径和不可变 id；
- 批准的干净 checkout commit/hash 与 WinSW 固定 SHA-256；
- 仅 `PublicOpinionWorker`，不写活跃 `services\`，不 install/start/stop，不补跑；
- B 只运行 v016 所列真实 `--preflight`，允许 SCM query 和 `SELECT`/`SHOW` readiness；
- C 或 B 失败时保留候选/审计证据、退出，不删除、不切换；清理由单独弹窗决定。

D 的 Worker stop/install/start 和可能的 Worker-only 自动回滚仍须另行单次授权，不能由 C+B
弹窗覆盖。
