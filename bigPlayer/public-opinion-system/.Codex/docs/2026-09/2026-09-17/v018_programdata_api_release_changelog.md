# v018 ProgramData API 独立运行包

## 变更

- 新增 `build-api-release.ps1`：在隔离且含空格的 staging 中执行干净 `npm ci --omit=dev --ignore-scripts --workspace server`，不复制现有 `node_modules`。
- 新增 `verify-api-release.js`：校验运行包 allowlist、reparse point、源码根目录及自有文件中的 `C:\Users` / `AppData` 路径泄漏、JS 语法、字面量依赖闭包和 SHA-256 清单。
- `prepare-services.ps1`、`render-config.ps1`、`install-services.cmd`：改为 `C:\ProgramData\PublicOpinion\releases\<release-id>` 版本化运行包；preflight 与 apply 共用准备链路，并仅在仓库 `.temp` 生成验证副本。
- release、services、config 使用只读 ACL，logs、data 使用可写 ACL；失败只清理本次 release 与本次 API wrapper/XML，保留上一版运行包。
- release 构建和清理改用 Node 文件 API，兼容仓库路径含空格及 Windows 深层依赖路径，并可靠移除 npm workspace junction。
- `PublicOpinionApi.xml`：服务模式显式加载 `C:\ProgramData\PublicOpinion\config\public-opinion.env`，数据目录固定为 `C:\ProgramData\PublicOpinion\data`，并清空 `NODE_PATH`、`NODE_OPTIONS`。
- `runtimeEnv.js`：服务模式 fail-closed，仅接受显式存在的非链接普通文件；非服务模式保持仓库根 `.env` 行为。
- 新增 `runtimeEnv.test.js` 和 `v182_api_release_runtime.test.ps1`。

## 验证

- 干净 release 构建：PASS，391 个文件；SHA-256 清单复算与篡改拒绝 PASS。
- Windows PowerShell 5.1 / pwsh：release 回归与 validator PASS。
- v164、v169、v173、v177、v182：PASS。
- runtimeEnv：3/3 PASS；缺配置、缺文件、目录、symlink 均 fail-closed。
- install/status/uninstall/rollback 四个无参数 dry-run：PASS。
- `install-services.cmd /preflight PublicOpinionApi`：PASS，验证 apply/preflight 同构、五类 ACL 和部署 XML 全字段。
- 4320 `/health`：数据库状态 `ok`；3001、4320 监听 PID、SCM、旧计划任务保持不变。
- `.temp` preflight fixture：0 残留。
- 未执行 `/apply`，未写入生产 ProgramData，未安装 API/Worker 服务。

## 剩余边界

- 本次只完成可安装运行包与隔离预检；真实安装仍需项目经理明确授权后执行。
