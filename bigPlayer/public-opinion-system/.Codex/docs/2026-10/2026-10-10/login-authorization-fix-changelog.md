---
last_updated: 2026-10-10
status: completed-runtime-authorized
---

# 账密授权失败修复

## 已确认原因

现役 API v019-read-compat-vgfxk2 在创建 BigPlayerH5Connector 时没有传入已构造的 loginSessionClient。账密检测在调用登录服务前直接失败，再被统一包装为 AUTHORIZATION_FAILED。因此本轮故障没有证据支持“用户密码错误”。工作区已存在接线修复，本会话保留并将该修正定向带入现役包候选。

现役 GET sources 路由无路径长度限制，截获来源详情与 login-status，返回来源数组。工作区已有列表/详情路由修正，本次将同一修正带入候选。前端打开详情时另有 normalizedPlatform(editingSource.platform) 错误传参，导致账密来源默认 Token；修正为 normalizedPlatform(editingSource)。

## 修改

| 文件 | 行为 |
|---|---|
| server/src/app.js | loginSessionClient 接线；来源 GET 列表/单条详情与嵌套状态路由分离（复用已有工作区修正） |
| server/src/connectors/bigPlayerH5Connector.js | 缺少接线给明确错误码；健康检测透传安全底层登录错误码，不透传消息或敏感内容 |
| ../admin/PublicOpinion/assets/sources.js | 账密模式正确回显；详情读取 login-status；失败后刷新状态；显示中文失败原因；新增异步读回包保护 |
| ../admin/PublicOpinion/sources.html | sources.js 资源版本 v212 |

## 验证

- 现役基线复制的 API 候选真实 handler/connector 进程内隔离验证 8/8 PASS；DB、网络、子进程护栏拒绝计数为空。
- 既有来源生命周期 11/11、状态 24/24、授权合同 6/6 PASS。
- Edge 本地拦截所有请求：账密来源详情读取状态、具体错误提示、检测后刷新状态、新增草稿保护四项 PASS，零 pageerror，无真实网络调用。
- API release 校验 395 文件；前端 release 校验 33 文件。候选只改两个 API 文件、两个前端文件与 manifest。旧 API 包内 candidate-report.json 移至包外保存，未删除现役文件。
- 首次浏览器验证暴露账密回显缺陷，修复并重新验证；未把初次失败当作通过。

## 工件

仓库根 .temp/login-authorization-fix-20261010/ 下保存 api-release、frontend-release、candidate.json、browser-selftest.json 与截图，SHA256 清单可审查。

正式自测脚本位于 .tests/2026-10/2026-10-10/：prepare-login-fix-candidate.cjs、login-fix-api-offline.test.cjs、login-fix-browser-selftest.cjs。

## 生效与验收

待用户弹窗批准后，将两个候选复制为独立 ProgramData release，备份 API/前端服务 XML，施加 LocalService RX 并复核 SHA256，然后仅重启 PublicOpinionApi 与 PublicOpinionFrontend3001。失败恢复旧 XML/旧包。不会重启 Worker 或登录服务，不迁移或批量改数据，不 push。

生效后检查来源详情返回单个对象、login-status 返回状态对象、三层页面/资源/API、外网浏览器账密模式。仅对指定来源做一次真实授权检测，可能触发验证码；不采集、不分析、不入队。真实登录可能因凭据、验证码或旧自动化适配器出现新的明确错误，不能将隔离验证称为真实登录成功。

## 实际执行结果

用户在本会话弹窗明确批准“立即切换并检测授权”。已切换 API 至 release-20261010-login-auth-fix，前端至 release-20261010-login-auth-v212；只重启 PublicOpinionApi 与 PublicOpinionFrontend3001，启动健康检查通过。两个旧运行包保留，XML 备份在仓库根 .temp/login-authorization-fix-20261010/ 下各服务 .before.xml。

首次切换脚本因 PowerShell XML 属性赋值结果类型错误停止，发生在保存 XML 和停止服务之前；未变更运行服务。修正为显式 string 转换后复核同一候选与原备份，切换成功。

对来源 a11c81b6-e4c4-4342-a3b1-17035cffe1b5 执行一次真实 check-auth：HTTP 200、authStatus=authorized、reason=null。随后只读 login-status 返回 active、failureCode=null、无验证码挑战。此证据确认本次缺陷修复后真实账密登录可用；没有调用采集、分析、入队端点。

localhost、172.16.2.48 LAN、外网 lfy3001.dev.q1op.com 均通过页面/8 个静态资源/来源详情对象/登录状态对象验收。三层登录状态均为 active。外网 Edge 重新加载后管理该来源，默认账密模式、右侧登录状态工作区正确，零 pageerror、零失败请求、Console 零 error/warn、零写请求。

正式验收脚本：.tests/2026-10/2026-10-10/login-fix-runtime-acceptance.cjs。原件与截图在仓库根 .temp/login-authorization-fix-20261010/runtime-acceptance.json、external-fixed.png。

49 项自动测试与四项隔离浏览器行为通过；真实账号授权与三层/外网浏览器验收另列，不混作模拟验证。无 push、合并、数据删除、迁移或 Worker/登录服务重启。授权与登录状态缺陷已关闭，采集/分析不属于本次验收范围。
