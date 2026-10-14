# 移除采集源列表两列

Status: candidate verified

按用户截图移除“地区 / 社区”和“帖子 / 评论”两个列表列。修改 `../admin/PublicOpinion/sources.html` 表头及 sources.js 的常规/Facebook行模板，列表剩六列。空状态、加载状态和实时同步进度行 colspan 由 8 改为 6。同步详情内容和接口数据保留，HTML 更新 sources.js 缓存版本。

JavaScript 语法、空白检查和候选前端 manifest 45 文件通过。真实 Edge 在境内、境外来源各验证六列表头/行、管理抽屉、真实 sources 接口 200，并验证无匹配空状态跨六列；无脚本错误，无写业务接口。

本次浏览器直接加载远端 BaaS SDK 出现“冰川登录组件加载失败”。用当天官方地址下载的原版 SDK 通过浏览器 route 提供，仅解决测试时组件加载；SSO 会话和来源查询仍为真实接口。测试结果不代表远端 SDK 在线加载已恢复。发布仅现役前端运行包的两列补丁，不修改 BaaS 登录或其他工作区内容。
