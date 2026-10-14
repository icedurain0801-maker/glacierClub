# 权限管理方案 6

日期：2026-10-13
状态：已发布前端

用户选择社区优先、批量分配功能的交互。顶部切换 SSO 角色，左侧列出社区并支持搜索、区域筛选和选择当前结果，右侧选择导航功能。应用操作仅增加授权并去重，保留已有授权；已配置社区摘要可逐项撤销。各角色独立保留未保存草稿，保存失败保留修改，离开页面提示未保存状态。

## 修改文件

- `../admin/PublicOpinion/permissions.html`
- `../admin/PublicOpinion/assets/permissions.js`
- `../admin/PublicOpinion/assets/permissions.css`
- `.tests/2026-10/2026-10-13/permissions-community-browser-test.py`

页面沿用现有 GET/PUT permission-rules 接口，未修改 API、数据库或真实角色授权。

## 验证

浏览器模拟接口测试通过：初始加载、缺少选择提示、搜索及筛选结果批选、保留旧授权、去重、角色草稿切换、保存失败保留、保存请求内容、撤销与刷新回读。1440、1024、768、375 四种视口无水平溢出，正文从顶部开始，无 JavaScript 错误。JavaScript 语法与相关文件空白检查通过。

截图为模拟接口数据，不代表线上管理员实际保存验收。本轮未用真实角色修改授权，未重新验证全部服务端权限边界。

## 发布

从现役 release-20261013-tab-icon-r1 复制运行包，仅覆盖上述三个前端文件，保留其他已上线改动。

新包：`C:\ProgramData\PublicOpinion\frontend3001\releases\release-20261013-permissions-community-r3`

42 文件 manifest 校验通过；已切换并重启 PublicOpinionFrontend3001，健康检查及页面、CSS、JS 请求返回 200。源文件与发布包的三个文件哈希一致。

原服务配置快照：`C:\ProgramData\PublicOpinion\frontend3001\services\PublicOpinionFrontend3001.xml.before-community-r3`。旧运行包保留，可恢复配置后重启前端回滚。未重启 API，未提交 Git 或执行 push。
