# v025 BigPlayer 登录会话服务 4311 恢复

## 目标与边界

- 恢复本机 `PublicOpinionLoginSession`，固定只监听 `127.0.0.1:4311`。
- 调用端继续使用既有 `LOGIN_SESSION_SERVICE_URL=http://127.0.0.1:4311`；不回退至 4310。
- 不读取、记录或复制任何明文凭据；不重启 API/Worker，不补跑，不删除历史候选。

## 变更

- 登录会话服务支持从 `PUBLIC_OPINION_ENV_FILE` 加载受控环境文件，优先于候选 release 内的 `.env`。
- 示例配置统一为 4311。
- 新增独立 WinSW 模板与 `prepare-login-session-service.ps1`：固定 WinSW SHA-256、拒绝 reparse point、要求 4311 空闲、要求服务尚未安装，构建不可变候选和 SHA-256 manifest，并使用 LocalService 最小 ACL。

## 候选失效记录

- `login-session-4311-20260920-1418a` 曾因 manifest 写入了字面 `\\n` 而预检失败。后续误发生原地 manifest 重建，因此该候选永久标记为 `INVALIDATED_MUTATED`：严禁安装、启动、复用、修补或删除。
- 原始 audit 与 `manifest-repair` 审计文件均仅保留，不覆盖。

## 已验证

- `node --test login-session-service/test/env.test.js`：4/4 PASS。
- `prepare-login-session-service.ps1 -Mode Preflight`：通过，候选、WinSW、受控配置、ACL、端口与清理路径均按同一构建链验证，无临时残留。
- `login-session-4311-20260920-1448b` 是结构化 manifest 首轮候选，因发布脚本 ACL 继承预检补强而不用于安装。
- 已创建待独立 QA 的全新候选：`login-session-4311-20260920-1503c`。
  - WinSW SHA-256：`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`
  - manifest SHA-256：`7B5580135B8581AD1F2F99361FDCF1F7F6AFC0D891DE80D899E3843270BE75B9`
  - manifest 为 UTF-8 无 BOM、尾部单个实际 LF；`JSON.parse` 与 625 个文件 SHA-256 校验均通过。

## 当前门禁

候选尚未安装或启动。需测试负责人复核候选后，才可只安装并启动 `PublicOpinionLoginSession`；启动后仅检查 `/health` 的 internal-auth、credential resolver 和 `bigplayer_h5` automation readiness，然后执行一次有界 BigPlayer 自然故障恢复验证。

## 受控安装失败与回滚（14:49）

- `PublicOpinionLoginSession` 安装成功且 SCM 状态为 `Running`；wrapper stdout 记录服务已请求监听 `127.0.0.1:4311`。
- 随即的 loopback 监听预检未找到 `127.0.0.1:4311`，因此没有调用 `/health`、Provider 或 BigPlayer Run。
- 按失败门禁已停止并卸载**仅该服务**；服务现在不存在且 4311 无监听。API、Worker、历史候选和旧 `1418a` 均未改变。
- 当前需先在隔离环境解释服务账户下的监听可见性差异，并重新通过候选 QA 后，才可申请下一次安装授权。
