# 静态托管候选包

Status: blocked，未上传。

- 打包脚本自动纳入前端 HTML 页面，新增单帖抓取分析页面及 shared/singlePostOutput.js；校验器要求新页面存在。
- 当前快照包含 9 页、49 个文件，资源引用、JS 语法、SHA256 和强制 SSO bootstrap 静态校验通过。
- 真实托管 API 的 OPTIONS 返回 Allow-Headers: *，未显式允许 Authorization；Allow-Methods 缺少 PATCH。授权跨域请求存在阻断。
- 当前浏览器工具只有无 tab 的 mcpapps；iab 创建失败，无法完成控制台、候选浏览器及独立普通用户首次登录验收。
- 未提交 BaaS、未改变线上托管版本、未推 Git、未重启本机服务。
- 证据：.tests/2026-10/2026-10-20/hosting-release-preflight.json；其中记录快照、zip 路径和 SHA256。
