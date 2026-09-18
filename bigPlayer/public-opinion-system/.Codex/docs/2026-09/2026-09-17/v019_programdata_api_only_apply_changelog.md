# v019 ProgramData API-only 真实安装

## 变更

- 从仓库现有 `.env` 复制生成 `C:\ProgramData\PublicOpinion\config\public-opinion.env`，未读取或回显配置内容。
- 安装版本化 API 运行包 `C:\ProgramData\PublicOpinion\releases\release-14869-24421-11130`。
- 安装 `PublicOpinionApi` Windows 服务，运行账户为 `NT AUTHORITY\LocalService`，启动模式为延迟自动启动。
- release/services/config 配置为只读 ACL，logs/data 配置为可写 ACL。
- 停止原 4320 npm API，并由已安装服务接管 4320。

## 验证

- API-only preflight、部署 validator：PASS。
- 初次启动、正常停止/启动、强杀恢复：PASS。
- 4320 `/health`：HTTP 200，数据库 `ok`。
- localhost、LAN、外网的管理页面、静态资源与真实 API：PASS。
- 3001、3306 PID及旧计划任务状态保持不变。
- Worker 未安装、未启动、未停止或修改；未执行 push、合并、tag、发版或数据删除。

## 剩余风险

- 外网根路径 `/` 仍为 404，当前有效页面路径为 `/admin/PublicOpinion/index.html`。
- 3001 仍由既有 `.temp/qa_proxy_3000.js` 临时代理承载，本次 API-only 安装未调整该链路。
- 浏览器强刷与 Console 验收待项目经理正式送测试负责人执行。
