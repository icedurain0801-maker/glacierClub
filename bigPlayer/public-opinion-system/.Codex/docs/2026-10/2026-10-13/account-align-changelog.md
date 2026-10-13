# 右上角账号信息垂直居中

Status: deployed and live verified

右上角头像、姓名、角色标签与下拉箭头虽使用 flex 居中，但继承的行高、标签内边距及字体箭头的字形位置造成视觉偏移。

`../admin/PublicOpinion/assets/baas-auth.js` 追加账号专用样式：触发器统一 40px 高度，文字与角色使用 20px 居中容器，头像行高统一，箭头采用居中容器内的 CSS 边框图形，展开仍按原逻辑旋转。不改变登录、权限或菜单行为。

候选从现役 `release-20261013-permissions-community-r3` 复制，保留已上线权限、用户菜单和退出修复。前端 manifest 42 文件检查通过；语法与空白检查通过。真实 Edge 测试 index/content/alerts/sources/collection-runs/keywords/permissions 七页，并对采集页增加 1280/390px 检查，共九组。头像、身份、姓名、角色和箭头与触发器的中心偏差均不超过 0.5px；菜单开关及 Escape 关闭通过，真实受保护 games 接口返回 200，无脚本异常。截图留本机临时目录，不提交业务内容。

本次只发布账号居中样式，重启前端服务；API、Worker、数据库无改动。测试脚本及数值证据位于 `.tests/2026-10/2026-10-13/account-align-*`。

已发布 `release-20261013-account-align-1791884550663`，正式版本九组浏览器检查与真实接口复测全部通过，无脚本异常。代码提交 `dc0a465` 已推送；上线数值证据为 `account-align-live.json`。
