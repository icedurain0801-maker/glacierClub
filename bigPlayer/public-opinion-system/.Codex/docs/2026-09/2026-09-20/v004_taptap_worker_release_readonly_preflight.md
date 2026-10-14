# TapTap Cursor 修复：Worker 发布候选只读预检

日期：2026-09-20

状态：仅只读预检完成；**未获发布授权，禁止部署、重启、补跑、push 或发版**

## 候选变更边界

本次 TapTap 候选仅为 `worker/src/worker.js` 中 `syncStage` 的一处语义变更：删除 `restartTapTapOwnedIncremental` 特例，改为所有阶段统一使用 `checkpoint.cursor ?? null`（当前工作树约第 569 行）。这使 TapTap `owned_content` incremental 在上一轮页预算耗尽后继续使用保存的 cursor。

配套候选测试在 `worker/test/worker.test.js` 约第 1096、1138 行：覆盖两轮各 20 页、首轮保存 `from=200`、次轮从该 cursor 继续、重放去重以及回填/其他平台/评论游标不变。

`worker/src/worker.js` 当前是共享脏文件，不能把它整体打包为 TapTap 候选。已明确排除的在途改动包括：

- BigPlayer candidate observation（约第 439–477、1099–1100 行）；
- pause/cancel 安全页落点与终态处理（约第 498、527–545、579、645–656、924、986 行）；
- 对应的其它新增测试。

因此，候选发布前必须从批准的干净基线重新摘取 TapTap 单一 hunk，或由负责人提供可审计的单一提交；当前共享工作树不具备整体发布条件。

## 只读指纹

以下为本次预检时相关文件 SHA-256；它们是工作树文件指纹，**不是**尚未构建的运行包 manifest：

| 文件 | SHA-256 |
|---|---|
| `worker/src/worker.js` | `558D8F2CE9F4C6BC39CD02B5072608003967A3EA0A92DEDCF0E3411E73B0BDAF` |
| `worker/test/worker.test.js` | `3B38557752ECDC342DC5FAF48319A012D3D0B2E4FF6FADCB98B5A1099206231B` |
| `.tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser_fixture.html` | `77847AC22525C340F8A2CFBEF6FDE7A59DE82E9C56FE5A6B5845CE7C724E7087` |
| `.tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser.test.js` | `A252B57C002958E89FD4B8CE11B92FDE3290D70DC268198FE92E1A815ED61748` |

未构建候选运行包、未写入 manifest；`build-worker-release.ps1` 会创建 release 并执行依赖安装，超出本次只读授权。

## 当前服务与 WinSW 归属（只读）

- 服务：`PublicOpinionWorker`，状态 `Running`，`AUTO_START (DELAYED)`，账户 `NT AUTHORITY\LocalService`。
- 服务二进制：`C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe`，SHA-256 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`。
- 服务 XML：`C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.xml`，SHA-256 `1B5C1A69F03C273AA8DF02ABBDF6B90545AFEDBDDD396ED675300873746D5153`。
- XML 和当前 Node 进程均指向 `C:\ProgramData\PublicOpinion\releases\worker-release-p0-parallel-20260918130000\worker\src\worker.js`（PID 在预检时为 `41836`）。当前 release 的 `verify-worker-release.js` 复算通过，405 个文件；manifest SHA-256 为 `50304D01F42220322E39150DB7286888E924B030701E3021E7DB86EAD4BFF348`。
- 仓库默认的 `scripts/windows-services/winsw.exe` 不存在。部署脚本需要通过 `WIN_SW_EXE` 或显式 `-WinSWSource` 提供独立、已校验的 WinSW 二进制；本次无权读取或设置运行时环境变量，故不能证明候选部署会使用何种独立源。

## 已有回滚材料

存在且可只读复算的 Worker releases：当前 `worker-release-p0-parallel-20260918130000` 与上一个 `worker-release-p0-merged-20260918123000`，二者均有 `worker/src/worker.js` 与 manifest，`verify-worker-release.js` 均通过（405 files）。

但 `C:\ProgramData\PublicOpinion\config\backups` 当前只看到 API/translation 名称的备份目录，没有命名的 Worker wrapper/XML 备份。仓库 `rollback-services.cmd /apply` 会同时 stop/uninstall API 与 Worker，且不指向指定旧 Worker release；它不是本次单 Worker 回滚方案。这个缺口阻断发布。

## 影响、前置和拟议发布步骤（未执行）

影响仅应为 TapTap `owned_content` incremental 的 checkpoint 起点：下一个频率触发会从安全保存 cursor 继续；不改变 `SYNC_PAGE_BUDGET=20`、其它平台、回填、评论或 Provider/凭据逻辑。发布后仍不得将 HTTP 200 或 run completed 直接等同于“今日内容恢复”。

下一次用户重新授权发布窗口后，拟议顺序如下：

1. 负责人先产出可审计的 TapTap-only commit/clean checkout，复核本记录内的候选 hunk 和定向测试。
2. 在隔离目录构建不可变 Worker release，生成并复算运行包 manifest；核对 `worker/src/worker.js` 的目标 hash。
3. 提供独立 WinSW 源与固定 SHA-256，确认其不与 `services\PublicOpinionWorker.exe` 同路径；保存当前 Worker XML、wrapper、release 路径及 manifest 至经批准的 Worker 专用回滚目录。
4. 在不触碰 API/3001 的单 Worker 门禁中完成配置、ACL、服务账户、release manifest 和只读 readiness 验证；开始前记录现有 PID/状态/日志偏移。
5. 经第二次用户授权后，才允许受控切换；随后只观察一次自然频率触发的 run/checkpoint/内容去重证据，不人工补跑。
6. 若安装、账户、manifest 或健康检查失败，停止新 Worker，恢复刚保存的同一 Worker wrapper/XML 对旧 release 的引用并启动旧 Worker；不得调用会影响 API 的全局 rollback 脚本。

## 精确阻塞

1. 共享 `worker/src/worker.js` 含非 TapTap 在途改动，当前不能作为整体候选包。
2. 缺少默认 WinSW 源文件，未提供候选窗口可用的独立 WinSW 路径/hash。
3. 缺少经验证的 Worker-only wrapper/XML 回滚包与单 Worker 切换/回滚程序；现有全局 rollback 不满足范围隔离。
4. 用户尚未就下一次发布窗口重新授权。

## 补充复核：既有 rollback WinSW 源（2026-09-20）

`v016_siteurls_controlled_local_apply.md` 所述 rollback 目录现仍可只读访问：

```text
C:\ProgramData\PublicOpinion\config\backups\siteurls-api-release-20260918-rollback\PublicOpinionApi.exe
```

该文件存在、不是 reparse point，SHA-256 为
`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`。它与
`prepare-worker-preflight.ps1` 的固定 WinSW SHA-256 门禁、当前
`PublicOpinionWorker.exe` 的 SHA-256 均一致；rollback manifest 也记录该原 API
wrapper 的相同 hash。因此它满足后续仅 Worker preflight 所需的“独立、固定 hash、
可读取 WinSW 二进制来源”这一技术条件。

安全边界：此目录的 `PublicOpinionApi.xml` 和 `rollback-manifest.json` 是 API 专用
回滚材料，不能用于 Worker。后续经授权的 Worker 流程只能**读取**该 `.exe` 作为源，
在新 Worker service target 生成独立 `PublicOpinionWorker.exe`、由 Worker 模板渲染
独立 XML；不得改写 rollback 目录、不得 stop/uninstall API。该结论不解除本记录其余
阻塞：仍须用户授权、TapTap-only release 构建、Worker-only 切换/回滚程序和完整门禁。
