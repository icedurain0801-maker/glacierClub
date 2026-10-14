# TapTap Cursor：隔离 Worker 发布候选材料

日期：2026-09-20

状态：隔离候选已验证；**未授权发布，未部署、重启、补跑、push 或发版**

## 隔离产物位置

所有临时产物仅位于仓库根 `.temp/`，未写入 `C:\ProgramData\PublicOpinion`、服务目录、配置或运行 Worker：

```text
.temp/taptap-cursor-release-candidate-20260920/
├── current-worker-release-readonly/      # 当前运行包的只读副本
├── candidate-worker-release/             # 仅 TapTap hunk 的候选包
├── candidate-winsw-source.exe            # 从当前 wrapper 独立复制的候选 WinSW 源
├── candidate-PublicOpinionWorker.xml.template
└── worker-only-rollback-material/        # 当前 Worker wrapper/XML 的只读副本
```

候选与当前只读备份逐文件 SHA-256 比较的差异**仅有两项**：

| 路径 | 备份 SHA-256 | 候选 SHA-256 | 原因 |
|---|---|---|---|
| `worker/src/worker.js` | `A7F8096B45B34D6B9B41DC82987BBE2957369A4B4480BE2910D2078357F61906` | `EC8727D3BE62357A1AA1D4315F5A4E3C58C797988D805964627CFF39C1667792` | 仅删除 TapTap incremental 的 cursor 清零特例，并改用 `checkpoint.cursor ?? null` |
| `package-worker-release-manifest.json` | `50304D01F42220322E39150DB7286888E924B030701E3021E7DB86EAD4BFF348` | `535F3461DDF7CDF29CEFB428EB70DDA92E693604CC98D9A58A701075A18C3158` | 重算候选包 manifest |

候选包和当前备份均为 405 个运行时文件；候选 `verify-worker-release.js` 复算两次均通过。候选 source 执行 `node --check` 通过；以 `syncStage` 的纯内存 fixture 断言 TapTap `owned_content` incremental 首个 connector 请求使用 `{"version":1,"accountIdx":0,"from":200}`，通过。

## 明确排除

隔离候选从当前运行 release 基线生成，而非从共享脏工作树复制。因此不包含工作树中在途的 pause/cancel、BigPlayer candidate observation、其环境变量开关或任何其它未批准改动。与当前 release 的唯一 source 差异见上表。

## WinSW、当前包备份和回滚材料

- 当前运行包已复制到 `current-worker-release-readonly/`，所有文件标为只读；其原始 release 未被写入。
- 当前 `PublicOpinionWorker.exe`、`PublicOpinionWorker.xml` 已复制到 `worker-only-rollback-material/` 并标为只读。二者 SHA-256 分别为 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`、`1B5C1A69F03C273AA8DF02ABBDF6B90545AFEDBDDD396ED675300873746D5153`。
- `candidate-winsw-source.exe` 是独立于 service 目录的复制件，其 SHA-256 与当前 wrapper 相同：`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`。
- `candidate-PublicOpinionWorker.xml.template` 的 SHA-256 是 `82F9D70916F5ED7AEFFC593417751901EBB347B71307AB78CE5A34746AAE3658`。它固定服务 id 为 `PublicOpinionWorker`、入口为 `__CANDIDATE_RELEASE_ROOT__\worker\src\worker.js`、候选 `BUILD_SHA` 为 `535F3461DDF7CDF29CEFB428EB70DDA92E693604CC98D9A58A701075A18C3158`。它仅为后续经批准的渲染源，不能直接安装。

## 可复现的隔离验证步骤

以下步骤描述已完成动作，仅用于复核；禁止将任何路径改写为 ProgramData 或服务目录：

1. 从已验证的 `worker-release-p0-parallel-20260918130000` 递归复制到 `.temp` 的当前备份与候选目录。
2. 在候选 `worker/src/worker.js` 应用单一 hunk：删除 `restartTapTapOwnedIncremental` 并令 `stage.cursor = checkpoint.cursor ?? null`。
3. 对候选执行 `node scripts/windows-services/verify-worker-release.js <candidate> <repo> --write-manifest`，再不带 `--write-manifest` 复算。
4. 对备份/候选逐文件 SHA-256 比较，允许差异只能是上述 `worker.js` 与 manifest。
5. 以本地 Node 内存 fixture 调用候选 `syncStage`，断言 checkpoint cursor `from=200` 会作为首次请求 cursor；不加载 credentials、不访问 Provider、不创建 run。

## 发布门禁与阻塞

候选材料可用，但尚不可执行切换。仍需：

1. 用户重新弹窗授权发布窗口。
2. 在经批准的 ProgramData 新 release 目录中重新构建同一候选，复算 manifest/hash；不能直接使用 `.temp` 产物。
3. 使用已复核的 rollback WinSW 二进制作为只读来源：`C:\ProgramData\PublicOpinion\config\backups\siteurls-api-release-20260918-rollback\PublicOpinionApi.exe`，其 SHA-256 已与 Worker 门禁固定值一致（详见 `v004_taptap_worker_release_readonly_preflight.md` 的补充复核）。该 API rollback 目录、其 XML 和 manifest 不得改写或复用为 Worker XML。
4. 审批并验证仅 Worker 的安装/切换与回滚程序：先保存当前 wrapper/XML/release 引用，失败时只恢复它们；不得使用会卸载 API 的 `rollback-services.cmd`。
5. 完成服务账户、ACL、配置文件读取和单 Worker readiness 门禁后，方可在第二次明确授权下切换；随后仅观察自然频率触发，不人工补跑。

API、3001、现有 Worker 进程、ProgramData release、服务配置与数据库在本次工作中均未被修改。
