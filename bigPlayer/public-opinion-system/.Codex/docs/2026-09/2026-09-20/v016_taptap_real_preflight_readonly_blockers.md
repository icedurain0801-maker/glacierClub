# TapTap 真实 `--preflight`：只读输入、门槛与阻塞

状态：只读盘点完成；未运行真实 preflight，未写 ProgramData、未控制服务。

阶段顺序以 `v017_taptap_stage_c_controlled_preparation_review.md` 为准：**A → C → B → D**。
本文件原“授权分层”表中的 B/C 顺序已被该记录纠正。

## 已确认存在与缺失

只读 `Test-Path` 确认以下现有材料存在：

- `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe/.xml`；
- `C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe/.xml`；
- `C:\ProgramData\PublicOpinion\config\public-opinion.env`；
- 受信任 WinSW 来源：`C:\ProgramData\PublicOpinion\config\backups\siteurls-api-release-20260918-rollback\PublicOpinionApi.exe`；
- 隔离候选和回滚副本：`.temp/taptap-cursor-release-candidate-20260920/`。

真实 preflight 尚缺的输入为：

1. **新的不可变候选 release**：
   `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-<批准的唯一 id>`，含经复算的
   `package-worker-release-manifest.json` 和 `worker/src/worker.js`；
2. **候选 Worker XML**：经渲染后、入口和 `BUILD_SHA` 指向上述候选 release 的普通文件；
3. **已验证 Worker-only snapshot JSON**：记录当前 Worker wrapper/XML、当前 API wrapper/XML 与候选
   manifest 的 SHA-256，且 `service=PublicOpinionWorker`；
4. 候选 WinSW wrapper（固定 SHA-256）和运行 preflight 的授权操作者可读取上述材料；
5. 运行 `worker-readiness.js` 所需的现有配置读取权、数据库 `SELECT`/`SHOW` 权限，以及 SCM 查询权。

`<批准的唯一 id>` 必须由项目经理在创建候选时登记；当前没有可代填的正式值。

## 固定目标与只读命令形状

真实 CLI 固定核对下列当前工件，不允许替换为 API/3001：

```text
C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe
C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.xml
C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe
C:\ProgramData\PublicOpinion\services\PublicOpinionApi.xml
```

在候选和 snapshot 已按批准路径创建后，真实只读预检命令形状为：

```powershell
node scripts/windows-services/worker-only-controlled-cutover.js --preflight --controller=real `
  --candidate-wrapper <受信任-WinSW-路径> `
  --candidate-xml <批准的候选-Worker-XML-路径> `
  --candidate-release C:\ProgramData\PublicOpinion\releases\worker-release-taptap-<id> `
  --worker-wrapper C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe `
  --worker-xml C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.xml `
  --api-wrapper C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe `
  --api-xml C:\ProgramData\PublicOpinion\services\PublicOpinionApi.xml `
  --verified-snapshot <批准的-Worker-only-snapshot.json> `
  --env-file C:\ProgramData\PublicOpinion\config\public-opinion.env
```

此命令会做文件/reparse、哈希、manifest、`sc.exe query PublicOpinionWorker`、以及仅允许
`SELECT`/`SHOW` 的 readiness 核对；不会 stop/install/start、写数据库、补跑或调用 Provider。
命令输出不得包含 `.env` 内容、Token 或连接串。

## 授权分层

| 阶段 | 行为 | 是否写入/高影响 | 所需门槛 |
|---|---|---|---|
| A | `.temp` 候选、脚本语法、fake 演练 | 否，仅本地临时目录 | 当前已完成，无真实环境授权 |
| B | 读取现有 ProgramData/SCM/config 并执行真实 preflight | 不写入；但读取运行配置并访问真实 DB readiness | 用户弹窗明确允许“TapTap Worker-only 真实只读预检”，并限定本命令/操作者/时间窗 |
| C | 构建新 ProgramData release、渲染候选 XML、写 snapshot | 会创建不可变 release、候选/审计文件 | 用户弹窗明确允许“仅创建候选与 snapshot，不切换服务”；完成后复核 hash |
| D | `--apply --controller=real`、Worker stop/install/start | 短暂停 Worker，可能触发自动 Worker-only 回滚 | 新的单次用户弹窗，明确仅 `PublicOpinionWorker`、不动 API/3001、不补跑 |
| E | 删除候选或 snapshot | 删除审计/候选材料 | 单独确认删除目标与保留期 |

## `.temp` 不能替代的原因

隔离候选证明 TapTap 单 hunk 与运行包哈希，但真实 CLI 明确拒绝 `.temp` release：真实候选必须位于
固定 `C:\ProgramData\PublicOpinion\releases\` 根，且必须与运行前 snapshot、候选 XML、实际
Worker/API 当前工件和真实 DB readiness 同时核对。直接将 `.temp` 作为真实运行包会绕开受控目录、
ACL、审计和可回滚的 release 身份，故不可用。

## 当前安全退出与遗留校验点

现阶段没有运行任何真实预检，故无服务回滚动作：保持当前 Worker/API 不变即可。未来真实 preflight
任一检查失败时，应立即退出、不创建/不切换服务、不删除既有 release；记录脱敏错误和 hash 后交项目经理。

候选 XML 的内容（`id=PublicOpinionWorker`、候选 entry、`BUILD_SHA`、LocalService 与无 API/3001
参数）仍应在阶段 C 写入前由现有 `prepare-worker-preflight.ps1`/`validate-artifacts.ps1` 复核；
当前 CLI 只校验其为非 reparse 普通文件，不能以此替代 XML 语义复核。
