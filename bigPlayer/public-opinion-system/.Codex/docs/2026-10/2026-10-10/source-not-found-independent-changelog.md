---
last_updated: 2026-10-10
status: completed-runtime-verified
---

# 采集源 source not found 定位与独立自测

## 原因与修复

现役前端为 release-20260924123831-boardid-save。新增 H5 来源的草稿切换账密时旧 bindH5CredentialMode 调用了已有来源 renderDetail，暴露保存与检测按钮。无真实来源 ID 的检测发往 /sources/undefined/check-auth，返回 source not found。Edge 隔离浏览器已复现截图报错。

工作区已经存在修复，本会话保留并复用，没有重写业务文件。sources.js 分开创建/编辑渲染，新增草稿保留创建按钮与非敏感输入，缺少真实 ID 时阻止编辑/检测；404 使用中文解释并避免重复无效请求；异步保存回包检查抽屉与社区上下文。sources.html 引用 sources.js?v=211。

## 自测

| 验证 | 结果 |
|---|---|
| 来源生命周期（工作区） | 11/11 PASS |
| 既有来源状态回归（工作区） | 24/24 PASS |
| v065 冻结来源迟到保存定向自测 | 15/15 PASS |
| Edge 旧版本真实 DOM 点击 | 复现 POST /sources/undefined/check-auth 与 source not found |
| Edge 修复包真实 DOM 点击 | 创建流程、字段保留、账号往返保留通过；零写请求、零 pageerror |
| 前端 release manifest | 33 文件全部通过 |
| JavaScript 语法和目标空白检查 | PASS |

测试使用本地模拟请求与合成凭据，无真实业务写入、认证、采集或 AI 调用。首次 node --test 命令因护栏禁止子进程而失败，改为 node --require ./scripts/offline-test-guard.cjs <test-file> 后通过，护栏拒绝计数为空。浏览器脚本初版两次超时源于错误按钮选择器与 mock 社区名称不在既有白名单，校正 fixture 后通过，未据此修改业务规则。

## 可审查更新包

仓库根 .temp/source-not-found-independent-20261010/release-source-draft-v211。基于现役完整运行包复制，仅替换以下两个文件并更新 SHA256 manifest：

| 文件 | SHA256 |
|---|---|
| public/admin/PublicOpinion/assets/sources.js | 50ceed0333bf3ba9e4455b774204293ff5c280eb2c2391179cc4b3c6f24e4135 |
| public/admin/PublicOpinion/sources.html | 9a258598d91b3ce8d8296b048ffc186d2a1201cc377ebb1e02ab79d18685cfac |

自测脚本：.tests/2026-10/2026-10-10/source-not-found-browser-selftest.cjs。
浏览器报告与对比截图：上述临时父目录 selftest.json、baseline.png、fixed.png。

## 生效步骤与边界

待用户弹窗批准后，将已验证包复制到独立的新 ProgramData release，保留旧 release 和服务 XML 备份；核验 manifest 和 LocalService 读取权限后，仅更新 PublicOpinionFrontend3001 XML 的 arguments/workingdirectory，停止并启动前端服务。失败则恢复 XML 并启动旧版。API、Worker、数据库与凭据不做变更。后续只读核验 localhost/LAN/外网页面、资源与来源列表，并以浏览器确认外网加载 v211。

用户于本会话弹窗选择“立即切换并验收”。已切换至 C:\ProgramData\PublicOpinion\frontend3001\releases\release-20261010-source-draft-v211，仅停止/启动 PublicOpinionFrontend3001；LocalService RX ACL 检查与 33 文件 manifest 校验通过。旧 release 保留，原 XML 备份于仓库根 .temp/source-not-found-independent-20261010/PublicOpinionFrontend3001.before.xml。

localhost、172.16.2.48 LAN 与 lfy3001.dev.q1op.com 外网页面、8 个 JS/CSS 资源、sources 列表 API 均为 200，脚本 SHA256 均为修复值。真实 API 当前所选社区来源数量为 0，未把空数组描述为有来源数据。外网 Edge 重新加载后点击新增、填写合成草稿、切换账密，创建按钮、字段保留与无检测按钮验证通过；零 pageerror、零失败请求、Console 零 error/warn，无真实写请求。验收草稿已取消。

验收脚本：.tests/2026-10/2026-10-10/source-not-found-runtime-acceptance.cjs；报告：仓库根 .temp/source-not-found-independent-20261010/runtime-acceptance.json；截图：同目录 external-fixed.png。

本次 source not found 缺陷已在外网验收关闭。真实采集源创建、账号凭据认证及 Worker 采集没有执行，不属于本次通过范围。

## 本会话正式新增

- AGENTS.md：用户弹窗确认的项目配置，status=confirmed。
- 项目配置补充草案、本文变更记录、独立浏览器自测脚本。

既有 sources.js/sources.html 修改与历史报告均保留，无提交、push、合并、站内信或数据删除。只进行了用户明确批准的前端运行包切换。
