# bigplayer-worker-20260923-P0 发布前隔离 QA

- 日期：2026-09-23
- 候选：`.temp/releases/bigplayer-worker-20260923-P0/`
- 测试角色：测试负责人
- 最终结论：**FAIL**
- `READY_FOR_APPLY`：**NO**
- 安全边界：未执行 Apply、服务切换、生产连接/写入、DDL、真实抓取或 v370 验收

## 阻断缺陷

### P0-1：immutable inventory 不完整且已有 hash 失效

- 磁盘文件：730。
- `release-manifest.json.files`：726，且这 726 个文件自身 hash 全部匹配。
- `checksums.sha256`：728，不是交测要求的 729。
- manifest 外的磁盘文件共有 4 个：`checksums.sha256`、`release-manifest.json`、`provenance.json`、`release-verifier.js`。
- checksum 自身可作为明确 exclusion；其余 3 个 metadata 应进入 729 条 immutable inventory。
- 实际 inventory 只包含 `release-manifest.json`、`provenance.json` 两项，遗漏 `release-verifier.js`。
- inventory 中 `release-manifest.json` 与 `provenance.json` 的 hash 均与磁盘实际文件不一致。

### P0-2：provenance 无法解析且缺少逐文件来源

- `provenance.json` 含字符串内未转义换行，Node JSON 解析报 `Bad control character in string literal`。
- `dirtyFileCount=1`，但 `dirtyFiles` 实际把整段多文件 `git status` 拼成一个字符串，无法表达真实 dirty 文件数量。
- 未提供 P0 文件逐项 source path/source hash/release hash，不能仅凭 `dirty=true` 建立可审计来源链。

### P0-3：release-verifier 存在假阳性

- `node release-verifier.js` 返回 PASS。
- 该 verifier 只校验 3 个 required 文件及其 manifest hash，不读取或全量校验 `checksums.sha256`，也不解析/校验 `provenance.json`。
- 因此在 checksum 已有 2 项不匹配、inventory 少 1 项、provenance 非法 JSON 时仍错误放行。

### P0-4：v363 immutable inventory 已失效

- v363 `checksums.sha256` 共 425 条，`apply-state.json` 正确排除。
- 但以下 2 项实际 hash 与 inventory 不一致：
  - `scripts/controlled-apply-executor.ps1`
  - `scripts/execution-gates.ps1`
- v363 source 路径已指向新 release，worker hash `EDE109...62701` 正确；但 inventory 不一致，不能满足 source/hash/inventory 同时有效的门禁。

### P1-1：包清单存在依赖/入口闭合风险

- worker/server/shared 主入口直接 `require` 均成功，关键文件 `node --check` 通过。
- 但 `npm ls --omit=dev --all` 报 `ELSPROBLEMS`：workspace 包为 invalid，并存在多项 extraneous 依赖。
- `worker/package.json` 声明 `start:last-night-overseas-daily` 与对应 preflight，但候选及源工作区均缺少 `worker/src/lastNightOverseasDailyJob.js`。若这些脚本仍是受支持入口，则候选不闭合；若已废弃，应从 package scripts 明确移除并更新 inventory。

## 已通过项

| 验证项 | 结果 |
|---|---|
| 关键文件与 manifest/source hash | PASS：`scheduleSlots.js`、`worker.js`、`repository.js`、`riskModes.js` 全部一致 |
| worker hash | PASS：`EDE109A553B8B6E5B585022B3765C60BD44D04093BE65B755DD62B91F5462701` |
| release 内 worker 回归 | 92/92 PASS |
| release 内 repository 回归 | 146/146 PASS |
| Discord/BigPlayer 定向回归 | 9/9 PASS |
| UTC/仓储定向回归 | 9/9 PASS |
| v363 executor/gates 测试 | 13/13 PASS，故障注入与 rollback hash recheck 逻辑存在 |
| rollback 基线 | PASS：仍指向 `worker-release-taptap-20260921-v055-formal1` |
| 旧 v358 | PASS：411/411 原 manifest hash 匹配；关键文件 hash仍为旧值，时间戳早于新候选 |

## 退回要求

1. 重建合法、逐文件可审计的 `provenance.json`，列明所有 P0 dirty 来源文件及 source/release hash。
2. 按最终文件内容重新生成 729 条 immutable inventory；明确仅排除 `checksums.sha256` 自身，并确保 manifest/provenance/verifier 三项在 inventory 中。
3. 强化 `release-verifier.js`：校验全量 inventory、磁盘额外/缺失文件、metadata JSON schema 与 provenance 逐文件来源。
4. 重新生成 v363 checksum inventory，修复两个脚本 hash 漂移；保持 `apply-state.json` exclusion。
5. 明确 `lastNightOverseasDailyJob.js` 入口是补齐还是废弃，并使 package scripts 与候选内容一致；清理或解释 `npm ls` 的 invalid/extraneous 状态。
6. 原路径修复后重新交测；修复前禁止 Apply。
