# v016 WinSW 服务账户契约与安装后门禁

## 变更

- `PublicOpinionApi.xml`、`PublicOpinionWorker.xml`
  - 服务账户改为 WinSW v2 `domain/user` 结构，目标仍为 `NT AUTHORITY\LocalService`。
- `validate-artifacts.ps1`
  - 模板、隔离渲染和部署工件统一严格验证 serviceaccount 契约。
  - 拒绝旧 `username`、`LocalSystem`、缺失字段、密码、`allowservicelogon` 和未知节点。
  - 区分 API-only 与 All 的成功文案。
- `install-services.cmd`
  - 部署前锁定 WinSW v2.12.0 SHA-256。
  - 安装后、启动前核验 SCM 实际账户；非 LocalService 时保全非敏感证据并自动卸载回滚。
- `v173_winsw_service_account_contract.test.ps1`
  - 新增新旧 XML 正负用例、DeploymentRoot 重入与零持久副作用回归。

## 验证

- Windows PowerShell 5.1：v173、v169、v164、独立 validate 全部 PASS。
- pwsh 7.6.5：v164、独立 validate 全部 PASS。
- 四个 dry-run 全部退出码 0；所有隔离 fixture/探针残留为 0；`git diff --check` PASS。
- 未执行 `/apply`。
