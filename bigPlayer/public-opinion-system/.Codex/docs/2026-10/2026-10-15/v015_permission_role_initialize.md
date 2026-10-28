# 权限管理：角色已有授权初始化

Status: 已发布并完成线上验收
日期：2026-10-15

## 问题与修复

原页面切换SSO角色时清空上方社区与功能勾选，已有配置只在下方摘要展示。现在首次加载及切换角色时，自动选中该角色草稿中已有授权的社区，并回填对应功能。不同角色草稿保留且互不串用。

多社区权限不一致时，共同授权功能勾选，部分授权功能半选并显示“部分社区已授权”。改变社区选择后重新计算。半选功能不会自动成为批量新增授权；只有用户明确勾选并应用，才加入草稿，实际保存仍需点击“保存角色权限”。切换角色、搜索及初始化均不写权限接口。

## 文件与发布

- `../admin/PublicOpinion/assets/permissions.js`：初始化、共同与部分授权回填、选择/撤销/应用后联动。
- `../admin/PublicOpinion/permissions.html`：更新脚本缓存版本。
- `.tests/2026-10/2026-10-15/permission-initialize.test.cjs`：8项交互与权限边界测试。

仅更新现役3001前端包中的两个静态文件，保持现役HTML其他版本引用；旧文件及manifest已备份，更新后运行包manifest校验通过。没有重启服务，没有修改API、数据库、SSO角色或实际授权数据。发布记录见 `.tests/2026-10/2026-10-15/permission-initialize-publish.json`。

## 验证

命令：`node --test .tests/2026-10/2026-10-15/permission-initialize.test.cjs`，8项通过；`node --check ../admin/PublicOpinion/assets/permissions.js`及目标文件`git diff --check`通过。

覆盖首次加载、角色切换、空角色、部分授权、不隐式扩大权限、单社区切换、搜索和批量选择、草稿跨角色保留、保存目标角色与撤销后联动。模拟保存只在测试夹具执行。

真实浏览器访问 <https://club-opinion.q1.com/admin/PublicOpinion/permissions.html>，三个角色依次正确回填：超能国内运营→超能世界国服版，灯塔海外运营→Last Light，位面2海外运营→X-Clash；每个角色已有5项功能勾选，AI分析管理未授权而保持不勾选。额外选择无授权社区后，已有5项功能均半选，保存按钮保持禁用。恢复超能国内运营后，社区和功能恢复正确。

线上截图：`.tests/2026-10/2026-10-15/permission-initialize-live.jpg`。没有通过本次验收向真实用户增加任何权限。
