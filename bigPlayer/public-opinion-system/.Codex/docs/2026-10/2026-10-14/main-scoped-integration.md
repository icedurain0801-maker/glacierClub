# 舆情系统定向合并 main

Status: ready-for-merge

日期：2026-10-14
来源：origin/codex/v102-bigplayer-recovery，bf8f7a1
基线：origin/main，cf5836f

用户确认：仅合并舆情系统及必要依赖。

范围：bigPlayer/public-opinion-system、bigPlayer/admin/PublicOpinion、舆情正文评分变更记录，以及 .gitignore 中舆情测试记录的例外规则。共享侧栏与 main 内容已一致，无需变更。不引入 SDK、社区货币、其他业务模块或 Vercel 配置差异。

整合方式：从 main 建立独立工作树，将上述路径整合为来源分支的已提交状态；保留 main 其余文件。本地原工作区未提交改动不参与。

验证：123 项专项回归全部通过；205 个正式 JavaScript 文件语法检查通过，静态相对 require 无缺失依赖；git diff --cached --check 通过。未重新运行全量 npm test，此前全量失败记录见 git-submission-validation.md，不宣称全量测试通过。

浏览器：使用整合工作树的舆情页面和静态资源，真实登录会话/来源 API；Token 倒计时位置、秒级更新、未知、过期和无 Token 隐藏通过。BaaS 官方 SDK 直连问题仍在，验证使用官方原版缓存。

本次执行 Git 合并，不重启服务、不运行数据库迁移、不修改业务数据。
