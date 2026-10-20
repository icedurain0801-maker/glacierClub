# 简化钉钉卡片提示

Status: local scheduled sender updated

移除紧急告警、关注级与优质内容卡片中的批次序号（如2 / 2），移除底部“另有X条内容分析失败，未纳入本轮推送。”。失败任务处理、回执去重与原有平台名称保持不变。

修改 `worker/src/collectionDingTalk.js` 及对应测试；34项隔离测试、语法及空白检查通过。对计划任务实际使用的 `release-20261020-member-index-dingtalk-r1/worker/src/collectionDingTalk.js` 应用最小补丁，原文件已存 audit 备份，并从现役模块模拟验证三类卡片不再含上述文字。后续发送生效，未重复发群，未修改已有消息。
