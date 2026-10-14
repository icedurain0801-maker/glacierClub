---
date: 2026-10-10
status: reported-needs-runtime-diagnosis
owner: 产品经理
---

# 采集源配置抽屉提示source not found

一句话需求：修复用户新增/配置BigPlayer来源时出现“操作失败：source not found”的问题；保留表单输入，正确区分创建与管理已存在记录。

## 证据和确认边界

截图`C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-277f01a5-0fa1-49c5-8279-d2fba4387719.png`显示BigPlayer社区001、我要当老祖、待配置、账密模式、待验证、保存配置按钮，右下角“操作失败：source not found”。不记录账号、密码、完整站点参数。

只读源码：`bigPlayer/admin/PublicOpinion/assets/sources.js`的openCreateDrawer显示新增采集源/创建，createSource调用POST /sources；renderDetail显示管理已有来源/保存配置，saveSource调用PATCH /sources/{id}/configuration。runSourceAction调用POST /sources/{id}/check-auth或check-capabilities，其catch输出“操作失败：…”，与截图一致；右侧login/check另有“授权检测失败”提示。

`server/src/app.js`的check-auth/check-capabilities首先sourceById，查不到返回404 NOT_FOUND/source not found；授权验证在此后。因此当前报错不能证明账密错误。源码证据支持“动作找不到来源”而不能证明实际用户点击的是哪个按钮、传入了哪个id、为何不存在或真实页面是否当前源码版本。当前背景为空列表不证明该来源从未创建，也可能由筛选/状态变化导致。

## 已有需求口径与修复

- 配置有效的新来源使用创建流程取得真实sourceId，成功后所有保存/检测/同步使用该id；不拿临时、账号或已删除id调用已有来源接口。
- 源不存在、页面过期或地区/社区切换时提示具体中文原因，保留非敏感表单输入并允许用户返回正确创建/重载流程，不能反复无效提交。密码不得写入日志、URL或浏览器持久存储。
- 未保存来源不提供能直接调用已有来源接口的检测操作；已保存来源的检测应使用已保存配置，待保存变更需给明确提示。
- 修复前核页面加载版本/API目标、实际失败请求路径及sourceId，和数据库存在性/删除状态/作用域/账号归属；不擅自重建来源掩盖错id，不自动重复创建。
- 本需求无需新增产品选项，按用户持续授权交项目经理安排排查修复；不改其他平台及采集/风险算法。

## 验收

新增合法BigPlayer来源→创建→列表出现真实记录→管理保存→授权/能力检查，全部使用同一sourceId。模拟创建失败、旧记录删除、抽屉打开后切换社区、旧页面资源缓存，均给可理解反馈、不丢非敏感输入、不重复建源；验证本机映射地址下真实前后端，不仅通过单测。

交项目经理安排开发负责人定位与修复、测试负责人独立回归。相关文件：`../admin/PublicOpinion/assets/sources.js`、`server/src/app.js`、`server/src/db/repository.js`、相关前端与source路由测试。
