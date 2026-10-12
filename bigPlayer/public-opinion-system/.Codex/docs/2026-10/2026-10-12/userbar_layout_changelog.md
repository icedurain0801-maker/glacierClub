# 用户信息移至右上角

Status: tested, pending deployment

`../admin/PublicOpinion/assets/baas-auth.js` 将共享用户栏挂载到 `.command-bar` 的右侧容器中，用户名、角色、成员权限和退出按钮位于上排，地区/社区筛选位于下排。用户栏参与正常布局，替代右下角固定浮层；窄屏自动换行。保留所有登录、鉴权和按钮行为。

本次仅提交该文件的用户栏补丁，不包含工作区现有免登录只读接入改动。上线基于当前现役 release 做相同最小补丁，保留已发布的其他功能；只切换前端服务，API/Worker 不重启。

`.tests/2026-10/2026-10-12/userbar-layout.cjs` 使用已登录真实 Edge 和正常证书校验，验证 index/content/alerts/sources/keywords/collection-runs 六页 × 1920/1440/375 三种宽度共 18 项。所有用户栏位于标题区内、与筛选不重叠，接口鉴权 200，成员权限面板可打开，无脚本错误；不执行真实业务写入或退出登录。上线后同样复测并保存 `userbar-layout-live.json`。
