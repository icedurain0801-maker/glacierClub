# X-Clash空列表排查

Status: 已确认筛选原因，无代码及业务数据修改。

截图URL为boardId=100016、platform=discord、北京时间2026-10-15。社区映射8b1f0000000000000000000000100016。

真实接口返回：Discord今天及不限日期均HTTP200、0条；同社区BigPlayer今天有295条帖子、865条评论、95条关注及3条紧急。API和前端服务Running。

浏览器按截图条件复现0条，切换数据平台至BigPlayer社区后验证列表恢复。没有把无数据筛选自动改为其他平台，也没有修改部署或推Git。

证据：.tests/2026-10/2026-10-15/xclash-empty-diagnosis.json；hosted-system-browser/xclash-correct-platform.png。
